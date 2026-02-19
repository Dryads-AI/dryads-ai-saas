import { BaseChannel, ChannelConfig, ChannelType, MessageHandler } from "./base"
import { WebChatChannel } from "./web-chat"
import { TelegramChannel } from "./telegram"
import { DiscordChannel } from "./discord"

type ChannelFactory = () => BaseChannel

const channelRegistry = new Map<ChannelType, ChannelFactory>()
channelRegistry.set("web", () => new WebChatChannel())
channelRegistry.set("telegram", () => new TelegramChannel())
channelRegistry.set("discord", () => new DiscordChannel())

export class ChannelManager {
  private channels: Map<string, BaseChannel> = new Map()
  private globalHandler?: MessageHandler

  static registerChannel(type: ChannelType, factory: ChannelFactory) {
    channelRegistry.set(type, factory)
  }

  static getAvailableChannels(): ChannelType[] {
    return Array.from(channelRegistry.keys())
  }

  onMessage(handler: MessageHandler) {
    this.globalHandler = handler
  }

  async connectChannel(
    key: string,
    type: ChannelType,
    config: ChannelConfig
  ): Promise<BaseChannel> {
    const factory = channelRegistry.get(type)
    if (!factory) throw new Error(`Channel type "${type}" not registered`)

    const channel = factory()
    if (this.globalHandler) channel.onMessage(this.globalHandler)
    await channel.connect(config)
    this.channels.set(key, channel)
    return channel
  }

  async disconnectChannel(key: string): Promise<void> {
    const channel = this.channels.get(key)
    if (channel) {
      await channel.disconnect()
      this.channels.delete(key)
    }
  }

  getChannel(key: string): BaseChannel | undefined {
    return this.channels.get(key)
  }

  getConnectedChannels(): Map<string, BaseChannel> {
    return new Map(
      Array.from(this.channels.entries()).filter(([, ch]) => ch.isConnected())
    )
  }

  async disconnectAll(): Promise<void> {
    for (const [key] of this.channels) {
      await this.disconnectChannel(key)
    }
  }
}
