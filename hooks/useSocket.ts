"use client"

import { useEffect, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { io, Socket } from "socket.io-client"

export function useSocket() {
  const { data: session } = useSession()
  const socketRef = useRef<Socket | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!session?.user?.id) return

    const url = process.env.NEXT_PUBLIC_REALTIME_URL || "http://localhost:3002"
    const socket = io(url, {
      auth: { userId: session.user.id },
      reconnection: true,
      reconnectionDelay: 1000,
    })

    socket.on("connect", () => setConnected(true))
    socket.on("disconnect", () => setConnected(false))

    socketRef.current = socket

    return () => {
      socket.disconnect()
      socketRef.current = null
      setConnected(false)
    }
  }, [session?.user?.id])

  return { socket: socketRef.current, connected }
}
