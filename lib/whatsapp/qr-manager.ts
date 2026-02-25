/**
 * In-process Baileys QR Manager
 *
 * Runs Baileys directly in the Next.js process for QR code generation.
 * After successful scan + reconnect, marks the channel as connected
 * so bot.mjs picks up established credentials on its next DB poll.
 */

import { makeWASocket, DisconnectReason, fetchLatestBaileysVersion, Browsers } from "@whiskeysockets/baileys"
import { Boom } from "@hapi/boom"
import { SocksProxyAgent } from "socks-proxy-agent"
import { usePgAuthState } from "../baileys-auth-pg.mjs"
import { pool, cuid } from "../db"

function getProxyAgent() {
  const proxy = process.env.WA_PROXY_URL
  if (!proxy) return undefined
  console.log(`[WA QR] Using proxy: ${proxy.replace(/\/\/.*@/, "//***@")}`)
  return new SocksProxyAgent(proxy)
}

interface LoginSession {
  sock: ReturnType<typeof makeWASocket> | null
  qr: string | null
  status: "connecting" | "qr" | "connected" | "error"
  error: string | null
  startedAt: number
  ttlTimer: ReturnType<typeof setTimeout> | null
  version: [number, number, number] | undefined
}

const TTL_MS = 3 * 60 * 1000 // 3 minutes

const globalForQr = globalThis as unknown as { _waQrManager: WhatsAppQrManager }

class WhatsAppQrManager {
  private sessions = new Map<string, LoginSession>()

  async startLogin(userId: string): Promise<void> {
    // Cleanup any previous session for this user
    this.cleanup(userId)

    const session: LoginSession = {
      sock: null,
      qr: null,
      status: "connecting",
      error: null,
      startedAt: Date.now(),
      ttlTimer: null,
      version: undefined,
    }
    this.sessions.set(userId, session)

    // Auto-cleanup after TTL
    session.ttlTimer = setTimeout(() => {
      console.log(`[WA QR] TTL expired for user ${userId.slice(0, 8)} — cleaning up`)
      this.cleanup(userId)
    }, TTL_MS)

    // Fetch latest WhatsApp Web version once for this session
    try {
      const v = await fetchLatestBaileysVersion()
      session.version = v.version
      console.log(`[WA QR] Using WhatsApp version: ${session.version.join(".")}`)
    } catch {
      console.warn("[WA QR] Could not fetch latest version, using default")
    }

    await this._connect(userId)
  }

  private async _connect(userId: string): Promise<void> {
    const session = this.sessions.get(userId)
    if (!session) return

    try {
      // Close previous socket if any
      if (session.sock) {
        try {
          ;(session.sock.ev as unknown as { removeAllListeners(): void }).removeAllListeners()
          session.sock.end(undefined)
        } catch {}
        session.sock = null
      }

      const { state, saveCreds } = await usePgAuthState(
        process.env.DATABASE_URL!,
        userId
      )

      const agent = getProxyAgent()
      const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        browser: Browsers.macOS("Desktop"),
        connectTimeoutMs: 60000,
        syncFullHistory: false,
        ...(session.version ? { version: session.version } : {}),
        ...(agent ? { agent, fetchAgent: agent } : {}),
      })

      session.sock = sock

      sock.ev.on("connection.update", async (update: { connection?: string; lastDisconnect?: { error?: Error }; qr?: string }) => {
        const { connection, lastDisconnect, qr } = update

        if (qr) {
          console.log(`[WA QR] QR code received for user ${userId.slice(0, 8)}`)
          session.qr = qr
          session.status = "qr"

          // Also write to DB for fallback
          await pool.query(
            "INSERT INTO channel_events (id, user_id, channel_type, event_type, payload, created_at) VALUES ($1, $2, $3, $4, $5, NOW())",
            [cuid(), userId, "whatsapp", "qr", qr]
          ).catch((err: Error) => console.error("[WA QR] DB write error:", err.message))
        }

        if (connection === "open") {
          console.log(`[WA QR] Connected for user ${userId.slice(0, 8)}!`)
          session.status = "connected"
          session.qr = null

          // Write connected event to DB
          await pool.query(
            "INSERT INTO channel_events (id, user_id, channel_type, event_type, payload, created_at) VALUES ($1, $2, $3, $4, $5, NOW())",
            [cuid(), userId, "whatsapp", "connected", null]
          ).catch((err: Error) => console.error("[WA QR] DB write error:", err.message))

          // Update UserChannel: set enabled=true + connected so bot.mjs picks it up
          await pool.query(
            'UPDATE "UserChannel" SET enabled = true, status = $1, "updatedAt" = NOW() WHERE "userId" = $2 AND "channelType" = $3',
            ["connected", userId, "whatsapp"]
          ).catch((err: Error) => console.error("[WA QR] DB update error:", err.message))

          // Cleanup socket after short delay (let creds save finish)
          setTimeout(() => this.cleanup(userId), 2000)
        }

        if (connection === "close") {
          const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode

          console.log(`[WA QR] Connection closed for user ${userId.slice(0, 8)} (code: ${statusCode})`)

          if (statusCode === DisconnectReason.restartRequired) {
            // 515 = restart required — normal after QR pairing.
            // Reconnect with saved credentials to complete the login.
            console.log(`[WA QR] Restart required — reconnecting for user ${userId.slice(0, 8)}...`)
            session.status = "connecting"
            // Small delay before reconnecting
            setTimeout(() => this._connect(userId), 1500)
          } else if (statusCode === DisconnectReason.loggedOut) {
            session.status = "error"
            session.error = "Logged out — please try again"
            await pool.query(
              "INSERT INTO channel_events (id, user_id, channel_type, event_type, payload, created_at) VALUES ($1, $2, $3, $4, $5, NOW())",
              [cuid(), userId, "whatsapp", "logged_out", null]
            ).catch(() => {})
          } else {
            session.status = "error"
            session.error = `Connection failed (code: ${statusCode})`
            await pool.query(
              "INSERT INTO channel_events (id, user_id, channel_type, event_type, payload, created_at) VALUES ($1, $2, $3, $4, $5, NOW())",
              [cuid(), userId, "whatsapp", "error", `Connection failed (code: ${statusCode})`]
            ).catch(() => {})
          }
        }
      })

      sock.ev.on("creds.update", saveCreds)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[WA QR] Fatal error for user ${userId.slice(0, 8)}:`, msg)
      session.status = "error"
      session.error = msg
    }
  }

  getStatus(userId: string): { status: string; qr: string | null; error: string | null } | null {
    const session = this.sessions.get(userId)
    if (!session) return null
    return {
      status: session.status,
      qr: session.qr,
      error: session.error,
    }
  }

  cleanup(userId: string): void {
    const session = this.sessions.get(userId)
    if (!session) return

    if (session.ttlTimer) {
      clearTimeout(session.ttlTimer)
    }

    if (session.sock) {
      try {
        ;(session.sock.ev as unknown as { removeAllListeners(): void }).removeAllListeners()
        session.sock.end(undefined)
      } catch {}
    }

    this.sessions.delete(userId)
    console.log(`[WA QR] Cleaned up session for user ${userId.slice(0, 8)}`)
  }
}

export const whatsappQrManager =
  globalForQr._waQrManager || new WhatsAppQrManager()

if (process.env.NODE_ENV !== "production") {
  globalForQr._waQrManager = whatsappQrManager
}
