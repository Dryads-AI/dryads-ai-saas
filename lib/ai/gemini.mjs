/**
 * Dryads AI — Google Gemini Provider
 * Handles Gemini chat completions with function calling support.
 * Uses pluggable tool registry with 10-round agent loop + 20-call safety cap.
 */

import { GoogleGenAI } from "@google/genai"
import { toolRegistry } from "./tool-registry.mjs"

/**
 * Convert OpenAI-format messages to Gemini format.
 * System messages are passed via systemInstruction.
 */
function toGeminiContents(messages) {
  const contents = []
  for (const msg of messages) {
    if (msg.role === "system") continue // handled separately
    if (msg.role === "tool") continue // handled in function response below

    const role = msg.role === "assistant" ? "model" : "user"
    contents.push({ role, parts: [{ text: msg.content }] })
  }
  return contents
}

/**
 * Call Gemini with messages, supporting multi-round function calls.
 * @param {string} apiKey - Google AI API key
 * @param {Array} messages - OpenAI-format messages [{role, content}]
 * @param {string} model - Model name (default: gemini-2.5-flash)
 * @param {object} opts - { onTyping, ctx }
 * @returns {{ reply: string, toolsUsed: string[] }}
 */
export async function callGemini(apiKey, messages, model = "gemini-2.5-flash", opts = {}) {
  const ai = new GoogleGenAI({ apiKey })

  // Extract system instruction
  const systemMsg = messages.find((m) => m.role === "system")
  const systemInstruction = systemMsg?.content || ""

  const functionDeclarations = toolRegistry.getGeminiDeclarations()
  console.log(`[AI:Gemini] Tools loaded: ${functionDeclarations.length} (${toolRegistry.getToolNames().join(", ")})`)
  const toolsUsed = []
  const maxRounds = 10
  const maxTotalToolCalls = 20
  let round = 0
  let totalToolCalls = 0

  // Build initial contents
  const contents = toGeminiContents(messages)

  while (round < maxRounds) {
    round++

    console.log(`[AI:Gemini] Round ${round} — sending to ${model}...`)

    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction,
        temperature: 0.7,
        maxOutputTokens: 2048,
        tools: functionDeclarations.length > 0
          ? [{ functionDeclarations }]
          : undefined,
      },
    })

    // Check for function calls
    const candidate = response.candidates?.[0]
    const parts = candidate?.content?.parts || []

    const functionCalls = parts.filter((p) => p.functionCall)

    if (functionCalls.length > 0) {
      // Add model response to contents
      contents.push({ role: "model", parts })

      // Execute each function call
      const functionResponses = []
      for (const part of functionCalls) {
        if (totalToolCalls >= maxTotalToolCalls) {
          console.warn(`[AI:Gemini] Safety cap reached (${maxTotalToolCalls} tool calls). Stopping.`)
          functionResponses.push({
            functionResponse: {
              name: part.functionCall.name,
              response: { result: "Tool call limit reached. Please provide your best answer with the information gathered so far." },
            },
          })
          continue
        }

        const { name, args } = part.functionCall

        console.log(`[AI:Gemini] Function call: ${name}(${JSON.stringify(args).slice(0, 80)})`)

        let result
        try {
          if (opts.onTyping) opts.onTyping()
          result = await toolRegistry.execute(name, args || {}, opts.ctx || {})
          toolsUsed.push(name)
          totalToolCalls++
        } catch (err) {
          console.error(`[AI:Gemini] Tool error (${name}):`, err.message)
          result = `Error: ${err.message}`
        }

        functionResponses.push({
          functionResponse: {
            name,
            response: { result },
          },
        })
      }

      // Add function responses
      contents.push({ role: "user", parts: functionResponses })
      continue
    }

    // Extract text response
    const textParts = parts.filter((p) => p.text)
    const reply = textParts.map((p) => p.text).join("") || "Sorry, I couldn't generate a response."

    return { reply, toolsUsed }
  }

  return { reply: "Sorry, I took too long thinking. Please try again.", toolsUsed }
}
