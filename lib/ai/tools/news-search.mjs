/**
 * DMMS AI — News Search Tool
 * Searches for recent news articles on a topic.
 */

import { toolRegistry } from "../tool-registry.mjs"
import { webSearch } from "./web-search.mjs"

toolRegistry.register(
  "news_search",
  {
    description:
      "Search specifically for recent news articles on a topic. Automatically appends the current year to improve freshness. Use this for breaking news, latest developments, or recent events.",
    parameters: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description: "The news topic to search for (e.g. 'AI regulation', 'Tesla earnings', 'earthquake')",
        },
      },
      required: ["topic"],
    },
  },
  async (args) => {
    const topic = args.topic
    const year = new Date().getFullYear()
    const query = `${topic} ${year} latest news`
    console.log(`[Tools:NewsSearch] Searching news: "${query}"`)
    return webSearch({ query })
  }
)
