"use client"

import { useSession } from "next-auth/react"

export function useRole() {
  const { data: session, status } = useSession()
  const role = (session?.user as { role?: string })?.role || "user"
  return {
    role,
    isAdmin: role === "admin",
    isLoading: status === "loading",
  }
}
