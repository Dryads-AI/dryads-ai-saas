/**
 * Dryads AI — Footer Middleware
 * Optionally prefixes AI model tag and/or appends footer signature to ctx.reply.
 */

const MODEL_DISPLAY_NAMES = {
  "gpt-5.2-chat-latest": "GPT-5.2",
  "gpt-4.5-preview": "GPT-4.5",
  "gpt-4o": "GPT-4o",
  "gemini-2.5-flash": "Gemini 2.5",
  "gemini-2.0-flash": "Gemini 2.0",
  "gemini-2.5-pro": "Gemini 2.5 Pro",
  "claude-opus-4-6": "Claude Opus",
  "claude-sonnet-4-6": "Claude Sonnet",
  "claude-haiku-4-5-20251001": "Claude Haiku",
}

/**
 * Footer middleware factory.
 * @param {object} [opts]
 * @param {boolean} [opts.showModelTag=false] — Prefix reply with [GPT-5.2] or [Gemini 2.5]
 * @param {string|null} [opts.footerText=null] — Append a footer signature
 */
export function footerMiddleware(opts = {}) {
  const { showModelTag = false, footerText = null } = opts

  return async function footer(ctx, next) {
    await next()

    if (!ctx.reply) return

    // Prefix with model tag
    if (showModelTag && ctx.aiModel) {
      const displayName = MODEL_DISPLAY_NAMES[ctx.aiModel] || ctx.aiModel
      ctx.reply = `[${displayName}] ${ctx.reply}`
    }

    // Append footer signature
    if (footerText) {
      ctx.reply = `${ctx.reply}\n\n${footerText}`
    }
  }
}
