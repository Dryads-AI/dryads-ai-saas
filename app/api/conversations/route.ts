import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { pool } from "@/lib/db"

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(req.url)
  const conversationId = url.searchParams.get("id")

  if (conversationId) {
    const convoRes = await pool.query(
      'SELECT * FROM "Conversation" WHERE id = $1 AND "userId" = $2',
      [conversationId, session.user.id]
    )
    if (convoRes.rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    const messagesRes = await pool.query(
      'SELECT * FROM "Message" WHERE "conversationId" = $1 ORDER BY "createdAt" ASC',
      [conversationId]
    )
    return NextResponse.json({ ...convoRes.rows[0], messages: messagesRes.rows })
  }

  const result = await pool.query(
    `SELECT c.*, (SELECT COUNT(*) FROM "Message" WHERE "conversationId" = c.id) as "messageCount"
     FROM "Conversation" c WHERE c."userId" = $1 ORDER BY c."updatedAt" DESC LIMIT 50`,
    [session.user.id]
  )

  const conversations = result.rows.map((c) => ({
    ...c,
    _count: { messages: parseInt(c.messageCount) },
  }))

  return NextResponse.json(conversations)
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await req.json()
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 })
  }

  await pool.query(
    'DELETE FROM "Message" WHERE "conversationId" IN (SELECT id FROM "Conversation" WHERE id = $1 AND "userId" = $2)',
    [id, session.user.id]
  )
  await pool.query(
    'DELETE FROM "Conversation" WHERE id = $1 AND "userId" = $2',
    [id, session.user.id]
  )

  return NextResponse.json({ ok: true })
}
