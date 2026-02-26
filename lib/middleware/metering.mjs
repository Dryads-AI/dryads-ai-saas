/**
 * Dryads AI — Metering Middleware
 * In-memory usage tracking + rate limiting per user per day.
 * Short-circuits the pipeline if a user exceeds their daily limit.
 * Placed FIRST in pipeline to avoid DB/AI load for rate-limited users.
 * Sets ctx.messageCount on the context.
 */

// ── In-Memory Usage Store ──────────────────────────────────────────

/**
 * Map<userId, { date: "YYYY-MM-DD", count: number }>
 * Resets automatically when the date changes.
 */
const usageMap = new Map()

/**
 * Get today's date key (UTC).
 */
function todayKey() {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`
}

/**
 * Increment and return the user's message count for today.
 */
function incrementUsage(userId) {
  const today = todayKey()
  const entry = usageMap.get(userId)

  if (!entry || entry.date !== today) {
    // New day or first message ever
    usageMap.set(userId, { date: today, count: 1 })
    return 1
  }

  entry.count += 1
  return entry.count
}

/**
 * Get the user's current count for today (without incrementing).
 */
function getUsage(userId) {
  const today = todayKey()
  const entry = usageMap.get(userId)
  if (!entry || entry.date !== today) return 0
  return entry.count
}

// ── Middleware ──────────────────────────────────────────────────────

const DEFAULT_LIMIT = 200

const RATE_LIMIT_MESSAGE =
  "You've reached your daily message limit. Your limit resets at midnight UTC. Upgrade your plan for more messages, or try again tomorrow!"

/**
 * Metering middleware factory.
 * @param {import("pg").Pool} pool - For future DB-backed usage (currently unused)
 * @param {object} [opts]
 * @param {number} [opts.maxMessagesPerDay=200] — Max messages per user per day
 */
export function meteringMiddleware(pool, opts = {}) {
  const { maxMessagesPerDay = DEFAULT_LIMIT } = opts

  return async function metering(ctx, next) {
    const userId = ctx.userId
    if (!userId) {
      // No user context — skip metering
      await next()
      return
    }

    const count = incrementUsage(userId)
    ctx.messageCount = count

    if (count > maxMessagesPerDay) {
      // Short-circuit: skip the rest of the pipeline
      ctx.reply = RATE_LIMIT_MESSAGE
      console.log(`[MW:Metering] Rate limit hit for user ${userId} (${count}/${maxMessagesPerDay})`)
      return // Do NOT call next() — skips everything
    }

    if (count === Math.floor(maxMessagesPerDay * 0.9)) {
      console.log(`[MW:Metering] User ${userId} at 90% of daily limit (${count}/${maxMessagesPerDay})`)
    }

    await next()
  }
}
