// app/page.tsx
'use client'

import { useState, useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import { CalibrationTool } from '@/components/CalibrationTool'
import { PositionPresets } from '@/components/PositionPresets'
import { CoordinateGrid } from '@/components/CoordinateGrid'
import { MotorControl } from '@/components/MotorControl'
import { Notifications, useNotifications } from '@/components/Notifications'
import { VisualFeedback } from '@/components/VisualFeedback'
import { StatusMonitor } from '@/components/StatusMonitor'
import { SafetyDiagnostics } from '@/components/SafetyDiagnostics'
import { TestingPanel } from '@/components/TestingPanel'
import { SequenceManager } from '@/components/SequenceManager'
import { ManualControl } from '@/components/ManualControl'

import { CommandQueue } from '@/lib/CommandQueue'
import { SafetyController } from '@/lib/SafetyController'
import { MovementValidator } from '@/lib/MovementValidator'
import { ConnectionMonitor } from '@/lib/ConnectionMonitor'
import { PathExecutor, PathOptimizer, PathProcessor } from '@/lib/pathUtils'
import { PathPlanner } from '@/lib/PathPlanner'
import { PlotterControl } from '@/lib/plotter'
import { 
  CalibrationSettings, 
  SimpleCalibration,
  PortLimits, 
  PlotterSequence,
  MotorState,
  PlotterMove,
  DEFAULT_SETTINGS, 
  DEFAULT_LIMITS,
  MOVEMENT_BOUNDS,
  COMMAND_TIMEOUT,
  DEFAULT_CALIBRATION,
  MONITORING_INTERVAL,
  A5_SIZE,
  HOME_POSITION,
  PEN_POSITIONS,
  NotificationType,
  PreviewPath,
  Position
} from '@/lib/types'  


declare global {
  interface Window {
    poweredup: {  // lowercase 'poweredup'
      Hub: any;
      Motor: any;
      BLEDevice: any;
      default: new () => any;
      [key: string]: any;
    }
  }
} 


interface PlotterState {
  position: Position;
  isConnected: boolean;
  isMoving: boolean;
}

export const convertCalibrationFormat = (settings: CalibrationSettings): SimpleCalibration => {
  return {
    x: settings.degreesPerMM.X,
    y: settings.degreesPerMM.Y
  };
};

export default function TestInterface() {
  // Core states
  
  const [hub, setHub] = useState<any>(null)
  const [status, setStatus] = useState('Disconnected')
  const [isLoading, setIsLoading] = useState(false)
  const [simulationMode, setSimulationMode] = useState<boolean>(false)
  const [signalStrength, setSignalStrength] = useState<number>(-60);

  // drawing states
  const [isDrawingMode, setIsDrawingMode] = useState(false)
  const [penState, setPenState] = useState<'up' | 'down'>('up')
  const [drawnSequence, setDrawnSequence] = useState<PlotterSequence | null>(null)
  const [currentPosition, setCurrentPosition] = useState<Position>({ x: 0, y: 0 })
  
  const [previewSequence, setPreviewSequence] = useState<PlotterSequence | null>(null)
  const [executionProgress, setExecutionProgress] = useState<number>(0)
  const maxX = MOVEMENT_BOUNDS.paperWidth
  const maxY = MOVEMENT_BOUNDS.paperHeight

  // Plotter control state
  const [plotterControl, setPlotterControl] = useState<PlotterControl | null>(null)
  const [plotterState, setPlotterState] = useState<PlotterState>({
    position: { x: 0, y: 0 },
    isConnected: false,
    isMoving: false
  })

  // Motor states
  const [motorStates, setMotorStates] = useState<Record<string, MotorState>>({
    A: { 
      speed: 50, 
      degrees: 90, 
      time: 1000, 
      currentPosition: 0,
      targetPosition: null,
      isMoving: false 
    },
    B: { 
      speed: 50, 
      degrees: 90, 
      time: 1000, 
      currentPosition: 0,
      targetPosition: null,
      isMoving: false 
    },
    C: { 
      speed: 50, 
      degrees: 90, 
      time: 1000, 
      currentPosition: 0,
      targetPosition: null,
      isMoving: false 
    }
  });

  useEffect(() => {
    if (!hub) return;
  
    const motorHandlers = new Map();
  
    ['A', 'B', 'C'].forEach(port => {
      const motor = hub.getDeviceAtPort(port);
      if (motor) {
        const handler = (degrees: number) => {
          updateMotorState(port, { currentPosition: degrees });
        };
        motor.on('rotate', handler);
        motorHandlers.set(port, handler);
      }
    });
  
    // Cleanup listeners on unmount or hub change
    return () => {
      ['A', 'B', 'C'].forEach(port => {
        const motor = hub.getDeviceAtPort(port);
        const handler = motorHandlers.get(port);
        if (motor && handler) {
          motor.off('rotate', handler);
        }
      });
    };
  }, [hub]);
  
  // Position states
  const [targetX, setTargetX] = useState(0)
  const [targetY, setTargetY] = useState(0)
  const [currentX, setCurrentX] = useState(0)
  const [currentY, setCurrentY] = useState(0)
  const [isMoving, setIsMoving] = useState(false)
  const [paths, setPaths] = useState<PlotterMove[]>([])

  // Configuration states
  const [calibration, setCalibration] = useState<CalibrationSettings & SimpleCalibration>({
    degreesPerMM: {
      X: 10,
      Y: 10
    },
    maxTravel: {
      X: MOVEMENT_BOUNDS.maxX,
      Y: MOVEMENT_BOUNDS.maxY
    },
    x: 10,  // Add simple format
    y: 10   // Add simple format
  });
  // At the top with other state declarations, explicitly type the objects:
  const [acceleration, setAcceleration] = useState<Record<string, number>>({
    A: 100, B: 100, C: 100 // ms
  });

  const [deceleration, setDeceleration] = useState<Record<string, number>>({
    A: 100, B: 100, C: 100 // ms
  });
  // Utility refs
  const commandQueue = useRef(new CommandQueue())
  const safetyController = useRef<SafetyController | null>(null)
  const movementValidator = useRef<MovementValidator | null>(null)
  const connectionMonitor = useRef<ConnectionMonitor | null>(null)
  const pathExecutor = useRef<PathExecutor | null>(null)

  useEffect(() => {
    if (connectionMonitor.current) {
      const updateInterval = setInterval(() => {
        setSignalStrength(connectionMonitor.current?.lastRSSI ?? -60);
      }, 1000);

      return () => clearInterval(updateInterval);
    }
  }, [connectionMonitor.current]);

  // drawing

  const handleDrawingComplete = (paths: PreviewPath[]) => {
    const sequence = PathPlanner.convertPreviewPathsToSequence(paths, 'Manual Drawing');
    // In simulation mode, we can skip some validations
    if (simulationMode) {
      sequence.moves = PathProcessor.validateAndScalePath(
        sequence.moves,
        { width: maxX, height: maxY },
        true  // simulationMode
      );
    }
    setDrawnSequence(sequence);
    setPreviewSequence(sequence);
  };
  
  
  const togglePenState = () => {
    setPenState(current => current === 'up' ? 'down' : 'up')
  }

  const handlePositionClick = async (x: number, y: number) => {
    if (!isDrawingMode && (plotterRef.current || simulationMode)) {
      try {
        // In simulation mode, skip some validations
        if (!simulationMode && movementValidator.current) {
          const validation = movementValidator.current.validatePath(
            currentX,
            currentY,
            x,
            y
          );
          if (!validation.valid) {
            addNotification(`Invalid movement: ${validation.reason}`, 'error');
            return;
          }
        }
  
        setPlotterState(prev => ({ ...prev, isMoving: true }));
        
        if (simulationMode) {
          // Simulate movement
          await new Promise(resolve => setTimeout(resolve, 500));
          setCurrentX(x);
          setCurrentY(y);
        } else {
          await plotterRef.current!.moveTo(x, y);
        }
      } catch (error) {
        console.error('Movement error:', error);
        addNotification(`Movement error: ${error instanceof Error ? error.message : String(error)}`, 'error');
      } finally {
        setPlotterState(prev => ({ ...prev, isMoving: false }));
      }
    }
  };

  const initializeMotors = async () => {
    if (!plotterRef.current || !hub) return;
  
    try {
      // Wait for motors to be detected
      await new Promise<void>((resolve, reject) => {
        let attempts = 0;
        const checkMotors = setInterval(() => {
          const motorA = plotterRef.current?.getDeviceAtPort('A');
          const motorB = plotterRef.current?.getDeviceAtPort('B');
          
          if (motorA && motorB) {
            clearInterval(checkMotors);
            resolve();
          } else if (attempts++ > 10) {  // Timeout after 10 attempts
            clearInterval(checkMotors);
            reject(new Error('Motors not detected after multiple attempts'));
          }
        }, 500);
      });
  
      addNotification('Motors initialized successfully', 'success');
    } catch (error) {
      addNotification(`Motor initialization failed: ${error}`, 'error');
      throw error;
    }
  };
  
  // Add to useEffect after connection
  useEffect(() => {
    if (hub && plotterRef.current) {
      initializeMotors().catch(error => {
        console.error('Motor initialization failed:', error);
      });
    }
  }, [hub]);

  // Notifications
  const { notifications, addNotification, dismissNotification } = useNotifications()

  // Sequence handling states
  const [currentSequence, setCurrentSequence] = useState<PlotterSequence | null>(null)
  //const [previewSequence, setPreviewSequence] = useState<PlotterSequence | null>(null)
  //const [executionProgress, setExecutionProgress] = useState(0)

  const [safetyLimits, setSafetyLimits] = useState<Record<string, PortLimits>>(DEFAULT_LIMITS);

  const handleCalibration = (settings: CalibrationSettings) => {
    setCalibration({
      ...settings,
      x: settings.degreesPerMM.X,  // Add simple format
      y: settings.degreesPerMM.Y   // Add simple format
    });
    
    // Now this will work because calibration has both formats
    if (movementValidator.current) {
      movementValidator.current = new MovementValidator(
        MOVEMENT_BOUNDS,
        convertCalibrationFormat(calibration),
        simulationMode
      );
    }
  };
  
  // Sequence handling functions
  const handleLoadSequence = async (sequence: PlotterSequence) => {
    if (isMoving) {
      addNotification('Cannot execute sequence: Already moving', 'error');
      return;
    }
  
    if (!sequence?.moves?.length) {
      addNotification('Cannot execute empty sequence', 'error');
      return;
    }
  
    try {
      setIsMoving(true);
      setCurrentSequence(sequence);
      setExecutionProgress(0);
  
      const totalMoves = sequence.moves.length;
      
      // For simulation mode, we don't need hardware connection
      if (!simulationMode && !plotterRef.current?.isConnected()) {
        throw new Error('Plotter not connected');
      }
  
      for (let i = 0; i < totalMoves; i++) {
        const move = sequence.moves[i];
  
        if (simulationMode) {
          // Simulate movement with visual feedback
          await new Promise<void>((resolve) => {
            setTimeout(() => {
              setCurrentX(move.x);
              setCurrentY(move.y);
              if (move.z !== undefined) {
                setPenState(move.z === 0 ? 'up' : 'down');
              }
              resolve();
            }, 200); // Slightly longer delay for better visualization
          });
        } else {
          // Real hardware execution
          if (movementValidator.current) {
            const validation = movementValidator.current.validatePath(
              currentX,
              currentY,
              move.x,
              move.y
            );
  
            if (!validation.valid) {
              throw new Error(`Invalid movement at step ${i + 1}: ${validation.reason}`);
            }
          }
  
          await executeCommand(async () => {
            if (move.z !== undefined) {
              await setPenPosition(move.z);
            }
            await moveToPosition(move.x, move.y);
          });
        }
  
        setExecutionProgress(((i + 1) / totalMoves) * 100);
      }
  
      // Ensure pen is up at the end
      if (simulationMode) {
        setPenState('up');
      } else {
        await executeCommand(async () => {
          await setPenPosition(PEN_POSITIONS.UP);
        });
      }
  
      addNotification(`Sequence "${sequence.name}" completed successfully`, 'success');
    } catch (error) {
      console.error('Sequence execution error:', error);
      addNotification(`Sequence execution failed: ${error}`, 'error');
      if (!simulationMode) {
        await emergencyStop();
      }
    } finally {
      setIsMoving(false);
      setCurrentSequence(null);
      setExecutionProgress(0);
    }
  };

  const handlePreviewSequence = (sequence: PlotterSequence | null) => {
    if (!sequence) {
      setPreviewSequence(null);
      return;
    }

    // Validate sequence bounds before preview
    const { minX, maxX, minY, maxY } = sequence.boundingBox;
    if (minX < MOVEMENT_BOUNDS.minX || maxX > MOVEMENT_BOUNDS.maxX ||
        minY < MOVEMENT_BOUNDS.minY || maxY > MOVEMENT_BOUNDS.maxY) {
      addNotification('Warning: Sequence exceeds movement bounds', 'info');
    }

    setPreviewSequence(sequence);
  };

  // Path validation helper
  const validateAndMove = async (x: number, y: number) => {
    if (!movementValidator.current) {
      addNotification('Movement validator not initialized', 'error');
      return;
    }

    const validation = movementValidator.current.validatePath(
      currentX,
      currentY,
      x,
      y
    );

    if (!validation.valid) {
      addNotification(`Invalid movement: ${validation.reason}`, 'error');
      return;
    }

    await moveToPosition(x, y);
  };

  const plotterRef = useRef<PlotterControl | null>(null)
  const commandQueueRef = useRef<any>(null);

  useEffect(() => {
    let initializeTimeout: ReturnType<typeof setTimeout>;
  
    const initializePlotter = () => {
      try {
        if (typeof window !== 'undefined' && window.poweredup?.default) {
          plotterRef.current = new PlotterControl(simulationMode);  // No arguments
          
          // If we need simulation mode, we should handle it differently
          // Maybe through a separate method or state in PlotterControl
          if (simulationMode) {
            setStatus('Simulation Mode');
            addNotification('Running in simulation mode', 'info');
          }
        } else {
          initializeTimeout = setTimeout(initializePlotter, 100);
        }
      } catch (error) {
        addNotification(`Plotter initialization failed: ${error}`, 'error');
      }
    };
  
    initializePlotter();
  
    return () => {
      if (initializeTimeout) {
        clearTimeout(initializeTimeout);
      }
      plotterRef.current?.disconnect();
    };
  }, [simulationMode]);

  // Plotter setup
  useEffect(() => {
    const setupPlotter = async () => {
      try {
        const control = new PlotterControl()
        await control.connect()
        setPlotterControl(control)
        setPlotterState(prev => ({ ...prev, isConnected: true }))

        // Subscribe to position updates
        control.onPositionUpdate((position: Position) => {
          setCurrentPosition(position)
          setPlotterState(prev => ({ ...prev, position }))
        })

      } catch (error) {
        console.error('Failed to connect to plotter:', error)
      }
    }

    setupPlotter()

    return () => {
      plotterControl?.disconnect()
    }
  }, [])

  useEffect(() => {
    if (!plotterRef.current?.hub || !addNotification) return;
  
    try {
      // Initialize safety systems - only in hardware mode
      if (!simulationMode) {
        safetyController.current = new SafetyController(
          plotterRef.current.hub, 
          (message: string, type: NotificationType) => addNotification(message, type)
        );
        
        connectionMonitor.current = new ConnectionMonitor(
          plotterRef.current.hub,
          (message: string) => addNotification(message, 'info'),
          handleDisconnect
        );
      }
  
      // Always initialize these
      movementValidator.current = new MovementValidator(
        MOVEMENT_BOUNDS, 
        calibration,
        simulationMode // Pass simulation mode flag
      );
  
      pathExecutor.current = new PathExecutor(
        plotterRef.current!, // Plotter instance
        calibration,        // Pass full CalibrationSettings
        simulationMode,     // Simulation mode
        50,                 // moveSpeed (optional)
        30                  // drawSpeed (optional)
      );
  
      // Start monitoring only in hardware mode
      if (!simulationMode) {
        safetyController.current?.startMonitoring();
        connectionMonitor.current?.startMonitoring();
      }
  
      return () => {
        if (!simulationMode) {
          safetyController.current?.stopMonitoring();
          connectionMonitor.current?.stopMonitoring();
        }
      };
    } catch (error) {
      addNotification(`Failed to initialize systems: ${error}`, 'error');
    }
  }, [plotterRef.current, calibration, simulationMode]);
  //}, [plotterRef.current?.hub, calibration, addNotification]);  

  // initial position setup effect:
  useEffect(() => {
    if (!hub || !plotterRef.current?.isConnected()) return;
    
    const initialize = async () => {
      try {
        await initializePosition();
      } catch (error) {
        addNotification(`Initialization failed: ${error}`, 'error');
      }
    };
  
    initialize();
  }, [hub]);

  useEffect(() => {
    if (!plotterRef.current) {
      plotterRef.current = new PlotterControl();
      commandQueueRef.current = plotterRef.current.commandQueue;
    }
  }, []);

  // Disconnect handler that properly cleans up safety systems
  const handleDisconnect = async () => {
    try {
      // Stop all safety monitoring
      safetyController.current?.stopMonitoring();
      connectionMonitor.current?.stopMonitoring();
      
      // Clear all safety system references
      safetyController.current = null;
      movementValidator.current = null;
      connectionMonitor.current = null;
      pathExecutor.current = null;
      
      // Reset states
      setHub(null);
      setStatus('Disconnected');
      setIsMoving(false);
      setCurrentSequence(null);
      setExecutionProgress(0);
      
      addNotification('Hub disconnected', 'info');
    } catch (error) {
      addNotification(`Disconnect error: ${error}`, 'error');
    }
  };
  
  
  const initializePosition = async () => {
    if (!hub) return;
    
    // Verify all motors are attached
    const motors = ['A', 'B', 'C'];
    const allMotorsReady = motors.every(port => plotterRef.current?.motors[port]);
    
    if (!allMotorsReady) {
      throw new Error('Not all motors are attached');
    }
    
    try {
      // First raise pen
      await setPenPosition(PEN_POSITIONS.UP);
      // Move to home position
      await moveToPosition(HOME_POSITION.x, HOME_POSITION.y);
      
      addNotification('Initialized to home position', 'success');
    } catch (error) {
      addNotification(`Initialization failed: ${error}`, 'error');
      // Attempt emergency stop on initialization failure
      await emergencyStop();
    }
  }

  // Disconnect function that ensures proper cleanup
  const disconnect = async () => {
    if (hub) {
      try {
        setIsLoading(true)
        await hub.disconnect()
        await handleDisconnect() // Use the same disconnect handler for consistency
      } catch (error) {
        addNotification(`Disconnect error: ${error}`, 'error')
      } finally {
        setIsLoading(false)
      }
    }
  }

  // Connection handling
  const handleConnection = async () => {
    if (!plotterRef.current) return;
    
    try {
      setIsLoading(true);
      if (!hub) {
        if (!simulationMode) {
          setStatus('Scanning...');
          await plotterRef.current.connect();
          setHub(plotterRef.current.hub);
        } else {
          // In simulation, just set hub directly
          setHub(plotterRef.current.hub);
        }
        setStatus(simulationMode ? 'Simulation Active' : 'Connected');
      } else {
        await plotterRef.current.disconnect();
        await handleDisconnect();
      }
    } catch (error) {
      addNotification(`Connection error: ${error}`, 'error');
      setStatus('Connection failed');
    } finally {
      setIsLoading(false);
    }
  };

  

  // Command execution with safety checks
  const executeCommand = async (command: () => Promise<void>): Promise<void> => {
    if (!connectionMonitor.current?.isConnectionStable()) {
      throw new Error('Connection unstable');
    }
  
    return commandQueue.current.add(() => {
      return new Promise<void>(async (resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Command timeout'));
        }, COMMAND_TIMEOUT);
  
        try {
          await command();
          clearTimeout(timeoutId);
          resolve();
        } catch (error) {
          clearTimeout(timeoutId);
          reject(error);
        }
      });
    });
  };

  const controlMotorByTime = async (port: string, direction: 'forward' | 'backward') => {
    if (!plotterRef.current) return;
  
    try {
      await plotterRef.current.runMotor(
        port, 
        direction, 
        motorStates[port].speed
      );
      
      // Wait for specified time
      await new Promise(resolve => setTimeout(resolve, motorStates[port].time));
      
      // Stop motor
      await plotterRef.current.stopMotor(port);
      updateMotorState(port, { isMoving: false });
    } catch (error) {
      addNotification(`Timed motor control failed: ${error}`, 'error');
      await emergencyStop();
    }
  };

  useEffect(() => {
    // Debug logging
    if (plotterRef.current) {
      console.log('Plotter status:', {
        isConnected: plotterRef.current.isConnected(),
        motors: {
          A: plotterRef.current.getMotorStatus('A'),
          B: plotterRef.current.getMotorStatus('B'),
          C: plotterRef.current.getMotorStatus('C')
        }
      });
    }
  }, [plotterRef.current?.hub]);

  // Movement validation and execution

  const moveToPosition = async (x: number, y: number) => {
    if (!plotterRef.current || !movementValidator.current) {
      addNotification('System not ready', 'error');
      return;
    }
  
    const validationResult = movementValidator.current.validatePath(currentX, currentY, x, y);
    if (!validationResult.valid) {
      addNotification(`Invalid movement: ${validationResult.reason}`, 'error');
      return;
    }
  
    try {
      setIsMoving(true);
      const deltaX = x - currentX;
      const deltaY = y - currentY;
      //const degreesX = deltaX * calibration.x;
      //const degreesY = deltaY * calibration.y;
      const degreesX = deltaX * calibration.degreesPerMM.X;  // or calibration.x if using simple format
      const degreesY = deltaY * calibration.degreesPerMM.Y;  // or calibration.y if using simple format
  
      // Update target positions
      updateMotorState('B', { targetPosition: degreesX, isMoving: true });
      updateMotorState('A', { targetPosition: degreesY, isMoving: true });
  
      // Set acceleration/deceleration
      await plotterRef.current.setAccelerationTime('B', acceleration.B);
      await plotterRef.current.setAccelerationTime('A', acceleration.A);
      await plotterRef.current.setDecelerationTime('B', deceleration.B);
      await plotterRef.current.setDecelerationTime('A', deceleration.A);
  
      // Move both motors
      await Promise.all([
        plotterRef.current.rotateByDegrees('B', degreesX, motorStates.B.speed),
        plotterRef.current.rotateByDegrees('A', degreesY, motorStates.A.speed)
      ]);
  
      setCurrentX(x);
      setCurrentY(y);
    } catch (error) {
      addNotification(`Movement failed: ${error}`, 'error');
      await emergencyStop();
    } finally {
      setIsMoving(false);
      updateMotorState('B', { targetPosition: null, isMoving: false });
      updateMotorState('A', { targetPosition: null, isMoving: false });
    }
  };

  const setPenPosition = async (position: number) => {
    if (!plotterRef.current) return;
  
    try {
      // Clamp position between -45 and 0 degrees
      const clampedPosition = Math.max(-45, Math.min(0, position));
      await plotterRef.current.rotateByDegrees('C', clampedPosition, motorStates.C.speed);
    } catch (error) {
      addNotification(`Pen movement failed: ${error}`, 'error');
    }
  };

  const togglePen = async () => {
    if (!plotterRef.current) return;
    try {
      // Use PEN_POSITIONS constants and current position to determine next position
      const newPosition = motorStates.C.currentPosition === PEN_POSITIONS.DOWN ? 
        PEN_POSITIONS.UP : PEN_POSITIONS.DOWN;
      await plotterRef.current.rotateByDegrees('C', newPosition, 30); // Lower speed for pen movement
      updateMotorState('C', { currentPosition: newPosition });
    } catch (error) {
      addNotification(`Pen movement failed: ${error}`, 'error');
    }
  };

  const updatePositions = (x: number, y: number) => {
    setCurrentX(x)
    setCurrentY(y)
    setTargetX(x)
    setTargetY(y)
  }

  const toggleSimulationMode = () => {
    if (isMoving) {
      addNotification('Cannot switch modes while executing', 'error');
      return;
    }
    
    if (hub) {
      // Disconnect first if connected
      handleDisconnect();
    }
    setSimulationMode(!simulationMode);
    // Reset positions when switching modes
    setCurrentX(0);
    setCurrentY(0);
    setPenState('up');
  };

  const updateMotorState = (port: string, updates: Partial<MotorState>) => {
    setMotorStates(prev => ({
      ...prev,
      [port]: { 
        ...prev[port], 
        ...updates,
        // Ensure currentPosition is always a number
        currentPosition: typeof updates.currentPosition === 'number' ? 
          updates.currentPosition : prev[port].currentPosition,
        // Ensure speed is always a number
        speed: typeof updates.speed === 'number' ? 
          updates.speed : prev[port].speed,
      }
    }));
  };

  // Core motor control functions
  const controlMotor = async (port: string, direction: 'forward' | 'backward') => {
    if (!plotterRef.current) return;
  
    try {
      await plotterRef.current.runMotor(
        port, 
        direction, 
        motorStates[port].speed
      );
      updateMotorState(port, { isMoving: true });
    } catch (error) {
      addNotification(`Error controlling motor ${port}: ${error}`, 'error');
    }
  };

  const stopMotor = async (port: string) => {
    if (!plotterRef.current) return;
  
    try {
      await plotterRef.current.stopMotor(port);
      updateMotorState(port, { isMoving: false });
    } catch (error) {
      addNotification(`Error stopping motor ${port}: ${error}`, 'error');
    }
  };

  // Add effect to track motor positions
  // Add effect to track motor positions
  useEffect(() => {
    if (!plotterRef.current || !hub) return

    const interval = setInterval(() => {
      ['A', 'B', 'C'].forEach(port => {
        const position = plotterRef.current?.getMotorPosition(port)
        if (position !== undefined) {
          updateMotorState(port, { currentPosition: position })
        }
      })
    }, MONITORING_INTERVAL)  // Use the constant here

    return () => clearInterval(interval)
  }, [hub])

  const emergencyStop = async () => {
    if (!plotterRef.current) return;
  
    setIsMoving(false);
    setCurrentSequence(null);
    setExecutionProgress(0);
    commandQueue.current.clear();
  
    try {
      await Promise.all(
        Object.keys(motorStates).map(port => 
          plotterRef.current?.stopMotor(port)
        )
      );
      addNotification('Emergency stop activated', 'info');
    } catch (error) {
      addNotification('Emergency stop failed: ' + error, 'error');
    }
  };

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        emergencyStop()
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [])

  interface DrawingControlsProps {
    isDrawingMode: boolean;
    setIsDrawingMode: (mode: boolean) => void;
    penState: 'up' | 'down';
    setPenState: (state: 'up' | 'down') => void;
    isConnected?: boolean;
    isMoving?: boolean;
  }
  
  const DrawingControls = ({
    isDrawingMode,
    setIsDrawingMode,
    penState,
    setPenState,
    isConnected = false,
    isMoving = false
  }: DrawingControlsProps) => (
    <div className="flex gap-4 mb-4">
      <button
        onClick={() => setIsDrawingMode(!isDrawingMode)}
        disabled={!isConnected || isMoving}
        className={`
          px-4 py-2 rounded transition-colors
          ${isDrawingMode 
            ? 'bg-blue-500 hover:bg-blue-600 text-white' 
            : 'bg-gray-600 hover:bg-gray-700 text-white'
          }
          ${(!isConnected || isMoving) && 'opacity-50 cursor-not-allowed'}
        `}
        title={!isConnected ? 'Connect plotter to start drawing' : 
               isMoving ? 'Cannot change mode while moving' : 
               isDrawingMode ? 'Exit drawing mode' : 'Start drawing mode'}
      >
        {isDrawingMode ? 'Exit Drawing Mode' : 'Start Drawing'}
      </button>
      
      {isDrawingMode && (
        <button
          onClick={() => setPenState(penState === 'up' ? 'down' : 'up')}
          disabled={!isConnected || isMoving}
          className={`
            px-4 py-2 rounded transition-colors
            ${penState === 'down'
              ? 'bg-green-500 hover:bg-green-600 text-white'
              : 'bg-gray-600 hover:bg-gray-700 text-white'
            }
            ${(!isConnected || isMoving) && 'opacity-50 cursor-not-allowed'}
          `}
          title={!isConnected ? 'Connect plotter to control pen' :
                 isMoving ? 'Cannot move pen while moving' :
                 `Click to move pen ${penState === 'up' ? 'down' : 'up'}`}
        >
          Pen: {penState.toUpperCase()}
        </button>
      )}
    </div>
  );

  // The render section:
  return (
    // Main container changed
      <div className="min-h-screen bg-black text-white p-6">
        {/* Top bar */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex gap-4 items-center">
            <button
              onClick={toggleSimulationMode}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Switch to {simulationMode ? 'Hardware' : 'Simulation'}
            </button>
            <button
              onClick={handleConnection}
              disabled={isLoading}
              className={`px-4 py-2 rounded ${
                hub ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'
              } text-white disabled:opacity-50`}
            >
              {isLoading ? 'Connecting...' : hub ? 'Disconnect' : 'Connect'}
            </button>
            <span className="text-gray-400">Status: {status}</span>
            {hub && (
              <span className="text-green-500">Battery: {hub.batteryLevel}%</span>
            )}
          </div>
          <button
            onClick={emergencyStop}
            className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 
                      font-bold animate-pulse"
          >
            EMERGENCY STOP (ESC)
          </button>
        </div>

        {/* Main content grid */}
        <div className="grid grid-cols-[1fr_400px] gap-6"> {/* Fixed width right column */}
          {/* Left column */}
          <div className="space-y-6">
            {/* Visual Feedback - smaller size */}
            <div className="bg-gray-800 rounded-lg p-4 max-w-[600px]"> {/* Constrained width */}
              <h2 className="text-xl font-bold mb-4">Visual Feedback</h2>
              <VisualFeedback
                motorStates={motorStates}
                currentX={currentX}
                currentY={currentY}
                targetX={targetX}
                targetY={targetY}
                penState={motorStates.C.currentPosition > 0 ? 'down' : 'up'}
                isConnected={!!hub}
                batteryLevel={hub?.batteryLevel || 0}
                signalStrength={signalStrength}
              />
            </div>

            {/* Drawing Controls and Grid */}
            <div className="bg-gray-800 rounded-lg p-4">
              <DrawingControls 
                isDrawingMode={isDrawingMode} 
                setIsDrawingMode={setIsDrawingMode}
                penState={penState}
                setPenState={setPenState}
                isConnected={simulationMode || !!(hub && plotterRef.current?.isConnected())}
                isMoving={isMoving}
              />
              <CoordinateGrid
                currentX={currentX}
                currentY={currentY}
                maxX={maxX}
                maxY={maxY}
                onPositionClick={handlePositionClick}
                previewSequence={previewSequence}
                executionProgress={executionProgress}
                isDrawingMode={isDrawingMode}
                onDrawingComplete={handleDrawingComplete}
                setDrawnSequence={setDrawnSequence}
                setPreviewSequence={setPreviewSequence}
                onPlot={handleLoadSequence}  // This will handle the actual plotter movement
                isMoving={isMoving}         // To disable plot button while moving
              />
              
            </div>

            {/* Motor Controls moved down */}
            <div className="bg-gray-800 rounded-lg p-4">
              <ManualControl
                hub={hub}
                motorStates={motorStates}
                controlMotor={controlMotor}
                stopMotor={stopMotor}
                togglePen={togglePen}
              />

              <div className="grid grid-cols-3 gap-4 mt-4">
                {['A', 'B', 'C'].map(port => (
                  <MotorControl
                    key={port}
                    port={port}
                    label={`Motor ${port} ${
                      port === 'A' ? '(Paper Roll)' : 
                      port === 'B' ? '(Pen Left/Right)' : 
                      '(Pen Up/Down)'
                    }`}
                    settings={motorStates[port]}
                    acceleration={acceleration[port]}
                    deceleration={deceleration[port]}
                    hub={hub}
                    isLoading={isMoving}
                    onUpdateSettings={(key, value) => 
                      updateMotorState(port, { [key]: value })}
                    onUpdateAcceleration={(value) => 
                      setAcceleration(prev => ({...prev, [port]: value}))}
                    onUpdateDeceleration={(value) => 
                      setDeceleration(prev => ({...prev, [port]: value}))}
                    onControl={(direction) => controlMotor(port, direction)}
                    onControlTimed={(direction) => controlMotorByTime(port, direction)}
                    onStop={() => stopMotor(port)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Right column - fixed width */}
          <div className="space-y-6">
            <div className="bg-gray-800 rounded-lg p-4">
              <SequenceManager
                onLoadSequence={handleLoadSequence}
                onPreviewSequence={handlePreviewSequence}
                isExecuting={isMoving}
                drawingArea={{
                  width: A5_SIZE.width,
                  height: A5_SIZE.height
                }}
                addNotification={addNotification}
              />
            </div>

            <div className="bg-gray-800 rounded-lg p-4">
              <SafetyDiagnostics
                hub={hub}
                limits={safetyLimits}
                onLimitChange={(port, limit) => {
                  setSafetyLimits(prev => ({
                    ...prev,
                    [port]: limit
                  }));
                  if (safetyController.current) {
                    safetyController.current.updateLimits(port, limit);
                  }
                }}
              />
            </div>

            <div className="bg-gray-800 rounded-lg p-4">
              <CalibrationTool
                onCalibrate={handleCalibration}
                hub={hub}
                settings={{
                  degreesPerMM: {
                    X: calibration.x,
                    Y: calibration.y
                  },
                  maxTravel: {
                    X: MOVEMENT_BOUNDS.maxX,
                    Y: MOVEMENT_BOUNDS.maxY
                  }
                }}
              />
            </div>

            <div className="bg-gray-800 rounded-lg p-4">
              <PositionPresets
                onMoveToPosition={validateAndMove}
                currentX={currentX}
                currentY={currentY}
                calibration={calibration}
                onError={(message) => addNotification(message, 'error')}
              />
            </div>
          </div>
        </div>

        {/* Notifications */}
        <Notifications 
          notifications={notifications}
          onDismiss={dismissNotification}
        />
      </div>
  );
}
