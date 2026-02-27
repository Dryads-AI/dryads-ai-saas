/**
 * Dryads AI — Send Message Tool (Actionable Middleware)
 * Allows the AI to send messages to contacts through any connected platform.
 * Uses the connector registry to find the right connector and call .send().
 */

import { toolRegistry } from "../tool-registry.mjs"

toolRegistry.register(
  "send_message",
  {
    description:
      "Send a message to a contact on a specific messaging platform (WhatsApp, Telegram, Discord, Slack, Signal, WeChat). " +
      "Use this when the user asks you to send a message to someone. " +
      "You MUST first use search_contacts to find the recipient's peer ID and channel type before sending. " +
      "Never guess peer IDs — always look them up first.",
    parameters: {
      type: "object",
      properties: {
        channel_type: {
          type: "string",
          enum: ["whatsapp", "telegram", "discord", "slack", "signal", "wechat"],
          description: "The messaging platform to send through",
        },
        peer_id: {
          type: "string",
          description:
            "The recipient's platform-specific peer ID (e.g. WhatsApp JID, Telegram chat ID). Get this from search_contacts.",
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
    const { channel_type, peer_id, message } = args

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
    if (channel_type === "whatsapp" && !peer_id.includes("@")) {
      // WhatsApp send() expects full JID
      sendTo = `${peer_id}@s.whatsapp.net`
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
