import { Pool } from "pg"
import bcrypt from "bcryptjs"
import { randomBytes } from "crypto"

function cuid() {
  return "c" + randomBytes(12).toString("hex")
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS "User" (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT,
  name TEXT,
  image TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "UserChannel" (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "channelType" TEXT NOT NULL,
  "connectionMode" TEXT DEFAULT 'business',
  config TEXT DEFAULT '{}',
  enabled BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'disconnected',
  "autoReply" BOOLEAN DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE("userId", "channelType", "connectionMode")
);

CREATE TABLE IF NOT EXISTS "UserApiKey" (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  "apiKey" TEXT NOT NULL,
  "isDefault" BOOLEAN DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE("userId", provider)
);

CREATE TABLE IF NOT EXISTS "Conversation" (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "channelType" TEXT NOT NULL DEFAULT 'web',
  "channelPeer" TEXT DEFAULT '',
  title TEXT DEFAULT 'New Chat',
  "aiModel" TEXT DEFAULT 'gpt-4o',
  "aiProvider" TEXT DEFAULT 'openai',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "Message" (
  id TEXT PRIMARY KEY,
  "conversationId" TEXT NOT NULL REFERENCES "Conversation"(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  attachments JSONB,
  "toolCalls" JSONB,
  "tokenCount" INTEGER,
  "channelType" TEXT,
  "channelPeer" TEXT,
  direction TEXT DEFAULT 'inbound',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS baileys_auth (
  id         TEXT NOT NULL,
  user_id    TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  data       JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS channel_events (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  channel_type TEXT NOT NULL,
  event_type   TEXT NOT NULL,
  payload      TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_channel_events_user ON channel_events(user_id, channel_type, event_type);

CREATE TABLE IF NOT EXISTS "Contact" (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "channelType" TEXT NOT NULL,
  "peerId" TEXT NOT NULL,
  "displayName" TEXT,
  "lastMessageAt" TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE("userId", "channelType", "peerId")
);
CREATE INDEX IF NOT EXISTS idx_contact_user ON "Contact"("userId");

CREATE TABLE IF NOT EXISTS "user_memory" (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  fact TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  source_channel TEXT,
  source_conversation_id TEXT,
  confidence REAL DEFAULT 1.0,
  access_count INTEGER DEFAULT 0,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_memory_unique ON "user_memory"("userId", fact);
CREATE INDEX IF NOT EXISTS idx_user_memory_user ON "user_memory"("userId");

CREATE TABLE IF NOT EXISTS "user_reminder" (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  reminder_text TEXT NOT NULL,
  remind_at TIMESTAMPTZ NOT NULL,
  channel_type TEXT,
  channel_peer TEXT,
  delivered BOOLEAN DEFAULT false,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_reminder_pending ON "user_reminder"("userId", delivered, remind_at);

CREATE INDEX IF NOT EXISTS idx_conversation_user ON "Conversation"("userId");
CREATE INDEX IF NOT EXISTS idx_message_conversation ON "Message"("conversationId");
CREATE INDEX IF NOT EXISTS idx_userchannel_user ON "UserChannel"("userId");
CREATE INDEX IF NOT EXISTS idx_userapikey_user ON "UserApiKey"("userId");
`

const MIGRATIONS = `
-- Migration: Add connectionMode to UserChannel (safe for existing DBs)
ALTER TABLE "UserChannel" ADD COLUMN IF NOT EXISTS "connectionMode" TEXT DEFAULT 'business';
DO $$ BEGIN
  ALTER TABLE "UserChannel" DROP CONSTRAINT IF EXISTS "UserChannel_userId_channelType_key";
  ALTER TABLE "UserChannel" ADD CONSTRAINT "UserChannel_userId_channelType_connectionMode_key"
    UNIQUE("userId", "channelType", "connectionMode");
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- Migration: Add aiProvider to Conversation
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "aiProvider" TEXT DEFAULT 'openai';

-- Migration: Add default AI model preference to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "defaultAiProvider" TEXT DEFAULT 'openai';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "defaultAiModel" TEXT DEFAULT 'gpt-4o';

-- Migration: Add autoReply to UserChannel
ALTER TABLE "UserChannel" ADD COLUMN IF NOT EXISTS "autoReply" BOOLEAN DEFAULT true;

-- Migration: Add channelType, channelPeer, direction to Message
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "channelType" TEXT;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "channelPeer" TEXT;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS direction TEXT DEFAULT 'inbound';

-- Migration: Create Contact table
CREATE TABLE IF NOT EXISTS "Contact" (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "channelType" TEXT NOT NULL,
  "peerId" TEXT NOT NULL,
  "displayName" TEXT,
  "lastMessageAt" TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE("userId", "channelType", "peerId")
);
CREATE INDEX IF NOT EXISTS idx_contact_user ON "Contact"("userId");

-- Migration: Add AI metadata columns to Message
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "provider" TEXT;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "model" TEXT;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "intentClass" TEXT;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "complexityClass" TEXT;

-- Migration: user_memory table
CREATE TABLE IF NOT EXISTS "user_memory" (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  fact TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  source_channel TEXT,
  source_conversation_id TEXT,
  confidence REAL DEFAULT 1.0,
  access_count INTEGER DEFAULT 0,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_memory_unique ON "user_memory"("userId", fact);
CREATE INDEX IF NOT EXISTS idx_user_memory_user ON "user_memory"("userId");

-- Migration: user_reminder table
CREATE TABLE IF NOT EXISTS "user_reminder" (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  reminder_text TEXT NOT NULL,
  remind_at TIMESTAMPTZ NOT NULL,
  channel_type TEXT,
  channel_peer TEXT,
  delivered BOOLEAN DEFAULT false,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_reminder_pending ON "user_reminder"("userId", delivered, remind_at);
`

async function initDb() {
  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) {
    console.error("DATABASE_URL not set")
    process.exit(1)
  }

  const pool = new Pool({ connectionString: dbUrl })

  console.log("Creating tables...")
  await pool.query(SCHEMA)
  console.log("Tables created.")

  console.log("Running migrations...")
  await pool.query(MIGRATIONS)
  console.log("Migrations applied.")

  // Seed admin user if not exists
  const existing = await pool.query('SELECT id FROM "User" WHERE email = $1', ["admin@admin.com"])
  if (existing.rows.length === 0) {
    const hashed = await bcrypt.hash("Admin@2020", 12)
    const id = cuid()
    const now = new Date().toISOString()
    await pool.query(
      'INSERT INTO "User" (id, email, password, name, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6)',
      [id, "admin@admin.com", hashed, "Admin", now, now]
    )
    console.log("Admin user created: admin@admin.com / Admin@2020")
  } else {
    console.log("Admin user already exists.")
  }

  await pool.end()
  console.log("Database initialized successfully!")
}

initDb().catch(console.error)
