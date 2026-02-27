import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { pool, cuid } from "@/lib/db"

const VALID_PROVIDERS = ["openai", "gemini", "anthropic"]

export async function GET() {
  const { user, error } = await requireAdmin()
  if (error) return error

  const result = await pool.query(
    'SELECT provider FROM "UserApiKey" WHERE "userId" = $1',
    [user!.id]
  )

  const keys: Record<string, boolean> = {}
  for (const row of result.rows) keys[row.provider] = true

  return NextResponse.json(keys)
}

export async function POST(req: Request) {
  const { user, error } = await requireAdmin()
  if (error) return error

  const body = await req.json()
  const provider = body.provider
  // Strip invisible Unicode characters from API keys (e.g. U+2028 from copy-paste)
  // eslint-disable-next-line no-control-regex
  const apiKey = body.apiKey ? body.apiKey.replace(/[^\x20-\x7E]/g, "").trim() : ""
  if (!provider || !apiKey) {
    return NextResponse.json({ error: "provider and apiKey required" }, { status: 400 })
  }

  if (!VALID_PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: `Invalid provider. Supported: ${VALID_PROVIDERS.join(", ")}` }, { status: 400 })
  }

  const existing = await pool.query(
    'SELECT id FROM "UserApiKey" WHERE "userId" = $1 AND provider = $2',
    [user!.id, provider]
  )

  if (existing.rows.length > 0) {
    await pool.query(
      'UPDATE "UserApiKey" SET "apiKey" = $1 WHERE id = $2',
      [apiKey, existing.rows[0].id]
    )
  } else {
    const id = cuid()
    const now = new Date().toISOString()
    await pool.query(
      'INSERT INTO "UserApiKey" (id, "userId", provider, "apiKey", "isDefault", "createdAt") VALUES ($1, $2, $3, $4, $5, $6)',
      [id, user!.id, provider, apiKey, true, now]
    )
  }

  return NextResponse.json({ ok: true })
}
