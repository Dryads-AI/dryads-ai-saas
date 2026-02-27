/**
 * Dryads AI — Signal Connector (signal-cli-rest-api)
 * Personal mode: QR code scanning to link as a Signal secondary device.
 * Requires signal-cli-rest-api running as a separate service.
 *
 * Setup: Deploy bbernhard/signal-cli-rest-api Docker image and set
 * SIGNAL_CLI_API_URL env var (e.g. http://signal-cli:8080)
 */

import { BaseConnector } from "./base.mjs"
import { transcribeFromUrl, transcribeAudio, getOpenAIKeyForUser } from "../ai/stt.mjs"

export class SignalConnector extends BaseConnector {
  constructor(userId, config, pool) {
    super(userId, "signal", "personal", config, pool)
    this._apiUrl = (config.signalCliUrl || process.env.SIGNAL_CLI_API_URL || "").replace(/\/$/, "")
    this._number = null
    this._pollTimer = null
    this._connecting = false
    /** Track message timestamps we sent so we can skip our own bot replies */
    this._sentTimestamps = new Set()
  }

  async start() {
    if (!this._apiUrl) {
      console.log("[Signal] No signal-cli API URL configured — connector disabled")
      this._permanentlyFailed = true
      await this.writeEvent("error", "Signal requires signal-cli-rest-api. Set SIGNAL_CLI_API_URL env var.").catch(() => {})
      await this.updateStatus("disconnected").catch(() => {})
      return
    }

    console.log(`[Signal] Starting Signal for user ${this.userId.slice(0, 8)}...`)
    console.log(`[Signal] API URL: ${this._apiUrl}`)

    // Check if signal-cli-rest-api is reachable
    try {
      const aboutRes = await fetch(`${this._apiUrl}/v1/about`, { signal: AbortSignal.timeout(5000) })
      if (!aboutRes.ok) throw new Error(`HTTP ${aboutRes.status}`)
      console.log("[Signal] signal-cli-rest-api is reachable")
    } catch (err) {
      console.error("[Signal] Cannot reach signal-cli-rest-api:", err.message)
      this._permanentlyFailed = true
      await this.writeEvent("error", `Cannot reach signal-cli API at ${this._apiUrl}`).catch(() => {})
      await this.updateStatus("disconnected").catch(() => {})
      return
    }

    // Check if already linked
    try {
      const accounts = await this._getAccounts()
      if (accounts.length > 0) {
        this._number = accounts[0]
        console.log(`[Signal] Already linked as ${this._number}`)
        this._running = true
        await this.writeEvent("connected", this._number)
        await this.updateStatus("connected")
        this._startMessagePolling()
        return
      }
    } catch (err) {
      console.log("[Signal] Could not check accounts:", err.message)
    }

    // Need to link — start QR process
    this._connecting = true
    await this._startLinking()
  }

  async stop() {
    this._running = false
    this._connecting = false
    if (this._pollTimer) {
      clearInterval(this._pollTimer)
      this._pollTimer = null
    }
  }

  async sendImage(recipient, imageUrl, caption) {
    if (!this._number) throw new Error("Signal not linked")
    try {
      // Download the image and convert to base64 for Signal
      const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) })
      if (!imgRes.ok) throw new Error(`Image fetch failed: ${imgRes.status}`)
      const buffer = Buffer.from(await imgRes.arrayBuffer())
      const base64 = buffer.toString("base64")

      const res = await fetch(`${this._apiUrl}/v2/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: caption || "",
          number: this._number,
          recipients: [recipient],
          base64_attachments: [`data:image/png;base64,${base64}`],
        }),
      })
      if (!res.ok) throw new Error(`Signal send failed: ${res.status}`)

      const body = await res.text().catch(() => "")
      try {
        const data = JSON.parse(body)
        if (data.timestamp) {
          this._sentTimestamps.add(String(data.timestamp))
          setTimeout(() => this._sentTimestamps.delete(String(data.timestamp)), 60000)
        }
      } catch {}
    } catch (err) {
      console.error("[Signal] sendImage failed:", err.message)
      await this.send(recipient, `${caption ? caption + "\n" : ""}${imageUrl}`)
    }
  }

  async send(recipient, text) {
    if (!this._number) throw new Error("Signal not linked")

    const chunks = []
    for (let i = 0; i < text.length; i += 2000) {
      chunks.push(text.slice(i, i + 2000))
    }

    for (const chunk of chunks) {
      const res = await fetch(`${this._apiUrl}/v2/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: chunk,
          number: this._number,
          recipients: [recipient],
        }),
      })
      const body = await res.text().catch(() => "")
      if (!res.ok) {
        throw new Error(`Signal send failed: ${res.status} ${body}`)
      }
      // Track sent timestamp to skip our own bot replies
      try {
        const data = JSON.parse(body)
        if (data.timestamp) {
          this._sentTimestamps.add(String(data.timestamp))
          setTimeout(() => this._sentTimestamps.delete(String(data.timestamp)), 60000)
        }
      } catch {}
    }
  }

  get socket() {
    return this._running ? this : null
  }

  get isConnecting() {
    return this._connecting
  }

  get permanentlyFailed() {
    return this._permanentlyFailed === true
  }

  async _getAccounts() {
    const res = await fetch(`${this._apiUrl}/v1/accounts`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return []
    const data = await res.json()
    // Returns array of account numbers
    return Array.isArray(data) ? data.map(a => a.number || a) : []
  }

  async _startLinking() {
    try {
      console.log("[Signal] Starting device linking (QR generation)...")

      const res = await fetch(`${this._apiUrl}/v1/qrcodelink?device_name=Dryads+AI`, {
        signal: AbortSignal.timeout(60000),
      })

      if (!res.ok) {
        const body = await res.text().catch(() => "")
        throw new Error(`QR link failed: ${res.status} ${body}`)
      }

      // The response is a PNG image of the QR code
      const buffer = await res.arrayBuffer()
      const base64 = Buffer.from(buffer).toString("base64")
      const dataUrl = `data:image/png;base64,${base64}`

      console.log("[Signal] QR code generated — writing to channel_events")
      await this.writeEvent("qr", dataUrl)

      // Poll for account linking completion
      this._waitForLink()
    } catch (err) {
      console.error("[Signal] Linking error:", err.message)
      this._connecting = false
      await this.writeEvent("error", `Linking failed: ${err.message}`).catch(() => {})
    }
  }

  _waitForLink() {
    let attempts = 0
    const maxAttempts = 60 // Check for 2 minutes

    const checkInterval = setInterval(async () => {
      attempts++
      try {
        const accounts = await this._getAccounts()
        if (accounts.length > 0) {
          clearInterval(checkInterval)
          this._number = accounts[0]
          this._connecting = false
          this._running = true
          console.log(`[Signal] Linked successfully as ${this._number}`)
          await this.writeEvent("connected", this._number)
          await this.updateStatus("connected")
          this._startMessagePolling()
        } else if (attempts >= maxAttempts) {
          clearInterval(checkInterval)
          this._connecting = false
          console.log("[Signal] Linking timed out")
          await this.writeEvent("error", "QR code expired. Try again.")
        }
      } catch {
        // Keep checking
      }
    }, 2000)
  }

  _startMessagePolling() {
    if (this._pollTimer) return
    console.log(`[Signal] Starting message polling for ${this._number}`)

    this._pollTimer = setInterval(async () => {
      if (!this._running || !this._number) return

      try {
        const res = await fetch(
          `${this._apiUrl}/v1/receive/${encodeURIComponent(this._number)}`,
          { signal: AbortSignal.timeout(10000) }
        )
        if (!res.ok) return

        const messages = await res.json()
        if (!Array.isArray(messages)) return

        if (messages.length > 0) {
          console.log(`[Signal] Received ${messages.length} message(s)`)
          for (const m of messages) {
            console.log(`[Signal:Debug] Raw msg keys: ${JSON.stringify(Object.keys(m.envelope || m))}`)
            const env = m.envelope || m
            if (env.syncMessage) console.log(`[Signal:Debug] syncMessage keys: ${JSON.stringify(Object.keys(env.syncMessage))}`)
            if (env.dataMessage) console.log(`[Signal:Debug] dataMessage: ${JSON.stringify(env.dataMessage).slice(0, 200)}`)
            if (env.syncMessage?.sentMessage) console.log(`[Signal:Debug] sentMessage: ${JSON.stringify(env.syncMessage.sentMessage).slice(0, 200)}`)
          }
        }

        for (const msg of messages) {
          const envelope = msg.envelope || msg

          // Handle both direct messages AND sync messages (Note to Self / self-chat)
          const dataMessage = envelope.dataMessage
            || envelope.syncMessage?.sentMessage
          if (!dataMessage) continue

          let text = (dataMessage.message || "").trim()

          // Check for audio/voice attachments
          const audioAttachment = dataMessage.attachments?.find(
            (a) => a.contentType?.startsWith("audio/")
          )

          if (!text && !audioAttachment) continue

          // STT: Transcribe voice attachments
          if (audioAttachment && !text) {
            const sender = envelope.source || envelope.sourceNumber || "unknown"
            console.log(`[Signal:Voice] From ${sender}: audio (${audioAttachment.contentType})`)
            try {
              const openaiKey = await getOpenAIKeyForUser(this.pool, this.userId)
              if (!openaiKey) {
                await this.send(sender, "⚙️ Voice transcription requires an OpenAI API key. Add one in Settings.").catch(() => {})
                continue
              }
              // signal-cli stores attachments locally — download via API
              const attachmentUrl = `${this._apiUrl}/v1/attachments/${audioAttachment.id}`
              const ext = audioAttachment.contentType?.split("/")[1] || "ogg"
              const sttResult = await transcribeFromUrl(openaiKey, attachmentUrl, { filename: `voice.${ext}` })
              if (!sttResult.text.trim()) {
                console.log("[Signal:Voice] Transcription empty — skipping")
                continue
              }
              text = sttResult.text
              console.log(`[Signal:Voice] Transcribed: "${text.slice(0, 80)}"`)
            } catch (err) {
              console.error("[Signal:Voice] STT error:", err.message)
              continue
            }
          }

          if (!text) continue

          // For direct messages, sender is in envelope.source
          // For sync/Note-to-Self messages, use the account number itself
          const isSync = !envelope.dataMessage && !!envelope.syncMessage?.sentMessage
          const sender = isSync
            ? (envelope.syncMessage.sentMessage.destination || this._number)
            : (envelope.source || envelope.sourceNumber)
          if (!sender) continue

          // Skip bot's own replies (tracked by sent timestamp)
          const msgTimestamp = String(envelope.timestamp || dataMessage.timestamp || "")
          if (msgTimestamp && this._sentTimestamps.has(msgTimestamp)) {
            console.log(`[Signal] Skipping own bot reply (ts: ${msgTimestamp})`)
            continue
          }

          const senderName = envelope.sourceName || sender
          console.log(`[Signal:Receive] From ${senderName} (${sender}): "${text.slice(0, 60)}"`)

          try {
            const result = await this.handleMessage(sender, text, {
              channelName: "Signal",
              displayName: senderName,
              onTyping: () => {},
            })

            await this.send(sender, result.reply)

            // Send generated images as Signal attachments
            for (const img of result.images) {
              await this.sendImage(sender, img.url, img.caption)
            }

            const preview = (s) => (s || "").slice(0, 50).replace(/\n/g, " ")
            console.log(`[Signal] ${senderName}: "${preview(text)}" → "${preview(result.reply)}"`)
          } catch (err) {
            console.error("[Signal] Pipeline error:", err.message)
            await this.send(sender, "Sorry, something went wrong. Please try again.").catch(() => {})
          }
        }
      } catch (err) {
        console.error("[Signal] Poll error:", err.message)
      }
    }, 3000)
  }
}
