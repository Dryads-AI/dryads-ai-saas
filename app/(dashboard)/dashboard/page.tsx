"use client"

import { useSession } from "next-auth/react"
import { Card, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"

const quickLinks = [
  { href: "/chat", label: "Chat Playground", desc: "Test your AI in the browser", icon: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" },
  { href: "/channels", label: "Channels", desc: "Connect messengers", icon: "M13 10V3L4 14h7v7l9-11h-7z" },
  { href: "/conversations", label: "Conversations", desc: "View all chats", icon: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" },
  { href: "/settings", label: "Settings", desc: "API keys & preferences", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" },
]

export default function DashboardPage() {
  const { data: session } = useSession()

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="text-3xl font-bold text-zinc-100">
          Welcome back{session?.user?.name ? `, ${session.user.name}` : ""}
        </h1>
        <p className="mt-1 text-zinc-400">Manage your AI channels and conversations.</p>
      </div>

      {/* Status Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <div className="text-2xl font-bold text-zinc-100">0</div>
          <div className="text-sm text-zinc-400">Connected Channels</div>
        </Card>
        <Card>
          <div className="text-2xl font-bold text-zinc-100">0</div>
          <div className="text-sm text-zinc-400">Conversations</div>
        </Card>
        <Card>
          <div className="text-2xl font-bold text-zinc-100">0</div>
          <div className="text-sm text-zinc-400">Messages Today</div>
        </Card>
        <Card>
          <Badge variant="success">Active</Badge>
          <div className="mt-1 text-sm text-zinc-400">System Status</div>
        </Card>
      </div>

      {/* Quick Links */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-zinc-200">Quick Actions</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {quickLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              <Card className="flex items-start gap-4 transition-colors hover:border-teal-500/50 hover:bg-zinc-900">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-500/10">
                  <svg className="h-5 w-5 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={link.icon} />
                  </svg>
                </div>
                <div>
                  <CardTitle className="text-base">{link.label}</CardTitle>
                  <CardDescription>{link.desc}</CardDescription>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
