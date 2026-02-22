/**
 * DMMS AI — Enrichment Middleware
 * Detects URLs in the user's message, fetches their content in parallel,
 * and makes it available for the persona system prompt.
 * Sets ctx.enrichedContent (array of {url, title, content}) and ctx.detectedUrls.
 */

import { fetchPageContent } from "../ai/tools.mjs"

const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/gi
const MAX_URLS = 3
const FETCH_TIMEOUT = 8000

/**
 * Extract a <title> from raw HTML.
 */
function extractTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (!match) return ""
  return match[1]
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Fetch a URL and return { url, title, content }.
 */
async function fetchUrlInfo(url) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; DMMS-AI/4.0; +https://dmms.ai)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
      redirect: "follow",
    })
    if (!res.ok) return { url, title: "", content: "" }

    const html = await res.text()
    const title = extractTitle(html)
    const content = await fetchPageContent(url, 3000)

    return { url, title, content }
  } catch {
    return { url, title: "", content: "" }
  }
}

/**
 * Enrichment middleware factory.
 */
export function enrichmentMiddleware() {
  return async function enrichment(ctx, next) {
    ctx.detectedUrls = []
    ctx.enrichedContent = []

    const text = ctx.text || ""
    const urls = text.match(URL_REGEX)

    if (urls && urls.length > 0) {
      // Deduplicate
      const unique = [...new Set(urls)].slice(0, MAX_URLS)
      ctx.detectedUrls = unique

      console.log(`[MW:Enrichment] Detected ${unique.length} URL(s), fetching...`)

      const results = await Promise.allSettled(unique.map(fetchUrlInfo))

      ctx.enrichedContent = results
        .filter((r) => r.status === "fulfilled" && r.value.content)
        .map((r) => r.value)

      console.log(`[MW:Enrichment] Fetched content from ${ctx.enrichedContent.length}/${unique.length} URL(s)`)
    }

    await next()
  }
}
