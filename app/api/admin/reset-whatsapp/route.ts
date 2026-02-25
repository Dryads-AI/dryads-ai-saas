import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { whatsappQrManager } from "@/lib/whatsapp/qr-manager"

export async function POST(req: NextRequest) {
  const { secret } = await req.json().catch(() => ({ secret: "" }))

  // Simple secret to prevent unauthorized access
  if (secret !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Cleanup all in-process QR sessions
  const userRows = await pool.query('SELECT DISTINCT "userId" FROM "UserChannel" WHERE "channelType" = \'whatsapp\'')
  for (const row of userRows.rows) {
    whatsappQrManager.cleanup(row.userId)
  }

  await pool.query("DELETE FROM baileys_auth")
  await pool.query("DELETE FROM channel_events WHERE channel_type = 'whatsapp'")
  await pool.query(`UPDATE "UserChannel" SET enabled = false, status = 'disconnected', "updatedAt" = NOW() WHERE "channelType" = 'whatsapp'`)

  return NextResponse.json({ ok: true, message: "WhatsApp fully reset. Click Connect WhatsApp to get a fresh QR code." })
}
