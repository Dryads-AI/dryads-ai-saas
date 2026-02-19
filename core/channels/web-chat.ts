import { BaseChannel, ChannelCapabilities, ChannelConfig, Attachment, UnifiedMessage } from "./base"

/**
 * Web Chat channel — browser-based chat built into the dashboard.
 * Messages arrive via API/WebSocket, not via an external service.
 * This channel acts as a thin adapter that formats web messages
 * into the unified format and sends responses back.
 */
export class WebChatChannel extends BaseChannel {
  readonly type = "web" as const
  readonly name = "Web Chat"
  readonly capabilities: ChannelCapabilities = {
    streaming: true,
    attachments: true,
    reactions: false,
    threads: false,
    editing: true,
    maxMessageLength: 100000,
  }

  private connected = false

  async connect(): Promise<void> {
    this.connected = true
  }

  async disconnect(): Promise<void> {
    this.connected = false
  }

  isConnected(): boolean {
    return this.connected
  }

  async sendMessage(
    _channelId: string,
    _content: string,
    _options?: { replyTo?: string; attachments?: Attachment[] }
  ): Promise<void> {
    // Web chat responses are streamed directly via the API route,
    // so this is a no-op. The API handles the SSE stream to the browser.
  }

  /** Called by the chat API route to feed incoming user messages into the pipeline */
  async handleIncomingMessage(params: {
    userId: string
    userName?: string
    content: string
    conversationId: string
  }): Promise<void> {
    if (!this.messageHandler) return

    const message: UnifiedMessage = {
      id: crypto.randomUUID(),
      channelType: "web",
      channelId: params.conversationId,
      userId: params.userId,
      userName: params.userName,
      content: params.content,
      timestamp: new Date(),
      metadata: {},
    }

    await this.messageHandler(message)
  }
}
