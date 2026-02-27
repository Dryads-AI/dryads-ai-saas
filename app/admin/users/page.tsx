"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { Card, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Users, Shield, ArrowLeft } from "lucide-react"
import Link from "next/link"

interface UserRow {
  id: string
  email: string
  name: string | null
  role: string
  createdAt: string
}

export default function AdminUsersPage() {
  const { data: session } = useSession()
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)

  const fetchUsers = () => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setUsers(data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  const toggleRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === "admin" ? "user" : "admin"
    setUpdating(userId)
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: newRole }),
      })
      if (res.ok) {
        setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)))
      }
    } finally {
      setUpdating(null)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin" className="text-text-muted hover:text-text-primary transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-6 w-6 text-violet-400" strokeWidth={1.5} />
            <h1 className="text-2xl font-bold text-text-primary">User Management</h1>
          </div>
          <p className="text-sm text-text-secondary">View and manage user roles</p>
        </div>
      </div>

      <Card>
        <CardTitle>All Users</CardTitle>
        <CardDescription>{users.length} registered user{users.length !== 1 ? "s" : ""}</CardDescription>

        {loading ? (
          <div className="mt-4 flex items-center justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-glass text-left text-text-muted">
                  <th className="pb-3 pr-4 font-medium">Name</th>
                  <th className="pb-3 pr-4 font-medium">Email</th>
                  <th className="pb-3 pr-4 font-medium">Role</th>
                  <th className="pb-3 pr-4 font-medium">Joined</th>
                  <th className="pb-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const isSelf = user.id === (session?.user as { id?: string })?.id
                  return (
                    <tr key={user.id} className="border-b border-border-glass/50 last:border-0">
                      <td className="py-3 pr-4 text-text-primary">
                        <div className="flex items-center gap-2">
                          {user.name || "\u2014"}
                          {isSelf && <Badge variant="outline" className="text-[10px]">You</Badge>}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-text-secondary">{user.email}</td>
                      <td className="py-3 pr-4">
                        {user.role === "admin" ? (
                          <Badge variant="default" className="gap-1">
                            <Shield className="h-3 w-3" />
                            Admin
                          </Badge>
                        ) : (
                          <Badge variant="outline">User</Badge>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-text-muted">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3">
                        {isSelf ? (
                          <span className="text-xs text-text-muted">\u2014</span>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggleRole(user.id, user.role)}
                            disabled={updating === user.id}
                          >
                            {updating === user.id
                              ? "Updating..."
                              : user.role === "admin"
                                ? "Demote to User"
                                : "Promote to Admin"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
