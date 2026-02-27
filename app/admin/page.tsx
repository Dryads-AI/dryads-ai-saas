"use client"

import { useState, useEffect } from "react"
import { Card, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { Users, Cpu, Settings2, Shield } from "lucide-react"

export default function AdminPage() {
  const [userCount, setUserCount] = useState<number | null>(null)
  const [activeProvider, setActiveProvider] = useState("")
  const [activeModel, setActiveModel] = useState("")

  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setUserCount(data.length)
      })
      .catch(() => {})

    fetch("/api/settings/model")
      .then((r) => r.json())
      .then((data) => {
        if (data?.aiProvider) setActiveProvider(data.aiProvider)
        if (data?.aiModel) setActiveModel(data.aiModel)
      })
      .catch(() => {})
  }, [])

  const cards = [
    {
      href: "/admin/users",
      label: "User Management",
      desc: `${userCount !== null ? userCount : "..."} registered users`,
      icon: Users,
      color: "text-violet-400 bg-violet-500/10",
    },
    {
      href: "/admin/ai-config",
      label: "AI Configuration",
      desc: activeProvider ? `${activeProvider} / ${activeModel}` : "Configure providers & models",
      icon: Cpu,
      color: "text-teal-400 bg-teal-500/10",
    },
    {
      href: "/settings",
      label: "Platform Settings",
      desc: "Profile & general settings",
      icon: Settings2,
      color: "text-sky-400 bg-sky-500/10",
    },
  ]

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <div className="flex items-center gap-3">
          <Shield className="h-7 w-7 text-teal-400" strokeWidth={1.5} />
          <h1 className="text-3xl font-bold text-text-primary">Admin Panel</h1>
        </div>
        <p className="mt-1 text-text-secondary">Manage users, AI providers, and platform configuration.</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="flex items-center justify-between">
            <div className="text-2xl font-bold text-text-primary">{userCount ?? "..."}</div>
            <Users className="h-5 w-5 text-violet-400" strokeWidth={1.5} />
          </div>
          <div className="mt-1 text-sm text-text-secondary">Total Users</div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <div className="text-lg font-bold text-text-primary capitalize">{activeProvider || "..."}</div>
            <Cpu className="h-5 w-5 text-teal-400" strokeWidth={1.5} />
          </div>
          <div className="mt-1 text-sm text-text-secondary">Active AI Provider</div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <Badge variant="success">Online</Badge>
          </div>
          <div className="mt-1 text-sm text-text-secondary">System Status</div>
        </Card>
      </div>

      {/* Quick Links */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-text-primary">Admin Sections</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => {
            const Icon = card.icon
            return (
              <Link key={card.href} href={card.href}>
                <Card className="flex items-start gap-4 transition-all hover:border-teal-500/20 hover:shadow-sm hover:shadow-teal-500/5">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${card.color}`}>
                    <Icon className="h-5 w-5" strokeWidth={1.5} />
                  </div>
                  <div>
                    <CardTitle className="text-base">{card.label}</CardTitle>
                    <CardDescription>{card.desc}</CardDescription>
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
