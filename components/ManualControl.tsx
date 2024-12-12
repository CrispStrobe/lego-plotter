import { MotorSettings } from '@/lib/types'

interface ManualControlProps {
  hub: any;
  motorStates: Record<string, MotorSettings>;
  controlMotor: (port: string, direction: 'forward' | 'backward') => Promise<void>;
  stopMotor: (port: string) => Promise<void>;
  togglePen: () => Promise<void>;
}

export function ManualControl({
  hub,
  motorStates,
  controlMotor,
  stopMotor,
  togglePen,
}: ManualControlProps) {
  return (
    <div className="border rounded-lg p-4">
      <h2 className="font-bold mb-4">Manual Control</h2>

      {hub && (
        <div className="grid grid-cols-3 gap-4">
          {/* Y Up */}
          <button
            className="col-start-2 p-2 bg-blue-500 text-white rounded"
            onMouseDown={() => controlMotor('A', 'forward')}
            onMouseUp={() => stopMotor('A')}
            onMouseLeave={() => stopMotor('A')}
          >
            ↑
          </button>

          {/* X Left */}
          <button
            className="col-start-1 p-2 bg-blue-500 text-white rounded"
            onMouseDown={() => controlMotor('B', 'backward')}
            onMouseUp={() => stopMotor('B')}
            onMouseLeave={() => stopMotor('B')}
          >
            ←
          </button>

          {/* Pen Up/Down */}
          <button
            className="col-start-2 p-2 bg-green-500 text-white rounded"
            onClick={togglePen}
          >
            {motorStates.C.currentPosition > 0 ? '⬆️' : '⬇️'}
          </button>

          {/* X Right */}
          <button
            className="col-start-3 p-2 bg-blue-500 text-white rounded"
            onMouseDown={() => controlMotor('B', 'forward')}
            onMouseUp={() => stopMotor('B')}
            onMouseLeave={() => stopMotor('B')}
          >
            →
          </button>

          {/* Y Down */}
          <button
            className="col-start-2 p-2 bg-blue-500 text-white rounded"
            onMouseDown={() => controlMotor('A', 'backward')}
            onMouseUp={() => stopMotor('A')}
            onMouseLeave={() => stopMotor('A')}
          >
            ↓
          </button>
        </div>
      )}
    </div>
  );
}
