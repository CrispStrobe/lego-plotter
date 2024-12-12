import { useEffect, useRef } from 'react'
import { VisualFeedbackProps } from '@/lib/types'

const CANVAS = {
  WIDTH: 400,
  HEIGHT: 300,
  CENTER: {
    X: 200,
    Y: 150
  },
  PLOTTER: {
    BASE_WIDTH: 200,
    BASE_HEIGHT: 100,
    RAIL_HEIGHT: 10,
    CARRIAGE_WIDTH: 20,
    CARRIAGE_HEIGHT: 70
  }
}

const STATUS_COLORS = {
  GOOD: 'green',
  WARNING: 'orange',
  CRITICAL: 'red'
} as const

export function VisualFeedback({
  motorStates,
  currentX,
  currentY,
  targetX,
  targetY,
  penState,
  isConnected,
  batteryLevel,
  signalStrength
}: VisualFeedbackProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear canvas
    ctx.clearRect(0, 0, CANVAS.WIDTH, CANVAS.HEIGHT)

    // Draw plotter schematic
    const drawPlotter = () => {
      // Base
      ctx.fillStyle = '#ccc'
      ctx.fillRect(
        CANVAS.CENTER.X - CANVAS.PLOTTER.BASE_WIDTH/2,
        CANVAS.CENTER.Y - CANVAS.PLOTTER.BASE_HEIGHT/2,
        CANVAS.PLOTTER.BASE_WIDTH,
        CANVAS.PLOTTER.BASE_HEIGHT
      )

      // X-axis rail
      ctx.fillStyle = '#999'
      ctx.fillRect(
        CANVAS.CENTER.X - CANVAS.PLOTTER.BASE_WIDTH/2 + 10,
        CANVAS.CENTER.Y - CANVAS.PLOTTER.BASE_HEIGHT/2 + 10,
        CANVAS.PLOTTER.BASE_WIDTH - 20,
        CANVAS.PLOTTER.RAIL_HEIGHT
      )

      // Carriage (scaled by currentX)
      const xPos = CANVAS.CENTER.X - CANVAS.PLOTTER.BASE_WIDTH/2 + 20 + 
                  ((CANVAS.PLOTTER.BASE_WIDTH - 40) * (currentX / 200))
      
      ctx.fillStyle = '#666'
      ctx.fillRect(
        xPos - CANVAS.PLOTTER.CARRIAGE_WIDTH/2,
        CANVAS.CENTER.Y - CANVAS.PLOTTER.BASE_HEIGHT/2 + 15,
        CANVAS.PLOTTER.CARRIAGE_WIDTH,
        CANVAS.PLOTTER.CARRIAGE_HEIGHT
      )

      // Pen mechanism
      const yOffset = CANVAS.PLOTTER.CARRIAGE_HEIGHT * (currentY / 200)
      const penOffset = penState === 'down' ? 10 : 0

      ctx.fillStyle = '#333'
      ctx.beginPath()
      ctx.moveTo(xPos, CANVAS.CENTER.Y - CANVAS.PLOTTER.BASE_HEIGHT/2 + 15 + yOffset)
      ctx.lineTo(xPos - 5, CANVAS.CENTER.Y - CANVAS.PLOTTER.BASE_HEIGHT/2 + 30 + yOffset + penOffset)
      ctx.lineTo(xPos + 5, CANVAS.CENTER.Y - CANVAS.PLOTTER.BASE_HEIGHT/2 + 30 + yOffset + penOffset)
      ctx.closePath()
      ctx.fill()
    }

    const drawStatusIndicators = () => {
      // Battery indicator
      ctx.fillStyle = batteryLevel > 30 ? STATUS_COLORS.GOOD :
                     batteryLevel > 15 ? STATUS_COLORS.WARNING :
                     STATUS_COLORS.CRITICAL
      ctx.fillRect(10, CANVAS.HEIGHT - 30, batteryLevel, 10)
      ctx.strokeRect(10, CANVAS.HEIGHT - 30, 100, 10)
      ctx.fillStyle = '#000'
      ctx.fillText(`Battery: ${batteryLevel}%`, 120, CANVAS.HEIGHT - 22)

      // Signal strength
      const signalWidth = Math.min(100, Math.max(0, (signalStrength + 100)))
      ctx.fillStyle = signalStrength > -70 ? STATUS_COLORS.GOOD :
                     signalStrength > -80 ? STATUS_COLORS.WARNING :
                     STATUS_COLORS.CRITICAL
      ctx.fillRect(10, CANVAS.HEIGHT - 50, signalWidth, 10)
      ctx.strokeRect(10, CANVAS.HEIGHT - 50, 100, 10)
      ctx.fillStyle = '#000'
      ctx.fillText(`Signal: ${signalStrength}dBm`, 120, CANVAS.HEIGHT - 42)

      // Connection status
      ctx.fillStyle = isConnected ? STATUS_COLORS.GOOD : STATUS_COLORS.CRITICAL
      ctx.beginPath()
      ctx.arc(CANVAS.WIDTH - 20, CANVAS.HEIGHT - 20, 5, 0, Math.PI * 2)
      ctx.fill()
    }

    // Execute drawing
    drawPlotter()
    drawStatusIndicators()

  }, [motorStates, currentX, currentY, targetX, targetY, penState, isConnected, 
      batteryLevel, signalStrength])

  return (
    <div className="border rounded-lg p-4">
      <h2 className="font-bold mb-4">Visual Feedback</h2>
      <canvas
        ref={canvasRef}
        width={CANVAS.WIDTH}
        height={CANVAS.HEIGHT}
        className="border bg-white"
      />
      <div className="grid grid-cols-2 gap-4">
        <div>
          <h3 className="font-semibold">Position</h3>
          <div>X: {currentX.toFixed(1)}</div>
          <div>Y: {currentY.toFixed(1)}</div>
          {targetX !== currentX || targetY !== currentY ? (
            <div className="text-blue-600">
              Target: ({targetX.toFixed(1)}, {targetY.toFixed(1)})
            </div>
          ) : null}
        </div>
        <div>
          <h3 className="font-semibold">Motors</h3>
          {Object.entries(motorStates).map(([port, state]) => (
            <div key={port}>
              {port}: {state.currentPosition.toFixed(1)}°
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-4 text-sm">
        {Object.entries(motorStates).map(([motor, state]) => (
          <div key={motor} className="border rounded p-2">
            <div className="font-medium">Motor {motor}</div>
            <div className="text-gray-600">
              Position: {state.currentPosition.toFixed(1)}°
              {state.isMoving && state.targetPosition !== null && (
                <span className="text-blue-500">
                  → {state.targetPosition.toFixed(1)}°
                </span>
              )}
            </div>
            <div 
              className="h-1 mt-1 bg-gray-200 rounded overflow-hidden"
              title={`Speed: ${state.speed}%`}
            >
              <div 
                className="h-full bg-blue-500 transition-all"
                style={{ width: `${Math.abs(state.speed)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}