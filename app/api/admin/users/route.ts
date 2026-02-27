import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { pool } from "@/lib/db"

export async function GET() {
  const { error } = await requireAdmin()
  if (error) return error

  const result = await pool.query(
    'SELECT id, email, name, role, "createdAt" FROM "User" ORDER BY "createdAt" ASC'
  )

  return NextResponse.json(result.rows)
}

export async function PATCH(req: Request) {
  const { user, error } = await requireAdmin()
  if (error) return error

  const { userId, role } = await req.json()

  if (!userId || !role || !["admin", "user"].includes(role)) {
    return NextResponse.json({ error: "userId and valid role required" }, { status: 400 })
  }

  // Prevent self-demotion
  if (userId === user!.id && role !== "admin") {
    return NextResponse.json({ error: "Cannot demote yourself" }, { status: 400 })
  }

  await pool.query('UPDATE "User" SET role = $1 WHERE id = $2', [role, userId])

  return NextResponse.json({ ok: true })
}
