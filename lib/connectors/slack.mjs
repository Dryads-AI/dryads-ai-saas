/**
 * Dryads AI — Slack Connector
 * Slack Bolt SDK with Socket Mode.
 */

import { BaseConnector } from "./base.mjs"
import { transcribeFromUrl, getOpenAIKeyForUser } from "../ai/stt.mjs"

export class SlackConnector extends BaseConnector {
  constructor(userId, config, pool) {
    super(userId, "slack", "business", config, pool)
    this._botToken = config.botToken
    this._appToken = config.appToken
    this._app = null
  }

  async start() {
    if (!this._botToken || !this._appToken) {
      console.log("[SLACK] Missing bot/app token — skipping")
      return
    }

    console.log("[SLACK] Starting Slack bot...")

    try {
      const { default: bolt } = await import("@slack/bolt")
      this._app = new bolt.App({
        token: this._botToken,
        appToken: this._appToken,
        socketMode: true,
      })

      this._app.message(async ({ message, say }) => {
        if (message.subtype && message.subtype !== "file_share") return

        let text = message.text?.trim() || ""

        // Check for audio file uploads
        const audioFile = message.files?.find(
          (f) => f.mimetype?.startsWith("audio/") || f.name?.match(/\.(ogg|mp3|wav|m4a|webm|opus)$/i)
        )

        if (!text && !audioFile) return

        const peer = `${message.channel}:${message.user}`

        // STT: Transcribe audio files
        if (audioFile) {
          console.log(`[SLACK:Voice] From ${message.user}: audio file (${audioFile.name}, ${audioFile.mimetype})`)
          try {
            const openaiKey = await getOpenAIKeyForUser(this.pool, this.userId)
            if (!openaiKey) {
              await say("⚙️ Voice transcription requires an OpenAI API key. Add one in Settings.")
              return
            }
            // Slack files need bot token auth to download
            const downloadUrl = audioFile.url_private_download || audioFile.url_private
            const res = await fetch(downloadUrl, {
              headers: { Authorization: `Bearer ${this._botToken}` },
              signal: AbortSignal.timeout(30000),
            })
            if (!res.ok) throw new Error(`Slack file download failed: ${res.status}`)
            const buffer = Buffer.from(await res.arrayBuffer())

            const { transcribeAudio } = await import("../ai/stt.mjs")
            const ext = audioFile.name?.split(".").pop() || "ogg"
            const sttResult = await transcribeAudio(openaiKey, buffer, { filename: `voice.${ext}` })
            if (!sttResult.text.trim()) {
              console.log("[SLACK:Voice] Transcription empty — skipping")
              return
            }
            text = sttResult.text
            console.log(`[SLACK:Voice] Transcribed: "${text.slice(0, 80)}"`)
          } catch (err) {
            console.error("[SLACK:Voice] STT error:", err.message)
            await say("Sorry, I couldn't understand the audio. Please try again or type your message.").catch(() => {})
            return
          }
        }

        console.log(`[SLACK:Receive] From ${message.user}: "${text.slice(0, 60)}"`)

        try {
          const result = await this.handleMessage(peer, text, {
            channelName: "Slack",
            isVoiceNote: !!audioFile,
          })
          await say(result.reply)

          // Send generated images as Slack image blocks
          for (const img of result.images) {
            await this.sendImage(message.channel, img.url, img.caption)
          }

          console.log("[SLACK] Reply sent")
        } catch (err) {
          console.error("[SLACK] Pipeline error:", err.message)
          await say("Sorry, something went wrong.").catch(() => {})
        }
      })

      await this._app.start()
      this._running = true
      console.log("[SLACK] Connected!")
      await this.writeEvent("connected", null)
      await this.updateStatus("connected")
    } catch (err) {
      console.error("[SLACK] Failed:", err.message)
      await this.writeEvent("error", err.message).catch(() => {})
    }
  }

  async stop() {
    this._running = false
    if (this._app) {
      await this._app.stop().catch(() => {})
      this._app = null
    }
  }

  async sendImage(channel, imageUrl, caption) {
    if (!this._app) throw new Error("Slack not connected")
    try {
      await this._app.client.chat.postMessage({
        channel,
        text: caption || "Generated image",
        blocks: [
          {
            type: "image",
            image_url: imageUrl,
            alt_text: caption || "AI generated image",
            ...(caption ? { title: { type: "plain_text", text: caption.slice(0, 200) } } : {}),
          },
        ],
      })
    } catch (err) {
      console.error("[SLACK] sendImage failed:", err.message)
      await this.send(channel, `${caption ? caption + "\n" : ""}${imageUrl}`)
    }
  }

  async send(channel, text) {
    if (!this._app) throw new Error("Slack not connected")
    await this._app.client.chat.postMessage({
      channel,
      text,
    })
  }
}
