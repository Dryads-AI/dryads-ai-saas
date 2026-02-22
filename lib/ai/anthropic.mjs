/**
 * DMMS AI — Anthropic (Claude) Provider
 * Handles Claude chat completions with tool/function calling support.
 */

import Anthropic from "@anthropic-ai/sdk"
import { TOOLS, executeTool } from "./tools.mjs"

/**
 * Convert OpenAI-format tool definitions to Anthropic format.
 * Anthropic tools use: { name, description, input_schema }
 */
function toAnthropicTools() {
  return TOOLS.map((t) => ({
    name: t.definition.function.name,
    description: t.definition.function.description,
    input_schema: t.definition.function.parameters,
  }))
}

/**
 * Convert OpenAI-format messages to Anthropic format.
 * Anthropic uses: role "user" or "assistant", content as string or content blocks.
 * System messages are extracted separately (passed via `system` param).
 */
function toAnthropicMessages(messages) {
  const result = []

  for (const msg of messages) {
    if (msg.role === "system") continue // handled separately via system param
    if (msg.role === "tool") continue   // handled inline as tool_result blocks

    if (msg.role === "user" || msg.role === "assistant") {
      result.push({ role: msg.role, content: msg.content })
    }
  }

  return result
}

/**
 * Call Claude with messages, supporting multi-round tool calls.
 * @param {string} apiKey - Anthropic API key
 * @param {Array} messages - OpenAI-format messages [{role, content}]
 * @param {string} model - Model name (default: claude-sonnet-4-6)
 * @param {object} opts - { onTyping }
 * @returns {{ reply: string, toolsUsed: string[] }}
 */
export async function callAnthropic(apiKey, messages, model = "claude-sonnet-4-6", opts = {}) {
  const client = new Anthropic({ apiKey })

  // Extract system message
  const systemMsg = messages.find((m) => m.role === "system")
  const system = systemMsg?.content || ""

  const tools = toAnthropicTools()
  const toolsUsed = []
  const maxRounds = 3
  let round = 0

  // Build initial messages
  let msgs = toAnthropicMessages(messages)

  while (round < maxRounds) {
    round++

    console.log(`[AI:Anthropic] Round ${round} — sending to ${model}...`)

    const response = await client.messages.create({
      model,
      max_tokens: 2048,
      system,
      messages: msgs,
      tools: tools.length > 0 ? tools : undefined,
    })

    // Check if model wants to use tools
    const toolUseBlocks = response.content.filter((b) => b.type === "tool_use")

    if (response.stop_reason === "tool_use" && toolUseBlocks.length > 0) {
      // Add assistant response to messages
      msgs.push({ role: "assistant", content: response.content })

      // Execute each tool and collect results
      const toolResults = []
      for (const block of toolUseBlocks) {
        const toolName = block.name
        const toolArgs = block.input || {}

        console.log(`[AI:Anthropic] Tool call: ${toolName}(${JSON.stringify(toolArgs).slice(0, 80)})`)

        let result
        try {
          if (opts.onTyping) opts.onTyping()
          result = await executeTool(toolName, toolArgs)
          toolsUsed.push(toolName)
        } catch (err) {
          console.error(`[AI:Anthropic] Tool error (${toolName}):`, err.message)
          result = `Error: ${err.message}`
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result,
        })
      }

      // Add tool results as a user message
      msgs.push({ role: "user", content: toolResults })
      continue
    }

    // Extract text response
    const textBlocks = response.content.filter((b) => b.type === "text")
    const reply = textBlocks.map((b) => b.text).join("") || "Sorry, I couldn't generate a response."

    return { reply, toolsUsed }
  }

  return { reply: "Sorry, I took too long thinking. Please try again.", toolsUsed }
}
