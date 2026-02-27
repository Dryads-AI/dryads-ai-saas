/**
 * Dryads AI — Send Message Tool (Actionable Middleware)
 * Allows the AI to send messages to contacts through any connected platform.
 * Supports sending by contact name lookup OR directly by phone number.
 * Uses the connector registry to find the right connector and call .send().
 */

import { toolRegistry } from "../tool-registry.mjs"

/**
 * Normalize a phone number: strip spaces, dashes, parentheses, plus signs.
 * Returns digits only. Handles common formats:
 *   +971 52 456 3883 → 971524563883
 *   0524563883 → 0524563883
 *   00971524563883 → 00971524563883
 */
function normalizePhone(input) {
  return input.replace(/[^\d]/g, "")
}

toolRegistry.register(
  "send_message",
  {
    description:
      "Send a message to a contact on a messaging platform (WhatsApp, Telegram, Discord, Slack, Signal, WeChat). " +
      "For WhatsApp: you can pass a phone number directly as peer_id (e.g. '971524563883' or '0524563883'). " +
      "For other platforms: use search_contacts first to find the peer_id. " +
      "If the user gives a phone number, you can send directly to WhatsApp WITHOUT searching contacts first.",
    parameters: {
      type: "object",
      properties: {
        channel_type: {
          type: "string",
          enum: ["whatsapp", "telegram", "discord", "slack", "signal", "wechat"],
          description: "The messaging platform to send through. Default to 'whatsapp' if the user mentions a phone number.",
        },
        peer_id: {
          type: "string",
          description:
            "The recipient identifier. For WhatsApp: a phone number with country code (e.g. '971524563883'). " +
            "For Telegram: the chat ID. For Discord/Slack: channel:user format. " +
            "IMPORTANT: For WhatsApp numbers, always include the country code and remove any leading 0. " +
            "Example: UAE number 0524563883 → 971524563883 (country code 971 + number without leading 0).",
        },
        message: {
          type: "string",
          description: "The message text to send",
        },
      },
      required: ["channel_type", "peer_id", "message"],
    },
  },
  async (args, ctx) => {
    const { channel_type, message } = args
    let { peer_id } = args

    if (!channel_type || !peer_id || !message) {
      return "Missing required fields: channel_type, peer_id, and message are all required."
    }

    const registry = ctx?.registry
    const userId = ctx?.userId
    if (!registry || !userId) {
      return "Cannot send messages — connector registry not available."
    }

    // Find the connector for this user and channel
    const connector = registry.getConnectorByUser(userId, channel_type)
    if (!connector) {
      return JSON.stringify({
        status: "error",
        error: `No active ${channel_type} connection found. The user needs to connect ${channel_type} first in their dashboard.`,
      })
    }

    // Check if connector is actually connected
    if (!connector._running && !connector.socket) {
      return JSON.stringify({
        status: "error",
        error: `${channel_type} connector exists but is not currently connected. It may be disconnected or still connecting.`,
      })
    }

    // Platform-specific peer ID normalization
    let sendTo = peer_id
    if (channel_type === "whatsapp") {
      // Strip all non-digit characters
      sendTo = normalizePhone(peer_id)

      // Remove leading 00 (international dialing prefix)
      if (sendTo.startsWith("00")) {
        sendTo = sendTo.slice(2)
      }
      // Remove leading 0 if it still starts with 0 (local number) — caller should have added country code
      // but we keep it if it's the only format given

      // Add WhatsApp JID suffix
      if (!sendTo.includes("@")) {
        sendTo = `${sendTo}@s.whatsapp.net`
      }
    }

    console.log(`[Tools:SendMessage] Sending via ${channel_type} to ${sendTo}: "${message.slice(0, 60)}"`)

    try {
      await connector.send(sendTo, message)

      return JSON.stringify({
        status: "sent",
        channel: channel_type,
        recipient: peer_id,
        message_preview: message.slice(0, 100),
        message: `Message sent successfully via ${channel_type}.`,
      })
    } catch (err) {
      console.error(`[Tools:SendMessage] Error:`, err.message)
      return JSON.stringify({
        status: "error",
        error: `Failed to send message via ${channel_type}: ${err.message}`,
      })
    }
  },
  { needsCtx: true }
)
