"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Card, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

interface ChannelInfo {
  type: string
  name: string
  description: string
  configFields: { key: string; label: string; placeholder: string; type?: string }[]
  connectionMethod: string
}

const CHANNELS: ChannelInfo[] = [
  {
    type: "web",
    name: "Web Chat",
    description: "Built-in browser chat — always available",
    configFields: [],
    connectionMethod: "built-in",
  },
  {
    type: "whatsapp",
    name: "WhatsApp",
    description: "Scan QR code to link as WhatsApp Web device",
    configFields: [],
    connectionMethod: "qr",
  },
  {
    type: "telegram",
    name: "Telegram",
    description: "Connect via Telegram Bot API",
    configFields: [{ key: "botToken", label: "Bot Token", placeholder: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11" }],
    connectionMethod: "token",
  },
  {
    type: "discord",
    name: "Discord",
    description: "Connect a Discord bot to your server",
    configFields: [
      { key: "botToken", label: "Bot Token", placeholder: "Discord bot token" },
      { key: "applicationId", label: "Application ID", placeholder: "e.g. 123456789012345678" },
    ],
    connectionMethod: "token",
  },
  {
    type: "slack",
    name: "Slack",
    description: "Connect via Slack Bolt SDK",
    configFields: [
      { key: "botToken", label: "Bot Token (xoxb-)", placeholder: "xoxb-..." },
      { key: "appToken", label: "App Token (xapp-)", placeholder: "xapp-..." },
      { key: "signingSecret", label: "Signing Secret", placeholder: "Slack signing secret" },
    ],
    connectionMethod: "token",
  },
  {
    type: "signal",
    name: "Signal",
    description: "Connect via signal-cli bridge",
    configFields: [
      { key: "signalNumber", label: "Phone Number", placeholder: "+1234567890" },
      { key: "signalCliPath", label: "signal-cli API URL", placeholder: "http://localhost:8080" },
    ],
    connectionMethod: "bridge",
  },
  {
    type: "imessage",
    name: "iMessage",
    description: "Connect via BlueBubbles REST API",
    configFields: [
      { key: "serverUrl", label: "BlueBubbles Server URL", placeholder: "http://localhost:1234" },
      { key: "password", label: "Server Password", placeholder: "BlueBubbles password", type: "password" },
    ],
    connectionMethod: "api",
  },
  {
    type: "googlechat",
    name: "Google Chat",
    description: "Connect via Google Chat API webhook",
    configFields: [
      { key: "webhookUrl", label: "Webhook URL", placeholder: "https://chat.googleapis.com/v1/spaces/..." },
      { key: "serviceAccountKey", label: "Service Account Key (JSON)", placeholder: "Paste service account JSON" },
    ],
    connectionMethod: "webhook",
  },
  {
    type: "msteams",
    name: "Microsoft Teams",
    description: "Connect via Bot Framework",
    configFields: [
      { key: "appId", label: "App ID", placeholder: "Microsoft App ID" },
      { key: "appPassword", label: "App Password", placeholder: "Microsoft App Password", type: "password" },
    ],
    connectionMethod: "oauth",
  },
  {
    type: "irc",
    name: "IRC",
    description: "Connect to any IRC server",
    configFields: [
      { key: "server", label: "Server", placeholder: "irc.libera.chat" },
      { key: "port", label: "Port", placeholder: "6697" },
      { key: "channel", label: "Channel", placeholder: "#my-channel" },
      { key: "nickname", label: "Nickname", placeholder: "dmms-ai" },
    ],
    connectionMethod: "config",
  },
  {
    type: "line",
    name: "LINE",
    description: "Connect via LINE Messaging API",
    configFields: [
      { key: "channelAccessToken", label: "Channel Access Token", placeholder: "LINE channel access token" },
      { key: "channelSecret", label: "Channel Secret", placeholder: "LINE channel secret" },
    ],
    connectionMethod: "token",
  },
  {
    type: "matrix",
    name: "Matrix",
    description: "Connect via Matrix protocol (Element, etc.)",
    configFields: [
      { key: "homeserver", label: "Homeserver URL", placeholder: "https://matrix.org" },
      { key: "accessToken", label: "Access Token", placeholder: "Matrix access token" },
      { key: "userId", label: "Bot User ID", placeholder: "@dmms-ai:matrix.org" },
    ],
    connectionMethod: "token",
  },
  {
    type: "twitch",
    name: "Twitch",
    description: "Connect to Twitch chat via IRC",
    configFields: [
      { key: "oauthToken", label: "OAuth Token", placeholder: "oauth:abc123..." },
      { key: "channel", label: "Channel Name", placeholder: "your_channel" },
      { key: "botUsername", label: "Bot Username", placeholder: "dmms_ai_bot" },
    ],
    connectionMethod: "token",
  },
  {
    type: "nostr",
    name: "Nostr",
    description: "Decentralized DMs via NIP-04",
    configFields: [
      { key: "privateKey", label: "Private Key (nsec)", placeholder: "nsec1...", type: "password" },
      { key: "relays", label: "Relay URLs (comma-separated)", placeholder: "wss://relay.damus.io,wss://nos.lol" },
    ],
    connectionMethod: "key",
  },
  {
    type: "zalo",
    name: "Zalo",
    description: "Connect via Zalo Bot API",
    configFields: [
      { key: "oaAccessToken", label: "OA Access Token", placeholder: "Zalo OA access token" },
      { key: "oaSecretKey", label: "OA Secret Key", placeholder: "Zalo OA secret key", type: "password" },
    ],
    connectionMethod: "token",
  },
  {
    type: "zalo_personal",
    name: "Zalo Personal",
    description: "Connect personal Zalo via QR login",
    configFields: [],
    connectionMethod: "qr",
  },
  {
    type: "mattermost",
    name: "Mattermost",
    description: "Connect via Mattermost Bot API",
    configFields: [
      { key: "serverUrl", label: "Server URL", placeholder: "https://mattermost.example.com" },
      { key: "botToken", label: "Bot Token", placeholder: "Mattermost bot token" },
    ],
    connectionMethod: "token",
  },
  {
    type: "nextcloud",
    name: "Nextcloud Talk",
    description: "Connect to self-hosted Nextcloud Talk",
    configFields: [
      { key: "serverUrl", label: "Nextcloud URL", placeholder: "https://cloud.example.com" },
      { key: "username", label: "Username", placeholder: "bot-user" },
      { key: "password", label: "App Password", placeholder: "Nextcloud app password", type: "password" },
    ],
    connectionMethod: "api",
  },
  {
    type: "feishu",
    name: "Feishu / Lark",
    description: "Connect via Feishu WebSocket bot",
    configFields: [
      { key: "appId", label: "App ID", placeholder: "Feishu App ID" },
      { key: "appSecret", label: "App Secret", placeholder: "Feishu App Secret", type: "password" },
    ],
    connectionMethod: "websocket",
  },
  {
    type: "tlon",
    name: "Tlon (Urbit)",
    description: "Connect via Urbit messenger",
    configFields: [
      { key: "shipUrl", label: "Ship URL", placeholder: "http://localhost:8080" },
      { key: "shipCode", label: "Access Code", placeholder: "+code from your ship", type: "password" },
    ],
    connectionMethod: "api",
  },
  {
    type: "viber",
    name: "Viber",
    description: "Connect via Viber Bot API",
    configFields: [
      { key: "botToken", label: "Auth Token", placeholder: "Viber bot auth token" },
      { key: "botName", label: "Bot Name", placeholder: "DMMS AI" },
    ],
    connectionMethod: "token",
  },
  {
    type: "wechat",
    name: "WeChat",
    description: "Connect via WeChat Official Account",
    configFields: [
      { key: "appId", label: "App ID", placeholder: "WeChat App ID" },
      { key: "appSecret", label: "App Secret", placeholder: "WeChat App Secret", type: "password" },
      { key: "token", label: "Token", placeholder: "Verification token" },
    ],
    connectionMethod: "oauth",
  },
  {
    type: "rocketchat",
    name: "Rocket.Chat",
    description: "Connect via Rocket.Chat webhook",
    configFields: [
      { key: "serverUrl", label: "Server URL", placeholder: "https://rocketchat.example.com" },
      { key: "webhookToken", label: "Webhook Token", placeholder: "Rocket.Chat webhook token" },
    ],
    connectionMethod: "webhook",
  },
  {
    type: "threema",
    name: "Threema",
    description: "Connect via Threema Gateway",
    configFields: [
      { key: "gatewayId", label: "Gateway ID", placeholder: "*MYID" },
      { key: "apiSecret", label: "API Secret", placeholder: "Threema API secret", type: "password" },
    ],
    connectionMethod: "gateway",
  },
]

interface SavedChannel {
  id: string
  channelType: string
  config: Record<string, string>
  enabled: boolean
  status: string
}

// ── WhatsApp QR Component ────────────────────────────────────────────

function QrScanCard({
  channelType,
  channelName,
  description,
  saved,
  onDisconnect,
}: {
  channelType: string
  channelName: string
  description: string
  saved?: SavedChannel
  onDisconnect: () => void
}) {
  const [status, setStatus] = useState<string>(saved?.status || "disconnected")
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastQr = useRef<string | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const startPolling = useCallback(() => {
    stopPolling()
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/channels/${channelType}/qr`)
        const data = await res.json()

        if (data.status === "connected") {
          setStatus("connected")
          setQrDataUrl(null)
          setConnecting(false)
          stopPolling()
        } else if (data.status === "qr" && data.qr) {
          setStatus("qr")
          if (data.qr !== lastQr.current) {
            lastQr.current = data.qr
            try {
              const QRCode = (await import("qrcode")).default
              const url = await QRCode.toDataURL(data.qr, { width: 256, margin: 2 })
              setQrDataUrl(url)
            } catch {
              setQrDataUrl(null)
            }
          }
        } else if (data.status === "logged_out") {
          setStatus("logged_out")
          setConnecting(false)
          stopPolling()
        } else if (data.status === "error") {
          setStatus("error")
          setConnecting(false)
          stopPolling()
        }
      } catch {
        // keep polling
      }
    }, 2000)
  }, [stopPolling, channelType])

  useEffect(() => {
    return () => stopPolling()
  }, [stopPolling])

  useEffect(() => {
    if (saved?.enabled && saved?.status === "connected") setStatus("connected")
  }, [saved])

  const handleConnect = async () => {
    setConnecting(true)
    setStatus("connecting")
    setQrDataUrl(null)
    try {
      const res = await fetch(`/api/channels/${channelType}/connect`, { method: "POST" })
      const data = await res.json()
      if (data.ok) startPolling()
      else { setStatus("error"); setConnecting(false) }
    } catch {
      setStatus("error"); setConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    stopPolling()
    setConnecting(false)
    setQrDataUrl(null)
    try {
      await fetch(`/api/channels/${channelType}/connect`, { method: "DELETE" })
      setStatus("disconnected")
      onDisconnect()
    } catch { /* ignore */ }
  }

  return (
    <Card className="relative">
      <div className="flex items-start justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            {channelName}
            {status === "connected" && <Badge variant="success">Connected</Badge>}
            {(status === "connecting" || status === "qr") && (
              <Badge variant="outline" className="animate-pulse">Connecting...</Badge>
            )}
          </CardTitle>
          <CardDescription className="mt-1">{description}</CardDescription>
        </div>
      </div>

      {status === "qr" && qrDataUrl && (
        <div className="mt-4 flex flex-col items-center">
          <div className="rounded-lg border border-zinc-700 bg-white p-2">
            <img src={qrDataUrl} alt={`${channelName} QR Code`} width={256} height={256} />
          </div>
          <p className="mt-2 text-xs text-zinc-400">
            Scan this QR code with your {channelName} app to link
          </p>
        </div>
      )}

      {status === "connecting" && !qrDataUrl && (
        <div className="mt-4 flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
          <p className="text-sm text-zinc-400">Waiting for QR code...</p>
        </div>
      )}

      {status === "connected" && (
        <p className="mt-4 text-sm text-teal-400">
          {channelName} is linked and receiving messages. AI responds automatically.
        </p>
      )}

      {status === "logged_out" && (
        <p className="mt-4 text-sm text-yellow-400">
          Session logged out. Click Connect to re-link.
        </p>
      )}

      {status === "error" && (
        <p className="mt-4 text-sm text-red-400">Connection error. Try again.</p>
      )}

      <div className="mt-4 flex gap-2">
        {status !== "connected" && status !== "qr" && status !== "connecting" && (
          <Button size="sm" onClick={handleConnect} disabled={connecting}>
            {connecting ? "Connecting..." : `Connect ${channelName}`}
          </Button>
        )}
        {(status === "connected" || status === "qr" || status === "connecting") && (
          <Button size="sm" variant="ghost" onClick={handleDisconnect}>Disconnect</Button>
        )}
      </div>
    </Card>
  )
}

// ── Main Channels Page ───────────────────────────────────────────────

export default function ChannelsPage() {
  const [savedChannels, setSavedChannels] = useState<SavedChannel[]>([])
  const [configuring, setConfiguring] = useState<string | null>(null)
  const [formData, setFormData] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  useEffect(() => {
    fetch("/api/channels")
      .then((r) => r.json())
      .then((channels) => {
        if (!Array.isArray(channels)) return
        const parsed = channels.map((ch: SavedChannel & { config: string | Record<string, string> }) => ({
          ...ch,
          config: typeof ch.config === "string" ? JSON.parse(ch.config || "{}") : ch.config,
        }))
        setSavedChannels(parsed)
      })
      .catch(() => {})
  }, [])

  const save = async (channelType: string, enabled: boolean) => {
    setSaving(true)
    setStatusMessage(null)
    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelType, config: formData, enabled }),
      })
      const updated = await res.json()

      if (typeof updated.config === "string") {
        try { updated.config = JSON.parse(updated.config) } catch { updated.config = {} }
      }

      setSavedChannels((prev) => {
        const idx = prev.findIndex((c) => c.channelType === channelType)
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = updated
          return next
        }
        return [...prev, updated]
      })

      // Channel-specific post-save actions
      if (channelType === "telegram" && enabled && formData.botToken) {
        setStatusMessage({ type: "success", text: "Saved! Registering Telegram webhook..." })
        const whRes = await fetch("/api/channels/telegram/webhook", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "register" }),
        })
        const whData = await whRes.json()
        setStatusMessage(whData.ok
          ? { type: "success", text: `Telegram connected! Bot: @${whData.botUsername || "your-bot"}` }
          : { type: "error", text: `Webhook failed: ${whData.description || whData.error || "Unknown"}` }
        )
      } else if (channelType === "telegram" && !enabled) {
        await fetch("/api/channels/telegram/webhook", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "unregister" }),
        }).catch(() => {})
        setStatusMessage({ type: "success", text: "Telegram disconnected." })
      } else if (enabled) {
        const ch = CHANNELS.find((c) => c.type === channelType)
        setStatusMessage({ type: "success", text: `${ch?.name || channelType} saved & enabled! Gateway will connect on next restart.` })
      } else {
        setStatusMessage({ type: "success", text: "Channel disconnected." })
      }

      setConfiguring(null)
      setFormData({})
    } catch {
      setStatusMessage({ type: "error", text: "Failed to save channel." })
    } finally {
      setSaving(false)
    }
  }

  const getSavedChannel = (type: string) =>
    savedChannels.find((c) => c.channelType === type)

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Channels</h1>
        <p className="text-sm text-zinc-400">
          Connect 24 messaging platforms to your AI assistant
        </p>
      </div>

      {statusMessage && (
        <div
          className={`rounded-lg p-3 text-sm ${
            statusMessage.type === "success"
              ? "bg-teal-500/10 text-teal-400"
              : "bg-red-500/10 text-red-400"
          }`}
        >
          {statusMessage.text}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {CHANNELS.map((ch) => {
          const saved = getSavedChannel(ch.type)
          const isConfiguring = configuring === ch.type

          // QR-based channels (WhatsApp, Zalo Personal)
          if (ch.connectionMethod === "qr") {
            return (
              <QrScanCard
                key={ch.type}
                channelType={ch.type}
                channelName={ch.name}
                description={ch.description}
                saved={saved}
                onDisconnect={() => {
                  setSavedChannels((prev) =>
                    prev.map((c) =>
                      c.channelType === ch.type ? { ...c, enabled: false, status: "disconnected" } : c
                    )
                  )
                }}
              />
            )
          }

          // Web Chat — always active
          if (ch.type === "web") {
            return (
              <Card key={ch.type} className="relative">
                <CardTitle className="text-base">{ch.name}</CardTitle>
                <CardDescription className="mt-1">{ch.description}</CardDescription>
                <div className="mt-4">
                  <Badge variant="success">Always Active</Badge>
                </div>
              </Card>
            )
          }

          // Token/config-based channels
          return (
            <Card key={ch.type} className="relative">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    {ch.name}
                    {saved?.enabled && <Badge variant="success">Connected</Badge>}
                  </CardTitle>
                  <CardDescription className="mt-1">{ch.description}</CardDescription>
                </div>
              </div>

              {isConfiguring && ch.configFields.length > 0 && (
                <div className="mt-4 space-y-3">
                  {ch.configFields.map((field) => (
                    <div key={field.key}>
                      <label className="mb-1 block text-xs font-medium text-zinc-400">
                        {field.label}
                      </label>
                      <Input
                        type={field.type || "text"}
                        placeholder={field.placeholder}
                        value={formData[field.key] || ""}
                        onChange={(e) =>
                          setFormData({ ...formData, [field.key]: e.target.value })
                        }
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 flex gap-2">
                {isConfiguring ? (
                  <>
                    <Button size="sm" onClick={() => save(ch.type, true)} disabled={saving}>
                      {saving ? "Connecting..." : "Save & Connect"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setConfiguring(null); setFormData({}); setStatusMessage(null) }}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setConfiguring(ch.type); setFormData(saved?.config || {}); setStatusMessage(null) }}
                  >
                    {saved ? "Configure" : "Set Up"}
                  </Button>
                )}
                {saved?.enabled && !isConfiguring && (
                  <Button size="sm" variant="ghost" onClick={() => save(ch.type, false)}>
                    Disconnect
                  </Button>
                )}
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
