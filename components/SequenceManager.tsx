// components/SequenceManager.tsx

import { useState, useCallback } from 'react'
import { PathProcessor } from '@/lib/pathUtils'
import { PathPlanner } from '@/lib/PathPlanner'
import { 
  MOVEMENT_BOUNDS,
  PlotterMove,
  PlotterSequence 
} from '@/lib/types'

interface SequenceManagerProps {
  onLoadSequence: (sequence: PlotterSequence) => void;
  onPreviewSequence: (sequence: PlotterSequence) => void;
  isExecuting: boolean;
  drawingArea: {
    width: number;
    height: number;
  };
  addNotification: (message: string, type: 'error' | 'success' | 'info') => void;
}

export function SequenceManager({
  onLoadSequence,
  onPreviewSequence,
  isExecuting,
  drawingArea,
  addNotification
}: SequenceManagerProps) {
  const [sequences, setSequences] = useState<PlotterSequence[]>([])

  const handleSVGUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const parser = new DOMParser()
      const doc = parser.parseFromString(text, 'image/svg+xml')
      const paths = doc.querySelectorAll('path')
      
      const moves: PlotterMove[] = []
      paths.forEach(path => {
        const d = path.getAttribute('d')
        if (d) {
          const pathMoves = PathPlanner.parseSVGPath(d)
          moves.push(...pathMoves)
        }
      })

      // Validate and scale moves
    const scaledMoves = PathProcessor.validateAndScalePath(moves, {
      width: MOVEMENT_BOUNDS.paperWidth,
      height: MOVEMENT_BOUNDS.paperHeight
    })

    // Optimize the scaled moves
    const optimizedMoves = PathProcessor.optimizePlotterMoves(scaledMoves)

    const sequence: PlotterSequence = {
      name: file.name,
      moves: optimizedMoves,
      boundingBox: PathProcessor.calculateBoundingBox(optimizedMoves)
    }

    setSequences(prev => [...prev, sequence])
    onPreviewSequence(sequence)
  } catch (error) {
    addNotification(`Error parsing SVG: ${error}`, 'error')
  }
}, [drawingArea, onPreviewSequence])

  const handleSequenceUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const sequence = PathPlanner.loadSequence(text)
      setSequences(prev => [...prev, sequence])
      onPreviewSequence(sequence)
    } catch (error) {
      console.error('Error loading sequence:', error)
    }
  }, [onPreviewSequence])

  const handleExecuteSequence = (sequence: PlotterSequence) => {
    onLoadSequence(sequence)
  }

  const downloadSequence = (sequence: PlotterSequence) => {
    const blob = new Blob([JSON.stringify(sequence, null, 2)], {
      type: 'application/json'
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${sequence.name}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="border rounded-lg p-4">
      <h2 className="font-bold mb-4">Drawing Sequences</h2>
      
      <div className="space-y-4">
        {/* Upload buttons */}
        <div className="flex gap-2">
          <div>
            <input
              type="file"
              accept=".svg"
              onChange={handleSVGUpload}
              className="hidden"
              id="svg-upload"
            />
            <label
              htmlFor="svg-upload"
              className="cursor-pointer inline-block px-4 py-2 bg-blue-500 
                       text-white rounded hover:bg-blue-600"
            >
              Import SVG
            </label>
          </div>
          
          <div>
            <input
              type="file"
              accept=".json"
              onChange={handleSequenceUpload}
              className="hidden"
              id="sequence-upload"
            />
            <label
              htmlFor="sequence-upload"
              className="cursor-pointer inline-block px-4 py-2 bg-green-500 
                       text-white rounded hover:bg-green-600"
            >
              Load Sequence
            </label>
          </div>
        </div>

        {/* Sequence list */}
        <div className="space-y-2">
          {sequences.map((sequence, index) => (
            <div
              key={index}
              className="border rounded p-2 flex items-center justify-between"
            >
              <div>
                <div className="font-medium">{sequence.name}</div>
                <div className="text-sm text-gray-500">
                  {sequence.moves.length} moves • 
                  {Math.round((sequence.boundingBox.maxX - sequence.boundingBox.minX))}x
                  {Math.round((sequence.boundingBox.maxY - sequence.boundingBox.minY))}mm
                </div>
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={() => onPreviewSequence(sequence)}
                  className="p-2 text-blue-500 hover:text-blue-600"
                >
                  Preview
                </button>
                <button
                  onClick={() => handleExecuteSequence(sequence)}
                  disabled={isExecuting}
                  className="p-2 text-green-500 hover:text-green-600 
                           disabled:text-gray-400"
                >
                  Execute
                </button>
                <button
                  onClick={() => downloadSequence(sequence)}
                  className="p-2 text-gray-500 hover:text-gray-600"
                >
                  Download
                </button>
              </div>
            </div>
          ))}

          {sequences.length === 0 && (
            <div className="text-gray-500 text-center py-4">
              No sequences loaded
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
