/**
 * DMMS AI — Formatter Middleware
 * Platform-specific response formatting applied after AI responds.
 * Converts markdown in ctx.reply to the appropriate format for each platform.
 */

// ── Platform Formatters ────────────────────────────────────────────

/**
 * WhatsApp: Convert markdown bold to WhatsApp bold, flatten links, strip headings.
 */
function formatWhatsApp(text) {
  return text
    // **bold** → *bold* (WhatsApp native bold)
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    // [text](url) → text (url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    // ### Heading → Heading (strip heading markers)
    .replace(/^#{1,6}\s+/gm, "")
    // ~~strikethrough~~ → ~strikethrough~ (WhatsApp native)
    .replace(/~~(.+?)~~/g, "~$1~")
    // ```code blocks``` → just the code (no fences)
    .replace(/```[\w]*\n?([\s\S]*?)```/g, "$1")
}

/**
 * Slack: Convert markdown to Slack mrkdwn format.
 */
function formatSlack(text) {
  return text
    // **bold** → *bold* (Slack bold)
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    // [text](url) → <url|text>
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<$2|$1>")
    // ### Heading → *Heading* (bold)
    .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
}

/**
 * Signal / WeChat: Strip ALL markdown to plain text.
 */
function formatPlainText(text) {
  return text
    // **bold** / *italic* → plain
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    // [text](url) → text (url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    // ### Heading → plain
    .replace(/^#{1,6}\s+/gm, "")
    // ~~strikethrough~~ → plain
    .replace(/~~(.+?)~~/g, "$1")
    // `inline code` → plain
    .replace(/`([^`]+)`/g, "$1")
    // ```code blocks``` → just the code
    .replace(/```[\w]*\n?([\s\S]*?)```/g, "$1")
    // > blockquotes → plain
    .replace(/^>\s?/gm, "")
}

// ── Formatter Map ──────────────────────────────────────────────────

const FORMATTERS = {
  whatsapp: formatWhatsApp,
  slack: formatSlack,
  signal: formatPlainText,
  wechat: formatPlainText,
  // Telegram and Discord: pass through (native markdown support)
}

// ── Middleware ──────────────────────────────────────────────────────

/**
 * Formatter middleware factory.
 */
export function formatterMiddleware() {
  return async function formatter(ctx, next) {
    await next()

    // Format after AI has responded
    if (ctx.reply && ctx.channelType) {
      const format = FORMATTERS[ctx.channelType]
      if (format) {
        ctx.reply = format(ctx.reply)
        console.log(`[MW:Formatter] Applied ${ctx.channelType} formatting`)
      }
    }
  }
}
