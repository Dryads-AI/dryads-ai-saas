/**
 * Next.js Instrumentation Hook
 *
 * Called once when the Next.js server starts.
 * We use this to start the Telegram bot (long-polling).
 */
export async function register() {
  // Only run on the Node.js server (not Edge runtime, not during build)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startTelegramBot } = await import("./lib/telegram-bot")
    startTelegramBot()
  }
}
