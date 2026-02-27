/**
 * Dryads AI — Speech-to-Text (STT) Module
 * Transcribes audio using OpenAI Whisper API.
 * Designed as a swappable layer — replace with self-hosted Whisper later.
 */

import OpenAI from "openai"

/**
 * Transcribe audio buffer to text using OpenAI Whisper.
 * @param {string} apiKey - OpenAI API key
 * @param {Buffer} audioBuffer - Raw audio data (ogg/opus, mp3, wav, etc.)
 * @param {object} [opts]
 * @param {string} [opts.language] - ISO language code hint (e.g. "en", "ar", "fr")
 * @param {string} [opts.filename] - Original filename (helps Whisper detect format)
 * @returns {Promise<{ text: string, language: string }>}
 */
export async function transcribeAudio(apiKey, audioBuffer, opts = {}) {
  const openai = new OpenAI({ apiKey })

  // Whisper accepts: mp3, mp4, mpeg, mpga, m4a, wav, webm, ogg
  // WhatsApp voice notes are OGG/Opus
  const filename = opts.filename || "voice.ogg"

  const file = new File([audioBuffer], filename, {
    type: getMimeType(filename),
  })

  const result = await openai.audio.transcriptions.create({
    model: "whisper-1",
    file,
    ...(opts.language ? { language: opts.language } : {}),
  })

  console.log(`[STT] Transcribed ${audioBuffer.length} bytes → "${result.text.slice(0, 80)}..."`)

  return {
    text: result.text,
    language: opts.language || "auto",
  }
}

/**
 * Download audio from a URL and transcribe it.
 * @param {string} apiKey - OpenAI API key
 * @param {string} url - URL to download audio from
 * @param {object} [opts] - Same as transcribeAudio opts
 * @returns {Promise<{ text: string, language: string }>}
 */
export async function transcribeFromUrl(apiKey, url, opts = {}) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) })
  if (!res.ok) throw new Error(`Audio download failed: HTTP ${res.status}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  if (!buffer.length) throw new Error("Downloaded audio is empty")
  return transcribeAudio(apiKey, buffer, opts)
}

/**
 * Get the platform OpenAI API key (admin's key first, then env fallback).
 * @param {import("pg").Pool} pool
 * @param {string} [_userId] - Deprecated, kept for backwards compat
 * @returns {Promise<string|null>}
 */
export async function getOpenAIKeyForUser(pool, _userId) {
  const res = await pool.query(
    `SELECT u."apiKey" FROM "UserApiKey" u
     JOIN "User" usr ON usr.id = u."userId"
     WHERE usr.role = 'admin' AND u.provider = 'openai' LIMIT 1`
  )
  return res.rows[0]?.apiKey || process.env.OPENAI_API_KEY || null
}

function getMimeType(filename) {
  const ext = filename.split(".").pop()?.toLowerCase()
  const map = {
    ogg: "audio/ogg",
    opus: "audio/ogg",
    mp3: "audio/mpeg",
    mp4: "audio/mp4",
    m4a: "audio/mp4",
    wav: "audio/wav",
    webm: "audio/webm",
  }
  return map[ext] || "audio/ogg"
}
