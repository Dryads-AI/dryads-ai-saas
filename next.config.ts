import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: [
    "discord.js",
    "grammy",
    "@slack/bolt",
    "socket.io",
    "socket.io-client",
    "bcryptjs",
    "pg",
    "openai",
    "@google/genai",
    "@anthropic-ai/sdk",
    "@whiskeysockets/baileys",
    "qrcode",
    "pino",
    "socks-proxy-agent",
    "wechaty",
    "wechaty-puppet-wechat4u",
  ],
}

export default nextConfig
