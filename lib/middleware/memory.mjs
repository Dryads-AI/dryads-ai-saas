/**
 * DMMS AI — Long-term Memory Middleware (Engine 2)
 * Two-phase middleware:
 *   Phase A (before AI): Load top 15 memories for this user
 *   Phase B (after AI): Extract facts from conversation, store in user_memory
 *
 * Memories persist across conversations and channels.
 */

import { randomBytes } from "crypto"

const cuid = () => "c" + randomBytes(12).toString("hex")

// ── Categories for fact extraction ──────────────────────────────────

const FACT_CATEGORIES = [
  "preference",     // likes, dislikes, favorites
  "personal_info",  // name, age, location, language
  "interest",       // hobbies, topics they follow
  "work",           // job, company, profession, projects
  "behavior",       // communication style, habits
  "general",        // everything else
]

// ── Simple fact extraction (rule-based, no extra AI call) ───────────

const FACT_PATTERNS = [
  // Personal info
  { pattern: /\bmy\s+name\s+is\s+(\w+)/i, category: "personal_info", template: (m) => `User's name is ${m[1]}` },
  { pattern: /\bi\s+am\s+(\w+)\s+years?\s+old/i, category: "personal_info", template: (m) => `User is ${m[1]} years old` },
  { pattern: /\bi(?:'m|\s+am)\s+from\s+(.+?)(?:\.|,|!|\?|$)/i, category: "personal_info", template: (m) => `User is from ${m[1].trim()}` },
  { pattern: /\bi\s+live\s+in\s+(.+?)(?:\.|,|!|\?|$)/i, category: "personal_info", template: (m) => `User lives in ${m[1].trim()}` },
  { pattern: /\bi\s+speak\s+(\w+)/i, category: "personal_info", template: (m) => `User speaks ${m[1]}` },

  // Work
  { pattern: /\bi\s+work\s+(?:at|for)\s+(.+?)(?:\.|,|!|\?|$)/i, category: "work", template: (m) => `User works at ${m[1].trim()}` },
  { pattern: /\bi(?:'m|\s+am)\s+a\s+(.+?)(?:\.|,|!|\?|$)/i, category: "work", template: (m) => `User is a ${m[1].trim()}` },
  { pattern: /\bmy\s+job\s+is\s+(.+?)(?:\.|,|!|\?|$)/i, category: "work", template: (m) => `User's job is ${m[1].trim()}` },
  { pattern: /\bi(?:'m|\s+am)\s+(?:a\s+)?(?:software\s+)?(?:developer|engineer|designer|manager|teacher|doctor|lawyer|student)\b/i, category: "work", template: (m) => `User is ${m[0].replace(/^i(?:'m|\s+am)\s+/i, "").trim()}` },

  // Preferences
  { pattern: /\bi\s+(?:love|like|enjoy|prefer)\s+(.+?)(?:\.|,|!|\?|$)/i, category: "preference", template: (m) => `User likes ${m[1].trim()}` },
  { pattern: /\bi\s+(?:hate|dislike|don't\s+like|can't\s+stand)\s+(.+?)(?:\.|,|!|\?|$)/i, category: "preference", template: (m) => `User dislikes ${m[1].trim()}` },
  { pattern: /\bmy\s+favorite\s+(\w+)\s+is\s+(.+?)(?:\.|,|!|\?|$)/i, category: "preference", template: (m) => `User's favorite ${m[1]} is ${m[2].trim()}` },

  // Interests
  { pattern: /\bi(?:'m|\s+am)\s+(?:interested|passionate)\s+(?:in|about)\s+(.+?)(?:\.|,|!|\?|$)/i, category: "interest", template: (m) => `User is interested in ${m[1].trim()}` },
  { pattern: /\bi\s+(?:study|learn|practice)\s+(.+?)(?:\.|,|!|\?|$)/i, category: "interest", template: (m) => `User studies ${m[1].trim()}` },
]

function extractFacts(text) {
  const facts = []
  for (const { pattern, category, template } of FACT_PATTERNS) {
    const match = text.match(pattern)
    if (match) {
      const fact = template(match)
      // Skip very short or very long facts
      if (fact.length > 10 && fact.length < 200) {
        facts.push({ fact, category })
      }
    }
  }
  return facts
}

// ── Middleware ────────────────────────────────────────────────────────

/**
 * @param {import("pg").Pool} pool
 */
export function memoryMiddleware(pool) {
  return async function memory(ctx, next) {
    // ── Phase A: Load memories before AI call ──
    try {
      const memRes = await pool.query(
        `SELECT fact, category FROM "user_memory"
         WHERE "userId" = $1
         ORDER BY access_count DESC, "updatedAt" DESC
         LIMIT 15`,
        [ctx.userId]
      )
      ctx.userMemories = memRes.rows

      // Increment access_count for loaded memories
      if (memRes.rows.length > 0) {
        await pool.query(
          `UPDATE "user_memory"
           SET access_count = access_count + 1, "updatedAt" = NOW()
           WHERE "userId" = $1 AND fact = ANY($2)`,
          [ctx.userId, memRes.rows.map((r) => r.fact)]
        )
      }

      console.log(`[MW:Memory] Loaded ${memRes.rows.length} memories for user ${ctx.userId}`)
    } catch (err) {
      console.error(`[MW:Memory] Error loading memories:`, err.message)
      ctx.userMemories = []
    }

    // ── Run the rest of the pipeline (AI call happens here) ──
    await next()

    // ── Phase B: Extract and store facts (fire-and-forget) ──
    const userText = ctx.text || ""

    // Only extract from user messages with enough substance
    if (userText.length < 15) return

    setImmediate(async () => {
      try {
        const facts = extractFacts(userText)

        for (const { fact, category } of facts) {
          try {
            await pool.query(
              `INSERT INTO "user_memory" (id, "userId", fact, category, source_channel, source_conversation_id, "createdAt", "updatedAt")
               VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
               ON CONFLICT ("userId", fact) DO UPDATE SET
                 access_count = "user_memory".access_count + 1,
                 "updatedAt" = NOW()`,
              [cuid(), ctx.userId, fact, category, ctx.channelType || null, ctx.convoId || null]
            )
            console.log(`[MW:Memory] Stored fact: "${fact}" (${category})`)
          } catch (err) {
            // Silently skip duplicates / errors
            if (!err.message.includes("duplicate")) {
              console.error(`[MW:Memory] Error storing fact:`, err.message)
            }
          }
        }
      } catch (err) {
        console.error(`[MW:Memory] Extraction error:`, err.message)
      }
    })
  }
}
