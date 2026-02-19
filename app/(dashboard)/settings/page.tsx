"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { Card, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

export default function SettingsPage() {
  const { data: session } = useSession()
  const [openaiKey, setOpenaiKey] = useState("")
  const [savedKey, setSavedKey] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    // Check if user has an API key saved
    fetch("/api/settings/apikeys")
      .then((r) => r.json())
      .then((data) => {
        if (data?.openai) {
          setOpenaiKey("sk-••••••••••••••••")
          setSavedKey(true)
        }
      })
      .catch(() => {})
  }, [])

  const saveApiKey = async () => {
    if (!openaiKey || openaiKey.startsWith("sk-••")) return
    setSaving(true)
    try {
      await fetch("/api/settings/apikeys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "openai", apiKey: openaiKey }),
      })
      setSavedKey(true)
      setOpenaiKey("sk-••••••••••••••••")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Settings</h1>
        <p className="text-sm text-zinc-400">Manage your account and API configuration</p>
      </div>

      {/* Profile */}
      <Card>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Your account information</CardDescription>
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-zinc-400">Email</label>
            <p className="text-sm text-zinc-200">{session?.user?.email}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-400">Name</label>
            <p className="text-sm text-zinc-200">{session?.user?.name || "—"}</p>
          </div>
        </div>
      </Card>

      {/* API Keys */}
      <Card>
        <CardTitle className="flex items-center gap-2">
          API Keys
          {savedKey && <Badge variant="success">Configured</Badge>}
        </CardTitle>
        <CardDescription>
          Add your AI provider API keys. Keys are stored encrypted.
        </CardDescription>
        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">
              OpenAI API Key
            </label>
            <div className="flex gap-2">
              <Input
                type="password"
                value={openaiKey}
                onChange={(e) => {
                  setOpenaiKey(e.target.value)
                  if (e.target.value !== "sk-••••••••••••••••") setSavedKey(false)
                }}
                placeholder="sk-..."
                onFocus={() => {
                  if (openaiKey.startsWith("sk-••")) setOpenaiKey("")
                }}
              />
              <Button onClick={saveApiKey} disabled={saving || !openaiKey || openaiKey.startsWith("sk-••")}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              Get your key from{" "}
              <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-teal-500 hover:underline">
                platform.openai.com
              </a>
            </p>
          </div>
        </div>
      </Card>

      {/* AI Model */}
      <Card>
        <CardTitle>AI Model</CardTitle>
        <CardDescription>Select your default AI model</CardDescription>
        <div className="mt-4">
          <select className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-teal-500">
            <option value="gpt-4o">GPT-4o (Recommended)</option>
            <option value="gpt-4o-mini">GPT-4o Mini (Faster)</option>
            <option value="gpt-4-turbo">GPT-4 Turbo</option>
            <option value="gpt-3.5-turbo">GPT-3.5 Turbo (Cheapest)</option>
          </select>
        </div>
      </Card>
    </div>
  )
}
