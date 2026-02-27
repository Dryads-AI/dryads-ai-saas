/**
 * Dryads AI — AI Router Middleware
 * Calls the appropriate AI provider and sets ctx.reply.
 * Uses ctx.systemPrompt from persona middleware (with basic fallback).
 */

import { callAI } from "../ai/registry.mjs"

const FALLBACK_PROMPT = `You are Dryads AI, an intelligent AI assistant. Be helpful, accurate, and direct. Keep responses concise.`

/**
 * @param {import("pg").Pool} pool - For looking up API keys
 */
export function aiRouterMiddleware(pool) {
  return async function aiRouter(ctx, next) {
    // Resolve API key for the provider — use admin's platform key first, then env fallback
    const provider = ctx.aiProvider || "openai"
    const keyRes = await pool.query(
      `SELECT u."apiKey" FROM "UserApiKey" u
       JOIN "User" usr ON usr.id = u."userId"
       WHERE usr.role = 'admin' AND u.provider = $1 LIMIT 1`,
      [provider]
    )

    const envKeyMap = {
      openai: "OPENAI_API_KEY",
      gemini: "GEMINI_API_KEY",
      anthropic: "ANTHROPIC_API_KEY",
    }
    const rawKey = keyRes.rows[0]?.apiKey || process.env[envKeyMap[provider] || "OPENAI_API_KEY"]
    if (!rawKey) throw new Error(`No API key configured for ${provider}`)
    // Strip invisible Unicode chars from API keys (e.g. U+2028 from copy-paste)
    // eslint-disable-next-line no-control-regex
    const apiKey = rawKey.replace(/[^\x20-\x7E]/g, "").trim()

    // Use persona-built system prompt, or fall back to basic
    const systemPrompt = ctx.systemPrompt || FALLBACK_PROMPT

    // Build messages array
    const messages = [
      { role: "system", content: systemPrompt },
      ...ctx.history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: ctx.text },
    ]

    ctx.toolsUsed = ctx.toolsUsed || []

    // Attach pool to ctx so context-aware tools can access the database
    ctx.pool = ctx.pool || pool

    // Also resolve OpenAI key for tools that need it (e.g., image_generation)
    if (provider === "openai") {
      ctx.openaiApiKey = apiKey
    } else {
      try {
        const oaiKeyRes = await pool.query(
          `SELECT u."apiKey" FROM "UserApiKey" u
           JOIN "User" usr ON usr.id = u."userId"
           WHERE usr.role = 'admin' AND u.provider = 'openai' LIMIT 1`
        )
        ctx.openaiApiKey = oaiKeyRes.rows[0]?.apiKey || process.env.OPENAI_API_KEY || null
      } catch { ctx.openaiApiKey = process.env.OPENAI_API_KEY || null }
    }

    console.log(`[MW:AI] Calling ${provider}/${ctx.aiModel} (intent: ${ctx.intentClass || "n/a"}, complexity: ${ctx.complexityClass || "n/a"})`)

    const startTime = Date.now()
    const result = await callAI(provider, apiKey, messages, ctx.aiModel, {
      onTyping: ctx.onTyping,
      ctx,
    })

    ctx.reply = result.reply
    ctx.toolsUsed.push(...result.toolsUsed)

    const elapsed = Date.now() - startTime
    console.log(
      `[MW:AI] Response ready (${elapsed}ms, provider: ${provider}${ctx.toolsUsed.length > 0 ? ", tools: " + ctx.toolsUsed.join(", ") : ""})`
    )

    await next()
  }
}
