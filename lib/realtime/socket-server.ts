/**
 * Dryads AI — Browser-facing Socket.IO Server
 * Relays gateway events (incoming messages, status changes) to browser clients.
 *
 * Runs inside the Next.js server process on REALTIME_PORT (default 3002).
 * Browser connects via useSocket hook.
 */

import { Server } from "socket.io"
import { getGatewayClient } from "@/lib/gateway/client"

let realtimeIO: Server | null = null

export function startRealtimeServer() {
  if (realtimeIO) return realtimeIO

  const port = parseInt(process.env.REALTIME_PORT || "3002", 10)

  realtimeIO = new Server(port, {
    cors: { origin: "*" },
  })

  // Auth middleware — extract userId from handshake
  realtimeIO.use((socket, next) => {
    const userId = socket.handshake.auth?.userId
    if (!userId) {
      return next(new Error("userId required"))
    }
    ;(socket as any).userId = userId
    next()
  })

  realtimeIO.on("connection", (socket) => {
    const userId = (socket as any).userId
    // Join user-specific room
    socket.join(`user:${userId}`)
    console.log(`[RealtimeIO] Browser connected: user=${userId}`)

    socket.on("disconnect", () => {
      console.log(`[RealtimeIO] Browser disconnected: user=${userId}`)
    })
  })

  // Connect to gateway and relay events to browsers
  const gateway = getGatewayClient()

  gateway.on("gateway:incoming", (event: {
    userId: string
    channelType: string
    connectionMode: string
    peerId: string
    text: string
    reply: string | null
    timestamp: string
  }) => {
    // Relay to the specific user's browser room
    realtimeIO?.to(`user:${event.userId}`).emit("inbox:message", event)
  })

  gateway.on("gateway:status-change", (event: {
    userId: string
    channelType: string
    connectionMode: string
    status: string
  }) => {
    realtimeIO?.to(`user:${event.userId}`).emit("inbox:status", event)
  })

  console.log(`[RealtimeIO] Browser Socket.IO server listening on port ${port}`)

  return realtimeIO
}
