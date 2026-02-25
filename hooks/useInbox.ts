"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useSocket } from "./useSocket"

export interface Contact {
  id: string
  channelType: string
  peerId: string
  displayName: string | null
  lastMessageAt: string | null
  lastMessage: string | null
  lastDirection: string | null
}

export interface InboxMessage {
  id: string
  role: string
  content: string
  channelType: string
  channelPeer: string
  direction: string
  createdAt: string
}

interface IncomingEvent {
  userId: string
  channelType: string
  connectionMode: string
  peerId: string
  text: string
  reply: string | null
  timestamp: string
}

export function useInbox() {
  const { socket, connected } = useSocket()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [messages, setMessages] = useState<InboxMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [activeContact, setActiveContact] = useState<{ channelType: string; peerId: string } | null>(null)
  const activeContactRef = useRef(activeContact)
  activeContactRef.current = activeContact

  // Fetch contacts
  const fetchContacts = useCallback(async () => {
    try {
      const res = await fetch("/api/inbox/contacts")
      if (res.ok) {
        const data = await res.json()
        setContacts(data)
      }
    } catch {
      // ignore
    }
  }, [])

  // Fetch messages for a specific contact
  const fetchMessages = useCallback(async (channelType: string, peerId: string) => {
    try {
      const res = await fetch(`/api/inbox?channelType=${encodeURIComponent(channelType)}&peerId=${encodeURIComponent(peerId)}`)
      if (res.ok) {
        const data = await res.json()
        // Messages come newest-first from API, reverse for display
        setMessages(data.reverse())
      }
    } catch {
      // ignore
    }
  }, [])

  // Select a contact
  const selectContact = useCallback((channelType: string, peerId: string) => {
    setActiveContact({ channelType, peerId })
    fetchMessages(channelType, peerId)
  }, [fetchMessages])

  // Send a message
  const sendMessage = useCallback(async (text: string) => {
    if (!activeContactRef.current) return false
    const { channelType, peerId } = activeContactRef.current

    try {
      const res = await fetch(`/api/channels/${encodeURIComponent(channelType)}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peerId, text }),
      })
      const data = await res.json()
      if (data.ok) {
        // Add to local messages immediately
        setMessages((prev) => [
          ...prev,
          {
            id: data.messageId,
            role: "user",
            content: text,
            channelType,
            channelPeer: peerId,
            direction: "outbound",
            createdAt: new Date().toISOString(),
          },
        ])
        return true
      }
      return false
    } catch {
      return false
    }
  }, [])

  // Initial load
  useEffect(() => {
    fetchContacts().finally(() => setLoading(false))
  }, [fetchContacts])

  // Listen for real-time incoming messages
  useEffect(() => {
    if (!socket) return

    const handleIncoming = (event: IncomingEvent) => {
      // Update contacts list
      setContacts((prev) => {
        const existing = prev.find(
          (c) => c.channelType === event.channelType && c.peerId === event.peerId
        )
        if (existing) {
          return prev
            .map((c) =>
              c.channelType === event.channelType && c.peerId === event.peerId
                ? { ...c, lastMessageAt: event.timestamp, lastMessage: event.text, lastDirection: "inbound" }
                : c
            )
            .sort((a, b) => {
              const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
              const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
              return bTime - aTime
            })
        }
        // New contact
        return [
          {
            id: "",
            channelType: event.channelType,
            peerId: event.peerId,
            displayName: null,
            lastMessageAt: event.timestamp,
            lastMessage: event.text,
            lastDirection: "inbound",
          },
          ...prev,
        ]
      })

      // If this is the active conversation, add the message
      const active = activeContactRef.current
      if (active && active.channelType === event.channelType && active.peerId === event.peerId) {
        // Add the inbound message
        setMessages((prev) => [
          ...prev,
          {
            id: `rt-${Date.now()}`,
            role: "user",
            content: event.text,
            channelType: event.channelType,
            channelPeer: event.peerId,
            direction: "inbound",
            createdAt: event.timestamp,
          },
        ])

        // If there's an AI reply, add that too
        if (event.reply) {
          setMessages((prev) => [
            ...prev,
            {
              id: `rt-reply-${Date.now()}`,
              role: "assistant",
              content: event.reply!,
              channelType: event.channelType,
              channelPeer: event.peerId,
              direction: "outbound",
              createdAt: event.timestamp,
            },
          ])
        }
      }
    }

    socket.on("inbox:message", handleIncoming)
    return () => {
      socket.off("inbox:message", handleIncoming)
    }
  }, [socket])

  return {
    contacts,
    messages,
    loading,
    connected,
    activeContact,
    selectContact,
    sendMessage,
    fetchContacts,
  }
}
