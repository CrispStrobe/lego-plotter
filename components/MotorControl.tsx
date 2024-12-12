// components/MotorControl.tsx
import { useState } from 'react'
import { MotorSettings } from '@/lib/types'
import type { MotorControlProps, Direction } from '@/lib/types';


export function MotorControl({
  port,
  label,
  settings,
  hub,
  onUpdateSettings
}: MotorControlProps) {
  const [showNumericInputs, setShowNumericInputs] = useState(false)

  const controlMotor = async (direction: 'forward' | 'backward') => {
    const motor = hub?.getDeviceAtPort(port)
    if (!motor) return

    try {
      // For rotation, we'll use positive degrees but negative speed for backward
      const speed = direction === 'forward' ? settings.speed : -settings.speed
      await motor.setPower(speed)
    } catch (error) {
      console.error(`Error controlling motor ${port}:`, error)
    }
  }

  const controlMotorByTime = async (direction: 'forward' | 'backward') => {
    const motor = hub?.getDeviceAtPort(port)
    if (!motor) return

    try {
      const speed = direction === 'forward' ? settings.speed : -settings.speed
      await motor.setPower(speed)
      setTimeout(async () => {
        await motor.brake()
      }, settings.time)
    } catch (error) {
      console.error(`Error controlling motor ${port}:`, error)
    }
  }

  const controlMotorByDegrees = async (direction: 'forward' | 'backward') => {
    const motor = hub?.getDeviceAtPort(port)
    if (!motor) return

    try {
      const degrees = direction === 'forward' ? settings.degrees : -settings.degrees
      await motor.rotateByDegrees(degrees, settings.speed)
    } catch (error) {
      console.error(`Error controlling motor ${port}:`, error)
    }
  }

  const stopMotor = async () => {
    const motor = hub?.getDeviceAtPort(port)
    if (!motor) return
    
    try {
      await motor.brake()
    } catch (error) {
      console.error(`Error stopping motor ${port}:`, error)
    }
  }

  return (
    <div className="border rounded-lg p-4">
      <div className="flex justify-between items-center mb-2">
        <h2 className="font-semibold">{label}</h2>
        <button
          onClick={() => setShowNumericInputs(!showNumericInputs)}
          className="text-sm text-blue-500 hover:text-blue-600"
        >
          {showNumericInputs ? 'Show Sliders' : 'Show Numeric Inputs'}
        </button>
      </div>

      <div className="text-sm text-gray-600 mb-2">
        Current Position: {settings.currentPosition}°
      </div>

      {/* Speed Control */}
      <div className="mb-4">
        <label className="block text-sm text-gray-600">Speed: {settings.speed}%</label>
        {showNumericInputs ? (
          <input
            type="number"
            min="0"
            max="100"
            value={settings.speed}
            onChange={(e) => onUpdateSettings('speed', Number(e.target.value))}
            className="w-full p-2 border rounded"
          />
        ) : (
          <input
            type="range"
            min="0"
            max="100"
            value={settings.speed}
            onChange={(e) => onUpdateSettings('speed', Number(e.target.value))}
            className="w-full"
          />
        )}
      </div>

      {/* Degree Control */}
      <div className="mb-4">
        <label className="block text-sm text-gray-600">Degrees: {settings.degrees}°</label>
        {showNumericInputs ? (
          <input
            type="number"
            min="-3600" // Allow 10 full turns
            max="3600"
            value={settings.degrees}
            onChange={(e) => onUpdateSettings('degrees', Number(e.target.value))}
            className="w-full p-2 border rounded"
          />
        ) : (
          <input
            type="range"
            min="-3600"
            max="3600"
            value={settings.degrees}
            onChange={(e) => onUpdateSettings('degrees', Number(e.target.value))}
            className="w-full"
          />
        )}
      </div>

      {/* Time Control */}
      <div className="mb-4">
        <label className="block text-sm text-gray-600">Time: {settings.time}ms</label>
        {showNumericInputs ? (
          <input
            type="number"
            min="0"
            max="5000"
            step="100"
            value={settings.time}
            onChange={(e) => onUpdateSettings('time', Number(e.target.value))}
            className="w-full p-2 border rounded"
          />
        ) : (
          <input
            type="range"
            min="0"
            max="5000"
            step="100"
            value={settings.time}
            onChange={(e) => onUpdateSettings('time', Number(e.target.value))}
            className="w-full"
          />
        )}
      </div>

      {/* Control Buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => controlMotor('forward')}
          disabled={!hub}
          className="p-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
        >
          Forward
        </button>
        <button
          onClick={() => controlMotor('backward')}
          disabled={!hub}
          className="p-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
        >
          Backward
        </button>
        <button
          onClick={() => controlMotorByTime('forward')}
          disabled={!hub}
          className="p-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
        >
          Timed Forward
        </button>
        <button
          onClick={() => controlMotorByTime('backward')}
          disabled={!hub}
          className="p-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
        >
          Timed Backward
        </button>
        <button
          onClick={() => controlMotorByDegrees('forward')}
          disabled={!hub}
          className="p-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50"
        >
          Rotate Degrees
        </button>
        <button
          onClick={stopMotor}
          disabled={!hub}
          className="p-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
        >
          Stop
        </button>
      </div>
    </div>
  )
}