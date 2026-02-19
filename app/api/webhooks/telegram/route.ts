import { NextResponse } from "next/server"

/**
 * Telegram webhook endpoint — kept as a no-op fallback.
 * The bot now uses long-polling (lib/telegram-bot.ts) instead of webhooks.
 */
export async function POST() {
  return NextResponse.json({ ok: true })
}
