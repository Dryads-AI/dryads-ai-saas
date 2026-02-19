/**
 * DMMS AI — Telegram Bot (Long-Polling)
 *
 * Uses Telegram's getUpdates API (long-polling) instead of webhooks.
 * This is the same approach used by Cloudbot and most production Telegram bots.
 * Runs alongside Next.js via instrumentation.ts.
 */

import { pool, cuid } from "./db"
import OpenAI from "openai"

const TG = (token: string, method: string) =>
  `https://api.telegram.org/bot${token}/${method}`

let botToken: string | null = null
let running = false

// ── Entrypoint ───────────────────────────────────────────────────────

export async function startTelegramBot() {
  if (running) return
  console.log("[TG Bot] Initializing...")

  // Get bot token from DB or env
  botToken = await resolveBotToken()

  if (!botToken) {
    console.log("[TG Bot] No bot token found. Retrying in 30s...")
    setTimeout(startTelegramBot, 30_000)
    return
  }

  // Delete any existing webhook — you can't use webhook + polling at the same time
  try {
    await fetch(TG(botToken, "deleteWebhook"), { method: "POST" })
    console.log("[TG Bot] Webhook deleted")
  } catch {}

  // Verify bot works
  try {
    const me = await fetch(TG(botToken, "getMe"))
    const data = await me.json()
    if (data.ok) {
      console.log(`[TG Bot] Connected as @${data.result.username}`)
    } else {
      console.error("[TG Bot] Invalid bot token:", data.description)
      botToken = null
      setTimeout(startTelegramBot, 60_000)
      return
    }
  } catch (err) {
    console.error("[TG Bot] Failed to connect:", err)
    setTimeout(startTelegramBot, 30_000)
    return
  }

  running = true
  console.log("[TG Bot] Long-polling started")
  pollLoop(0)
}

// ── Long-polling loop ────────────────────────────────────────────────

async function pollLoop(offset: number) {
  while (running && botToken) {
    try {
      const url = `${TG(botToken, "getUpdates")}?offset=${offset}&timeout=25&allowed_updates=${encodeURIComponent('["message","edited_message"]')}`

      const res = await fetch(url, {
        signal: AbortSignal.timeout(35_000),
      })

      const data = await res.json()

      if (data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          offset = update.update_id + 1
          const msg = update.message || update.edited_message
          if (msg?.text) {
            // Handle each message — don't let one failure stop the loop
            try {
              await handleMessage(msg)
            } catch (err) {
              console.error("[TG Bot] Message handler error:", err)
            }
          }
        }
      }
    } catch (err: unknown) {
      const errName = err instanceof Error ? err.name : ""
      if (errName !== "AbortError" && errName !== "TimeoutError") {
        console.error("[TG Bot] Poll error:", err instanceof Error ? err.message : err)
      }
      // Brief pause before retry
      await sleep(3_000)
    }
  }
}

// ── Message handler ──────────────────────────────────────────────────

async function handleMessage(msg: {
  message_id: number
  from: { id: number; first_name: string }
  chat: { id: number; type: string }
  text?: string
}) {
  const chatId = String(msg.chat.id)
  const text = msg.text || ""
  if (!text || !botToken) return

  console.log(`[TG Bot] ${msg.from.first_name}: ${text.slice(0, 60)}`)

  // /start command
  if (text === "/start") {
    await sendTg(chatId, "Welcome to DMMS AI! Send me any message and I'll respond with AI.")
    return
  }

  // Send "typing..." indicator
  fetch(TG(botToken, "sendChatAction"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  }).catch(() => {})

  // Find the Telegram channel owner
  const channelRes = await pool.query(
    'SELECT * FROM "UserChannel" WHERE "channelType" = $1 AND enabled = true LIMIT 1',
    ["telegram"]
  )
  if (channelRes.rows.length === 0) {
    await sendTg(chatId, "Bot not configured yet. Set up Telegram in the DMMS AI dashboard.")
    return
  }
  const userId = channelRes.rows[0].userId

  // Get OpenAI API key
  const keyRes = await pool.query(
    'SELECT "apiKey" FROM "UserApiKey" WHERE "userId" = $1 AND provider = $2',
    [userId, "openai"]
  )
  const apiKey = keyRes.rows[0]?.apiKey || process.env.OPENAI_API_KEY
  if (!apiKey) {
    await sendTg(chatId, "No OpenAI API key. Please add one in Settings on the DMMS AI dashboard.")
    return
  }

  // Get or create conversation
  const convoRes = await pool.query(
    'SELECT id, "aiModel" FROM "Conversation" WHERE "userId" = $1 AND "channelType" = $2 AND "channelPeer" = $3 ORDER BY "updatedAt" DESC LIMIT 1',
    [userId, "telegram", chatId]
  )

  let convoId: string
  let aiModel: string
  const now = new Date().toISOString()

  if (convoRes.rows.length > 0) {
    convoId = convoRes.rows[0].id
    aiModel = convoRes.rows[0].aiModel || "gpt-4o-mini"
  } else {
    convoId = cuid()
    aiModel = "gpt-4o-mini"
    await pool.query(
      'INSERT INTO "Conversation" (id, "userId", "channelType", "channelPeer", title, "aiModel", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [convoId, userId, "telegram", chatId, text.slice(0, 50), aiModel, now, now]
    )
  }

  // Save user message
  await pool.query(
    'INSERT INTO "Message" (id, "conversationId", role, content, "createdAt") VALUES ($1, $2, $3, $4, $5)',
    [cuid(), convoId, "user", text, now]
  )

  // Build context from history
  const historyRes = await pool.query(
    'SELECT role, content FROM "Message" WHERE "conversationId" = $1 ORDER BY "createdAt" ASC LIMIT 20',
    [convoId]
  )

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content:
        "You are DMMS AI, a helpful AI assistant on Telegram. Be knowledgeable, friendly, and concise. Keep responses under 500 characters when possible. Do NOT use markdown formatting — use plain text only.",
    },
    ...historyRes.rows.map((m: { role: string; content: string }) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ]

  // Call OpenAI (non-streaming — simpler and more reliable)
  const openai = new OpenAI({ apiKey })
  const completion = await openai.chat.completions.create({
    model: aiModel,
    messages,
    temperature: 0.7,
    max_tokens: 1024,
  })

  const reply =
    completion.choices[0]?.message?.content ||
    "Sorry, I couldn't generate a response. Please try again."

  // Save assistant message
  const saveNow = new Date().toISOString()
  await pool.query(
    'INSERT INTO "Message" (id, "conversationId", role, content, "createdAt") VALUES ($1, $2, $3, $4, $5)',
    [cuid(), convoId, "assistant", reply, saveNow]
  )
  await pool.query(
    'UPDATE "Conversation" SET "updatedAt" = $1 WHERE id = $2',
    [saveNow, convoId]
  )

  // Send reply to Telegram
  await sendTg(chatId, reply, msg.message_id)
  console.log(`[TG Bot] Replied: ${reply.slice(0, 60)}`)
}

// ── Telegram send helper ─────────────────────────────────────────────

async function sendTg(
  chatId: string,
  text: string,
  replyToId?: number
) {
  if (!botToken) return

  // Split long messages (Telegram limit: 4096 chars)
  const chunks: string[] = []
  for (let i = 0; i < text.length; i += 4000) {
    chunks.push(text.slice(i, i + 4000))
  }

  for (let i = 0; i < chunks.length; i++) {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text: chunks[i],
    }
    if (replyToId && i === 0) {
      body.reply_parameters = {
        message_id: replyToId,
        allow_sending_without_reply: true,
      }
    }

    try {
      const res = await fetch(TG(botToken, "sendMessage"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!data.ok) {
        console.error("[TG Bot] Send failed:", data.description)
        // Retry without reply_parameters
        if (replyToId && i === 0) {
          await fetch(TG(botToken, "sendMessage"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text: chunks[i] }),
          })
        }
      }
    } catch (err) {
      console.error("[TG Bot] Send error:", err)
    }
  }
}

// ── Token resolver ───────────────────────────────────────────────────

async function resolveBotToken(): Promise<string | null> {
  // Check env var first
  if (process.env.TELEGRAM_BOT_TOKEN) {
    return process.env.TELEGRAM_BOT_TOKEN
  }

  // Check database
  try {
    const res = await pool.query(
      'SELECT config FROM "UserChannel" WHERE "channelType" = $1 AND enabled = true LIMIT 1',
      ["telegram"]
    )
    if (res.rows.length > 0) {
      const raw = res.rows[0].config
      const config = typeof raw === "string" ? JSON.parse(raw) : raw
      if (config?.botToken) return config.botToken
    }
  } catch (err) {
    console.error("[TG Bot] DB config read error:", err)
  }

  return null
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
