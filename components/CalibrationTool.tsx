import React, { useState } from 'react'
import { CalibrationSettings, DEFAULT_SETTINGS } from '@/lib/types'

interface Props {
  onCalibrate: (settings: CalibrationSettings) => void;
  hub: any;
  settings?: CalibrationSettings;
}

export function CalibrationTool({ onCalibrate, hub, settings = DEFAULT_SETTINGS}: Props) {
  const [step, setStep] = useState(1)
  const [measurements, setMeasurements] = useState({
    X: { degrees: 0, mm: 0 },
    Y: { degrees: 0, mm: 0 }
  })
  const [maxTravel, setMaxTravel] = useState({
    X: settings.maxTravel.X,
    Y: settings.maxTravel.Y
  });

  const testMotor = async (axis: 'X' | 'Y', degrees: number) => {
    if (!hub) {
      console.warn('Hub not connected');
      return;
    }
  
    const motor = hub.getDeviceAtPort(axis === 'X' ? 'B' : 'A');
    if (!motor) {
      console.warn(`Motor ${axis === 'X' ? 'B' : 'A'} not found`);
      return;
    }
    
    try {
      await motor.rotateByDegrees(degrees, 50);
    } catch (error) {
      console.error(`Error testing ${axis} axis:`, error);
    }
  }

  const calculateCalibration = () => {
    const degreesPerMM = {
      X: measurements.X.degrees / measurements.X.mm,
      Y: measurements.Y.degrees / measurements.Y.mm
    }
    
    onCalibrate({
      degreesPerMM,
      maxTravel
    })
    
    setStep(1) // Reset for next time
  }

  return (
    <div className="border rounded-lg p-4">
      <h2 className="font-semibold mb-4">Calibration Tool</h2>

      {step === 1 && (
        <div>
          <h3 className="font-medium mb-2">Step 1: X-Axis Calibration</h3>
          <p className="text-sm mb-4">
            Click Test to move the pen 360°, then measure the actual distance in mm
          </p>
          <div className="flex gap-2 mb-4">
          <button
            onClick={() => testMotor('X', 360)}
            disabled={!hub}
            className="p-2 bg-blue-500 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Test X-Axis (360°)
          </button>
            <input
              type="number"
              placeholder="Measured MM"
              className="border rounded p-2"
              onChange={(e) => setMeasurements(prev => ({
                ...prev,
                X: { degrees: 360, mm: Number(e.target.value) }
              }))}
            />
          </div>
          <button
            onClick={() => setStep(2)}
            disabled={!measurements.X.mm}  // Disable until measurement entered
            className="w-full p-2 bg-green-500 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next Step
          </button>
        </div>
      )}

      {step === 2 && (
        <div>
          <h3 className="font-medium mb-2">Step 2: Y-Axis Calibration</h3>
          <p className="text-sm mb-4">
            Click Test to move the paper 360°, then measure the actual distance in mm
          </p>
          <div className="flex gap-2 mb-4">
          <button
            onClick={() => testMotor('Y', 360)}
            disabled={!hub}
            className="p-2 bg-blue-500 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Test Y-Axis (360°)
          </button>
            <input
              type="number"
              placeholder="Measured MM"
              className="border rounded p-2"
              onChange={(e) => setMeasurements(prev => ({
                ...prev,
                Y: { degrees: 360, mm: Number(e.target.value) }
              }))}
            />
          </div>
          <button
            onClick={() => setStep(3)}
            disabled={!measurements.Y.mm}  // Disable until measurement entered
            className="w-full p-2 bg-green-500 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next Step
          </button>
        </div>
      )}

      {step === 3 && (
        <div>
          <h3 className="font-medium mb-2">Step 3: Maximum Travel</h3>
          <p className="text-sm mb-4">
            Enter the maximum safe travel distance in mm for each axis
          </p>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm">Max X (mm)</label>
              <input
                type="number"
                className="border rounded p-2 w-full"
                onChange={(e) => setMaxTravel(prev => ({
                  ...prev,
                  X: Number(e.target.value)
                }))}
              />
            </div>
            <div>
              <label className="block text-sm">Max Y (mm)</label>
              <input
                type="number"
                className="border rounded p-2 w-full"
                onChange={(e) => setMaxTravel(prev => ({
                  ...prev,
                  Y: Number(e.target.value)
                }))}
              />
            </div>
          </div>
          <button
            onClick={calculateCalibration}
            disabled={!maxTravel.X || !maxTravel.Y}  // Disable until both values entered
            className="w-full p-2 bg-green-500 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Complete Calibration
          </button>
        </div>
      )}

      <div className="mt-4 text-sm text-gray-600">
        <p>Current Calibration:</p>
        <p>X: {settings.degreesPerMM.X.toFixed(2)}° per mm</p>
        <p>Y: {settings.degreesPerMM.Y.toFixed(2)}° per mm</p>
        <p>Max X: {settings.maxTravel.X}mm</p>
        <p>Max Y: {settings.maxTravel.Y}mm</p>
      </div>
    </div>
  )
}
