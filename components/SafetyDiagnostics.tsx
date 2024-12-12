// components/SafetyDiagnostics.tsx
import { useState, useEffect } from 'react'
import { DEFAULT_LIMITS } from '@/lib/types'

interface MotorInfo {
  temp: number
  current: number
  voltage: number
}

interface SystemLogEntry {
  timestamp: number
  type: 'info' | 'warning' | 'error'
  message: string
}

interface PortLimits {
  minDegrees: number;
  maxDegrees: number;
}

interface DiagnosticsProps {
  hub: any;
  limits: Record<string, PortLimits>;
  onLimitChange: (port: string, limit: PortLimits) => void;
}

export function SafetyDiagnostics({ 
  hub, 
  limits = DEFAULT_LIMITS, 
  onLimitChange 
}: DiagnosticsProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [systemLog, setSystemLog] = useState<SystemLogEntry[]>([])
  const [batteryLevel, setBatteryLevel] = useState(100)
  const [bluetoothSignal, setBluetoothSignal] = useState(-60)

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString()
  }

  const addLogEntry = (type: 'info' | 'warning' | 'error', message: string) => {
    setSystemLog(prev => [...prev, {
      timestamp: Date.now(),
      type,
      message
    }].slice(-50)) // Keep last 50 entries
  }

  useEffect(() => {
    if (!hub) return

    let isMounted = true

    const updateInterval = setInterval(() => {
      if (hub && isMounted) {
        // Update battery level
        if (typeof hub.batteryLevel === 'number') {
          setBatteryLevel(hub.batteryLevel)
          if (hub.batteryLevel < 15) {
            addLogEntry('warning', 'Low battery level')
          }
        }

        // Update signal strength
        if (typeof hub.rssi === 'number') {
          setBluetoothSignal(hub.rssi)
          if (Math.abs(hub.rssi) > 80) {
            addLogEntry('warning', 'Weak connection signal')
          }
        }

        // Monitor motor status
        ['A', 'B', 'C'].forEach(async port => {
          const motor = hub.getDeviceAtPort?.(port)
          if (motor) {
            // Only log real motor events, not simulated ones
            if (motor.getCurrentPosition && motor.getCurrent) {
              const position = await motor.getCurrentPosition()
              const current = await motor.getCurrent()
              
              if (position !== undefined && Math.abs(position) > limits[port].maxDegrees) {
                addLogEntry('error', `Motor ${port} position out of bounds: ${position}°`)
              }
              
              if (current !== undefined && current > 1000) {
                addLogEntry('warning', `Motor ${port} high current draw: ${current}mA`)
              }
            }
          }
        })
      }
    }, 1000)

    hub.on?.('disconnect', () => {
      if (isMounted) {
        addLogEntry('error', 'Hub disconnected')
      }
    })

    hub.on?.('error', (error: any) => {
      if (isMounted) {
        addLogEntry('error', `Hub error: ${error}`)
      }
    })

    return () => {
      isMounted = false
      clearInterval(updateInterval)
    }
  }, [hub, limits])

  return (
    <div className="border rounded-lg p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-bold">Safety & Diagnostics</h2>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-blue-500 hover:text-blue-600"
        >
          {isExpanded ? 'Show Less' : 'Show More'}
        </button>
      </div>

      {/* Core Status */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <div className="text-sm text-gray-600">Battery Level</div>
          <div className={batteryLevel > 30 ? 'text-green-500' : 
                         batteryLevel > 15 ? 'text-yellow-500' : 
                         'text-red-500'}>
            {batteryLevel}%
          </div>
        </div>
        <div>
          <div className="text-sm text-gray-600">Signal Strength</div>
          <div className={Math.abs(bluetoothSignal) < 70 ? 'text-green-500' :
                         Math.abs(bluetoothSignal) < 80 ? 'text-yellow-500' :
                         'text-red-500'}>
            {bluetoothSignal} dBm
          </div>
        </div>
      </div>

      {isExpanded && (
        <>
          {/* Motor Limits */}
          <div className="space-y-4">
            {['A', 'B', 'C'].map(port => (
              <div key={port} className="border-t pt-4">
                <h3 className="font-semibold mb-2">Motor {port} Limits</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-600 block">Min Degrees</label>
                    <input
                      type="number"
                      value={limits[port].minDegrees}
                      onChange={(e) => onLimitChange(port, { 
                        ...limits[port], 
                        minDegrees: Number(e.target.value) 
                      })}
                      className="w-full p-2 border rounded bg-gray-700 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600 block">Max Degrees</label>
                    <input
                      type="number"
                      value={limits[port].maxDegrees}
                      onChange={(e) => onLimitChange(port, { 
                        ...limits[port], 
                        maxDegrees: Number(e.target.value) 
                      })}
                      className="w-full p-2 border rounded bg-gray-700 text-white"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* System Log */}
          <div className="border-t pt-4 mt-4">
            <h3 className="font-medium mb-2">System Log</h3>
            <div className="h-48 overflow-auto text-sm space-y-1">
              {systemLog.map((entry, index) => (
                <div 
                  key={index}
                  className={`p-1 rounded ${
                    entry.type === 'error' ? 'bg-red-900/50' :
                    entry.type === 'warning' ? 'bg-yellow-900/50' :
                    'bg-gray-800'
                  }`}
                >
                  <span className="text-gray-400 mr-2">
                    {formatTime(entry.timestamp)}
                  </span>
                  {entry.message}
                </div>
              ))}
              {systemLog.length === 0 && (
                <div className="text-gray-500">No log entries</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}