export type ChannelType =
  | "web"
  | "whatsapp"
  | "telegram"
  | "discord"
  | "slack"
  | "signal"
  | "line"
  | "matrix"
  | "msteams"
  | "googlechat"
  | "mattermost"
  | "irc"
  | "twitch"
  | "nostr"
  | "zalo"
  | "imessage"

export interface Attachment {
  type: "image" | "audio" | "video" | "file"
  url: string
  name?: string
  mimeType?: string
  size?: number
}

export interface UnifiedMessage {
  id: string
  channelType: ChannelType
  channelId: string
  userId: string
  userName?: string
  content: string
  attachments?: Attachment[]
  replyTo?: string
  timestamp: Date
  metadata: Record<string, unknown>
}

export interface ChannelCapabilities {
  streaming: boolean
  attachments: boolean
  reactions: boolean
  threads: boolean
  editing: boolean
  maxMessageLength: number
}

export interface ChannelConfig {
  [key: string]: unknown
}

export type MessageHandler = (message: UnifiedMessage) => Promise<void>

export abstract class BaseChannel {
  abstract readonly type: ChannelType
  abstract readonly name: string
  abstract readonly capabilities: ChannelCapabilities

  protected messageHandler?: MessageHandler

  onMessage(handler: MessageHandler) {
    this.messageHandler = handler
  }

  abstract connect(config: ChannelConfig): Promise<void>
  abstract disconnect(): Promise<void>
  abstract sendMessage(channelId: string, content: string, options?: {
    replyTo?: string
    attachments?: Attachment[]
  }): Promise<void>

  abstract isConnected(): boolean
}
