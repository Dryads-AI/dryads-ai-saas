interface RateLimitEntry {
  count: number
  resetAt: number
}

const limits = new Map<string, RateLimitEntry>()

const DEFAULT_MAX = 30 // messages per window
const DEFAULT_WINDOW_MS = 60_000 // 1 minute

export function checkRateLimit(
  userId: string,
  max = DEFAULT_MAX,
  windowMs = DEFAULT_WINDOW_MS
): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now()
  const entry = limits.get(userId)

  if (!entry || now > entry.resetAt) {
    limits.set(userId, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: max - 1, resetIn: windowMs }
  }

  if (entry.count >= max) {
    return { allowed: false, remaining: 0, resetIn: entry.resetAt - now }
  }

  entry.count++
  return { allowed: true, remaining: max - entry.count, resetIn: entry.resetAt - now }
}
