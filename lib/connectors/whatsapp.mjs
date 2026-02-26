/**
 * DMMS AI — WhatsApp Connector (Baileys — QR Code Scan)
 * Personal mode: QR code scanning via Baileys (WhatsApp Web protocol).
 * Uses PostgreSQL auth state adapter for ephemeral hosting.
 */

import { makeWASocket, DisconnectReason, fetchLatestBaileysVersion, Browsers } from "@whiskeysockets/baileys"
import { Boom } from "@hapi/boom"
import { SocksProxyAgent } from "socks-proxy-agent"
import { usePgAuthState } from "../baileys-auth-pg.mjs"
import { BaseConnector } from "./base.mjs"

function getProxyAgent() {
  const proxy = process.env.WA_PROXY_URL
  if (!proxy) return undefined
  console.log(`[WA] Using proxy: ${proxy.replace(/\/\/.*@/, "//***@")}`)
  return new SocksProxyAgent(proxy)
}

export class WhatsAppConnector extends BaseConnector {
  constructor(userId, config, pool) {
    super(userId, "whatsapp", "personal", config, pool)
    this._sock = null
    this._connecting = false
    this._retryCount = 0
    this._connectLock = false
    this._retryTimer = null
    /** Track message IDs we sent, so self-chat doesn't loop */
    this._sentMessageIds = new Set()
  }

  async start() {
    if (this.config?.accessToken) {
      console.log("[WA] WhatsApp Business API mode detected — using webhook, not Baileys")
      return
    }

    console.log(`[WA] Starting WhatsApp (Baileys) for user ${this.userId.slice(0, 8)}...`)
    this._connecting = true
    await this._connect()
  }

  async stop() {
    this._running = false
    this._connecting = false
    this._connectLock = false
    if (this._retryTimer) {
      clearTimeout(this._retryTimer)
      this._retryTimer = null
    }
    if (this._sock) {
      try { this._sock.end() } catch {}
      this._sock = null
    }
  }

  async send(jid, text) {
    if (!this._sock) throw new Error("WhatsApp not connected")

    const chunks = []
    for (let i = 0; i < text.length; i += 4000) {
      chunks.push(text.slice(i, i + 4000))
    }
    for (const chunk of chunks) {
      const sent = await this._sock.sendMessage(jid, { text: chunk })
      // Track the message ID so we can skip it in self-chat
      if (sent?.key?.id) {
        this._sentMessageIds.add(sent.key.id)
        // Auto-cleanup after 60s to prevent memory leak
        setTimeout(() => this._sentMessageIds.delete(sent.key.id), 60000)
      }
    }
  }

  async sendImage(jid, imageUrl, caption) {
    if (!this._sock) throw new Error("WhatsApp not connected")
    try {
      const sent = await this._sock.sendMessage(jid, {
        image: { url: imageUrl },
        caption: caption ? caption.slice(0, 1024) : undefined,
      })
      if (sent?.key?.id) {
        this._sentMessageIds.add(sent.key.id)
        setTimeout(() => this._sentMessageIds.delete(sent.key.id), 60000)
      }
    } catch (err) {
      console.error("[WA] sendImage failed:", err.message)
      // Fallback: send URL as text
      await this.send(jid, `${caption ? caption + "\n" : ""}${imageUrl}`)
    }
  }

  get socket() {
    return this._sock
  }

  get isConnecting() {
    return this._connecting
  }

  get permanentlyFailed() {
    return this._permanentlyFailed === true
  }

  _scheduleRetry(delaySec) {
    if (this._retryTimer) clearTimeout(this._retryTimer)
    this._connecting = true
    this._retryTimer = setTimeout(() => {
      this._retryTimer = null
      this._connect()
    }, delaySec * 1000)
  }

  async _connect() {
    // Prevent concurrent connection attempts
    if (this._connectLock) {
      console.log("[WA] Connection attempt already in progress — skipping")
      return
    }
    this._connectLock = true

    try {
      // Close any existing socket before creating a new one
      if (this._sock) {
        console.log("[WA] Closing previous socket before reconnecting...")
        try { this._sock.ev.removeAllListeners(); this._sock.end() } catch {}
        this._sock = null
      }

      const { state, saveCreds } = await usePgAuthState(
        process.env.DATABASE_URL,
        this.userId
      )

      // Fetch latest WhatsApp Web version to avoid 405 rejection
      let version
      try {
        const v = await fetchLatestBaileysVersion()
        version = v.version
        console.log(`[WA] Using WhatsApp version: ${version.join(".")}`)
      } catch (err) {
        console.warn("[WA] Could not fetch latest version, using default")
      }

      const agent = getProxyAgent()
      const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        browser: Browsers.macOS("Desktop"),
        connectTimeoutMs: 60000,
        syncFullHistory: false,
        ...(version ? { version } : {}),
        ...(agent ? { agent, fetchAgent: agent } : {}),
      })

      this._sock = sock
      this._running = true
      this._connectLock = false

      // Handle connection updates
      sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update

        if (qr) {
          console.log("[WA] QR code received — writing to channel_events")
          await this.writeEvent("qr", qr)
        }

        if (connection === "close") {
          // Only handle close for the CURRENT socket — ignore stale sockets
          if (this._sock !== sock) return
          this._sock = null

          const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode

          console.log(`[WA] Connection closed (code: ${statusCode})`)
          await this.writeEvent("disconnected", String(statusCode)).catch(() => {})
          await this.updateStatus("disconnected").catch(() => {})

          if (statusCode === DisconnectReason.loggedOut) {
            console.log("[WA] Logged out — clearing auth state")
            await this.pool.query("DELETE FROM baileys_auth WHERE user_id = $1", [this.userId])
            await this.writeEvent("logged_out", null).catch(() => {})
            this._connecting = false
          } else if (statusCode === 440) {
            // Conflict: another WhatsApp Web session replaced us
            if (!this._conflictRetried) {
              this._conflictRetried = true
              console.log("[WA] Conflict detected (deploy overlap) — waiting 10s then retrying...")
              this._scheduleRetry(10)
            } else {
              console.log("[WA] Conflict persists — stopping. Reconnect from dashboard.")
              this._connecting = false
              this._permanentlyFailed = true
              await this.writeEvent("error", "Another WhatsApp Web session is active.").catch(() => {})
            }
          } else if (this._retryCount < 5) {
            const delay = Math.min(2 * Math.pow(2, this._retryCount), 20)
            this._retryCount++
            console.log(`[WA] Reconnecting in ${delay}s (attempt ${this._retryCount})...`)
            this._scheduleRetry(delay)
          } else {
            console.log("[WA] Max retries reached — stopping")
            this._connecting = false
          }
        }

        if (connection === "open") {
          console.log("[WA] Connected successfully!")
          this._retryCount = 0
          this._conflictRetried = false
          this._connecting = false
          await this.writeEvent("connected", null).catch(() => {})
          await this.updateStatus("connected").catch(() => {})
        }
      })

      // Handle credential updates
      sock.ev.on("creds.update", saveCreds)

      // Handle incoming messages
      sock.ev.on("messages.upsert", async (upsert) => {
        // Ignore events from stale sockets
        if (this._sock !== sock) return

        const msgs = upsert.messages || upsert
        const type = upsert.type || "notify"

        if (type !== "notify") return

        for (const msg of msgs) {
          if (msg.key.id && this._sentMessageIds.has(msg.key.id)) continue

          const text =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption ||
            ""

          if (!text.trim()) continue

          const jid = msg.key.remoteJid
          const pushName = msg.pushName || "User"
          const peer = jid.replace(/@s\.whatsapp\.net$/, "")

          console.log(`[WA:Receive] From ${pushName} (${peer}): "${text.slice(0, 60)}"`)

          try {
            const result = await this.handleMessage(peer, text.trim(), {
              channelName: "WhatsApp",
              onTyping: () => {
                sock.sendPresenceUpdate("composing", jid).catch(() => {})
              },
            })

            await this.send(jid, result.reply)

            // Send generated images as actual photos in chat
            for (const img of result.images) {
              await this.sendImage(jid, img.url, img.caption)
            }

            sock.sendPresenceUpdate("available", jid).catch(() => {})

            const preview = (s) => (s || "").slice(0, 50).replace(/\n/g, " ")
            console.log(`[WA] ${pushName}: "${preview(text)}" → "${preview(result.reply)}"`)
          } catch (err) {
            console.error("[WA] Pipeline error:", err.message)
            const errSent = await sock.sendMessage(jid, { text: "Sorry, something went wrong. Please try again." }).catch(() => null)
            if (errSent?.key?.id) {
              this._sentMessageIds.add(errSent.key.id)
              setTimeout(() => this._sentMessageIds.delete(errSent.key.id), 60000)
            }
          }
        }
      })
    } catch (err) {
      this._connectLock = false
      this._connecting = false
      console.error("[WA] Fatal error:", err.message)
      if (this._retryCount < 5) {
        const delay = Math.min(2 * Math.pow(2, this._retryCount), 20)
        this._retryCount++
        console.log(`[WA] Retrying in ${delay}s...`)
        this._scheduleRetry(delay)
      }
    }
  }
}
