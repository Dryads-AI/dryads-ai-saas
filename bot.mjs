/**
 * DMMS AI — Telegram Bot v2.0
 * Intelligent Middleware Architecture
 *
 * Pipeline:
 *   Telegram → Receive → Session → Context → AI (+ Tools) → Store → Send → Telegram
 *
 * The AI middleware uses OpenAI function calling with tools:
 *   - web_search: Search the internet for real-time information
 *   - get_datetime: Get current date, time, and timezone
 *
 * The middleware is EXTENSIBLE — add new tools/layers by registering them.
 */

import pg from "pg"
import OpenAI from "openai"
import { randomBytes } from "crypto"

const { Pool } = pg

// ── Config ───────────────────────────────────────────────────────────

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 })
const cuid = () => "c" + randomBytes(12).toString("hex")

let BOT_TOKEN = ""
const TG = (method) => `https://api.telegram.org/bot${BOT_TOKEN}/${method}`

// ── Tools Registry (Extensible) ─────────────────────────────────────

/**
 * Each tool has:
 *   definition — OpenAI function schema (name, description, parameters)
 *   execute(args) — async function that returns a string result
 */
const TOOLS = []

// Tool 1: Web Search — search the internet for real-time info
TOOLS.push({
  definition: {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the internet for current/real-time information including weather, news, prices, sports scores, events, people, places, or any factual question. Use this whenever the user asks about something that might need up-to-date information.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query to look up on the internet",
          },
        },
        required: ["query"],
      },
    },
  },
  execute: webSearch,
})

// Tool 2: Get Date/Time
TOOLS.push({
  definition: {
    type: "function",
    function: {
      name: "get_datetime",
      description: "Get the current date, time, and day of the week.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  execute: async () => {
    const now = new Date()
    return JSON.stringify({
      date: now.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
      time: now.toLocaleTimeString("en-US", { hour12: true }),
      timezone: "UTC",
      iso: now.toISOString(),
    })
  },
})

// ── Web Search Implementation ────────────────────────────────────────

async function webSearch(args) {
  const query = args.query
  console.log(`[MW:Search] Searching: "${query}"`)

  try {
    // Use DuckDuckGo HTML lite (no API key required)
    const res = await fetch("https://lite.duckduckgo.com/lite/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "DMMS-AI/2.0",
      },
      body: `q=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(8000),
    })

    const html = await res.text()

    // Extract search result snippets from DuckDuckGo lite HTML
    const results = []

    // DuckDuckGo lite uses single quotes: class='result-link' and class='result-snippet'
    const snippetRegex =
      /<td\s+class=['"]result-snippet['"]>([\s\S]*?)<\/td>/gi
    const linkRegex =
      /<a\s+[^>]*class=['"]result-link['"][^>]*>([\s\S]*?)<\/a>/gi

    const snippets = []
    const titles = []
    let m

    while ((m = snippetRegex.exec(html)) !== null && snippets.length < 5) {
      snippets.push(
        m[1]
          .replace(/<[^>]+>/g, "")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#x27;/g, "'")
          .replace(/\s+/g, " ")
          .trim()
      )
    }

    while ((m = linkRegex.exec(html)) !== null && titles.length < 5) {
      titles.push(
        m[1]
          .replace(/<[^>]+>/g, "")
          .replace(/&amp;/g, "&")
          .replace(/\s+/g, " ")
          .trim()
      )
    }

    // Build results
    for (let i = 0; i < Math.max(snippets.length, titles.length); i++) {
      results.push({
        title: titles[i] || "",
        snippet: snippets[i] || "",
      })
    }

    if (results.length === 0) {
      // Fallback: try DuckDuckGo instant answer API
      const iaRes = await fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`,
        { signal: AbortSignal.timeout(5000) }
      )
      const iaData = await iaRes.json()

      if (iaData.AbstractText) {
        results.push({
          title: iaData.Heading || query,
          snippet: iaData.AbstractText,
        })
      }
      if (iaData.Answer) {
        results.push({ title: "Answer", snippet: iaData.Answer })
      }
      // Related topics as fallback
      if (iaData.RelatedTopics && results.length === 0) {
        for (const topic of iaData.RelatedTopics.slice(0, 3)) {
          if (topic.Text) {
            results.push({ title: topic.FirstURL || "", snippet: topic.Text })
          }
        }
      }
    }

    if (results.length === 0) {
      return `No search results found for: "${query}". Please answer based on your knowledge.`
    }

    const formatted = results
      .map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet}`)
      .join("\n\n")

    console.log(`[MW:Search] Found ${results.length} results`)
    return `Web search results for "${query}":\n\n${formatted}\n\nUse these results to give the user an accurate, up-to-date answer.`
  } catch (err) {
    console.error(`[MW:Search] Error:`, err.message)
    return `Web search failed (${err.message}). Please answer based on your knowledge and let the user know the information might not be fully current.`
  }
}

// ── System Prompt ────────────────────────────────────────────────────

function buildSystemPrompt() {
  const now = new Date()
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })
  const timeStr = now.toLocaleTimeString("en-US", { hour12: true })

  return `You are DMMS AI, an intelligent AI assistant on Telegram. Today is ${dateStr}, ${timeStr} UTC.

CAPABILITIES:
- You can search the internet for real-time information (weather, news, prices, events, etc.)
- You have access to tools: use web_search when you need current/live data
- You remember the conversation context

RULES:
- Read the user's message carefully and answer their EXACT question
- When asked about weather, news, prices, sports, or current events: ALWAYS use the web_search tool first
- Be helpful, accurate, and direct
- Keep responses concise but complete (under 500 characters when possible)
- Use plain text for Telegram — no markdown formatting, no asterisks, no code blocks
- If the user greets you, greet them warmly and ask how you can help
- If a tool search fails, be honest about it
- Be conversational and natural, like a smart friend

IDENTITY:
- You are DMMS AI, NOT ChatGPT, NOT Google, NOT Siri
- You are powered by advanced AI technology
- You are available on multiple messengers (Telegram, WhatsApp, Discord, and more)
- Your tagline: "Every Messenger is AI Now"`
}

// ── Middleware Pipeline ──────────────────────────────────────────────

const pipeline = [
  receiveMiddleware,
  sessionMiddleware,
  contextMiddleware,
  aiMiddleware,
  storeMiddleware,
  sendMiddleware,
]

async function processMessage(msg) {
  const ctx = {}

  try {
    for (const mw of pipeline) {
      await mw(ctx, msg)
    }
    const preview = (s) => (s || "").slice(0, 50).replace(/\n/g, " ")
    console.log(`[MW] ${ctx.userName}: "${preview(ctx.text)}" → "${preview(ctx.reply)}"`)
  } catch (err) {
    console.error("[MW] Pipeline error:", err.message)
    if (ctx.chatId) {
      await tgSend(ctx.chatId, "Sorry, something went wrong. Please try again.").catch(() => {})
    }
  }
}

// ── MW 1: Receive — Parse incoming Telegram message ─────────────────

async function receiveMiddleware(ctx, msg) {
  ctx.chatId = String(msg.chat.id)
  ctx.text = (msg.text || "").trim()
  ctx.messageId = msg.message_id
  ctx.userName = msg.from?.first_name || "User"
  ctx.telegramUserId = String(msg.from?.id || "")
  ctx.userId = null
  ctx.startTime = Date.now()

  if (!ctx.text) throw new Error("Empty message — skipping")

  console.log(`[MW:Receive] From ${ctx.userName} (${ctx.chatId}): "${ctx.text.slice(0, 60)}"`)
}

// ── MW 2: Session — Load user, conversation, history from DB ────────

async function sessionMiddleware(ctx) {
  // Find the Telegram channel owner
  const channelRes = await pool.query(
    'SELECT "userId" FROM "UserChannel" WHERE "channelType" = $1 AND enabled = true LIMIT 1',
    ["telegram"]
  )
  if (channelRes.rows.length === 0) throw new Error("No Telegram channel configured")
  ctx.userId = channelRes.rows[0].userId

  // Get OpenAI API key
  const keyRes = await pool.query(
    'SELECT "apiKey" FROM "UserApiKey" WHERE "userId" = $1 AND provider = $2',
    [ctx.userId, "openai"]
  )
  ctx.apiKey = keyRes.rows[0]?.apiKey || process.env.OPENAI_API_KEY
  if (!ctx.apiKey) throw new Error("No OpenAI API key configured")

  // Get or create conversation
  const convoRes = await pool.query(
    'SELECT id, "aiModel" FROM "Conversation" WHERE "userId" = $1 AND "channelType" = $2 AND "channelPeer" = $3 ORDER BY "updatedAt" DESC LIMIT 1',
    [ctx.userId, "telegram", ctx.chatId]
  )

  ctx.now = new Date().toISOString()

  if (convoRes.rows.length > 0) {
    ctx.convoId = convoRes.rows[0].id
    ctx.aiModel = convoRes.rows[0].aiModel || "gpt-4o-mini"
  } else {
    ctx.convoId = cuid()
    ctx.aiModel = "gpt-4o-mini"
    await pool.query(
      'INSERT INTO "Conversation" (id, "userId", "channelType", "channelPeer", title, "aiModel", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [ctx.convoId, ctx.userId, "telegram", ctx.chatId, ctx.text.slice(0, 50), ctx.aiModel, ctx.now, ctx.now]
    )
  }

  // Load recent history (last 10 messages for context — 5 exchanges)
  const historyRes = await pool.query(
    'SELECT role, content FROM "Message" WHERE "conversationId" = $1 ORDER BY "createdAt" DESC LIMIT 10',
    [ctx.convoId]
  )
  ctx.history = historyRes.rows.reverse()

  console.log(`[MW:Session] Conversation ${ctx.convoId.slice(0, 8)}... | ${ctx.history.length} prior messages`)
}

// ── MW 3: Context — Enrich with date/time and metadata ──────────────

async function contextMiddleware(ctx) {
  // Nothing extra needed here for now — the system prompt handles date/time.
  // This middleware is a placeholder for future enrichment:
  //   - User preferences
  //   - Location data
  //   - Custom knowledge base lookup
  //   - Rate limiting checks
  //   - Language detection
  ctx.toolsUsed = []
}

// ── MW 4: AI — Call OpenAI with tools, handle tool-call loop ────────

async function aiMiddleware(ctx) {
  const openai = new OpenAI({ apiKey: ctx.apiKey })

  // Build messages array
  const messages = [
    { role: "system", content: buildSystemPrompt() },
    ...ctx.history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: ctx.text },
  ]

  // OpenAI tool definitions
  const tools = TOOLS.map((t) => t.definition)

  // Tool-call loop: AI can call tools, we execute them, feed results back
  let maxRounds = 3 // prevent infinite loops
  let round = 0

  while (round < maxRounds) {
    round++

    const params = {
      model: ctx.aiModel,
      messages,
      temperature: 0.7,
      max_tokens: 1024,
    }

    // Only include tools on first round (or if AI requested more)
    if (tools.length > 0) {
      params.tools = tools
      params.tool_choice = round === 1 ? "auto" : "auto"
    }

    console.log(`[MW:AI] Round ${round} — sending to ${ctx.aiModel}...`)
    const completion = await openai.chat.completions.create(params)
    const choice = completion.choices[0]

    // If AI wants to call tools
    if (choice.finish_reason === "tool_calls" || choice.message.tool_calls?.length > 0) {
      // Add the assistant message with tool calls
      messages.push(choice.message)

      // Execute each tool call
      for (const toolCall of choice.message.tool_calls) {
        const toolName = toolCall.function.name
        const toolArgs = JSON.parse(toolCall.function.arguments || "{}")

        console.log(`[MW:AI] Tool call: ${toolName}(${JSON.stringify(toolArgs).slice(0, 80)})`)

        // Find the tool
        const tool = TOOLS.find((t) => t.definition.function.name === toolName)
        let result = "Tool not found."

        if (tool) {
          try {
            // Keep typing indicator active during tool execution
            tgTyping(ctx.chatId)
            result = await tool.execute(toolArgs)
            ctx.toolsUsed.push(toolName)
          } catch (err) {
            console.error(`[MW:AI] Tool error (${toolName}):`, err.message)
            result = `Error: ${err.message}`
          }
        }

        // Add tool result to messages
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        })
      }

      // Continue the loop — AI will process tool results
      continue
    }

    // AI gave a final text response
    ctx.reply = choice.message.content || "Sorry, I couldn't generate a response."
    break
  }

  if (!ctx.reply) {
    ctx.reply = "Sorry, I took too long thinking. Please try again."
  }

  const elapsed = Date.now() - ctx.startTime
  console.log(
    `[MW:AI] Response ready (${elapsed}ms, ${round} round${round > 1 ? "s" : ""}${ctx.toolsUsed.length > 0 ? ", tools: " + ctx.toolsUsed.join(", ") : ""})`
  )
}

// ── MW 5: Store — Save messages to database ─────────────────────────

async function storeMiddleware(ctx) {
  const saveNow = new Date().toISOString()

  // Save user message
  await pool.query(
    'INSERT INTO "Message" (id, "conversationId", role, content, "createdAt") VALUES ($1, $2, $3, $4, $5)',
    [cuid(), ctx.convoId, "user", ctx.text, ctx.now]
  )

  // Save AI response
  await pool.query(
    'INSERT INTO "Message" (id, "conversationId", role, content, "createdAt") VALUES ($1, $2, $3, $4, $5)',
    [cuid(), ctx.convoId, "assistant", ctx.reply, saveNow]
  )

  // Update conversation timestamp
  await pool.query('UPDATE "Conversation" SET "updatedAt" = $1 WHERE id = $2', [saveNow, ctx.convoId])
}

// ── MW 6: Send — Deliver reply to Telegram ──────────────────────────

async function sendMiddleware(ctx) {
  await tgSend(ctx.chatId, ctx.reply, ctx.messageId)
}

// ── Telegram Helpers ─────────────────────────────────────────────────

async function tgSend(chatId, text, replyToId) {
  // Split long messages (Telegram limit: 4096 chars)
  const chunks = []
  for (let i = 0; i < text.length; i += 4000) {
    chunks.push(text.slice(i, i + 4000))
  }

  for (let i = 0; i < chunks.length; i++) {
    const body = { chat_id: chatId, text: chunks[i] }
    if (replyToId && i === 0) {
      body.reply_parameters = { message_id: replyToId, allow_sending_without_reply: true }
    }

    const res = await fetch(TG("sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!data.ok) {
      console.error("[TG] Send failed:", data.description)
      if (replyToId && i === 0) {
        await fetch(TG("sendMessage"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: chunks[i] }),
        })
      }
    }
  }
}

function tgTyping(chatId) {
  fetch(TG("sendChatAction"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  }).catch(() => {})
}

// ── Long-Polling Loop ────────────────────────────────────────────────

async function pollLoop(offset) {
  while (true) {
    try {
      const url = `${TG("getUpdates")}?offset=${offset}&timeout=25&allowed_updates=${encodeURIComponent('["message","edited_message"]')}`
      const res = await fetch(url, { signal: AbortSignal.timeout(35000) })
      const data = await res.json()

      if (data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          offset = update.update_id + 1
          const msg = update.message || update.edited_message
          if (!msg?.text) continue

          // Handle /start command
          if (msg.text === "/start") {
            await tgSend(
              String(msg.chat.id),
              "Welcome to DMMS AI! I'm your smart AI assistant.\n\nI can answer questions, search the web, give you news, weather, and more.\n\nJust send me any message!\n\nCommands:\n/new — Start a fresh conversation\n\nPowered by DMMS AI — Every Messenger is AI Now."
            )
            continue
          }

          // Handle /new command (reset conversation)
          if (msg.text === "/new") {
            await tgSend(String(msg.chat.id), "Fresh start! Send me anything.")
            continue
          }

          // Show typing indicator then process
          tgTyping(String(msg.chat.id))
          processMessage(msg).catch((err) => {
            console.error("[Bot] Unhandled:", err.message)
          })
        }
      }
    } catch (err) {
      if (err.name !== "AbortError" && err.name !== "TimeoutError") {
        console.error("[Bot] Poll error:", err.message)
      }
      await new Promise((r) => setTimeout(r, 3000))
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log("[Bot] DMMS AI v2.0 — Intelligent Middleware Engine")
  console.log("[Bot] Pipeline: Receive → Session → Context → AI (+ Tools) → Store → Send")
  console.log(`[Bot] Tools: ${TOOLS.map((t) => t.definition.function.name).join(", ")}`)

  // Resolve bot token
  BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ""
  if (!BOT_TOKEN) {
    try {
      const res = await pool.query(
        'SELECT config FROM "UserChannel" WHERE "channelType" = $1 AND enabled = true LIMIT 1',
        ["telegram"]
      )
      if (res.rows.length > 0) {
        const raw = res.rows[0].config
        const config = typeof raw === "string" ? JSON.parse(raw) : raw
        if (config?.botToken) BOT_TOKEN = config.botToken
      }
    } catch (err) {
      console.error("[Bot] DB error:", err.message)
    }
  }

  if (!BOT_TOKEN) {
    console.error("[Bot] No bot token! Set TELEGRAM_BOT_TOKEN or configure in dashboard.")
    process.exit(1)
  }

  // Delete any webhook (can't use both webhook and polling)
  await fetch(TG("deleteWebhook"), { method: "POST" }).catch(() => {})

  // Verify bot connection
  const me = await fetch(TG("getMe"))
  const meData = await me.json()
  if (!meData.ok) {
    console.error("[Bot] Invalid token:", meData.description)
    process.exit(1)
  }

  console.log(`[Bot] Connected as @${meData.result.username}`)
  console.log("[Bot] Waiting for messages...")

  await pollLoop(0)
}

main().catch((err) => {
  console.error("[Bot] Fatal:", err)
  process.exit(1)
})
