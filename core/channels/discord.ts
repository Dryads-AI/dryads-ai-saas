import { Client, Events, GatewayIntentBits, Message as DiscordMessage } from "discord.js"
import {
  BaseChannel,
  ChannelCapabilities,
  ChannelConfig,
  Attachment,
  UnifiedMessage,
} from "./base"

export class DiscordChannel extends BaseChannel {
  readonly type = "discord" as const
  readonly name = "Discord"
  readonly capabilities: ChannelCapabilities = {
    streaming: false,
    attachments: true,
    reactions: true,
    threads: true,
    editing: true,
    maxMessageLength: 2000,
  }

  private client?: Client
  private _connected = false

  async connect(config: ChannelConfig): Promise<void> {
    const token = config.botToken as string
    if (!token) throw new Error("Discord bot token required")

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
    })

    this.client.on(Events.MessageCreate, async (msg: DiscordMessage) => {
      if (msg.author.bot) return
      if (!this.messageHandler) return

      const attachments: Attachment[] = msg.attachments.map((a) => ({
        type: (a.contentType?.startsWith("image/")
          ? "image"
          : a.contentType?.startsWith("audio/")
            ? "audio"
            : a.contentType?.startsWith("video/")
              ? "video"
              : "file") as Attachment["type"],
        url: a.url,
        name: a.name,
        mimeType: a.contentType || undefined,
        size: a.size,
      }))

      const message: UnifiedMessage = {
        id: msg.id,
        channelType: "discord",
        channelId: msg.channelId,
        userId: msg.author.id,
        userName: msg.author.displayName || msg.author.username,
        content: msg.content,
        attachments: attachments.length > 0 ? attachments : undefined,
        replyTo: msg.reference?.messageId || undefined,
        timestamp: msg.createdAt,
        metadata: {
          guildId: msg.guildId,
          guildName: msg.guild?.name,
          channelName: "name" in msg.channel ? msg.channel.name : "DM",
        },
      }

      await this.messageHandler(message)
    })

    await this.client.login(token)
    this._connected = true
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.destroy()
      this._connected = false
    }
  }

  isConnected(): boolean {
    return this._connected
  }

  async sendMessage(
    channelId: string,
    content: string,
    options?: { replyTo?: string; attachments?: Attachment[] }
  ): Promise<void> {
    if (!this.client) throw new Error("Discord client not connected")

    const channel = await this.client.channels.fetch(channelId)
    if (!channel || !("send" in channel)) throw new Error("Invalid channel")

    const chunks = this.splitMessage(content, this.capabilities.maxMessageLength)

    for (let i = 0; i < chunks.length; i++) {
      await (channel as unknown as { send: (opts: Record<string, unknown>) => Promise<unknown> }).send({
        content: chunks[i],
        ...(i === 0 && options?.replyTo
          ? { reply: { messageReference: options.replyTo } }
          : {}),
      })
    }
  }

  private splitMessage(text: string, maxLen: number): string[] {
    if (text.length <= maxLen) return [text]
    const chunks: string[] = []
    let remaining = text
    while (remaining.length > 0) {
      if (remaining.length <= maxLen) {
        chunks.push(remaining)
        break
      }
      let splitAt = remaining.lastIndexOf("\n", maxLen)
      if (splitAt === -1 || splitAt < maxLen / 2) splitAt = maxLen
      chunks.push(remaining.slice(0, splitAt))
      remaining = remaining.slice(splitAt)
    }
    return chunks
  }
}
