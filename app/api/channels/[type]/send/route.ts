import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { pool, cuid } from "@/lib/db"
import { sendViaGateway } from "@/lib/gateway/client"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ type: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { type: channelType } = await params
  const { peerId, text, connectionMode } = await req.json()

  if (!peerId || !text?.trim()) {
    return NextResponse.json({ error: "peerId and text required" }, { status: 400 })
  }

  // Send via gateway
  const result = await sendViaGateway(
    session.user.id,
    channelType,
    peerId,
    text,
    connectionMode
  )

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }

  // Find or create conversation for this channel+peer
  const now = new Date().toISOString()
  let convoRes = await pool.query(
    'SELECT id FROM "Conversation" WHERE "userId" = $1 AND "channelType" = $2 AND "channelPeer" = $3 LIMIT 1',
    [session.user.id, channelType, peerId]
  )

  let convoId: string
  if (convoRes.rows.length > 0) {
    convoId = convoRes.rows[0].id
  } else {
    convoId = cuid()
    await pool.query(
      'INSERT INTO "Conversation" (id, "userId", "channelType", "channelPeer", title, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [convoId, session.user.id, channelType, peerId, `${channelType}:${peerId}`, now, now]
    )
  }

  // Save outbound message
  const msgId = cuid()
  await pool.query(
    'INSERT INTO "Message" (id, "conversationId", role, content, "channelType", "channelPeer", direction, "createdAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
    [msgId, convoId, "user", text, channelType, peerId, "outbound", now]
  )

  // Update conversation timestamp
  await pool.query('UPDATE "Conversation" SET "updatedAt" = $1 WHERE id = $2', [now, convoId])

  // Upsert contact
  await pool.query(
    `INSERT INTO "Contact" (id, "userId", "channelType", "peerId", "lastMessageAt")
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT ("userId", "channelType", "peerId") DO UPDATE SET "lastMessageAt" = $5`,
    [cuid(), session.user.id, channelType, peerId, now]
  )

  return NextResponse.json({ ok: true, messageId: msgId, conversationId: convoId })
}
