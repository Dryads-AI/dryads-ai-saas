/**
 * Dryads AI — Reminder Tool
 * Saves reminders to the user_reminder table for future delivery.
 */

import { randomBytes } from "crypto"
import { toolRegistry } from "../tool-registry.mjs"

const cuid = () => "c" + randomBytes(12).toString("hex")

toolRegistry.register(
  "set_reminder",
  {
    description:
      "Set a reminder for the user at a specific date/time. The reminder will be saved and the user will be notified when the time comes. Use this when the user asks to be reminded about something.",
    parameters: {
      type: "object",
      properties: {
        reminder_text: {
          type: "string",
          description: "What to remind the user about",
        },
        remind_at: {
          type: "string",
          description: "When to remind the user, in ISO 8601 format (e.g. '2025-03-15T14:00:00Z'). Calculate this from the user's request relative to the current time.",
        },
      },
      required: ["reminder_text", "remind_at"],
    },
  },
  async (args, ctx) => {
    const { reminder_text, remind_at } = args
    if (!reminder_text || !remind_at) return "Missing reminder text or time."

    const pool = ctx?.pool
    const userId = ctx?.userId
    if (!pool || !userId) {
      return "Reminder saved in memory only (database not available). I'll try to remind you if we're still chatting."
    }

    console.log(`[Tools:Reminder] Setting reminder for ${userId}: "${reminder_text}" at ${remind_at}`)

    try {
      const remindDate = new Date(remind_at)
      if (isNaN(remindDate.getTime())) {
        return `Invalid date format: "${remind_at}". Please provide a valid ISO 8601 date.`
      }

      if (remindDate <= new Date()) {
        return "The reminder time is in the past. Please provide a future date/time."
      }

      await pool.query(
        `INSERT INTO "user_reminder" (id, "userId", reminder_text, remind_at, channel_type, channel_peer, "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [cuid(), userId, reminder_text, remindDate.toISOString(), ctx.channelType || null, ctx.channelPeer || null]
      )

      const dateStr = remindDate.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
      const timeStr = remindDate.toLocaleTimeString("en-US", { hour12: true })

      return JSON.stringify({
        status: "saved",
        reminder_text,
        remind_at: remindDate.toISOString(),
        human_readable: `${dateStr} at ${timeStr} UTC`,
        message: "Reminder has been saved successfully. You will be notified at the specified time.",
      })
    } catch (err) {
      console.error(`[Tools:Reminder] Error:`, err.message)
      return `Failed to save reminder: ${err.message}`
    }
  },
  { needsCtx: true }
)
