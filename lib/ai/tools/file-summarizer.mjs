/**
 * Dryads AI — File Summarizer Tool
 * Processes and summarizes long text content.
 */

import { toolRegistry } from "../tool-registry.mjs"

toolRegistry.register(
  "summarize_text",
  {
    description:
      "Summarize a long piece of text into key points. Use this when the user provides or references a long document, article, or text and wants a summary. Also useful for condensing search results or page content.",
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "The long text content to summarize",
        },
        style: {
          type: "string",
          enum: ["bullet_points", "paragraph", "tldr"],
          description: "Summary style: bullet_points (default), paragraph, or tldr (very brief)",
        },
        max_points: {
          type: "number",
          description: "Maximum number of key points (for bullet_points style). Default: 5",
        },
      },
      required: ["text"],
    },
  },
  async (args) => {
    const { text, style = "bullet_points", max_points = 5 } = args
    if (!text) return "No text provided to summarize."

    console.log(`[Tools:Summarizer] Summarizing ${text.length} chars (style: ${style})`)

    // Truncate very long input to avoid token overflow
    const maxInput = 8000
    const truncated = text.length > maxInput
    const processedText = text.slice(0, maxInput)

    // Return structured instruction for the AI model to summarize
    return JSON.stringify({
      instruction: `Summarize the following text in ${style === "tldr" ? "one brief sentence" : style === "paragraph" ? "a concise paragraph" : `up to ${max_points} bullet points`}.`,
      text: processedText,
      style,
      max_points,
      truncated,
      original_length: text.length,
    })
  }
)
