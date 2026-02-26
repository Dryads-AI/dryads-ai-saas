/**
 * Dryads AI — DateTime Tool
 * Returns the current date, time, and timezone.
 */

import { toolRegistry } from "../tool-registry.mjs"

toolRegistry.register(
  "get_datetime",
  {
    description: "Get the current date, time, and day of the week.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  async () => {
    const now = new Date()
    return JSON.stringify({
      date: now.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
      time: now.toLocaleTimeString("en-US", { hour12: true }),
      timezone: "UTC",
      iso: now.toISOString(),
    })
  }
)
