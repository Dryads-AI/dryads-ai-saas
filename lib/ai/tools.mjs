/**
 * DMMS AI — Shared Tools Registry
 * Tools available to all AI providers (web_search, get_datetime, url_reader, news_search)
 */

// ── Tools Registry ──────────────────────────────────────────────────

const TOOLS = []

// Tool 1: Web Search
TOOLS.push({
  definition: {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the internet for current/real-time information including weather, news, prices, sports scores, events, people, places, or any factual question. Use this whenever the user asks about something that might need up-to-date information.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query to look up on the internet",
          },
        },
        required: ["query"],
      },
    },
  },
  execute: webSearch,
})

// Tool 2: Get Date/Time
TOOLS.push({
  definition: {
    type: "function",
    function: {
      name: "get_datetime",
      description: "Get the current date, time, and day of the week.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  execute: async () => {
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
  },
})

// Tool 3: URL Reader
TOOLS.push({
  definition: {
    type: "function",
    function: {
      name: "url_reader",
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
  },
  execute: async (args) => {
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
  },
})

// Tool 4: News Search
TOOLS.push({
  definition: {
    type: "function",
    function: {
      name: "news_search",
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
  },
  execute: async (args) => {
    const topic = args.topic
    const year = new Date().getFullYear()
    const query = `${topic} ${year} latest news`
    console.log(`[Tools:NewsSearch] Searching news: "${query}"`)
    return webSearch({ query })
  },
})

// ── Web Search Implementation ────────────────────────────────────────

async function fetchPageContent(url, maxChars = 4000) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; DMMS-AI/4.0; +https://dmms.ai)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    })
    if (!res.ok) return ""
    const html = await res.text()

    let text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[\s\S]*?<\/header>/gi, "")
      .replace(/<form[\s\S]*?<\/form>/gi, "")
      .replace(/<aside[\s\S]*?<\/aside>/gi, "")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
      .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
      .replace(/<svg[\s\S]*?<\/svg>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim()

    return text.slice(0, maxChars)
  } catch {
    return ""
  }
}

async function webSearch(args) {
  const query = args.query
  console.log(`[Tools:Search] Searching: "${query}"`)

  try {
    const res = await fetch("https://lite.duckduckgo.com/lite/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (compatible; DMMS-AI/4.0; +https://dmms.ai)",
      },
      body: `q=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(8000),
    })

    const html = await res.text()
    const results = []

    const snippetRegex = /<td\s+class=['"]result-snippet['"]>([\s\S]*?)<\/td>/gi
    const linkRegex = /<a\s+[^>]*class=['"]result-link['"][^>]*href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi

    const snippets = []
    const links = []
    let m

    while ((m = snippetRegex.exec(html)) !== null && snippets.length < 5) {
      snippets.push(
        m[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'")
          .replace(/\s+/g, " ").trim()
      )
    }

    while ((m = linkRegex.exec(html)) !== null && links.length < 5) {
      const url = m[1].trim()
      const title = m[2].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim()
      if (url.startsWith("http")) {
        links.push({ url, title })
      }
    }

    for (let i = 0; i < Math.max(snippets.length, links.length); i++) {
      results.push({
        title: links[i]?.title || "",
        url: links[i]?.url || "",
        snippet: snippets[i] || "",
      })
    }

    // Fallback: DuckDuckGo Instant Answer API
    if (results.length === 0) {
      const iaRes = await fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`,
        { signal: AbortSignal.timeout(5000) }
      )
      const iaData = await iaRes.json()

      if (iaData.AbstractText) {
        results.push({ title: iaData.Heading || query, url: iaData.AbstractURL || "", snippet: iaData.AbstractText })
      }
      if (iaData.Answer) {
        results.push({ title: "Answer", url: "", snippet: iaData.Answer })
      }
      if (iaData.RelatedTopics && results.length === 0) {
        for (const topic of iaData.RelatedTopics.slice(0, 3)) {
          if (topic.Text) {
            results.push({ title: topic.FirstURL || "", url: topic.FirstURL || "", snippet: topic.Text })
          }
        }
      }
    }

    if (results.length === 0) {
      return `No search results found for: "${query}". Please answer based on your knowledge.`
    }

    // Fetch actual page content from top 3 URLs
    const urlsToFetch = results.filter(r => r.url).slice(0, 3)
    console.log(`[Tools:Search] Found ${results.length} results, fetching content from ${urlsToFetch.length} pages...`)

    const pageContents = await Promise.allSettled(
      urlsToFetch.map(r => fetchPageContent(r.url, 2000))
    )

    let output = `Web search results for "${query}":\n\n`

    for (let i = 0; i < results.length; i++) {
      const r = results[i]
      output += `[${i + 1}] ${r.title}\n`
      if (r.url) output += `URL: ${r.url}\n`
      output += `Snippet: ${r.snippet}\n`

      const fetchIdx = urlsToFetch.indexOf(r)
      if (fetchIdx >= 0 && pageContents[fetchIdx]?.status === "fulfilled" && pageContents[fetchIdx].value) {
        output += `Page content: ${pageContents[fetchIdx].value}\n`
      }
      output += "\n"
    }

    output += "Use these search results and page content to give the user a detailed, accurate, up-to-date answer. Cite sources when possible."

    console.log(`[Tools:Search] Completed — ${results.length} results with page content`)
    return output
  } catch (err) {
    console.error(`[Tools:Search] Error:`, err.message)
    return `Web search failed (${err.message}). Please answer based on your knowledge and let the user know the information might not be fully current.`
  }
}

/**
 * Execute a tool by name
 */
export async function executeTool(name, args) {
  const tool = TOOLS.find((t) => t.definition.function.name === name)
  if (!tool) return "Tool not found."
  return await tool.execute(args)
}

// Export for enrichment middleware to reuse
export { TOOLS, fetchPageContent, webSearch }
