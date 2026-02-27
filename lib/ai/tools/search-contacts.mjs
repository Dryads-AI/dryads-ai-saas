/**
 * Dryads AI — Search Contacts Tool (Actionable Middleware)
 * Searches the Contact table to find people the user has chatted with.
 * Searches by name AND by phone number/peer ID.
 * Returns peer IDs needed by send_message tool.
 */

import { toolRegistry } from "../tool-registry.mjs"

/**
 * Normalize a phone number by stripping spaces, dashes, parentheses,
 * and leading + or 00. Returns digits only for flexible matching.
 */
function normalizePhone(input) {
  // Strip everything except digits
  return input.replace(/[^\d]/g, "")
}

toolRegistry.register(
  "search_contacts",
  {
    description:
      "Search for contacts the user has previously chatted with across all connected platforms. " +
      "Returns their name, peer ID, and channel type. " +
      "You can search by name (partial match), phone number, or peer ID. " +
      "Searches both the display name AND the peer ID (phone number) fields. " +
      "If the user provides a phone number directly, this tool will find matching contacts.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Name, phone number, or peer ID to search for. " +
            "Examples: 'Ahmed', 'Mom', '+971524563883', '0524563883', '524563883'",
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

    if (!query) return "Please provide a name, phone number, or keyword to search for."

    const pool = ctx?.pool
    const userId = ctx?.userId
    if (!pool || !userId) {
      return "Cannot search contacts — database not available."
    }

    console.log(`[Tools:SearchContacts] Searching for "${query}" (channel: ${channel_type || "all"})`)

    try {
      // Check if query looks like a phone number (contains mostly digits)
      const digitsOnly = normalizePhone(query)
      const isPhoneQuery = digitsOnly.length >= 5 && digitsOnly.length === query.replace(/[\s\-\+\(\)]/g, "").length

      let sql
      let params

      if (isPhoneQuery) {
        // Search by phone number: match against peerId (which stores the number)
        // Try multiple formats: exact digits, with country code variations
        sql = `
          SELECT "channelType", "peerId", "displayName", "lastMessageAt"
          FROM "Contact"
          WHERE "userId" = $1
            AND (
              "peerId" LIKE $2
              OR "peerId" LIKE $3
              OR "peerId" = $4
              OR "displayName" ILIKE $5
            )
        `
        // Match: contains the digits, ends with the digits, exact match, or name match
        params = [userId, `%${digitsOnly}%`, `%${digitsOnly}`, digitsOnly, `%${query}%`]

        if (channel_type) {
          sql += ` AND "channelType" = $6`
          params.push(channel_type)
        }
      } else {
        // Search by name
        sql = `
          SELECT "channelType", "peerId", "displayName", "lastMessageAt"
          FROM "Contact"
          WHERE "userId" = $1
            AND ("displayName" ILIKE $2 OR "peerId" ILIKE $2)
        `
        params = [userId, `%${query}%`]

        if (channel_type) {
          sql += ` AND "channelType" = $3`
          params.push(channel_type)
        }
      }

      sql += ` ORDER BY "lastMessageAt" DESC NULLS LAST LIMIT 10`

      const res = await pool.query(sql, params)

      if (res.rows.length === 0) {
        // Provide helpful guidance based on query type
        if (isPhoneQuery) {
          return JSON.stringify({
            status: "no_results",
            query,
            is_phone: true,
            digits: digitsOnly,
            message: `No contact found for "${query}" in the database, but that's OK. ` +
              `You can STILL send a message directly! Use send_message with peer_id="${digitsOnly}" and channel_type="whatsapp". ` +
              `Make sure the number includes the country code (e.g. 971524563883 for UAE).`,
            action: "send_directly",
          })
        }

        return JSON.stringify({
          status: "no_results",
          query,
          is_phone: false,
          message: `No contact named "${query}" found. This person hasn't messaged the bot before. ` +
            `ASK THE USER for the phone number so you can send the message directly. ` +
            `Example: "I don't have ${query}'s contact saved. Can you give me their phone number? I'll send the message directly."`,
          action: "ask_for_number",
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
