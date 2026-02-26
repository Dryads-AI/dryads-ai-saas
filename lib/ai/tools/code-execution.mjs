/**
 * DMMS AI — Code Execution Tool
 * Sandboxed JavaScript execution via Node.js vm module.
 */

import vm from "node:vm"
import { toolRegistry } from "../tool-registry.mjs"

toolRegistry.register(
  "code_execution",
  {
    description:
      "Execute JavaScript code in a sandboxed environment. Use this for running calculations, data transformations, string manipulation, or demonstrating code behavior. The code runs in an isolated sandbox with a 5-second timeout. Console.log output is captured and returned.",
    parameters: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "The JavaScript code to execute. Use console.log() to output results.",
        },
      },
      required: ["code"],
    },
  },
  async (args) => {
    const { code } = args
    if (!code) return "No code provided."

    console.log(`[Tools:CodeExec] Running code (${code.length} chars)`)

    const logs = []
    const sandbox = {
      console: {
        log: (...a) => logs.push(a.map(String).join(" ")),
        error: (...a) => logs.push("[error] " + a.map(String).join(" ")),
        warn: (...a) => logs.push("[warn] " + a.map(String).join(" ")),
      },
      JSON,
      Math,
      Date,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      Map,
      Set,
      Promise,
    }

    try {
      const context = vm.createContext(sandbox)
      const script = new vm.Script(code, { timeout: 5000 })
      const result = script.runInContext(context, { timeout: 5000 })

      const output = logs.length > 0 ? logs.join("\n") : ""
      const returnVal = result !== undefined ? String(result) : ""

      let response = ""
      if (output) response += `Output:\n${output}\n`
      if (returnVal && returnVal !== output.trim()) response += `Return value: ${returnVal}\n`
      if (!response) response = "Code executed successfully (no output)."

      return response.trim()
    } catch (err) {
      const output = logs.length > 0 ? `Output before error:\n${logs.join("\n")}\n\n` : ""
      return `${output}Error: ${err.message}`
    }
  }
)
