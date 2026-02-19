import OpenAI from "openai"
import {
  BaseProvider,
  ProviderConfig,
  ProviderMessage,
  StreamChunk,
  ToolDefinition,
} from "./base"

export class OpenAIProvider extends BaseProvider {
  readonly name = "openai"
  readonly models = ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"]
  readonly defaultModel = "gpt-4o"

  private client: OpenAI

  constructor(config: ProviderConfig) {
    super(config)
    this.client = new OpenAI({ apiKey: config.apiKey })
  }

  async *chat(
    messages: ProviderMessage[],
    options?: {
      model?: string
      tools?: ToolDefinition[]
      temperature?: number
      maxTokens?: number
      systemPrompt?: string
    }
  ): AsyncGenerator<StreamChunk> {
    const model = options?.model || this.config.model || this.defaultModel

    const openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
      []

    if (options?.systemPrompt || this.config.systemPrompt) {
      openaiMessages.push({
        role: "system",
        content: (options?.systemPrompt || this.config.systemPrompt)!,
      })
    }

    for (const msg of messages) {
      if (msg.role === "tool") {
        openaiMessages.push({
          role: "tool",
          content: msg.content,
          tool_call_id: msg.toolCallId || "",
        })
      } else if (msg.role === "assistant" && msg.toolCalls?.length) {
        openaiMessages.push({
          role: "assistant",
          content: msg.content || null,
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: tc.arguments },
          })),
        })
      } else {
        openaiMessages.push({
          role: msg.role as "user" | "assistant" | "system",
          content: msg.content,
        })
      }
    }

    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] | undefined =
      options?.tools?.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters as OpenAI.FunctionParameters,
        },
      }))

    try {
      const stream = await this.client.chat.completions.create({
        model,
        messages: openaiMessages,
        tools: tools?.length ? tools : undefined,
        temperature: options?.temperature ?? this.config.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? this.config.maxTokens ?? 4096,
        stream: true,
        stream_options: { include_usage: true },
      })

      const toolCallBuffers: Map<number, { id: string; name: string; args: string }> =
        new Map()

      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta

        if (delta?.content) {
          yield { type: "text", content: delta.content }
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (!toolCallBuffers.has(tc.index)) {
              toolCallBuffers.set(tc.index, {
                id: tc.id || "",
                name: tc.function?.name || "",
                args: "",
              })
            }
            const buf = toolCallBuffers.get(tc.index)!
            if (tc.id) buf.id = tc.id
            if (tc.function?.name) buf.name = tc.function.name
            if (tc.function?.arguments) buf.args += tc.function.arguments
          }
        }

        if (chunk.choices?.[0]?.finish_reason === "tool_calls") {
          for (const [, buf] of toolCallBuffers) {
            yield {
              type: "tool_call",
              toolCall: { id: buf.id, name: buf.name, arguments: buf.args },
            }
          }
        }

        if (chunk.usage) {
          yield {
            type: "done",
            usage: {
              promptTokens: chunk.usage.prompt_tokens,
              completionTokens: chunk.usage.completion_tokens,
              totalTokens: chunk.usage.total_tokens,
            },
          }
        }
      }
    } catch (err) {
      yield {
        type: "error",
        error: err instanceof Error ? err.message : "Unknown OpenAI error",
      }
    }
  }

  countTokens(text: string): number {
    // Rough estimate: ~4 chars per token for English
    return Math.ceil(text.length / 4)
  }
}
