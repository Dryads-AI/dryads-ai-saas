/**
 * DMMS AI — Envelope Middleware
 * Wraps the incoming message with metadata (platform, sender, timestamp).
 * Sets ctx.envelope, ctx.senderInfo, ctx.originalText.
 */

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

/**
 * Format a phone number or peer ID for display.
 * E.g. "447700900000@s.whatsapp.net" → "+447700900000"
 */
function formatPeer(peer, channelType) {
  if (!peer) return "unknown"

  // WhatsApp: strip @s.whatsapp.net / @g.us
  if (channelType === "whatsapp") {
    const num = peer.replace(/@.*$/, "")
    return /^\d+$/.test(num) ? `+${num}` : num
  }

  // Telegram: use as-is (could be numeric chat ID or username)
  if (channelType === "telegram") return peer

  // Discord / Slack / others: return as-is
  return peer
}

/**
 * Build a human-readable envelope string.
 * E.g. "[WhatsApp +447700900000 Sat 2026-02-22 14:30 UTC]"
 */
function buildEnvelope(channelType, peer, now) {
  const day = DAY_NAMES[now.getUTCDay()]
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, "0")
  const date = String(now.getUTCDate()).padStart(2, "0")
  const hours = String(now.getUTCHours()).padStart(2, "0")
  const mins = String(now.getUTCMinutes()).padStart(2, "0")

  const platformLabel = (channelType || "Messenger").charAt(0).toUpperCase() + (channelType || "messenger").slice(1)
  const formattedPeer = formatPeer(peer, channelType)

  return `[${platformLabel} ${formattedPeer} ${day} ${year}-${month}-${date} ${hours}:${mins} UTC]`
}

/**
 * Envelope middleware factory.
 */
export function envelopeMiddleware() {
  return async function envelope(ctx, next) {
    const now = new Date()

    ctx.originalText = ctx.text
    ctx.senderInfo = {
      channelType: ctx.channelType || "unknown",
      channelPeer: ctx.channelPeer || "unknown",
      channelName: ctx.channelName || ctx.channelType || "Messenger",
      timestamp: now.toISOString(),
      utcDate: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`,
      utcTime: `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`,
      dayOfWeek: DAY_NAMES[now.getUTCDay()],
    }

    ctx.envelope = buildEnvelope(ctx.channelType, ctx.channelPeer, now)

    console.log(`[MW:Envelope] ${ctx.envelope}`)

    await next()
  }
}
