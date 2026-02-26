#!/bin/sh
echo "[start.sh] Starting Dryads AI..."

# Start Telegram bot in background
echo "[start.sh] Launching Telegram bot..."
node bot.mjs &
BOT_PID=$!
echo "[start.sh] Bot PID: $BOT_PID"

# Start Next.js (foreground — this is what Railway monitors)
echo "[start.sh] Starting Next.js..."
exec npx next start
