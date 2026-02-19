FROM node:22-slim AS base
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# ── Build stage ──────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

COPY package*.json .npmrc ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm prune --omit=dev

# ── Production stage ─────────────────────────────────────────────────
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/lib/baileys-auth-pg.mjs ./lib/baileys-auth-pg.mjs

EXPOSE 3000
CMD ["sh", "-c", "node bot.mjs & node server.js"]
