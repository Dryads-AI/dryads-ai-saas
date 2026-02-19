import { UnifiedMessage } from "../channels/base"
import { ChannelManager } from "../channels/manager"
import { ProviderManager } from "../providers/manager"
import { normalizeMessage } from "./normalizer"
import { getOrCreateSession } from "./session"
import { buildContext } from "./context"
import { checkRateLimit } from "./rate-limiter"
import { messageQueue } from "./queue"
import { pool, cuid } from "@/lib/db"

export class MessageRouter {
  constructor(
    private channelManager: ChannelManager,
    private providerManager: ProviderManager
  ) {}

  /**
   * Main message pipeline:
   * Receive → Normalize → Rate Limit → Session → Queue → Context → AI → Save → Route back
   */
  async handleMessage(message: UnifiedMessage, dbUserId: string): Promise<void> {
    const normalized = normalizeMessage(message)
    if (!normalized.content) return

    // Rate limit
    const limit = checkRateLimit(normalized.userId)
    if (!limit.allowed) {
      const channel = this.channelManager.getChannel(
        `${normalized.channelType}:${dbUserId}`
      )
      if (channel) {
        await channel.sendMessage(
          normalized.channelId,
          `Rate limited. Try again in ${Math.ceil(limit.resetIn / 1000)}s.`
        )
      }
      return
    }

    // Session
    const session = getOrCreateSession(
      normalized.channelType,
      normalized.channelId,
      normalized.userId
    )

    // Process in queue (one at a time per conversation)
    const queueKey = `${dbUserId}:${normalized.channelType}:${normalized.channelId}`
    await messageQueue.enqueue(queueKey, async () => {
      // Get or create conversation
      let conversationId: string | undefined = session.conversationId
      if (conversationId) {
        const existing = await pool.query(
          'SELECT id FROM "Conversation" WHERE id = $1',
          [conversationId]
        )
        if (existing.rows.length === 0) conversationId = undefined
      }

      if (!conversationId) {
        conversationId = cuid()
        const now = new Date().toISOString()
        await pool.query(
          'INSERT INTO "Conversation" (id, "userId", "channelType", "channelPeer", "aiModel", title, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
          [conversationId, dbUserId, normalized.channelType, normalized.userId, session.aiModel, normalized.content.slice(0, 50), now, now]
        )
        session.conversationId = conversationId
      }

      // Save user message
      const userMsgId = cuid()
      const now = new Date().toISOString()
      await pool.query(
        'INSERT INTO "Message" (id, "conversationId", role, content, "createdAt") VALUES ($1, $2, $3, $4, $5)',
        [userMsgId, conversationId, "user", normalized.content, now]
      )

      // Build context and call AI
      const context = await buildContext(conversationId, session.systemPrompt)
      const provider = this.providerManager.getProvider("openai")
      if (!provider) return

      let fullResponse = ""
      for await (const chunk of provider.chat(context, { model: session.aiModel })) {
        if (chunk.type === "text" && chunk.content) {
          fullResponse += chunk.content
        }
        if (chunk.type === "error") {
          fullResponse = `Error: ${chunk.error}`
          break
        }
      }

      // Save assistant message
      const asstMsgId = cuid()
      const saveNow = new Date().toISOString()
      await pool.query(
        'INSERT INTO "Message" (id, "conversationId", role, content, "createdAt") VALUES ($1, $2, $3, $4, $5)',
        [asstMsgId, conversationId, "assistant", fullResponse, saveNow]
      )

      // Update conversation timestamp
      await pool.query(
        'UPDATE "Conversation" SET "updatedAt" = $1 WHERE id = $2',
        [saveNow, conversationId]
      )

      // Route response back to channel
      const channel = this.channelManager.getChannel(
        `${normalized.channelType}:${dbUserId}`
      )
      if (channel) {
        await channel.sendMessage(normalized.channelId, fullResponse, {
          replyTo: normalized.id,
        })
      }
    })
  }
}
