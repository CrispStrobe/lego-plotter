// lib/ConnectionMonitor.ts
export class ConnectionMonitor {
  private hub: any
  private onConnectionIssue: (message: string) => void
  private onDisconnect: () => void
  private _lastRSSI: number = -60
  private checkInterval: ReturnType<typeof setInterval> | null = null  
  private readonly WARNING_RSSI = -70

  constructor(
    hub: any,
    onConnectionIssue: (message: string) => void,
    onDisconnect: () => void
  ) {
    this.hub = hub
    this.onConnectionIssue = onConnectionIssue
    this.onDisconnect = onDisconnect
  }

  startMonitoring() {
    if (this.checkInterval) return

    // Monitor RSSI
    this.hub.on('rssi', (data: { rssi: number }) => {
      this._lastRSSI = data.rssi
      if (data.rssi < this.WARNING_RSSI) {
        this.onConnectionIssue(`Low signal strength: ${data.rssi}dBm`)
      }
    })

    // Monitor disconnect events
    this.hub.on('disconnect', () => {
      this.onDisconnect()
    })
  }

  stopMonitoring() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }
  }

  isConnectionStable(): boolean {
    return this.hub.connected && this.lastRSSI > this.WARNING_RSSI
  }

  get lastRSSI(): number {
    return this._lastRSSI;
  }
}