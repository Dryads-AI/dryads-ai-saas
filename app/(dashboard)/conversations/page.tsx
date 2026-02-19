"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

interface Conversation {
  id: string
  channelType: string
  title: string
  aiModel: string
  createdAt: string
  updatedAt: string
  _count: { messages: number }
}

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/conversations")
      .then((r) => r.json())
      .then((data) => {
        setConversations(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const deleteConvo = async (id: string) => {
    await fetch("/api/conversations", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
    setConversations((prev) => prev.filter((c) => c.id !== id))
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Conversations</h1>
        <p className="text-sm text-zinc-400">Monitor all conversations across channels</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
        </div>
      ) : conversations.length === 0 ? (
        <Card className="py-12 text-center">
          <p className="text-zinc-500">No conversations yet. Start chatting!</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {conversations.map((convo) => (
            <Card key={convo.id} className="flex items-center justify-between p-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-zinc-200">{convo.title}</span>
                  <Badge variant="outline">{convo.channelType}</Badge>
                  <Badge variant="default">{convo.aiModel}</Badge>
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  {convo._count.messages} messages &middot; Last active{" "}
                  {new Date(convo.updatedAt).toLocaleDateString()}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => deleteConvo(convo.id)}>
                <svg className="h-4 w-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
