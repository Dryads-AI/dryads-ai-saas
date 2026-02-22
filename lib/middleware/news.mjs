/**
 * DMMS AI — News Middleware
 * Detects news-related queries and pre-fetches search results.
 * Sets ctx.newsContext for the persona system prompt to consume.
 * Saves an AI round-trip: instead of AI calling web_search, news is pre-fetched.
 */

import { webSearch } from "../ai/tools.mjs"

// ── News Detection Patterns ────────────────────────────────────────

const NEWS_PATTERNS = [
  /\b(news|breaking|headlines?|latest|update|what'?s happening)\b/i,
  /\b(weather|forecast|temperature)\b/i,
  /\b(scores?|results?|standings?|match|game)\b.*\b(today|yesterday|tonight|this week)\b/i,
  /\b(stock|shares?|market|price|crypto|bitcoin|ethereum)\b.*\b(today|now|current|latest)\b/i,
  /\b(earthquake|hurricane|tornado|flood|wildfire|disaster)\b/i,
  /\b(election|vote|poll|president|congress)\b.*\b(latest|results?|update)\b/i,
  /\bwhat'?s\s+(new|going on|the latest)\b/i,
  /\b(trending|viral|popular)\b.*\b(today|now|this week)\b/i,
]

/**
 * Check if a message looks like a news/current-events query.
 */
function isNewsQuery(text) {
  return NEWS_PATTERNS.some((pattern) => pattern.test(text))
}

/**
 * Build a search query from the user's message, optimized for news.
 */
function buildNewsQuery(text) {
  // Strip question words and filler for a cleaner search query
  const cleaned = text
    .replace(/^(what'?s|what is|tell me|give me|show me|any)\s+/i, "")
    .replace(/\b(the|a|an|about|regarding|on|in|for)\b/gi, "")
    .replace(/[?!.]+$/, "")
    .replace(/\s+/g, " ")
    .trim()

  const year = new Date().getFullYear()
  return `${cleaned} ${year} latest`
}

// ── Middleware ──────────────────────────────────────────────────────

/**
 * News middleware factory.
 */
export function newsMiddleware() {
  return async function news(ctx, next) {
    ctx.newsContext = null

    const text = ctx.text || ""

    if (isNewsQuery(text)) {
      const query = buildNewsQuery(text)
      console.log(`[MW:News] News query detected, pre-fetching: "${query}"`)

      try {
        const result = await webSearch({ query })
        if (result && !result.startsWith("No search results") && !result.startsWith("Web search failed")) {
          ctx.newsContext = result
          console.log(`[MW:News] Pre-fetched news context (${result.length} chars)`)
        } else {
          console.log(`[MW:News] No useful results for: "${query}"`)
        }
      } catch (err) {
        console.error(`[MW:News] Pre-fetch failed:`, err.message)
      }
    }

    await next()
  }
}
