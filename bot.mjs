/**
 * DMMS AI — Multi-Channel Gateway v5.0
 * 3-Layer Architecture: Connector + Middleware + AI
 * 3-Engine Intelligent Pipeline: Intent Router + Memory + Agent Loop
 *
 * Pipeline (13 steps):
 *   metering → session → history → envelope → enrichment →
 *   memory → persona → news → intentClassifier → aiRouter →
 *   formatter → footer → store
 *
 * This file is a thin orchestrator that wires together:
 *   - lib/middleware/  — Composable pipeline steps
 *   - lib/ai/         — AI providers (OpenAI, Gemini, Anthropic)
 *   - lib/connectors/ — Platform connectors (Telegram, WhatsApp, Discord, Slack)
 */

import pg from "pg"
import { createPipeline } from "./lib/middleware/pipeline.mjs"
import { meteringMiddleware } from "./lib/middleware/metering.mjs"
import { sessionMiddleware } from "./lib/middleware/session.mjs"
import { historyMiddleware } from "./lib/middleware/history.mjs"
import { envelopeMiddleware } from "./lib/middleware/envelope.mjs"
import { enrichmentMiddleware } from "./lib/middleware/enrichment.mjs"
import { memoryMiddleware } from "./lib/middleware/memory.mjs"
import { personaMiddleware } from "./lib/middleware/persona.mjs"
import { newsMiddleware } from "./lib/middleware/news.mjs"
import { intentClassifierMiddleware } from "./lib/middleware/intent-classifier.mjs"
import { aiRouterMiddleware } from "./lib/middleware/ai-router.mjs"
import { formatterMiddleware } from "./lib/middleware/formatter.mjs"
import { footerMiddleware } from "./lib/middleware/footer.mjs"
import { storeMiddleware } from "./lib/middleware/store.mjs"
import { ConnectorRegistry } from "./lib/connectors/registry.mjs"
import { toolRegistry } from "./lib/ai/tool-registry.mjs"
import "./lib/ai/tools/index.mjs"
import { createGatewayServer } from "./lib/gateway/socket-server.mjs"

const { Pool } = pg

// ── Database ────────────────────────────────────────────────────────

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 })

// ── Ensure Tables ───────────────────────────────────────────────────

async function ensureTables() {
  console.log("[Gateway] Ensuring database tables exist...")
  await pool.query(`
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

    -- Migrations: safe column additions for existing DBs
    ALTER TABLE "UserChannel" ADD COLUMN IF NOT EXISTS "connectionMode" TEXT DEFAULT 'business';
    ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "aiProvider" TEXT DEFAULT 'openai';
    ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "defaultAiProvider" TEXT DEFAULT 'openai';
    ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "defaultAiModel" TEXT DEFAULT 'gpt-4o';

    -- Migration: update unique constraint to include connectionMode
    DO $$ BEGIN
      ALTER TABLE "UserChannel" DROP CONSTRAINT IF EXISTS "UserChannel_userId_channelType_key";
      ALTER TABLE "UserChannel" ADD CONSTRAINT "UserChannel_userId_channelType_connectionMode_key"
        UNIQUE("userId", "channelType", "connectionMode");
    EXCEPTION WHEN duplicate_table THEN NULL;
    END $$;

    -- Migration: Unified Inbox support
    ALTER TABLE "UserChannel" ADD COLUMN IF NOT EXISTS "autoReply" BOOLEAN DEFAULT true;
    ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "channelType" TEXT;
    ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "channelPeer" TEXT;
    ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS direction TEXT DEFAULT 'inbound';

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

    -- Migration: AI metadata columns on Message
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
  `)
  console.log("[Gateway] Database tables ready.")
}

// ── Build Middleware Pipeline ────────────────────────────────────────

const pipeline = createPipeline([
  meteringMiddleware(pool),          //  1. Rate limiting (short-circuits if over limit)
  sessionMiddleware(pool),           //  2. Look up / create conversation
  historyMiddleware(pool),           //  3. Load last 10 messages
  envelopeMiddleware(),              //  4. Wrap message with metadata
  enrichmentMiddleware(),            //  5. Fetch URL content if links present
  memoryMiddleware(pool),            //  6. Load memories + extract post-AI
  personaMiddleware(),               //  7. Build rich system prompt (now includes memories)
  newsMiddleware(),                  //  8. Smart news pre-fetch
  intentClassifierMiddleware(pool),  //  9. Classify intent + smart route
  aiRouterMiddleware(pool),          // 10. Call AI provider
  formatterMiddleware(),             // 11. Platform-specific formatting
  footerMiddleware(),                // 12. Model prefix + footer (defaults: off)
  storeMiddleware(pool),             // 13. Save to database (now with metadata)
])

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════╗")
  console.log("║  DMMS AI — Multi-Channel Gateway v5.0               ║")
  console.log("║  13-Step Intelligent AI Pipeline                     ║")
  console.log("║  3 Engines: Intent Router + Memory + Agent Loop      ║")
  console.log("║  Every Messenger is AI Now.                          ║")
  console.log("╚══════════════════════════════════════════════════════╝")
  console.log(`[Gateway] Tools (${toolRegistry.getToolNames().length}): ${toolRegistry.getToolNames().join(", ")}`)
  console.log(`[Gateway] AI Providers: OpenAI, Gemini, Anthropic (Claude)`)
  console.log(`[Gateway] Engines: Intent Classifier + Smart Router | Long-term Memory | Enhanced Agent Loop`)
  console.log(`[Gateway] Pipeline: metering → session → history → envelope → enrichment → memory → persona → news → intent → aiRouter → formatter → footer → store`)

  await ensureTables()

  // Create connector registry and sync from DB
  const registry = new ConnectorRegistry(pool, pipeline)

  console.log("[Gateway] Starting connectors from DB...")
  await registry.syncFromDB()

  // Start Gateway Socket.IO server for IPC with Next.js
  const gatewayIO = createGatewayServer(registry, pipeline, pool)

  // Register incoming-message listener on all connectors so gateway can relay to Next.js
  registry.setOnIncomingCallback((event) => {
    gatewayIO.emit("gateway:incoming", event)
  })

  // Start polling for new channel activations
  registry.pollForChanges(2000)

  console.log("[Gateway] All connectors initialized. Waiting for messages...")

  // Graceful shutdown
  const shutdown = async (signal) => {
    console.log(`\n[Gateway] ${signal} received, shutting down...`)
    gatewayIO.close()
    await registry.stopAll()
    await pool.end()
    process.exit(0)
  }

  process.on("SIGINT", () => shutdown("SIGINT"))
  process.on("SIGTERM", () => shutdown("SIGTERM"))
}

main().catch((err) => {
  console.error("[Gateway] Fatal:", err)
  process.exit(1)
})
