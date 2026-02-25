"use client"

import { useState, useRef, useEffect } from "react"
import { useInbox, Contact, InboxMessage } from "@/hooks/useInbox"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Send, Inbox, Wifi, WifiOff } from "lucide-react"

const CHANNEL_COLORS: Record<string, string> = {
  telegram: "bg-blue-500/20 text-blue-400",
  whatsapp: "bg-green-500/20 text-green-400",
  discord: "bg-indigo-500/20 text-indigo-400",
  slack: "bg-purple-500/20 text-purple-400",
  signal: "bg-sky-500/20 text-sky-400",
  wechat: "bg-emerald-500/20 text-emerald-400",
  imessage: "bg-blue-600/20 text-blue-300",
  line: "bg-lime-500/20 text-lime-400",
}

function ChannelBadge({ type }: { type: string }) {
  const color = CHANNEL_COLORS[type] || "bg-zinc-500/20 text-zinc-400"
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase ${color}`}>
      {type}
    </span>
  )
}

function ContactList({
  contacts,
  activeContact,
  onSelect,
}: {
  contacts: Contact[]
  activeContact: { channelType: string; peerId: string } | null
  onSelect: (channelType: string, peerId: string) => void
}) {
  if (contacts.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
        <Inbox className="mb-3 h-10 w-10 text-text-muted" strokeWidth={1} />
        <p className="text-sm text-text-secondary">No contacts yet</p>
        <p className="mt-1 text-xs text-text-muted">
          Messages from connected channels will appear here
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto">
      {contacts.map((contact) => {
        const isActive =
          activeContact?.channelType === contact.channelType &&
          activeContact?.peerId === contact.peerId
        return (
          <button
            key={`${contact.channelType}:${contact.peerId}`}
            onClick={() => onSelect(contact.channelType, contact.peerId)}
            className={`w-full border-b border-border-glass px-4 py-3 text-left transition-colors ${
              isActive
                ? "bg-teal-500/10"
                : "hover:bg-surface-card"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="truncate text-sm font-medium text-text-primary">
                {contact.displayName || contact.peerId}
              </span>
              <ChannelBadge type={contact.channelType} />
            </div>
            {contact.lastMessage && (
              <p className="mt-1 truncate text-xs text-text-secondary">
                {contact.lastDirection === "outbound" ? "You: " : ""}
                {contact.lastMessage}
              </p>
            )}
            {contact.lastMessageAt && (
              <p className="mt-0.5 text-[10px] text-text-muted">
                {new Date(contact.lastMessageAt).toLocaleString()}
              </p>
            )}
          </button>
        )
      })}
    </div>
  )
}

function MessageThread({
  messages,
  activeContact,
  onSend,
}: {
  messages: InboxMessage[]
  activeContact: { channelType: string; peerId: string } | null
  onSend: (text: string) => Promise<boolean>
}) {
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  if (!activeContact) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <Inbox className="mb-3 h-12 w-12 text-text-muted" strokeWidth={1} />
        <p className="text-sm text-text-secondary">Select a contact to view messages</p>
      </div>
    )
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text || sending) return
    setSending(true)
    setInput("")
    await onSend(text)
    setSending(false)
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border-glass px-4 py-3">
        <ChannelBadge type={activeContact.channelType} />
        <span className="text-sm font-medium text-text-primary">{activeContact.peerId}</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-center text-sm text-text-muted">No messages yet</p>
        )}
        {messages.map((msg) => {
          const isOutbound = msg.direction === "outbound" || msg.role === "assistant"
          return (
            <div
              key={msg.id}
              className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm ${
                  isOutbound
                    ? msg.role === "assistant"
                      ? "bg-purple-500/20 text-purple-200"
                      : "bg-teal-500/20 text-teal-200"
                    : "bg-surface-card text-text-primary"
                }`}
              >
                {msg.role === "assistant" && (
                  <span className="mb-1 block text-[10px] font-semibold uppercase text-purple-400">
                    AI Reply
                  </span>
                )}
                <p className="whitespace-pre-wrap">{msg.content}</p>
                <p className="mt-1 text-[10px] opacity-60">
                  {new Date(msg.createdAt).toLocaleTimeString()}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Send input */}
      <div className="border-t border-border-glass p-4">
        <form
          onSubmit={(e) => { e.preventDefault(); handleSend() }}
          className="flex gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Message via ${activeContact.channelType}...`}
            disabled={sending}
            className="flex-1"
          />
          <Button type="submit" size="sm" disabled={!input.trim() || sending}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  )
}

export default function InboxPage() {
  const {
    contacts,
    messages,
    loading,
    connected,
    activeContact,
    selectContact,
    sendMessage,
  } = useInbox()

  return (
    <div className="flex h-full flex-col">
      {/* Title bar */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Inbox</h1>
          <p className="text-sm text-text-secondary">
            Unified view of all messenger conversations
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {connected ? (
            <span className="flex items-center gap-1 text-teal-400">
              <Wifi className="h-3.5 w-3.5" /> Live
            </span>
          ) : (
            <span className="flex items-center gap-1 text-text-muted">
              <WifiOff className="h-3.5 w-3.5" /> Offline
            </span>
          )}
        </div>
      </div>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden rounded-xl border border-border-glass bg-surface-card/50">
        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
          </div>
        ) : (
          <>
            {/* Contact list */}
            <div className="flex w-72 flex-col border-r border-border-glass">
              <div className="border-b border-border-glass px-4 py-3">
                <h2 className="text-sm font-semibold text-text-primary">Contacts</h2>
              </div>
              <ContactList
                contacts={contacts}
                activeContact={activeContact}
                onSelect={selectContact}
              />
            </div>

            {/* Message thread */}
            <MessageThread
              messages={messages}
              activeContact={activeContact}
              onSend={sendMessage}
            />
          </>
        )}
      </div>
    </div>
  )
}
