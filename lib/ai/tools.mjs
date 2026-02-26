/**
 * Dryads AI — Shared Tools (backward-compatible shim)
 * Delegates to the pluggable tool-registry + individual tool modules.
 */

import { toolRegistry } from "./tool-registry.mjs"
import "./tools/index.mjs"

// Backward-compatible TOOLS array (OpenAI format with execute fn)
const TOOLS = toolRegistry.getDefinitions().map((def) => ({
  definition: def,
  execute: async (args) => toolRegistry.execute(def.function.name, args),
}))

/**
 * Execute a tool by name (backward-compatible wrapper).
 */
export async function executeTool(name, args, ctx) {
  return toolRegistry.execute(name, args, ctx)
}

// Re-export utilities for enrichment middleware
export { fetchPageContent, webSearch } from "./tools/web-search.mjs"

export { TOOLS }
