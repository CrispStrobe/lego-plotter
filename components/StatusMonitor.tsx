// components/StatusMonitor.tsx
import { useEffect, useState, useCallback } from 'react'

interface SystemStatus {
  timestamp: number
  type: 'info' | 'warning' | 'error' 
  message: string
}

interface StatusMonitorProps {
  hub: any
  isConnected: boolean 
  onIssueDetected: (issue: string) => void
}

export function StatusMonitor({
  hub,
  isConnected, 
  onIssueDetected
}: StatusMonitorProps) {
  const [systemLog, setSystemLog] = useState<SystemStatus[]>([])
  const [batteryLevel, setBatteryLevel] = useState(100)
  const [rssi, setRSSI] = useState(-60)
  const [showDetails, setShowDetails] = useState(false)

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString()
  }

  const getStatusColor = (value: number, warning: number, critical: number) => {
    return value > critical ? 'text-red-500' :
           value > warning ? 'text-yellow-500' :
           'text-green-500'
  }

  const addLogEntry = useCallback((type: 'info' | 'warning' | 'error', message: string) => {
    const entry: SystemStatus = {
      timestamp: Date.now(),
      type,
      message
    }
    setSystemLog(prev => [...prev, entry].slice(-50))
    if (type === 'error') {
      onIssueDetected(message)
    }
  }, [onIssueDetected])

  useEffect(() => {
    if (!hub || !isConnected) return

    let isMounted = true

    hub.on('batteryLevel', (data: { batteryLevel: number }) => {
      if (!isMounted) return
      setBatteryLevel(data.batteryLevel)
      if (data.batteryLevel < 10) {
        addLogEntry('warning', 'Low battery level')
      }
    })

    hub.on('rssi', (data: { rssi: number }) => {
      if (!isMounted) return
      setRSSI(data.rssi)
      if (data.rssi < -80) {
        addLogEntry('warning', 'Weak connection signal')
      }
    })

    hub.on('button', (data: { event: number }) => {
      if (!isMounted) return
      const state = data.event === 2 ? 'pressed' : 'released'
      addLogEntry('info', `Hub button ${state}`)
    })

    return () => {
      isMounted = false
    }
  }, [hub, isConnected, addLogEntry])

  return (
    <div className="border rounded-lg p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-bold">System Status</h2>
        <button
          onClick={() => setShowDetails(prev => !prev)}
          className="text-sm text-blue-500 hover:text-blue-600"
        >
          {showDetails ? 'Hide Details' : 'Show Details'}
        </button>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <div className="text-sm text-gray-600">Battery Level</div>
          <div className={getStatusColor(
            batteryLevel,
            20,
            10
          )}>
            {batteryLevel}%
          </div>
        </div>
        <div>
          <div className="text-sm text-gray-600">Signal Strength (RSSI)</div>
          <div className={getStatusColor(
            Math.abs(rssi),
            70,
            80
          )}>
            {rssi}dBm
          </div>
        </div>
      </div>

      {showDetails && (
        <>
          {/* System Log */}
          <div className="border-t pt-4">
            <h3 className="font-medium mb-2">System Log</h3>
            <div className="h-48 overflow-auto text-sm space-y-1">
              {systemLog.length > 0 ? (
                systemLog.map((entry, index) => (
                  <div 
                    key={index}
                    className={`p-1 rounded ${
                      entry.type === 'error' ? 'bg-red-50 text-red-700' :
                      entry.type === 'warning' ? 'bg-yellow-50 text-yellow-700' :
                      'bg-gray-50 text-gray-700'
                    }`}
                  >
                    <span className="text-gray-500 mr-2">
                      {formatTime(entry.timestamp)}
                    </span>
                    {entry.message}
                  </div>
                ))
              ) : (
                <div className="text-gray-500">No log entries</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}