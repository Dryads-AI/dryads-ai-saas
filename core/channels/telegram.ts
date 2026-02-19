import { Bot, Context } from "grammy"
import {
  BaseChannel,
  ChannelCapabilities,
  ChannelConfig,
  Attachment,
  UnifiedMessage,
} from "./base"

export class TelegramChannel extends BaseChannel {
  readonly type = "telegram" as const
  readonly name = "Telegram"
  readonly capabilities: ChannelCapabilities = {
    streaming: false,
    attachments: true,
    reactions: true,
    threads: true,
    editing: true,
    maxMessageLength: 4096,
  }

  private bot?: Bot
  private _connected = false

  async connect(config: ChannelConfig): Promise<void> {
    const token = config.botToken as string
    if (!token) throw new Error("Telegram bot token required")

    this.bot = new Bot(token)

    this.bot.on("message:text", async (ctx: Context) => {
      if (!this.messageHandler || !ctx.message) return

      const message: UnifiedMessage = {
        id: String(ctx.message.message_id),
        channelType: "telegram",
        channelId: String(ctx.message.chat.id),
        userId: String(ctx.message.from?.id || ""),
        userName:
          ctx.message.from?.first_name +
          (ctx.message.from?.last_name ? ` ${ctx.message.from.last_name}` : ""),
        content: ctx.message.text || "",
        replyTo: ctx.message.reply_to_message
          ? String(ctx.message.reply_to_message.message_id)
          : undefined,
        timestamp: new Date(ctx.message.date * 1000),
        metadata: {
          chatType: ctx.message.chat.type,
          chatTitle: "title" in ctx.message.chat ? ctx.message.chat.title : undefined,
        },
      }

      await this.messageHandler(message)
    })

    this.bot.start()
    this._connected = true
  }

  async disconnect(): Promise<void> {
    if (this.bot) {
      await this.bot.stop()
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
    if (!this.bot) throw new Error("Telegram bot not connected")

    const chatId = Number(channelId)

    // Split long messages
    const chunks = this.splitMessage(content, this.capabilities.maxMessageLength)

    for (const chunk of chunks) {
      await this.bot.api.sendMessage(chatId, chunk, {
        parse_mode: "Markdown",
        ...(options?.replyTo
          ? { reply_parameters: { message_id: Number(options.replyTo) } }
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
