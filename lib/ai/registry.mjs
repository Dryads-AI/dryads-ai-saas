/**
 * DMMS AI — AI Provider Registry
 * Routes AI calls to the appropriate provider (OpenAI, Gemini, etc.)
 */

import { callOpenAI } from "./openai.mjs"
import { callGemini } from "./gemini.mjs"
import { callAnthropic } from "./anthropic.mjs"

/**
 * Default models per provider
 */
const DEFAULT_MODELS = {
  openai: "gpt-5.2-chat-latest",
  gemini: "gemini-2.5-flash",
  anthropic: "claude-sonnet-4-6",
}

/**
 * Sanitize an API key by stripping invisible/non-ASCII characters.
 * Prevents ByteString errors in Node.js fetch when keys contain
 * invisible Unicode chars (e.g. U+2028 LINE SEPARATOR from copy-paste).
 */
function sanitizeKey(key) {
  if (!key) return key
  // eslint-disable-next-line no-control-regex
  return key.replace(/[^\x20-\x7E]/g, "").trim()
}

/**
 * Call the appropriate AI provider.
 * @param {string} provider - "openai", "gemini", or "anthropic"
 * @param {string} apiKey - API key for the provider
 * @param {Array} messages - OpenAI-format messages [{role, content}]
 * @param {string} [model] - Override model name
 * @param {object} [opts] - { onTyping }
 * @returns {{ reply: string, toolsUsed: string[] }}
 */
export async function callAI(provider, apiKey, messages, model, opts = {}) {
  const cleanKey = sanitizeKey(apiKey)
  const resolvedModel = model || DEFAULT_MODELS[provider] || DEFAULT_MODELS.openai

  switch (provider) {
    case "gemini":
      return callGemini(cleanKey, messages, resolvedModel, opts)

    case "anthropic":
      return callAnthropic(cleanKey, messages, resolvedModel, opts)

    case "openai":
    default:
      return callOpenAI(cleanKey, messages, resolvedModel, opts)
  }
}

export { DEFAULT_MODELS }
