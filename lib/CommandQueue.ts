interface Command {
  id: number
  execute: () => Promise<void>
}

export class CommandQueue {
  private queue: Command[] = []
  private executing = false
  private currentCommand: Command | null = null

  async add(command: () => Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
      const id = Date.now()
      
      this.queue.push({
        id,
        execute: async () => {
          try {
            await command()
            resolve()
          } catch (error) {
            reject(error)
          }
        }
      })

      this.processQueue()
    })
  }

  async processQueue() {
    if (this.executing || this.queue.length === 0) return

    this.executing = true
    this.currentCommand = this.queue.shift() || null

    try {
      if (this.currentCommand) {
        await this.currentCommand.execute()
      }
    } catch (error) {
      console.error('Command execution failed:', error)
    }

    this.executing = false
    this.currentCommand = null
    this.processQueue()
  }

  clear() {
    this.queue = []
    this.executing = false
    this.currentCommand = null
  }

  get isExecuting() {
    return this.executing
  }

  get pendingCommands() {
    return this.queue.length
  }
}
