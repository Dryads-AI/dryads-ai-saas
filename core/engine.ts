import { ChannelManager } from "./channels/manager"
import { ProviderManager } from "./providers/manager"
import { MessageRouter } from "./middleware/router"
import { ChannelType } from "./channels/base"

/**
 * DMMS AI Core Engine
 * Orchestrates channels, providers, and message routing.
 */
export class DMSEngine {
  readonly channels: ChannelManager
  readonly providers: ProviderManager
  readonly router: MessageRouter

  constructor() {
    this.channels = new ChannelManager()
    this.providers = new ProviderManager()
    this.router = new MessageRouter(this.channels, this.providers)

    // Wire up: when any channel receives a message, route it
    // The router needs a dbUserId which we get from the channel key
    this.channels.onMessage(async (message) => {
      // For external channels, we need to look up the user from the channel config
      // This is handled per-channel in their webhook/connection setup
      console.log(`[Engine] Message from ${message.channelType}:${message.userId}: ${message.content.slice(0, 50)}`)
    })
  }

  /** Initialize the AI provider for a user */
  initProvider(provider: string, apiKey: string, model?: string) {
    this.providers.getOrCreate(provider, { apiKey, model })
  }

  /** Connect a channel for a specific user */
  async connectChannel(
    userId: string,
    channelType: ChannelType,
    config: Record<string, unknown>
  ) {
    const key = `${channelType}:${userId}`
    return this.channels.connectChannel(key, channelType, config)
  }

  /** Disconnect a channel for a specific user */
  async disconnectChannel(userId: string, channelType: ChannelType) {
    const key = `${channelType}:${userId}`
    await this.channels.disconnectChannel(key)
  }

  async shutdown() {
    await this.channels.disconnectAll()
  }
}

// Singleton engine instance
let engine: DMSEngine | null = null

export function getEngine(): DMSEngine {
  if (!engine) engine = new DMSEngine()
  return engine
}
