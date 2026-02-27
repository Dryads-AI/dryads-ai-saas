import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { pool, cuid } from "@/lib/db"

export async function POST(req: Request) {
  try {
    const { email, password, name } = await req.json()

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 })
    }

    const existing = await pool.query('SELECT id FROM "User" WHERE email = $1', [email])
    if (existing.rows.length > 0) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 })
    }

    const hashed = await bcrypt.hash(password, 12)
    const id = cuid()
    const now = new Date().toISOString()
    const userName = name || email.split("@")[0]

    await pool.query(
      'INSERT INTO "User" (id, email, password, name, role, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id, email, hashed, userName, "user", now, now]
    )

    return NextResponse.json({ id, email, name: userName })
  } catch (err) {
    console.error("[Signup]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
