/**
 * Dryads AI — Search Contacts Tool (Actionable Middleware)
 * Searches the Contact table to find people the user has chatted with.
 * Returns peer IDs needed by send_message tool.
 */

import { toolRegistry } from "../tool-registry.mjs"

toolRegistry.register(
  "search_contacts",
  {
    description:
      "Search for contacts the user has previously chatted with across all connected platforms. " +
      "Returns their name, peer ID, and channel type. " +
      "Use this BEFORE send_message to find the correct peer_id and channel_type for a recipient. " +
      "You can search by name (partial match) or by channel type.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Name or partial name to search for (e.g. 'Ahmed', 'Mom', 'John')",
        },
        channel_type: {
          type: "string",
          enum: ["whatsapp", "telegram", "discord", "slack", "signal", "wechat"],
          description: "Optional: filter by specific platform",
        },
      },
      required: ["query"],
    },
  },
  async (args, ctx) => {
    const { query, channel_type } = args

    if (!query) return "Please provide a name or keyword to search for."

    const pool = ctx?.pool
    const userId = ctx?.userId
    if (!pool || !userId) {
      return "Cannot search contacts — database not available."
    }

    console.log(`[Tools:SearchContacts] Searching for "${query}" (channel: ${channel_type || "all"})`)

    try {
      let sql = `
        SELECT "channelType", "peerId", "displayName", "lastMessageAt"
        FROM "Contact"
        WHERE "userId" = $1
          AND "displayName" ILIKE $2
      `
      const params = [userId, `%${query}%`]

      if (channel_type) {
        sql += ` AND "channelType" = $3`
        params.push(channel_type)
      }

      sql += ` ORDER BY "lastMessageAt" DESC NULLS LAST LIMIT 10`

      const res = await pool.query(sql, params)

      if (res.rows.length === 0) {
        return JSON.stringify({
          status: "no_results",
          query,
          message: `No contacts found matching "${query}". The user may not have chatted with this person yet, or the name might be different.`,
        })
      }

      const contacts = res.rows.map((r) => ({
        name: r.displayName || r.peerId,
        peer_id: r.peerId,
        channel: r.channelType,
        last_message: r.lastMessageAt,
      }))

      return JSON.stringify({
        status: "found",
        count: contacts.length,
        contacts,
        message: `Found ${contacts.length} contact(s) matching "${query}". Use the peer_id and channel values with send_message.`,
      })
    } catch (err) {
      console.error(`[Tools:SearchContacts] Error:`, err.message)
      return `Failed to search contacts: ${err.message}`
    }
  },
  { needsCtx: true }
)
