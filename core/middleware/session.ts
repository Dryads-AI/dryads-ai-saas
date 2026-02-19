export interface SessionData {
  userId: string
  channelType: string
  channelId: string
  conversationId?: string
  aiModel: string
  systemPrompt?: string
  metadata: Record<string, unknown>
}

/** In-memory session store. Keys are "channelType:channelId:userId" */
const sessions = new Map<string, SessionData>()

function sessionKey(channelType: string, channelId: string, userId: string): string {
  return `${channelType}:${channelId}:${userId}`
}

export function getSession(channelType: string, channelId: string, userId: string): SessionData | undefined {
  return sessions.get(sessionKey(channelType, channelId, userId))
}

export function setSession(channelType: string, channelId: string, userId: string, data: SessionData): void {
  sessions.set(sessionKey(channelType, channelId, userId), data)
}

export function getOrCreateSession(channelType: string, channelId: string, userId: string): SessionData {
  const key = sessionKey(channelType, channelId, userId)
  let session = sessions.get(key)
  if (!session) {
    session = {
      userId,
      channelType,
      channelId,
      aiModel: "gpt-4o",
      metadata: {},
    }
    sessions.set(key, session)
  }
  return session
}

export function deleteSession(channelType: string, channelId: string, userId: string): void {
  sessions.delete(sessionKey(channelType, channelId, userId))
}
