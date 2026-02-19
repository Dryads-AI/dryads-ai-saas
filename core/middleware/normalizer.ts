import { UnifiedMessage } from "../channels/base"

/** Normalizes and sanitizes incoming messages from any channel */
export function normalizeMessage(message: UnifiedMessage): UnifiedMessage {
  return {
    ...message,
    content: message.content.trim(),
    timestamp: message.timestamp instanceof Date ? message.timestamp : new Date(message.timestamp),
  }
}
