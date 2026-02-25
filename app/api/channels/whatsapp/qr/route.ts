import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { pool } from "@/lib/db"
import { whatsappQrManager } from "@/lib/whatsapp/qr-manager"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = (session.user as { id: string }).id

  // Check in-memory QR manager first (instant, no DB round-trip)
  const mem = whatsappQrManager.getStatus(userId)
  if (mem) {
    if (mem.status === "qr" && mem.qr) return NextResponse.json({ status: "qr", qr: mem.qr })
    if (mem.status === "connected") return NextResponse.json({ status: "connected" })
    if (mem.status === "error") return NextResponse.json({ status: "error", error: mem.error })
    // "connecting" — fall through to DB check in case bot.mjs wrote something
  }

  // DB fallback — check if connected first
  const connectedRes = await pool.query(
    `SELECT event_type, payload, created_at FROM channel_events
     WHERE user_id = $1 AND channel_type = 'whatsapp'
     AND event_type IN ('connected', 'qr', 'disconnected', 'logged_out', 'error')
     ORDER BY created_at DESC LIMIT 1`,
    [userId]
  )

  if (connectedRes.rows.length === 0) {
    return NextResponse.json({ status: "waiting" })
  }

  const latest = connectedRes.rows[0]

  if (latest.event_type === "connected") {
    return NextResponse.json({ status: "connected" })
  }

  if (latest.event_type === "qr") {
    return NextResponse.json({ status: "qr", qr: latest.payload })
  }

  if (latest.event_type === "logged_out") {
    return NextResponse.json({ status: "logged_out" })
  }

  if (latest.event_type === "error") {
    return NextResponse.json({ status: "error", error: latest.payload })
  }

  return NextResponse.json({ status: "disconnected" })
}
