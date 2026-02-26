/**
 * Dryads AI — URL Reader Tool
 * Fetches and cleans HTML content from URLs.
 */

import { toolRegistry } from "../tool-registry.mjs"
import { fetchPageContent } from "./web-search.mjs"

toolRegistry.register(
  "url_reader",
  {
    description:
      "Fetch and read the content of a specific URL/webpage. Use this when the user asks you to read, summarize, or analyze a specific web page, article, or document at a given URL.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The full URL to fetch and read (must start with http:// or https://)",
        },
      },
      required: ["url"],
    },
  },
  async (args) => {
    const url = args.url
    if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
      return "Invalid URL. Please provide a full URL starting with http:// or https://"
    }
    console.log(`[Tools:URLReader] Fetching: ${url}`)
    const content = await fetchPageContent(url, 4000)
    if (!content) {
      return `Could not fetch content from ${url}. The page may be unavailable or blocking automated access.`
    }
    return `Content from ${url}:\n\n${content}\n\nUse this content to answer the user's question about this page.`
  }
)
