/**
 * DMMS AI — Translation Tool
 * Uses the AI provider itself for high-quality translation.
 */

import { toolRegistry } from "../tool-registry.mjs"

toolRegistry.register(
  "translate",
  {
    description:
      "Translate text from one language to another. Supports all major languages. Use this when the user explicitly asks for translation between languages.",
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "The text to translate",
        },
        target_language: {
          type: "string",
          description: "The language to translate to (e.g. 'Spanish', 'French', 'Arabic', 'Chinese', 'Japanese')",
        },
        source_language: {
          type: "string",
          description: "The source language (optional, auto-detected if not provided)",
        },
      },
      required: ["text", "target_language"],
    },
  },
  async (args) => {
    const { text, target_language, source_language } = args
    if (!text || !target_language) return "Missing text or target language."

    console.log(`[Tools:Translate] Translating to ${target_language} (${text.length} chars)`)

    // The AI model itself is the best translator — return instructions for the AI
    // to translate inline (this avoids an extra API call)
    const fromLang = source_language ? ` from ${source_language}` : ""
    return JSON.stringify({
      instruction: `Please translate the following text${fromLang} to ${target_language}. Provide only the translation, no explanations.`,
      text,
      target_language,
      source_language: source_language || "auto-detect",
    })
  }
)
