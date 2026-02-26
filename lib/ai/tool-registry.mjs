/**
 * Dryads AI — Pluggable Tool Registry
 * Central registry for all AI tools. Each tool self-registers via register().
 * Provides definitions in OpenAI, Anthropic, and Gemini formats.
 */

class ToolRegistry {
  constructor() {
    /** @type {Map<string, { definition: object, execute: Function, opts: object }>} */
    this._tools = new Map()
  }

  /**
   * Register a tool.
   * @param {string} name - Unique tool name
   * @param {object} definition - OpenAI-format function definition { description, parameters }
   * @param {Function} executeFn - async (args, ctx) => string
   * @param {object} [opts] - { needsCtx: boolean }
   */
  register(name, definition, executeFn, opts = {}) {
    this._tools.set(name, {
      definition: {
        type: "function",
        function: { name, ...definition },
      },
      execute: executeFn,
      opts,
    })
  }

  /**
   * OpenAI-format tool definitions array.
   */
  getDefinitions() {
    return Array.from(this._tools.values()).map((t) => t.definition)
  }

  /**
   * Anthropic-format tool definitions array.
   */
  getAnthropicDefinitions() {
    return Array.from(this._tools.values()).map((t) => ({
      name: t.definition.function.name,
      description: t.definition.function.description,
      input_schema: t.definition.function.parameters,
    }))
  }

  /**
   * Gemini-format function declarations array.
   */
  getGeminiDeclarations() {
    return Array.from(this._tools.values()).map((t) => ({
      name: t.definition.function.name,
      description: t.definition.function.description,
      parameters: t.definition.function.parameters,
    }))
  }

  /**
   * Execute a tool by name.
   * @param {string} name
   * @param {object} args
   * @param {object} [ctx] - Pipeline context (for context-aware tools)
   * @returns {Promise<string>}
   */
  async execute(name, args, ctx = {}) {
    const tool = this._tools.get(name)
    if (!tool) return `Tool "${name}" not found.`
    return await tool.execute(args, ctx)
  }

  /**
   * Get a list of all registered tool names.
   */
  getToolNames() {
    return Array.from(this._tools.keys())
  }

  /**
   * Get tool summaries for system prompt.
   * @returns {Object<string, string>}
   */
  getToolSummaries() {
    const summaries = {}
    for (const [name, tool] of this._tools) {
      summaries[name] = tool.definition.function.description
    }
    return summaries
  }
}

/** Singleton instance */
export const toolRegistry = new ToolRegistry()
