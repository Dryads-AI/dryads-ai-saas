export interface ProviderMessage {
  role: "system" | "user" | "assistant" | "tool"
  content: string
  toolCalls?: ToolCall[]
  toolCallId?: string
}

export interface ToolCall {
  id: string
  name: string
  arguments: string
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface StreamChunk {
  type: "text" | "tool_call" | "done" | "error"
  content?: string
  toolCall?: ToolCall
  error?: string
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
}

export interface ProviderConfig {
  apiKey: string
  model?: string
  maxTokens?: number
  temperature?: number
  systemPrompt?: string
}

export abstract class BaseProvider {
  abstract readonly name: string
  abstract readonly models: string[]
  abstract readonly defaultModel: string

  protected config: ProviderConfig

  constructor(config: ProviderConfig) {
    this.config = config
  }

  abstract chat(
    messages: ProviderMessage[],
    options?: {
      model?: string
      tools?: ToolDefinition[]
      temperature?: number
      maxTokens?: number
      systemPrompt?: string
    }
  ): AsyncGenerator<StreamChunk>

  abstract countTokens(text: string): number
}
