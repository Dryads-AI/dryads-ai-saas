/**
 * DMMS AI — Image Generation Tool
 * Generates images via DALL-E 3 (OpenAI API).
 */

import OpenAI from "openai"
import { toolRegistry } from "../tool-registry.mjs"

toolRegistry.register(
  "image_generation",
  {
    description:
      "Generate an image based on a text description using AI (DALL-E 3). Use this when the user asks you to create, generate, draw, or design an image, picture, illustration, or artwork.",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "A detailed description of the image to generate. Be specific about style, colors, composition, and subject.",
        },
        size: {
          type: "string",
          enum: ["1024x1024", "1792x1024", "1024x1792"],
          description: "Image size. Default: 1024x1024. Use 1792x1024 for landscape, 1024x1792 for portrait.",
        },
      },
      required: ["prompt"],
    },
  },
  async (args, ctx) => {
    const { prompt, size = "1024x1024" } = args
    if (!prompt) return "No image description provided."

    console.log(`[Tools:ImageGen] Generating: "${prompt.slice(0, 80)}..." (${size})`)

    // Get OpenAI API key — prefer from ctx, fall back to env
    const apiKey = ctx?.openaiApiKey || process.env.OPENAI_API_KEY
    if (!apiKey) {
      return "Image generation requires an OpenAI API key. Please configure one to use this feature."
    }

    try {
      const openai = new OpenAI({ apiKey })
      const response = await openai.images.generate({
        model: "dall-e-3",
        prompt,
        n: 1,
        size,
        quality: "standard",
      })

      const imageUrl = response.data[0]?.url
      const revisedPrompt = response.data[0]?.revised_prompt

      if (!imageUrl) {
        return "Image generation completed but no URL was returned. Please try again."
      }

      console.log(`[Tools:ImageGen] Generated successfully`)

      // Store image on pipeline context for connector to send as actual image
      if (ctx && typeof ctx === "object") {
        if (!ctx.generatedImages) ctx.generatedImages = []
        ctx.generatedImages.push({
          url: imageUrl,
          caption: revisedPrompt || prompt,
        })
      }

      return JSON.stringify({
        image_url: imageUrl,
        revised_prompt: revisedPrompt,
        size,
        note: "The image has been generated and will be sent directly in the chat. You can describe what was created.",
      })
    } catch (err) {
      console.error(`[Tools:ImageGen] Error:`, err.message)
      return `Image generation failed: ${err.message}`
    }
  },
  { needsCtx: true }
)
