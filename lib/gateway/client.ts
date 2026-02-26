/**
 * Dryads AI — Gateway Client (Next.js side)
 * Connects to the bot.mjs Gateway Socket.IO server for IPC.
 */

import { io, Socket } from "socket.io-client"

let gatewaySocket: Socket | null = null

export function getGatewayClient(): Socket {
  if (gatewaySocket) return gatewaySocket

  const url = process.env.GATEWAY_URL || "http://localhost:3001"
  const secret = process.env.GATEWAY_SECRET || ""

  gatewaySocket = io(url, {
    auth: { secret },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: Infinity,
  })

  gatewaySocket.on("connect", () => {
    console.log("[GatewayClient] Connected to gateway at", url)
  })

  gatewaySocket.on("disconnect", (reason) => {
    console.log("[GatewayClient] Disconnected:", reason)
  })

  gatewaySocket.on("connect_error", (err) => {
    // Only log once to avoid spam
    if (!(gatewaySocket as any)?._loggedError) {
      console.log("[GatewayClient] Connection error (gateway may not be running):", err.message)
      ;(gatewaySocket as any)._loggedError = true
    }
  })

  return gatewaySocket
}

/** Send a message through a connector via the gateway */
export function sendViaGateway(
  userId: string,
  channelType: string,
  peerId: string,
  text: string,
  connectionMode?: string
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const client = getGatewayClient()
    if (!client.connected) {
      return resolve({ ok: false, error: "Gateway not connected" })
    }
    client.emit(
      "gateway:send",
      { userId, channelType, peerId, text, connectionMode },
      (response: { ok: boolean; error?: string }) => {
        resolve(response || { ok: false, error: "No response from gateway" })
      }
    )
  })
}

/** Toggle auto-reply for a connector via the gateway */
export function toggleAutoReplyViaGateway(
  userId: string,
  channelType: string,
  connectionMode: string,
  enabled: boolean
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const client = getGatewayClient()
    if (!client.connected) {
      return resolve({ ok: false, error: "Gateway not connected" })
    }
    client.emit(
      "gateway:toggle-auto-reply",
      { userId, channelType, connectionMode, enabled },
      (response: { ok: boolean; error?: string }) => {
        resolve(response || { ok: false, error: "No response from gateway" })
      }
    )
  })
}

/** Query connector statuses via the gateway */
export function getConnectorStatuses(
  userId: string
): Promise<{ ok: boolean; statuses?: Array<{ channelType: string; connectionMode: string; running: boolean }>; error?: string }> {
  return new Promise((resolve) => {
    const client = getGatewayClient()
    if (!client.connected) {
      return resolve({ ok: false, error: "Gateway not connected" })
    }
    client.emit(
      "gateway:status",
      { userId },
      (response: any) => {
        resolve(response || { ok: false, error: "No response from gateway" })
      }
    )
  })
}
