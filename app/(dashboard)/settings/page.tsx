"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { Card, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

const DEFAULT_MODELS: Record<string, string> = {
  openai: "gpt-4o",
  gemini: "gemini-2.5-flash",
  anthropic: "claude-sonnet-4-6",
}

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  gemini: "Google Gemini",
  anthropic: "Anthropic (Claude)",
}

export default function SettingsPage() {
  const { data: session } = useSession()
  const [openaiKey, setOpenaiKey] = useState("")
  const [geminiKey, setGeminiKey] = useState("")
  const [anthropicKey, setAnthropicKey] = useState("")
  const [savedKeys, setSavedKeys] = useState<Record<string, boolean>>({})
  const [savingOpenai, setSavingOpenai] = useState(false)
  const [savingGemini, setSavingGemini] = useState(false)
  const [savingAnthropic, setSavingAnthropic] = useState(false)
  const [activeProvider, setActiveProvider] = useState("openai")
  const [selectedModel, setSelectedModel] = useState("openai:gpt-4o")
  const [savingModel, setSavingModel] = useState(false)
  const [modelSaved, setModelSaved] = useState(false)
  const [activating, setActivating] = useState(false)

  useEffect(() => {
    fetch("/api/settings/apikeys")
      .then((r) => r.json())
      .then((data) => {
        setSavedKeys(data || {})
        if (data?.openai) setOpenaiKey("sk-••••••••••••••••")
        if (data?.gemini) setGeminiKey("AI••••••••••••••••")
        if (data?.anthropic) setAnthropicKey("sk-ant-••••••••••••••••")
      })
      .catch(() => {})

    fetch("/api/settings/model")
      .then((r) => r.json())
      .then((data) => {
        if (data?.aiProvider && data?.aiModel) {
          setActiveProvider(data.aiProvider)
          setSelectedModel(`${data.aiProvider}:${data.aiModel}`)
        }
      })
      .catch(() => {})
  }, [])

  const saveApiKey = async (provider: string, key: string, setSaving: (v: boolean) => void) => {
    if (!key || key.includes("••")) return
    setSaving(true)
    try {
      await fetch("/api/settings/apikeys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey: key }),
      })
      setSavedKeys((prev) => ({ ...prev, [provider]: true }))
      if (provider === "openai") setOpenaiKey("sk-••••••••••••••••")
      if (provider === "gemini") setGeminiKey("AI••••••••••••••••")
      if (provider === "anthropic") setAnthropicKey("sk-ant-••••••••••••••••")
    } finally {
      setSaving(false)
    }
  }

  const activateProvider = async (provider: string) => {
    const defaultModel = DEFAULT_MODELS[provider]
    const value = `${provider}:${defaultModel}`
    setActivating(true)
    setActiveProvider(provider)
    setSelectedModel(value)
    try {
      await fetch("/api/settings/model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiProvider: provider, aiModel: defaultModel }),
      })
    } finally {
      setActivating(false)
    }
  }

  const saveModel = async (value: string) => {
    setSelectedModel(value)
    setModelSaved(false)
    const [aiProvider, ...rest] = value.split(":")
    const aiModel = rest.join(":")
    setActiveProvider(aiProvider)
    setSavingModel(true)
    try {
      await fetch("/api/settings/model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiProvider, aiModel }),
      })
      setModelSaved(true)
      setTimeout(() => setModelSaved(false), 2000)
    } finally {
      setSavingModel(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Settings</h1>
        <p className="text-sm text-zinc-400">Manage your account and AI configuration</p>
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
          {(savedKeys.openai || savedKeys.gemini || savedKeys.anthropic) && <Badge variant="success">Configured</Badge>}
        </CardTitle>
        <CardDescription>
          Add your AI provider API keys and activate the one you want to use. Only one provider can be active at a time.
        </CardDescription>
        <div className="mt-4 space-y-6">
          {/* OpenAI */}
          <div className={`rounded-lg border p-4 transition-colors ${activeProvider === "openai" ? "border-teal-500/50 bg-teal-500/5" : "border-zinc-800 bg-transparent opacity-60"}`}>
            <div className="mb-3 flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                OpenAI
                {savedKeys.openai && <Badge variant="success" className="text-[10px]">Saved</Badge>}
              </label>
              <button
                onClick={() => activateProvider("openai")}
                disabled={activating || activeProvider === "openai"}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:cursor-default ${activeProvider === "openai" ? "bg-teal-500" : "bg-zinc-700"}`}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${activeProvider === "openai" ? "translate-x-5" : "translate-x-0"}`} />
              </button>
            </div>
            <div className="flex gap-2">
              <Input
                type="password"
                value={openaiKey}
                onChange={(e) => {
                  setOpenaiKey(e.target.value)
                  if (!e.target.value.includes("••")) setSavedKeys((p) => ({ ...p, openai: false }))
                }}
                placeholder="sk-..."
                onFocus={() => {
                  if (openaiKey.includes("••")) setOpenaiKey("")
                }}
              />
              <Button
                onClick={() => saveApiKey("openai", openaiKey, setSavingOpenai)}
                disabled={savingOpenai || !openaiKey || openaiKey.includes("••")}
                size="sm"
              >
                {savingOpenai ? "Saving..." : "Save"}
              </Button>
            </div>
            <p className="mt-1.5 text-xs text-zinc-500">
              Get your key from{" "}
              <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-teal-500 hover:underline">
                platform.openai.com
              </a>
            </p>
          </div>

          {/* Gemini */}
          <div className={`rounded-lg border p-4 transition-colors ${activeProvider === "gemini" ? "border-teal-500/50 bg-teal-500/5" : "border-zinc-800 bg-transparent opacity-60"}`}>
            <div className="mb-3 flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                Google Gemini
                {savedKeys.gemini && <Badge variant="success" className="text-[10px]">Saved</Badge>}
              </label>
              <button
                onClick={() => activateProvider("gemini")}
                disabled={activating || activeProvider === "gemini"}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:cursor-default ${activeProvider === "gemini" ? "bg-teal-500" : "bg-zinc-700"}`}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${activeProvider === "gemini" ? "translate-x-5" : "translate-x-0"}`} />
              </button>
            </div>
            <div className="flex gap-2">
              <Input
                type="password"
                value={geminiKey}
                onChange={(e) => {
                  setGeminiKey(e.target.value)
                  if (!e.target.value.includes("••")) setSavedKeys((p) => ({ ...p, gemini: false }))
                }}
                placeholder="AIza..."
                onFocus={() => {
                  if (geminiKey.includes("••")) setGeminiKey("")
                }}
              />
              <Button
                onClick={() => saveApiKey("gemini", geminiKey, setSavingGemini)}
                disabled={savingGemini || !geminiKey || geminiKey.includes("••")}
                size="sm"
              >
                {savingGemini ? "Saving..." : "Save"}
              </Button>
            </div>
            <p className="mt-1.5 text-xs text-zinc-500">
              Get your key from{" "}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-teal-500 hover:underline">
                aistudio.google.com
              </a>
            </p>
          </div>

          {/* Anthropic (Claude) */}
          <div className={`rounded-lg border p-4 transition-colors ${activeProvider === "anthropic" ? "border-teal-500/50 bg-teal-500/5" : "border-zinc-800 bg-transparent opacity-60"}`}>
            <div className="mb-3 flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                Anthropic (Claude)
                {savedKeys.anthropic && <Badge variant="success" className="text-[10px]">Saved</Badge>}
              </label>
              <button
                onClick={() => activateProvider("anthropic")}
                disabled={activating || activeProvider === "anthropic"}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:cursor-default ${activeProvider === "anthropic" ? "bg-teal-500" : "bg-zinc-700"}`}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${activeProvider === "anthropic" ? "translate-x-5" : "translate-x-0"}`} />
              </button>
            </div>
            <div className="flex gap-2">
              <Input
                type="password"
                value={anthropicKey}
                onChange={(e) => {
                  setAnthropicKey(e.target.value)
                  if (!e.target.value.includes("••")) setSavedKeys((p) => ({ ...p, anthropic: false }))
                }}
                placeholder="sk-ant-..."
                onFocus={() => {
                  if (anthropicKey.includes("••")) setAnthropicKey("")
                }}
              />
              <Button
                onClick={() => saveApiKey("anthropic", anthropicKey, setSavingAnthropic)}
                disabled={savingAnthropic || !anthropicKey || anthropicKey.includes("••")}
                size="sm"
              >
                {savingAnthropic ? "Saving..." : "Save"}
              </Button>
            </div>
            <p className="mt-1.5 text-xs text-zinc-500">
              Get your key from{" "}
              <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-teal-500 hover:underline">
                console.anthropic.com
              </a>
            </p>
          </div>
        </div>
      </Card>

      {/* AI Model */}
      <Card>
        <CardTitle className="flex items-center gap-2">
          AI Model
          {modelSaved && <Badge variant="success" className="text-[10px]">Saved</Badge>}
          {savingModel && <span className="text-xs text-zinc-500">Saving...</span>}
        </CardTitle>
        <CardDescription>
          Select a model for the active provider: <span className="font-medium text-teal-400">{PROVIDER_LABELS[activeProvider]}</span>
        </CardDescription>
        <div className="mt-4 space-y-3">
          <select
            value={selectedModel}
            onChange={(e) => saveModel(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            {activeProvider === "openai" && (
              <optgroup label="OpenAI">
                <option value="openai:gpt-5.2-chat-latest">GPT-5.2 (Latest)</option>
                <option value="openai:gpt-4o">GPT-4o (Recommended)</option>
                <option value="openai:gpt-4o-mini">GPT-4o Mini (Faster)</option>
              </optgroup>
            )}
            {activeProvider === "gemini" && (
              <optgroup label="Google Gemini">
                <option value="gemini:gemini-2.5-flash">Gemini 2.5 Flash (Fast)</option>
                <option value="gemini:gemini-2.5-pro">Gemini 2.5 Pro</option>
              </optgroup>
            )}
            {activeProvider === "anthropic" && (
              <optgroup label="Anthropic (Claude)">
                <option value="anthropic:claude-sonnet-4-6">Claude Sonnet 4.6 (Recommended)</option>
                <option value="anthropic:claude-haiku-4-5-20251001">Claude Haiku 4.5 (Fast)</option>
                <option value="anthropic:claude-opus-4-6">Claude Opus 4.6 (Most Capable)</option>
              </optgroup>
            )}
          </select>
          <p className="text-xs text-zinc-500">
            This applies to web chat and new messenger conversations. Changes take effect immediately.
          </p>
        </div>
      </Card>
    </div>
  )
}
