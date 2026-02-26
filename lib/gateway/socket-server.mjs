/**
 * Dryads AI — Gateway Socket.IO Server
 * IPC bridge between bot.mjs (connectors) and Next.js (web UI).
 *
 * Runs inside the bot.mjs process on GATEWAY_PORT (default 3001).
 * Next.js connects as a Socket.IO client to relay events to browsers.
 */

import { Server } from "socket.io"

/**
 * @param {import("../connectors/registry.mjs").ConnectorRegistry} registry
 * @param {Function} pipeline
 * @param {import("pg").Pool} pool
 */
export function createGatewayServer(registry, pipeline, pool) {
  const port = parseInt(process.env.GATEWAY_PORT || "3001", 10)
  const secret = process.env.GATEWAY_SECRET || ""

  const io = new Server(port, {
    cors: { origin: "*" },
  })

  // Auth middleware — require shared secret
  io.use((socket, next) => {
    const token = socket.handshake.auth?.secret
    if (secret && token !== secret) {
      return next(new Error("Unauthorized"))
    }
    next()
  })

  io.on("connection", (socket) => {
    console.log("[GatewayIO] Next.js client connected")

    // ── Send a message through a connector ────────────────────────
    socket.on("gateway:send", async (data, ack) => {
      const { userId, channelType, connectionMode, peerId, text } = data
      try {
        const mode = connectionMode || "personal"
        const connector = registry.getConnector(userId, channelType, mode)
          || registry.getConnectorByUser(userId, channelType)
        if (!connector) {
          return ack?.({ ok: false, error: `No active ${channelType} connector` })
        }
        await connector.send(peerId, text)
        ack?.({ ok: true })
      } catch (err) {
        console.error("[GatewayIO] send error:", err.message)
        ack?.({ ok: false, error: err.message })
      }
    })

    // ── Query connector statuses ──────────────────────────────────
    socket.on("gateway:status", async (data, ack) => {
      const { userId } = data
      try {
        const connectors = registry.getConnectorsByUser(userId)
        const statuses = connectors.map((c) => ({
          channelType: c.channelType,
          connectionMode: c.connectionMode,
          running: c._running,
        }))
        ack?.({ ok: true, statuses })
      } catch (err) {
        ack?.({ ok: false, error: err.message })
      }
    })

    // ── Toggle auto-reply for a connector ─────────────────────────
    socket.on("gateway:toggle-auto-reply", async (data, ack) => {
      const { userId, channelType, connectionMode, enabled } = data
      try {
        // Update DB
        await pool.query(
          'UPDATE "UserChannel" SET "autoReply" = $1, "updatedAt" = NOW() WHERE "userId" = $2 AND "channelType" = $3 AND "connectionMode" = $4',
          [enabled, userId, channelType, connectionMode || "business"]
        )
        // Update in-memory connector
        const connector = registry.getConnector(userId, channelType, connectionMode || "business")
          || registry.getConnectorByUser(userId, channelType)
        if (connector) {
          connector._autoReplyEnabled = enabled
        }
        ack?.({ ok: true })
      } catch (err) {
        ack?.({ ok: false, error: err.message })
      }
    })

    socket.on("disconnect", () => {
      console.log("[GatewayIO] Next.js client disconnected")
    })
  })

  console.log(`[GatewayIO] Listening on port ${port}`)

  return io
}
