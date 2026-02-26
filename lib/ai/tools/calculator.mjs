/**
 * DMMS AI — Calculator Tool
 * Safe math expression evaluation.
 */

import { toolRegistry } from "../tool-registry.mjs"

/**
 * Evaluate a math expression safely.
 * Only allows numbers, operators, parentheses, and Math functions.
 */
function safeMathEval(expression) {
  // Whitelist: numbers, operators, parens, dots, commas, spaces, Math functions
  const sanitized = expression.replace(/\s+/g, "")

  // Block anything that isn't math
  if (/[a-zA-Z]/.test(sanitized)) {
    // Only allow known Math functions
    const allowedFns = /^(Math\.(abs|ceil|floor|round|sqrt|pow|min|max|log|log2|log10|sin|cos|tan|PI|E)|[\d+\-*/().,%^])+$/
    if (!allowedFns.test(sanitized)) {
      throw new Error("Expression contains disallowed characters or functions.")
    }
  }

  // Additional safety: no assignment, no property access beyond Math
  if (/[=;{}[\]`~\\]/.test(sanitized)) {
    throw new Error("Expression contains disallowed characters.")
  }

  // Use Function constructor with restricted scope
  const fn = new Function("Math", `"use strict"; return (${sanitized})`)
  return fn(Math)
}

toolRegistry.register(
  "calculator",
  {
    description:
      "Evaluate a mathematical expression. Supports basic arithmetic (+, -, *, /, %), exponents (**), parentheses, and Math functions (sqrt, pow, abs, round, ceil, floor, sin, cos, tan, log, PI, E). Use this for any math calculations.",
    parameters: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "The math expression to evaluate (e.g. '245 * 37', 'Math.sqrt(144)', '(15 + 25) * 3')",
        },
      },
      required: ["expression"],
    },
  },
  async (args) => {
    const { expression } = args
    if (!expression) return "No expression provided."

    console.log(`[Tools:Calculator] Evaluating: ${expression}`)

    try {
      const result = safeMathEval(expression)
      if (typeof result !== "number" || !isFinite(result)) {
        return `The expression "${expression}" did not produce a valid number. Result: ${result}`
      }
      return JSON.stringify({ expression, result })
    } catch (err) {
      return `Could not evaluate "${expression}": ${err.message}`
    }
  }
)
