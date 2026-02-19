import { NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { getEngine } from "@/core/engine"

export async function POST(req: Request) {
  try {
    const update = await req.json()

    // Extract chat ID and message from the Telegram update
    const message = update.message || update.edited_message
    if (!message?.text) {
      return NextResponse.json({ ok: true })
    }

    const chatId = String(message.chat.id)
    const fromId = String(message.from?.id || "")

    // Find which user has this Telegram channel configured
    const channelRes = await pool.query(
      'SELECT * FROM "UserChannel" WHERE "channelType" = $1 AND enabled = true LIMIT 1',
      ["telegram"]
    )
    const userChannel = channelRes.rows[0]

    if (!userChannel) {
      return NextResponse.json({ ok: true })
    }

    // Get the user's API key
    const apiKeyRes = await pool.query(
      'SELECT "apiKey" FROM "UserApiKey" WHERE "userId" = $1 AND provider = $2',
      [userChannel.userId, "openai"]
    )

    const apiKey = apiKeyRes.rows[0]?.apiKey || process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ ok: true })
    }

    const engine = getEngine()
    engine.initProvider("openai", apiKey)

    // Route the message through the engine
    await engine.router.handleMessage(
      {
        id: String(message.message_id),
        channelType: "telegram",
        channelId: chatId,
        userId: fromId,
        userName: message.from?.first_name,
        content: message.text,
        timestamp: new Date(message.date * 1000),
        metadata: { chatType: message.chat.type },
      },
      userChannel.userId
    )

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[Telegram Webhook]", err)
    return NextResponse.json({ ok: true }) // Always 200 to Telegram
  }
}
