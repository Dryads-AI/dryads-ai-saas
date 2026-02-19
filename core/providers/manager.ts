import { BaseProvider, ProviderConfig } from "./base"
import { OpenAIProvider } from "./openai"

type ProviderFactory = (config: ProviderConfig) => BaseProvider

const providerRegistry: Map<string, ProviderFactory> = new Map([
  ["openai", (config) => new OpenAIProvider(config)],
])

export class ProviderManager {
  private instances: Map<string, BaseProvider> = new Map()

  static registerProvider(name: string, factory: ProviderFactory) {
    providerRegistry.set(name, factory)
  }

  static getAvailableProviders(): string[] {
    return Array.from(providerRegistry.keys())
  }

  createProvider(name: string, config: ProviderConfig): BaseProvider {
    const factory = providerRegistry.get(name)
    if (!factory) throw new Error(`Provider "${name}" not registered`)

    const provider = factory(config)
    this.instances.set(name, provider)
    return provider
  }

  getProvider(name: string): BaseProvider | undefined {
    return this.instances.get(name)
  }

  getOrCreate(name: string, config: ProviderConfig): BaseProvider {
    return this.instances.get(name) || this.createProvider(name, config)
  }

  removeProvider(name: string) {
    this.instances.delete(name)
  }
}
