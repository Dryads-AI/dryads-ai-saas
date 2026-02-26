/**
 * DMMS AI — Store Middleware
 * Saves user message + AI response to the Message table.
 * Now persists AI metadata: provider, model, intentClass, complexityClass.
 */

import { randomBytes } from "crypto"

const cuid = () => "c" + randomBytes(12).toString("hex")

/**
 * @param {import("pg").Pool} pool
 */
export function storeMiddleware(pool) {
  return async function store(ctx, next) {
    const saveNow = new Date().toISOString()

    // Save user message
    await pool.query(
      'INSERT INTO "Message" (id, "conversationId", role, content, "createdAt") VALUES ($1, $2, $3, $4, $5)',
      [cuid(), ctx.convoId, "user", ctx.text, ctx.now]
    )

    // Save AI response with metadata
    await pool.query(
      `INSERT INTO "Message" (id, "conversationId", role, content, provider, model, "intentClass", "complexityClass", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        cuid(),
        ctx.convoId,
        "assistant",
        ctx.reply,
        ctx.aiProvider || null,
        ctx.aiModel || null,
        ctx.intentClass || null,
        ctx.complexityClass || null,
        saveNow,
      ]
    )

    await pool.query('UPDATE "Conversation" SET "updatedAt" = $1 WHERE id = $2', [saveNow, ctx.convoId])

    await next()
  }
}
