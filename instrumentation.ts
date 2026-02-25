/**
 * Next.js Instrumentation Hook
 *
 * Bot is started via bot.mjs (standalone process).
 * This hook starts the realtime Socket.IO server + gateway client
 * for bridging bot.mjs events to the browser.
 */
export async function register() {
  // Only run on Node.js runtime (not edge)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { startRealtimeServer } = await import("@/lib/realtime/socket-server")
      startRealtimeServer()
      console.log("[Instrumentation] Realtime server + gateway client started")
    } catch (err) {
      console.error("[Instrumentation] Failed to start realtime server:", err)
    }
  }
}
