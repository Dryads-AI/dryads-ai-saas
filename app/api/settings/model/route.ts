import { NextResponse } from "next/server"
import { requireAuth, requireAdmin } from "@/lib/auth-helpers"
import { pool } from "@/lib/db"

const VALID_PROVIDERS = ["openai", "gemini", "anthropic"]

const VALID_MODELS: Record<string, string[]> = {
  openai: ["gpt-5.2-chat-latest", "gpt-4o", "gpt-4o-mini"],
  gemini: ["gemini-2.5-flash", "gemini-2.5-pro"],
  anthropic: ["claude-sonnet-4-6", "claude-haiku-4-5-20251001", "claude-opus-4-6"],
}

export async function GET() {
  const { error } = await requireAuth()
  if (error) return error

  // Read from PlatformSetting table (global config)
  const providerRes = await pool.query(
    'SELECT value FROM "PlatformSetting" WHERE key = $1',
    ["activeAiProvider"]
  )
  const modelRes = await pool.query(
    'SELECT value FROM "PlatformSetting" WHERE key = $1',
    ["activeAiModel"]
  )

  return NextResponse.json({
    aiProvider: providerRes.rows[0]?.value || "openai",
    aiModel: modelRes.rows[0]?.value || "gpt-4o",
  })
}

export async function POST(req: Request) {
  const { error } = await requireAdmin()
  if (error) return error

  const { aiProvider, aiModel } = await req.json()

  if (!aiProvider || !VALID_PROVIDERS.includes(aiProvider)) {
    return NextResponse.json(
      { error: `Invalid provider. Supported: ${VALID_PROVIDERS.join(", ")}` },
      { status: 400 }
    )
  }

  if (!aiModel || !VALID_MODELS[aiProvider]?.includes(aiModel)) {
    return NextResponse.json(
      { error: `Invalid model for ${aiProvider}. Supported: ${VALID_MODELS[aiProvider]?.join(", ")}` },
      { status: 400 }
    )
  }

  // Write to PlatformSetting table
  await pool.query(
    `INSERT INTO "PlatformSetting" (key, value, "updatedAt") VALUES ('activeAiProvider', $1, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $1, "updatedAt" = NOW()`,
    [aiProvider]
  )
  await pool.query(
    `INSERT INTO "PlatformSetting" (key, value, "updatedAt") VALUES ('activeAiModel', $1, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $1, "updatedAt" = NOW()`,
    [aiModel]
  )

  return NextResponse.json({ ok: true })
}
