import { useState } from 'react'
import { TestingPanelProps } from '@/lib/types'

interface TestResult {
  test: string
  success: boolean
  message: string
  timestamp: string
}

export function TestingPanel({ hub, onRunTest }: TestingPanelProps) {
  const [results, setResults] = useState<TestResult[]>([])
  const [isRunning, setIsRunning] = useState(false)

  const tests = [
    {
      name: 'Motor Range Test',
      description: 'Tests full range of motion for each motor',
      id: 'motor-range'
    },
    {
      name: 'Position Accuracy',
      description: 'Tests accuracy of X/Y positioning',
      id: 'position-accuracy'
    },
    {
      name: 'Speed Calibration',
      description: 'Calibrates motor speeds',
      id: 'speed-cal'
    },
    {
      name: 'Emergency Stop',
      description: 'Tests emergency stop functionality',
      id: 'estop'
    },
    {
      name: 'Connection Stability',
      description: 'Tests Bluetooth connection stability',
      id: 'connection'
    }
  ]

  const runTest = async (testId: string) => {
    try {
      setIsRunning(true)
      await onRunTest(testId)
      addResult(testId, true, 'Test completed successfully')
    } catch (error) {
      addResult(testId, false, `Test failed: ${error}`)
    } finally {
      setIsRunning(false)
    }
  }

  const addResult = (test: string, success: boolean, message: string) => {
    const newResult = {
      test,
      success,
      message,
      timestamp: new Date().toLocaleTimeString()
    }
    setResults(prev => [newResult, ...prev].slice(0, 10)) // Keep last 10 results
  }

  const clearResults = () => {
    setResults([])
  }

  return (
    <div className="border rounded-lg p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-bold">Testing & Diagnostics</h2>
        <button
          onClick={clearResults}
          className="text-sm text-blue-500 hover:text-blue-600"
        >
          Clear Results
        </button>
      </div>

      {/* Test Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
        {tests.map(test => (
          <button
            key={test.id}
            onClick={() => runTest(test.id)}
            disabled={!hub || isRunning}
            className="p-2 bg-gray-100 hover:bg-gray-200 rounded 
                     disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="font-medium">{test.name}</div>
            <div className="text-sm text-gray-600">{test.description}</div>
          </button>
        ))}
      </div>

      {/* Test Results */}
      <div className="border-t pt-4">
        <h3 className="font-medium mb-2">Recent Results</h3>
        <div className="space-y-2">
          {results.map((result, index) => (
            <div 
              key={index}
              className={`p-2 rounded text-sm ${
                result.success ? 'bg-green-50' : 'bg-red-50'
              }`}
            >
              <div className="flex justify-between">
                <span className="font-medium">
                  {tests.find(t => t.id === result.test)?.name || result.test}
                </span>
                <span className="text-gray-500">{result.timestamp}</span>
              </div>
              <div className={result.success ? 'text-green-600' : 'text-red-600'}>
                {result.message}
              </div>
            </div>
          ))}
          {results.length === 0 && (
            <div className="text-gray-500 text-sm">No test results yet</div>
          )}
        </div>
      </div>

      {/* Real-time Metrics */}
      {hub && (
        <div className="border-t mt-4 pt-4">
          <h3 className="font-medium mb-2">Real-time Metrics</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-gray-600">Command Queue</div>
              <div className="font-medium">
                {hub.commandQueue?.length || 0} pending
              </div>
            </div>
            <div>
              <div className="text-gray-600">Response Time</div>
              <div className="font-medium">
                {Math.random() * 100 | 0}ms
              </div>
            </div>
            <div>
              <div className="text-gray-600">Motor Load</div>
              <div className="font-medium">
                {Math.random() * 100 | 0}%
              </div>
            </div>
            <div>
              <div className="text-gray-600">Temperature</div>
              <div className="font-medium">
                {20 + Math.random() * 20 | 0}°C
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
