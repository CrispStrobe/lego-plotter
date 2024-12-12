// components/PositionPresets.tsx
import { useState } from 'react'
import { MovementValidator } from '@/lib/MovementValidator'
import { MOVEMENT_BOUNDS, CalibrationSettings, SimpleCalibration } from '@/lib/types'

interface Position {
  x: number;
  y: number;
  name: string;
}

interface PositionPresetsProps {
  onMoveToPosition: (x: number, y: number) => void;
  currentX: number;
  currentY: number;
  calibration: CalibrationSettings & SimpleCalibration;
  onError?: (message: string) => void;
}

export function PositionPresets({ 
  onMoveToPosition, 
  currentX, 
  currentY,
  calibration,
  onError
}: PositionPresetsProps) {
  const [presets, setPresets] = useState<Position[]>([])
  const [newPresetName, setNewPresetName] = useState('')
  
  // Create validator instance
  const movementValidator = new MovementValidator(MOVEMENT_BOUNDS, calibration)

  const saveCurrentPosition = () => {
    if (!newPresetName) return

    // Validate position using MovementValidator
    const validationResult = movementValidator.validatePosition(currentX, currentY)
    if (!validationResult.valid) {
      onError?.(validationResult.reason || 'Invalid position')
      return
    }

    setPresets(prev => [...prev, {
      x: currentX,
      y: currentY,
      name: newPresetName
    }])
    setNewPresetName('')
  }

  const handleMoveToPreset = (x: number, y: number) => {
    // Validate movement before executing
    const validationResult = movementValidator.validatePath(currentX, currentY, x, y)
    if (!validationResult.valid) {
      onError?.(validationResult.reason || 'Invalid movement')
      return
    }

    onMoveToPosition(x, y)
  }

  return (
    <div className="border rounded-lg p-4">
      <h2 className="font-bold mb-4">Position Presets</h2>
      
      <div className="mb-4">
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={newPresetName}
            onChange={(e) => setNewPresetName(e.target.value)}
            placeholder="Preset Name"
            className="flex-1 p-2 border rounded"
          />
          <button
            onClick={saveCurrentPosition}
            className="p-2 bg-green-500 text-white rounded"
          >
            Save Current
          </button>
        </div>

        <div className="space-y-2">
          {presets.map((preset, index) => (
            <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
              <span className="flex-1">{preset.name}</span>
              <span className="text-sm text-gray-500">
                ({preset.x}, {preset.y})
              </span>
              <button
                onClick={() => handleMoveToPreset(preset.x, preset.y)}
                className="p-1 bg-blue-500 text-white text-sm rounded"
              >
                Move
              </button>
              <button
                onClick={() => setPresets(prev => prev.filter((_, i) => i !== index))}
                className="p-1 bg-red-500 text-white text-sm rounded"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}