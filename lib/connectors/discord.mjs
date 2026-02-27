/**
 * Dryads AI — Discord Connector
 * discord.js client with message intents.
 */

import { Client, GatewayIntentBits } from "discord.js"
import { BaseConnector } from "./base.mjs"
import { transcribeFromUrl, getOpenAIKeyForUser } from "../ai/stt.mjs"

export class DiscordConnector extends BaseConnector {
  constructor(userId, config, pool) {
    super(userId, "discord", "business", config, pool)
    this._token = config.botToken
    this._client = null
  }

  async start() {
    if (!this._token) {
      console.log("[DC] No Discord bot token — skipping")
      return
    }

    console.log("[DC] Starting Discord bot...")

    this._client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
    })

    this._client.on("ready", async () => {
      console.log(`[DC] Connected as ${this._client.user.tag}`)
      await this.writeEvent("connected", this._client.user.tag).catch(() => {})
      await this.updateStatus("connected")
      this._running = true
    })

    this._client.on("messageCreate", async (message) => {
      if (message.author.bot) return

      let text = message.content?.trim() || ""

      // Check for audio attachments (voice messages, audio files)
      const audioAttachment = message.attachments?.find(
        (a) => a.contentType?.startsWith("audio/") || a.name?.match(/\.(ogg|mp3|wav|m4a|webm|opus)$/i)
      )

      if (!text && !audioAttachment) return

      const peer = `${message.channel.id}:${message.author.id}`

      // STT: Transcribe audio attachments
      if (audioAttachment) {
        console.log(`[DC:Voice] From ${message.author.username}: audio attachment (${audioAttachment.name}, ${audioAttachment.size} bytes)`)
        try {
          const openaiKey = await getOpenAIKeyForUser(this.pool, this.userId)
          if (!openaiKey) {
            await message.reply("⚙️ Voice transcription requires an OpenAI API key. Add one in Settings.")
            return
          }
          message.channel.sendTyping().catch(() => {})
          const ext = audioAttachment.name?.split(".").pop() || "ogg"
          const sttResult = await transcribeFromUrl(openaiKey, audioAttachment.url, { filename: `voice.${ext}` })
          if (!sttResult.text.trim()) {
            console.log("[DC:Voice] Transcription empty — skipping")
            return
          }
          text = sttResult.text
          console.log(`[DC:Voice] Transcribed: "${text.slice(0, 80)}"`)
        } catch (err) {
          console.error("[DC:Voice] STT error:", err.message)
          await message.reply("Sorry, I couldn't understand the audio. Please try again or type your message.").catch(() => {})
          return
        }
      }

      console.log(`[DC:Receive] From ${message.author.username} in #${message.channel.name || "DM"}: "${text.slice(0, 60)}"`)

      try {
        message.channel.sendTyping().catch(() => {})

        const result = await this.handleMessage(peer, text, {
          channelName: "Discord",
          isVoiceNote: !!audioAttachment,
          onTyping: () => {
            message.channel.sendTyping().catch(() => {})
          },
        })

        await this.send(message.channel.id, result.reply, message)

        // Send generated images as actual files in chat
        for (const img of result.images) {
          await this.sendImage(message.channel.id, img.url, img.caption, message)
        }

        const preview = (s) => (s || "").slice(0, 50).replace(/\n/g, " ")
        console.log(`[DC] ${message.author.username}: "${preview(text)}" → "${preview(result.reply)}"`)
      } catch (err) {
        console.error("[DC] Pipeline error:", err.message)
        await message.reply("Sorry, something went wrong. Please try again.").catch(() => {})
      }
    })

    this._client.on("error", (err) => {
      console.error("[DC] Client error:", err.message)
    })

    try {
      await this._client.login(this._token)
    } catch (err) {
      console.error("[DC] Login failed:", err.message)
      await this.writeEvent("error", err.message).catch(() => {})
    }
  }

  async stop() {
    this._running = false
    if (this._client) {
      this._client.destroy()
      this._client = null
    }
  }

  async sendImage(channelId, imageUrl, caption, originalMessage) {
    if (!this._client) throw new Error("Discord not connected")
    try {
      const channel = originalMessage?.channel || await this._client.channels.fetch(channelId)
      await channel.send({
        content: caption || undefined,
        files: [imageUrl],
      })
    } catch (err) {
      console.error("[DC] sendImage failed:", err.message)
      await this.send(channelId, `${caption ? caption + "\n" : ""}${imageUrl}`)
    }
  }

  async send(channelId, text, originalMessage) {
    if (!this._client) throw new Error("Discord not connected")

    // Split long messages (Discord limit: 2000 chars)
    const chunks = []
    for (let i = 0; i < text.length; i += 1900) {
      chunks.push(text.slice(i, i + 1900))
    }

    const channel = originalMessage?.channel || await this._client.channels.fetch(channelId)

    for (let i = 0; i < chunks.length; i++) {
      if (i === 0 && originalMessage) {
        await originalMessage.reply(chunks[i])
      } else {
        await channel.send(chunks[i])
      }
    }
  }
}
