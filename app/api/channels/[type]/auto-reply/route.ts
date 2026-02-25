import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { pool } from "@/lib/db"
import { toggleAutoReplyViaGateway } from "@/lib/gateway/client"

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ type: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { type: channelType } = await params
  const { enabled, connectionMode } = await req.json()

  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled (boolean) required" }, { status: 400 })
  }

  const mode = connectionMode || "business"

  // Update DB
  await pool.query(
    'UPDATE "UserChannel" SET "autoReply" = $1, "updatedAt" = NOW() WHERE "userId" = $2 AND "channelType" = $3 AND "connectionMode" = $4',
    [enabled, session.user.id, channelType, mode]
  )

  // Notify gateway to update in-memory state
  const result = await toggleAutoReplyViaGateway(session.user.id, channelType, mode, enabled)

  return NextResponse.json({ ok: true, autoReply: enabled, gatewaySync: result.ok })
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ type: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { type: channelType } = await params
  const url = new URL(req.url)
  const mode = url.searchParams.get("connectionMode") || "business"

  const res = await pool.query(
    'SELECT "autoReply" FROM "UserChannel" WHERE "userId" = $1 AND "channelType" = $2 AND "connectionMode" = $3',
    [session.user.id, channelType, mode]
  )

  const autoReply = res.rows[0]?.autoReply ?? true
  return NextResponse.json({ autoReply })
}
