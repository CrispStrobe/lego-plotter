// components/MovementPreview.tsx

import { useState, useEffect, useRef } from 'react'

interface PreviewPath {
  startX: number
  startY: number
  endX: number
  endY: number
  type: 'move' | 'draw'
}

interface MovementPreviewProps {
  width: number
  height: number
  currentX: number
  currentY: number
  targetX: number
  targetY: number
  paths: PreviewPath[]
  onPathsChange: (paths: PreviewPath[]) => void
}

export function MovementPreview({
  width,
  height,
  currentX,
  currentY,
  targetX,
  targetY,
  paths,
  onPathsChange
}: MovementPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear canvas
    ctx.clearRect(0, 0, width, height)

    // Draw grid
    ctx.strokeStyle = '#eee'
    for (let x = 0; x <= width; x += 20) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
    }
    for (let y = 0; y <= height; y += 20) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }

    // Draw existing paths
    paths.forEach(path => {
      ctx.beginPath()
      ctx.moveTo(path.startX, path.startY)
      ctx.lineTo(path.endX, path.endY)
      ctx.strokeStyle = path.type === 'move' ? '#blue' : '#red'
      ctx.stroke()
    })

    // Draw current position
    ctx.beginPath()
    ctx.arc(currentX, currentY, 5, 0, Math.PI * 2)
    ctx.fillStyle = 'green'
    ctx.fill()

    // Draw target position if exists
    if (targetX !== currentX || targetY !== currentY) {
      ctx.beginPath()
      ctx.arc(targetX, targetY, 5, 0, Math.PI * 2)
      ctx.fillStyle = 'red'
      ctx.fill()

      // Draw projected path
      ctx.beginPath()
      ctx.moveTo(currentX, currentY)
      ctx.lineTo(targetX, targetY)
      ctx.strokeStyle = 'rgba(0, 0, 255, 0.5)'
      ctx.setLineDash([5, 5])
      ctx.stroke()
      ctx.setLineDash([])
    }
  }, [width, height, currentX, currentY, targetX, targetY, paths])

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    if (isDragging) {
      // End path
      const newPaths = [...paths]
      newPaths[newPaths.length - 1].endX = x
      newPaths[newPaths.length - 1].endY = y
      onPathsChange(newPaths)
      setIsDragging(false)
    } else {
      // Start new path
      onPathsChange([...paths, {
        startX: x,
        startY: y,
        endX: x,
        endY: y,
        type: e.ctrlKey ? 'draw' : 'move'
      }])
      setIsDragging(true)
    }
  }

  return (
    <div className="border rounded-lg p-4">
      <h2 className="font-bold mb-4">Movement Preview</h2>
      <div className="space-y-2 mb-4 text-sm text-gray-600">
        <p>Click to start a path, click again to end it.</p>
        <p>Hold Ctrl while clicking to create a drawing path.</p>
      </div>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onClick={handleCanvasClick}
        className="border cursor-crosshair"
      />
    </div>
  )
}
