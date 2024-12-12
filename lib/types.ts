// lib/types.ts

export interface CalibrationSettings {
  degreesPerMM: {
    X: number
    Y: number
  }
  maxTravel: {
    X: number
    Y: number
  }
}

export interface Position {
  x: number
  y: number
}

export interface Device {
  portName: string;
  typeName: string;
  on(event: string, callback: (data: any) => void): void;
  removeAllListeners(event: string): void;
  setPower(power: number): Promise<void>;
  brake(): Promise<void>;
  rotateByDegrees(degrees: number, speed: number): Promise<void>;
  setAccelerationTime(ms: number): Promise<void>;
  setDecelerationTime(ms: number): Promise<void>;
}

export interface PreviewPath {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  type: 'move' | 'draw';
}

export interface PortLimits {
  minDegrees: number;
  maxDegrees: number;
}

// Motor and Device Settings
export interface MotorSettings {
  speed: number;
  degrees: number;
  time: number;
  currentPosition: number;
  targetPosition: number | null;
  isMoving: boolean;
}

export interface SimpleCalibration {
  x: number;
  y: number;
}

export interface MotorState {
  speed: number;
  degrees: number;
  time: number;
  currentPosition: number;
  targetPosition: number | null;
  isMoving: boolean;
}

export interface SimulatedMotorState {
  currentPosition: number
  targetPosition: number | null
  currentPower: number
  currentSpeed: number
  targetSpeed: number
  acceleration: number
  deceleration: number
  isMoving: boolean
}

export interface MotorControlProps {
  port: string;
  label: string;
  settings: MotorState;
  acceleration: number;  // Add these missing props
  deceleration: number;
  hub: any;
  isLoading: boolean;
  onUpdateSettings: (key: string, value: number) => void;
  onUpdateAcceleration: (value: number) => void;
  onUpdateDeceleration: (value: number) => void;
  onControl: (direction: 'forward' | 'backward') => Promise<void>;
  onControlTimed: (direction: 'forward' | 'backward') => Promise<void>;
  onStop: () => Promise<void>;
}

export interface VisualFeedbackProps {
  motorStates: Record<string, MotorSettings>;
  currentX: number;
  currentY: number;
  targetX: number;
  targetY: number;
  penState: 'up' | 'down';
  isConnected: boolean;
  batteryLevel: number;
  signalStrength: number;
}

export interface TestingPanelProps {
  hub: any;
  onRunTest: (test: string) => Promise<void>;
}

export interface Point {
  x: number;
  y: number;
}

export interface PathSegment {
  type: 'move' | 'draw';
  start: Point;
  end: Point;
}

export interface PlotterMove {
  type: 'move' | 'draw';
  x: number;
  y: number;
  z?: number;  // For pen up/down
}

export interface PlotterSequence {
  name: string
  moves: PlotterMove[]
  boundingBox: {
    minX: number
    maxX: number
    minY: number
    maxY: number
  }
  estimatedTime?: number  // estimated execution time
  totalDistance?: number  // total path distance
}

export interface DrawingArea {
  width: number
  height: number
}

export interface ValidationResult {
  valid: boolean
  reason?: string
}

export interface CalibrationResult {
  valid: boolean
  degreesPerMM: {
    X: number
    Y: number
  }
  maxTravel: {
    X: number
    Y: number
  }
}

export interface MovementValidatorConfig {
  minX: number
  maxX: number
  minY: number
  maxY: number
  paperWidth: number
  paperHeight: number
  safeZones?: {x1: number, y1: number, x2: number, y2: number}[]
  dangerZones?: {x1: number, y1: number, x2: number, y2: number}[]
}

export interface PlotterSequence {
  name: string
  moves: PlotterMove[]
  boundingBox: BoundingBox
  estimatedTime?: number
}

export interface BoundingBox {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

// Default values

export const A5_SIZE = {
  width: 148,  // mm
  height: 210  // mm
}

export const HOME_POSITION = {
  x: 0,
  y: 0,
  penUp: true
}


export const PEN_POSITIONS = {
  UP: 0,
  DOWN: -45
}

export const DEFAULT_SETTINGS: CalibrationSettings = {
  degreesPerMM: {
    X: 10,
    Y: 10
  },
  maxTravel: {
    X: A5_SIZE.width,
    Y: A5_SIZE.height
  }
};

export const DEFAULT_LIMITS: Record<string, PortLimits> = {
  A: { minDegrees: -180, maxDegrees: 180 },
  B: { minDegrees: -180, maxDegrees: 180 },
  C: { minDegrees: -180, maxDegrees: 180 }
};

export const MOVEMENT_BOUNDS: MovementValidatorConfig = {
  minX: 0,
  maxX: A5_SIZE.width,
  minY: 0,
  maxY: A5_SIZE.height,
  paperWidth: A5_SIZE.width,
  paperHeight: A5_SIZE.height,
  dangerZones: [
    { x1: -10, y1: -10, x2: 10, y2: 10 }
  ]
}

export const COMMAND_TIMEOUT = 5000;

export const DEFAULT_CALIBRATION: CalibrationSettings & SimpleCalibration = {
  degreesPerMM: {
    X: 10,
    Y: 10
  },
  maxTravel: {
    X: MOVEMENT_BOUNDS.maxX,
    Y: MOVEMENT_BOUNDS.maxY
  },
  x: 10,
  y: 10
};

export const MONITORING_INTERVAL = 100 // ms

export type NotificationType = 'error' | 'success' | 'info'

export type Direction = 'forward' | 'backward';

export interface NotificationHandler {
  addNotification: (message: string, type: NotificationType) => void
}