/**
 * Dryads AI — Send Message Tool (Actionable Middleware)
 * Allows the AI to send messages AND images to contacts through any connected platform.
 * Supports sending by contact name lookup OR directly by phone number.
 * Uses the connector registry to find the right connector and call .send() / .sendImage().
 */

import { toolRegistry } from "../tool-registry.mjs"

/**
 * Normalize a phone number: strip spaces, dashes, parentheses, plus signs.
 * Returns digits only.
 */
function normalizePhone(input) {
  return input.replace(/[^\d]/g, "")
}

toolRegistry.register(
  "send_message",
  {
    description:
      "Send a text message OR an image to a contact on a messaging platform (WhatsApp, Telegram, Discord, Slack, Signal, WeChat). " +
      "For WhatsApp: you can pass a phone number directly as peer_id (e.g. '971524563883'). " +
      "To send an image: provide the image_url parameter (from image_generation tool or any URL). " +
      "To forward a previously generated image: use the image URL from the earlier image_generation result. " +
      "If the user says 'send that image to X', look in the conversation history for the most recent image_url.",
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
            "IMPORTANT: For WhatsApp numbers, always include the country code and remove any leading 0. " +
            "Example: UAE number 0524563883 → 971524563883 (country code 971 + number without leading 0).",
        },
        message: {
          type: "string",
          description: "The text message to send. Also used as the image caption when sending an image.",
        },
        image_url: {
          type: "string",
          description:
            "Optional: URL of an image to send. Use this to send generated images (from image_generation tool) " +
            "or any image URL to the recipient. When provided, the image will be sent as an actual photo in the chat, not just a link.",
        },
      },
      required: ["channel_type", "peer_id", "message"],
    },
  },
  async (args, ctx) => {
    const { channel_type, message, image_url } = args
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
      sendTo = normalizePhone(peer_id)
      if (sendTo.startsWith("00")) {
        sendTo = sendTo.slice(2)
      }
      if (!sendTo.includes("@")) {
        sendTo = `${sendTo}@s.whatsapp.net`
      }
    }

    try {
      const results = []

      // Send image if provided
      if (image_url) {
        console.log(`[Tools:SendMessage] Sending IMAGE via ${channel_type} to ${sendTo}: "${image_url.slice(0, 80)}"`)
        try {
          await connector.sendImage(sendTo, image_url, message)
          results.push("image_sent")
        } catch (imgErr) {
          console.error(`[Tools:SendMessage] sendImage failed:`, imgErr.message)
          // Fallback: send image URL as text
          await connector.send(sendTo, `${message}\n${image_url}`)
          results.push("image_sent_as_link")
        }
      } else {
        // Send text only
        console.log(`[Tools:SendMessage] Sending TEXT via ${channel_type} to ${sendTo}: "${message.slice(0, 60)}"`)
        await connector.send(sendTo, message)
        results.push("text_sent")
      }

      return JSON.stringify({
        status: "sent",
        channel: channel_type,
        recipient: peer_id,
        sent: results,
        has_image: !!image_url,
        message_preview: message.slice(0, 100),
        message: image_url
          ? `Image and message sent successfully via ${channel_type}.`
          : `Message sent successfully via ${channel_type}.`,
      })
    } catch (err) {
      console.error(`[Tools:SendMessage] Error:`, err.message)
      return JSON.stringify({
        status: "error",
        error: `Failed to send via ${channel_type}: ${err.message}`,
      })
    }
  },
  { needsCtx: true }
)
