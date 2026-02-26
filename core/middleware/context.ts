import { ProviderMessage } from "../providers/base"
import { pool } from "@/lib/db"

const DEFAULT_SYSTEM_PROMPT = `You are Dryads AI, a helpful AI assistant. You are knowledgeable, friendly, and concise. You can help with a wide range of tasks including writing, coding, analysis, and general conversation.`

const MAX_CONTEXT_MESSAGES = 50

/** Builds the conversation context (message history) for the AI provider */
export async function buildContext(
  conversationId: string,
  systemPrompt?: string
): Promise<ProviderMessage[]> {
  const result = await pool.query(
    'SELECT role, content, "toolCalls" FROM "Message" WHERE "conversationId" = $1 ORDER BY "createdAt" ASC LIMIT $2',
    [conversationId, MAX_CONTEXT_MESSAGES]
  )

  const context: ProviderMessage[] = [
    { role: "system", content: systemPrompt || DEFAULT_SYSTEM_PROMPT },
  ]

  for (const msg of result.rows) {
    context.push({
      role: msg.role as ProviderMessage["role"],
      content: msg.content,
      toolCalls: msg.toolCalls as unknown as ProviderMessage["toolCalls"],
    })
  }

  return context
}
