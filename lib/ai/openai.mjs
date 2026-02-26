/**
 * Dryads AI — OpenAI Provider
 * Handles OpenAI GPT chat completions with tool/function calling support.
 * Uses pluggable tool registry with 10-round agent loop + 20-call safety cap.
 */

import OpenAI from "openai"
import { toolRegistry } from "./tool-registry.mjs"

/**
 * Call OpenAI with messages, supporting multi-round tool calls.
 * @param {string} apiKey - OpenAI API key
 * @param {Array} messages - OpenAI-format messages [{role, content}]
 * @param {string} model - Model name (default: gpt-5.2-chat-latest)
 * @param {object} opts - { onTyping, ctx }
 * @returns {{ reply: string, toolsUsed: string[] }}
 */
export async function callOpenAI(apiKey, messages, model = "gpt-5.2-chat-latest", opts = {}) {
  const openai = new OpenAI({ apiKey })

  const tools = toolRegistry.getDefinitions()
  const maxRounds = 10
  const maxTotalToolCalls = 20
  let round = 0
  let totalToolCalls = 0
  const toolsUsed = []
  let reply = null

  console.log(`[AI:OpenAI] Tools loaded: ${tools.length} (${toolRegistry.getToolNames().join(", ")})`)

  // Clone messages array to avoid mutating caller's copy
  const msgs = [...messages]

  while (round < maxRounds) {
    round++

    const isGPT5 = model.startsWith("gpt-5")
    const params = {
      model,
      messages: msgs,
      max_completion_tokens: 2048,
    }
    // GPT-5.x only supports temperature=1 (default)
    if (!isGPT5) params.temperature = 0.7

    if (tools.length > 0) {
      params.tools = tools
      params.tool_choice = "auto"
    }

    console.log(`[AI:OpenAI] Round ${round} — sending to ${model}...`)
    const completion = await openai.chat.completions.create(params)
    const choice = completion.choices[0]

    if (choice.finish_reason === "tool_calls" || choice.message.tool_calls?.length > 0) {
      msgs.push(choice.message)

      for (const toolCall of choice.message.tool_calls) {
        if (totalToolCalls >= maxTotalToolCalls) {
          console.warn(`[AI:OpenAI] Safety cap reached (${maxTotalToolCalls} tool calls). Stopping.`)
          msgs.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: "Tool call limit reached. Please provide your best answer with the information gathered so far.",
          })
          continue
        }

        const toolName = toolCall.function.name
        const toolArgs = JSON.parse(toolCall.function.arguments || "{}")

        console.log(`[AI:OpenAI] Tool call: ${toolName}(${JSON.stringify(toolArgs).slice(0, 80)})`)

        let result
        try {
          if (opts.onTyping) opts.onTyping()
          result = await toolRegistry.execute(toolName, toolArgs, opts.ctx || {})
          toolsUsed.push(toolName)
          totalToolCalls++
        } catch (err) {
          console.error(`[AI:OpenAI] Tool error (${toolName}):`, err.message)
          result = `Error: ${err.message}`
        }

        msgs.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        })
      }

      if (totalToolCalls >= maxTotalToolCalls) {
        // Force a final completion without tools
        continue
      }

      continue
    }

    reply = choice.message.content || "Sorry, I couldn't generate a response."
    break
  }

  if (!reply) {
    reply = "Sorry, I took too long thinking. Please try again."
  }

  return { reply, toolsUsed }
}
