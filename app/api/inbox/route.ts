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
  const channelType = url.searchParams.get("channelType")
  const peerId = url.searchParams.get("peerId")
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200)
  const offset = parseInt(url.searchParams.get("offset") || "0")

  // Build query — fetch messages from connector-based conversations
  let query = `
    SELECT m.id, m.role, m.content, m."channelType", m."channelPeer", m.direction, m."createdAt",
           c."channelType" as "convoChannelType", c."channelPeer" as "convoChannelPeer"
    FROM "Message" m
    JOIN "Conversation" c ON m."conversationId" = c.id
    WHERE c."userId" = $1
  `
  const params: (string | number)[] = [session.user.id]
  let paramIdx = 2

  // Filter by channelType — check both message-level and conversation-level
  if (channelType) {
    query += ` AND (m."channelType" = $${paramIdx} OR c."channelType" = $${paramIdx})`
    params.push(channelType)
    paramIdx++
  } else {
    // Exclude web chat messages from inbox (they have their own chat page)
    query += ` AND c."channelType" != 'web'`
  }

  if (peerId) {
    query += ` AND (m."channelPeer" = $${paramIdx} OR c."channelPeer" = $${paramIdx})`
    params.push(peerId)
    paramIdx++
  }

  query += ` ORDER BY m."createdAt" DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`
  params.push(limit, offset)

  const res = await pool.query(query, params)

  // Normalize — fill in channelType/peer from conversation if missing on message
  const messages = res.rows.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    channelType: m.channelType || m.convoChannelType,
    channelPeer: m.channelPeer || m.convoChannelPeer,
    direction: m.direction || "inbound",
    createdAt: m.createdAt,
  }))

  return NextResponse.json(messages)
}
