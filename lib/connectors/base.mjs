/**
 * Dryads AI — Base Connector
 * Abstract base class for all messaging platform connectors.
 */

import { randomBytes } from "crypto"

const cuid = () => "c" + randomBytes(12).toString("hex")

export class BaseConnector {
  /**
   * @param {string} userId - Dryads AI user ID who owns this connector
   * @param {string} channelType - e.g. "telegram", "whatsapp", "discord", "slack"
   * @param {string} connectionMode - "business" or "personal"
   * @param {object} config - Channel-specific configuration (tokens, etc.)
   * @param {import("pg").Pool} pool - PostgreSQL connection pool
   */
  constructor(userId, channelType, connectionMode, config, pool) {
    this.userId = userId
    this.channelType = channelType
    this.connectionMode = connectionMode
    this.config = config
    this.pool = pool
    this._pipeline = null
    this._running = false
    this._onIncomingCallbacks = []
    this._autoReplyEnabled = true
  }

  /** Register a callback for incoming messages (used by gateway to relay to Next.js) */
  onIncoming(callback) {
    this._onIncomingCallbacks.push(callback)
  }

  /** Register the middleware pipeline to process incoming messages */
  setPipeline(pipeline) {
    this._pipeline = pipeline
  }

  /** Start the connector (abstract — must override) */
  async start() {
    throw new Error("start() not implemented")
  }

  /** Stop the connector (abstract — must override) */
  async stop() {
    this._running = false
  }

  /** Send a text message to a peer (abstract — must override) */
  async send(peerId, text) {
    throw new Error("send() not implemented")
  }

  /** Send an image to a peer (override per platform) */
  async sendImage(peerId, imageUrl, caption) {
    // Default: send as URL in text (fallback for platforms without image support)
    console.log(`[${this.channelType}] sendImage not implemented — sending URL as text`)
    await this.send(peerId, `${caption ? caption + "\n" : ""}${imageUrl}`)
  }

  /**
   * Handle an incoming message by running it through the pipeline.
   * @param {string} peerId - Platform-specific peer identifier
   * @param {string} text - Message text
   * @param {object} extra - { channelName, onTyping, ... }
   * @returns {{ reply: string, images: Array<{url: string, caption: string}> }}
   */
  async handleMessage(peerId, text, extra = {}) {
    if (!this._pipeline) {
      console.error(`[${this.channelType}] No pipeline configured`)
      return { reply: null, images: [] }
    }

    const timestamp = new Date().toISOString()
    let reply = null
    let images = []

    // Run pipeline only if auto-reply is enabled
    if (this._autoReplyEnabled) {
      const ctx = {
        channelType: this.channelType,
        channelName: extra.channelName || this.channelType,
        channelPeer: peerId,
        connectionMode: this.connectionMode,
        text,
        startTime: Date.now(),
        userId: this.userId,
        toolsUsed: [],
        onTyping: extra.onTyping || (() => {}),
        // Actionable middleware: give tools access to the connector registry
        registry: this._registry || null,
      }

      try {
        await this._pipeline(ctx)
        reply = ctx.reply
        images = ctx.generatedImages || []
      } catch (err) {
        console.error(`[${this.channelType}] Pipeline error:`, err.message)
        throw err
      }
    }

    // Upsert contact so search_contacts tool has data
    const displayName = extra.displayName || extra.pushName || null
    this._upsertContact(peerId, displayName).catch((e) =>
      console.error(`[${this.channelType}] Contact upsert error:`, e.message)
    )

    // Emit to all registered incoming callbacks (gateway relay)
    const event = {
      userId: this.userId,
      channelType: this.channelType,
      connectionMode: this.connectionMode,
      peerId,
      text,
      reply,
      images,
      timestamp,
    }
    for (const cb of this._onIncomingCallbacks) {
      try { cb(event) } catch (e) { console.error("[BaseConnector] onIncoming callback error:", e.message) }
    }

    return { reply, images }
  }

  /** Upsert a contact record for the peer */
  async _upsertContact(peerId, displayName) {
    if (!peerId) return
    await this.pool.query(
      `INSERT INTO "Contact" (id, "userId", "channelType", "peerId", "displayName", "lastMessageAt")
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT ("userId", "channelType", "peerId")
       DO UPDATE SET "displayName" = COALESCE(NULLIF($5, ''), "Contact"."displayName"),
                     "lastMessageAt" = NOW()`,
      [cuid(), this.userId, this.channelType, peerId, displayName || null]
    )
  }

  /** Write a channel event to the DB */
  async writeEvent(eventType, payload) {
    await this.pool.query(
      "INSERT INTO channel_events (id, user_id, channel_type, event_type, payload, created_at) VALUES ($1, $2, $3, $4, $5, NOW())",
      [cuid(), this.userId, this.channelType, eventType, payload || null]
    )
  }

  /** Update channel status in the UserChannel table */
  async updateStatus(status) {
    await this.pool.query(
      'UPDATE "UserChannel" SET status = $1, "updatedAt" = NOW() WHERE "userId" = $2 AND "channelType" = $3 AND "connectionMode" = $4',
      [status, this.userId, this.channelType, this.connectionMode]
    ).catch(() => {
      // Fallback: try without connectionMode for backward compatibility
      this.pool.query(
        'UPDATE "UserChannel" SET status = $1, "updatedAt" = NOW() WHERE "userId" = $2 AND "channelType" = $3',
        [status, this.userId, this.channelType]
      ).catch(() => {})
    })
  }
}
