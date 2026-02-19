import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "discord.js",
    "grammy",
    "@slack/bolt",
    "socket.io",
    "bcryptjs",
    "pg",
    "openai",
  ],
}

export default nextConfig
