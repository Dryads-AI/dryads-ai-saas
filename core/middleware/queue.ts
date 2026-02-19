type QueueTask<T> = {
  execute: () => Promise<T>
  resolve: (value: T) => void
  reject: (error: Error) => void
}

/** Simple in-memory message queue. Processes messages sequentially per key (user/conversation). */
export class MessageQueue {
  private queues = new Map<string, QueueTask<unknown>[]>()
  private processing = new Set<string>()

  async enqueue<T>(key: string, execute: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!this.queues.has(key)) this.queues.set(key, [])
      this.queues.get(key)!.push({ execute, resolve: resolve as (v: unknown) => void, reject })
      this.process(key)
    })
  }

  private async process(key: string) {
    if (this.processing.has(key)) return
    this.processing.add(key)

    const queue = this.queues.get(key)
    while (queue && queue.length > 0) {
      const task = queue.shift()!
      try {
        const result = await task.execute()
        task.resolve(result)
      } catch (err) {
        task.reject(err instanceof Error ? err : new Error(String(err)))
      }
    }

    this.processing.delete(key)
    if (queue?.length === 0) this.queues.delete(key)
  }
}

export const messageQueue = new MessageQueue()
