/**
 * Dryads AI — List Channels Tool (Actionable Middleware)
 * Lists all connected messaging platforms for the current user.
 * Helps the AI know which platforms are available for sending messages.
 */

import { toolRegistry } from "../tool-registry.mjs"

toolRegistry.register(
  "list_channels",
  {
    description:
      "List all messaging platforms the user has connected (WhatsApp, Telegram, Discord, etc.) and their current status. " +
      "Use this to check which platforms are available before attempting to send a message.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  async (args, ctx) => {
    const pool = ctx?.pool
    const userId = ctx?.userId
    if (!pool || !userId) {
      return "Cannot list channels — database not available."
    }

    try {
      const res = await pool.query(
        `SELECT "channelType", "connectionMode", status, enabled, "autoReply"
         FROM "UserChannel"
         WHERE "userId" = $1
         ORDER BY "channelType"`,
        [userId]
      )

      if (res.rows.length === 0) {
        return JSON.stringify({
          status: "none",
          message: "No messaging platforms connected yet. The user can connect platforms from the dashboard.",
        })
      }

      const channels = res.rows.map((r) => ({
        platform: r.channelType,
        mode: r.connectionMode || "business",
        status: r.status || "unknown",
        enabled: r.enabled,
        auto_reply: r.autoReply,
      }))

      // Also check which have active connectors in the registry
      const registry = ctx?.registry
      if (registry) {
        for (const ch of channels) {
          const connector = registry.getConnectorByUser(userId, ch.platform)
          ch.live = !!connector && (connector._running || !!connector.socket)
        }
      }

      return JSON.stringify({
        status: "ok",
        count: channels.length,
        channels,
        message: `User has ${channels.length} platform(s) configured.`,
      })
    } catch (err) {
      console.error(`[Tools:ListChannels] Error:`, err.message)
      return `Failed to list channels: ${err.message}`
    }
  },
  { needsCtx: true }
)
