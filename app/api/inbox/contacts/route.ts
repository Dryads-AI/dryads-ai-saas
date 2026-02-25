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

  // Fetch contacts with last message preview
  let query = `
    SELECT
      ct.id,
      ct."channelType",
      ct."peerId",
      ct."displayName",
      ct."lastMessageAt",
      (
        SELECT m.content FROM "Message" m
        JOIN "Conversation" c ON m."conversationId" = c.id
        WHERE c."userId" = ct."userId"
          AND (m."channelPeer" = ct."peerId" OR c."channelPeer" = ct."peerId")
          AND (m."channelType" = ct."channelType" OR c."channelType" = ct."channelType")
        ORDER BY m."createdAt" DESC LIMIT 1
      ) as "lastMessage",
      (
        SELECT m.direction FROM "Message" m
        JOIN "Conversation" c ON m."conversationId" = c.id
        WHERE c."userId" = ct."userId"
          AND (m."channelPeer" = ct."peerId" OR c."channelPeer" = ct."peerId")
          AND (m."channelType" = ct."channelType" OR c."channelType" = ct."channelType")
        ORDER BY m."createdAt" DESC LIMIT 1
      ) as "lastDirection"
    FROM "Contact" ct
    WHERE ct."userId" = $1
  `
  const params: string[] = [session.user.id]

  if (channelType) {
    query += ` AND ct."channelType" = $2`
    params.push(channelType)
  }

  query += ` ORDER BY ct."lastMessageAt" DESC NULLS LAST`

  const res = await pool.query(query, params)

  return NextResponse.json(res.rows)
}
