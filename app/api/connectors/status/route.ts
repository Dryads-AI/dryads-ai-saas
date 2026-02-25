import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { pool } from "@/lib/db"
import { getConnectorStatuses } from "@/lib/gateway/client"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Get live statuses from gateway
  const liveResult = await getConnectorStatuses(session.user.id)

  // Also get DB statuses for channels the gateway might not have running
  const dbRes = await pool.query(
    'SELECT "channelType", "connectionMode", enabled, status, "autoReply" FROM "UserChannel" WHERE "userId" = $1',
    [session.user.id]
  )

  const dbChannels = dbRes.rows.map((row) => ({
    channelType: row.channelType,
    connectionMode: row.connectionMode || "business",
    enabled: row.enabled,
    dbStatus: row.status,
    autoReply: row.autoReply ?? true,
    live: false,
  }))

  // Merge live statuses
  if (liveResult.ok && liveResult.statuses) {
    for (const live of liveResult.statuses) {
      const match = dbChannels.find(
        (c) => c.channelType === live.channelType && c.connectionMode === live.connectionMode
      )
      if (match) {
        match.live = live.running
      }
    }
  }

  return NextResponse.json({
    channels: dbChannels,
    gatewayConnected: liveResult.ok,
  })
}
