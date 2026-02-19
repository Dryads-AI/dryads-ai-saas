import { Pool } from "pg"
import { randomBytes } from "crypto"

const globalForDb = globalThis as unknown as { pool: Pool }

export const pool =
  globalForDb.pool ||
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
  })

if (process.env.NODE_ENV !== "production") globalForDb.pool = pool

export function cuid() {
  return "c" + randomBytes(12).toString("hex")
}
