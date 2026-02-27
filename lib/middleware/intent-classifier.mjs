/**
 * Dryads AI — Intent Classifier + Smart Model Router (Engine 1)
 * Rule-based classifier (zero latency, zero cost) that detects intent/complexity
 * and routes to the cheapest capable model automatically.
 *
 * Only overrides provider/model when user hasn't explicitly set one.
 */

// ── Intent Patterns ──────────────────────────────────────────────────

const INTENT_PATTERNS = {
  chitchat: {
    patterns: [
      /^(hi|hello|hey|sup|yo|hola|howdy|good\s*(morning|afternoon|evening|night)|what'?s\s*up|greetings)\b/i,
      /^(thanks|thank\s*you|thx|ty|bye|goodbye|see\s*you|later|gn|gm)\b/i,
      /^(how\s*are\s*you|how'?s\s*it\s*going|what'?s\s*new)\b/i,
      /^(lol|haha|lmao|nice|cool|ok|okay|sure|great|awesome)\b/i,
    ],
  },
  image: {
    patterns: [
      /\b(generate|create|draw|design|make|paint|render|sketch)\s+(an?\s+)?(image|picture|photo|illustration|artwork|painting|icon|logo|poster)\b/i,
      /\b(image|picture|photo|illustration)\s+of\b/i,
      /\bdall[-\s]?e\b/i,
    ],
  },
  code: {
    patterns: [
      /\b(write|create|build|implement|code|develop|fix|debug|refactor)\s+(a\s+)?(function|class|script|program|app|component|module|api|endpoint|algorithm)\b/i,
      /\b(javascript|python|typescript|java|c\+\+|rust|go|ruby|php|swift|kotlin|sql|html|css|react|node\.?js|express)\b/i,
      /\b(bug|error|exception|stack\s*trace|syntax\s*error|compile|runtime|segfault)\b/i,
      /```[\s\S]*```/,
      /\b(regex|regexp|algorithm|data\s*structure|binary\s*tree|linked\s*list|hash\s*map)\b/i,
    ],
  },
  search: {
    patterns: [
      /\b(search|find|look\s*up|google|what\s*is|who\s*is|where\s*is|when\s*did|when\s*was)\b/i,
      /\b(latest|recent|current|today'?s?|news|update|score|price|weather|stock)\b/i,
      /\b(how\s*much|how\s*many|what\s*happened|what'?s\s*the)\b/i,
    ],
  },
  analysis: {
    patterns: [
      /\b(analyze|analysis|compare|contrast|evaluate|assess|review|critique|pros?\s*and\s*cons)\b/i,
      /\b(explain\s*(in\s*detail|thoroughly|deeply|the\s*difference)|break\s*down|deep\s*dive)\b/i,
      /\b(strategy|strategic|framework|methodology|architecture|design\s*pattern)\b/i,
      /\b(business\s*(plan|model|case)|market\s*(research|analysis)|competitive)\b/i,
    ],
  },
  task: {
    patterns: [
      /\b(summarize|translate|convert|calculate|format|organize|sort|filter|extract|rewrite)\b/i,
      /\b(remind|reminder|schedule|set\s*a?\s*(timer|alarm|reminder))\b/i,
      /\b(help\s*me|can\s*you|could\s*you|please|I\s*need)\b/i,
    ],
  },
  action: {
    patterns: [
      /\b(send|message|text|tell|forward|reply)\s+(a\s+)?(message|msg|hi|hello|hey)?\s*(to|for)\b/i,
      /\bsend\s+(hi|hello|hey|this|that|it|a\s*message)\b/i,
      /\b(send|message|text|tell)\s+\S+\s+(hi|hello|hey|that|saying)\b/i,
      /\b(message|contact|reach\s*out\s*to|get\s*in\s*touch)\b/i,
      /\bsend\s.*\bto\s/i,
    ],
  },
}

// ── Complexity Scoring ───────────────────────────────────────────────

const COMPLEXITY_SIGNALS = {
  complex: {
    patterns: [
      /\b(step\s*by\s*step|in\s*detail|thorough|comprehensive|complete|full|elaborate)\b/i,
      /\b(compare|contrast|analyze|evaluate|pros?\s*and\s*cons|trade\s*offs?)\b/i,
      /\b(architecture|design\s*pattern|system\s*design|scalab|microservice|distributed)\b/i,
      /\b(essay|article|report|document|proposal|business\s*plan)\b/i,
    ],
    wordCountMin: 50,
  },
  simple: {
    patterns: [
      /^(hi|hello|hey|thanks|bye|yes|no|ok|okay|sure)\s*[!?.]*$/i,
      /^.{1,20}$/,
    ],
    wordCountMax: 8,
  },
}

// ── Routing Table ────────────────────────────────────────────────────

const ROUTING_TABLE = {
  simple: { provider: "openai", model: "gpt-4o-mini" },
  medium: { provider: "openai", model: "gpt-4o" },
  complex: { provider: "anthropic", model: "claude-sonnet-4-6" },
}

// ── Classifier Functions ─────────────────────────────────────────────

function classifyIntent(text) {
  const scores = {}

  for (const [intent, config] of Object.entries(INTENT_PATTERNS)) {
    scores[intent] = 0
    for (const pattern of config.patterns) {
      if (pattern.test(text)) {
        scores[intent]++
      }
    }
  }

  // Find highest scoring intent
  let bestIntent = "question" // default
  let bestScore = 0

  for (const [intent, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score
      bestIntent = intent
    }
  }

  // If no patterns matched at all, default to "question"
  if (bestScore === 0) {
    // Heuristic: if it ends with ?, it's a question
    if (/\?\s*$/.test(text)) {
      bestIntent = "question"
    }
  }

  return bestIntent
}

function classifyComplexity(text, intent) {
  const wordCount = text.split(/\s+/).filter(Boolean).length

  // Simple overrides
  if (intent === "chitchat") return "simple"
  if (intent === "image") return "medium"
  if (intent === "action") return "medium"  // Actions need tool-capable model, never downgrade

  // Check simple signals
  for (const pattern of COMPLEXITY_SIGNALS.simple.patterns) {
    if (pattern.test(text)) return "simple"
  }
  if (wordCount <= (COMPLEXITY_SIGNALS.simple.wordCountMax || 8)) return "simple"

  // Check complex signals
  for (const pattern of COMPLEXITY_SIGNALS.complex.patterns) {
    if (pattern.test(text)) return "complex"
  }
  if (wordCount >= (COMPLEXITY_SIGNALS.complex.wordCountMin || 50)) return "complex"

  // Code tasks are at least medium
  if (intent === "code") return "medium"
  if (intent === "analysis") return "complex"

  // Default: medium
  return "medium"
}

// ── Middleware ────────────────────────────────────────────────────────

/**
 * @param {import("pg").Pool} pool
 */
export function intentClassifierMiddleware(pool) {
  return async function intentClassifier(ctx, next) {
    const text = ctx.text || ""

    const intent = classifyIntent(text)
    const complexity = classifyComplexity(text, intent)

    ctx.intentClass = intent
    ctx.complexityClass = complexity

    const route = ROUTING_TABLE[complexity]

    // Only override if user hasn't explicitly set a provider
    if (!ctx._userExplicitProvider && route) {
      const previousProvider = ctx.aiProvider
      const previousModel = ctx.aiModel

      ctx.aiProvider = route.provider
      ctx.aiModel = route.model

      if (previousProvider !== route.provider || previousModel !== route.model) {
        console.log(
          `[MW:Intent] "${text.slice(0, 60)}..." → intent=${intent}, complexity=${complexity} → ${route.provider}/${route.model} (was ${previousProvider}/${previousModel})`
        )
      } else {
        console.log(`[MW:Intent] intent=${intent}, complexity=${complexity} → keeping ${route.provider}/${route.model}`)
      }
    } else {
      console.log(`[MW:Intent] intent=${intent}, complexity=${complexity} → user-set provider, no override`)
    }

    await next()
  }
}
