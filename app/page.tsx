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

const convertCalibrationFormat = (settings: CalibrationSettings): SimpleCalibration => {
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
      // More robust motor detection with specific motor check
      await new Promise<void>((resolve) => {
        let attempts = 0;
        const maxAttempts = 10;
        const checkMotors = setInterval(() => {
          const missingMotors: string[] = []; // Explicitly typed as an array of strings
          const motors = ['A', 'B', 'C'];
  
          motors.forEach(port => {
            const motor = plotterRef.current?.getDeviceAtPort(port);
            if (!motor) missingMotors.push(port);
          });
  
          if (missingMotors.length === 0) {
            clearInterval(checkMotors);
            resolve();
          } else if (attempts++ >= maxAttempts) {
            clearInterval(checkMotors);
            // Notify the user which motors are missing
            addNotification(
              `Motors not detected on ports: ${missingMotors.join(', ')}. Check connections.`,
              'info'
            );
            resolve(); // Allow operation to continue
          }
        }, 500);
      });
  
      addNotification('Motors initialized', 'success');
    } catch (error) {
      addNotification(`Motor initialization failed: ${error}`, 'error');
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
    // Update calibration state
    setCalibration({
      ...settings,
      x: settings.degreesPerMM.X,
      y: settings.degreesPerMM.Y
    });
    
    // Update all systems that depend on calibration
    if (movementValidator.current) {
      movementValidator.current = new MovementValidator(
        MOVEMENT_BOUNDS,
        convertCalibrationFormat(settings), // Use new settings, not current state
        simulationMode
      );
    }
    
    if (pathExecutor.current) {
      pathExecutor.current = new PathExecutor(
        plotterRef.current,
        settings,
        simulationMode,
        50,
        30
      );
    }
  };
  
  // Sequence handling functions
  const handleLoadSequence = async (sequence: PlotterSequence) => {
    if (isMoving || !plotterRef.current) {
      addNotification('Cannot execute sequence: System not ready', 'error');
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
      setPreviewSequence(sequence); // Set preview sequence for visualization
  
      if (simulationMode) {
        // Simulation mode execution
        for (let i = 0; i < sequence.moves.length; i++) {
          const move = sequence.moves[i];
          setCurrentX(move.x);
          setCurrentY(move.y);
          if (move.z !== undefined) {
            setPenState(move.z === 0 ? 'up' : 'down');
          }
          setExecutionProgress(((i + 1) / sequence.moves.length) * 100);
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } else {
        // Hardware mode execution
        for (let i = 0; i < sequence.moves.length; i++) {
          const move = sequence.moves[i];
          
          await executeCommand(async () => {
            try {
              // Handle pen movement if needed
              if (move.z !== undefined) {
                const position = move.z === 0 ? PEN_POSITIONS.UP : PEN_POSITIONS.DOWN;
                await setPenPosition(position);
              }
  
              // Move to position if changed
              if (move.x !== currentX || move.y !== currentY) {
                await moveToPosition(move.x, move.y);
              }
            } catch (error) {
              throw new Error(`Move failed at step ${i + 1}: ${error}`);
            }
          });
  
          setExecutionProgress(((i + 1) / sequence.moves.length) * 100);
        }
  
        // Ensure pen is up at end
        await setPenPosition(PEN_POSITIONS.UP);
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
      setPreviewSequence(null);
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

  const plotterRef = useRef<PlotterControl>(new PlotterControl(simulationMode));
  const commandQueueRef = useRef<CommandQueue>(plotterRef.current.commandQueue);

  // Single unified initialization effect
  useEffect(() => {
    let initializeTimeout: ReturnType<typeof setTimeout>;
    let isInitializing = false;

    const initializePlotter = async () => {
      if (isInitializing) return;
      isInitializing = true;

      try {
        // Wait for PoweredUP to be available in non-simulation mode
        if (!simulationMode && typeof window !== 'undefined' && !window.poweredup?.default) {
          initializeTimeout = setTimeout(initializePlotter, 100);
          return;
        }

        const plotter = plotterRef.current;

        // Connect in hardware mode
        if (!simulationMode) {
          await plotter.connect();
          setHub(plotter.hub);
          setStatus('Connected');

          // Initialize safety systems
          safetyController.current = new SafetyController(
            plotter.hub,
            (message: string, type: NotificationType) => addNotification(message, type)
          );
          
          connectionMonitor.current = new ConnectionMonitor(
            plotter.hub,
            (message: string) => addNotification(message, 'info'),
            handleDisconnect
          );

          // Start monitoring
          safetyController.current.startMonitoring();
          connectionMonitor.current.startMonitoring();
        } else {
          setStatus('Simulation Mode');
          addNotification('Running in simulation mode', 'info');
        }

        // Initialize common systems
        movementValidator.current = new MovementValidator(
          MOVEMENT_BOUNDS,
          calibration,
          simulationMode
        );

        pathExecutor.current = new PathExecutor(
          plotter,
          calibration,
          simulationMode,
          50, // moveSpeed
          30  // drawSpeed
        );

        // Initialize position if in hardware mode
        if (!simulationMode && plotter.isConnected()) {
          // Verify all motors are attached
          const motors = ['A', 'B', 'C'];
          const allMotorsReady = motors.every(port => plotter.motors[port]);
          
          if (!allMotorsReady) {
            throw new Error('Not all motors are attached');
          }

          // Initialize position
          await setPenPosition(PEN_POSITIONS.UP);
          await moveToPosition(HOME_POSITION.x, HOME_POSITION.y);
          addNotification('Initialized to home position', 'success');
        }

      } catch (error) {
        console.error('Initialization error:', error);
        addNotification(`Initialization failed: ${error}`, 'error');
        
        if (!simulationMode) {
          // Clean up on failure
          await handleDisconnect();
        }
      } finally {
        isInitializing = false;
      }
    };

    // Start initialization
    initializePlotter();

    // Cleanup function
    return () => {
      if (initializeTimeout) {
        clearTimeout(initializeTimeout);
      }

      if (!simulationMode) {
        safetyController.current?.stopMonitoring();
        connectionMonitor.current?.stopMonitoring();
      }

      plotterRef.current?.disconnect();
      
      // Clear all refs
      safetyController.current = null;
      movementValidator.current = null;
      connectionMonitor.current = null;
      pathExecutor.current = null;
    };
  }, [simulationMode, calibration]); // Only re-run on mode or calibration changes

  // Handle disconnection
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
      console.error('Disconnect error:', error);
      addNotification(`Disconnect error: ${error}`, 'error');
    }
  };

  // Helper for position initialization
  const initializePosition = async () => {
    if (!plotterRef.current || !hub) return;
    
    try {
      await setPenPosition(PEN_POSITIONS.UP);
      await moveToPosition(HOME_POSITION.x, HOME_POSITION.y);
      addNotification('Initialized to home position', 'success');
    } catch (error) {
      console.error('Position initialization error:', error);
      addNotification(`Position initialization failed: ${error}`, 'error');
      await emergencyStop();
    }
  };

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
          
          // Instead of calling initializePlotter, reinitialize directly:
          await initializePosition();
          if (movementValidator.current) {
            movementValidator.current = new MovementValidator(
              MOVEMENT_BOUNDS,
              calibration,
              simulationMode
            );
          }
        } else {
          setHub(plotterRef.current.hub);
        }
        setStatus(simulationMode ? 'Simulation Active' : 'Connected');
      } else {
        await disconnect();
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
    if (!plotterRef.current) {
      throw new Error('Plotter not initialized');
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
  
    await executeCommand(async () => {
      try {
        await plotterRef.current!.runMotor(
          port,
          direction,
          motorStates[port].speed
        );
        
        await new Promise(resolve => setTimeout(resolve, motorStates[port].time));
        
        await plotterRef.current!.stopMotor(port);
        updateMotorState(port, { isMoving: false });
      } catch (error) {
        addNotification(`Timed motor control failed: ${error}`, 'error');
        await emergencyStop();
        throw error;
      }
    });
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
  
    await executeCommand(async () => {
      try {
        setIsMoving(true);
        const deltaX = x - currentX;
        const deltaY = y - currentY;
        const degreesX = deltaX * calibration.degreesPerMM.X;
        const degreesY = deltaY * calibration.degreesPerMM.Y;
  
        // Update target positions
        updateMotorState('B', { targetPosition: degreesX, isMoving: true });
        updateMotorState('A', { targetPosition: degreesY, isMoving: true });
  
        // Execute movement
        await Promise.all([
          plotterRef.current!.runMotor('B', degreesX >= 0 ? 'forward' : 'backward', motorStates.B.speed),
          plotterRef.current!.runMotor('A', degreesY >= 0 ? 'forward' : 'backward', motorStates.A.speed)
        ]);
  
        // Wait for movement using time approximation
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        const moveTime = (distance / motorStates.B.speed) * 1000; // rough approximation
        await new Promise(resolve => setTimeout(resolve, moveTime));
  
        // Stop motors
        await Promise.all([
          plotterRef.current!.stopMotor('B'),
          plotterRef.current!.stopMotor('A')
        ]);
  
        setCurrentX(x);
        setCurrentY(y);
      } catch (error) {
        addNotification(`Movement failed: ${error}`, 'error');
        await emergencyStop();
        throw error;
      } finally {
        setIsMoving(false);
        updateMotorState('B', { targetPosition: null, isMoving: false });
        updateMotorState('A', { targetPosition: null, isMoving: false });
      }
    });
  };

  const setPenPosition = async (position: number) => {
    if (!plotterRef.current) return;
    
    try {
      // Always use timed movement for pen
      const direction = position === PEN_POSITIONS.UP ? 'forward' : 'backward';
      await plotterRef.current.runMotor('C', direction, 50);
      await new Promise(resolve => setTimeout(resolve, 400));
      await plotterRef.current.stopMotor('C');
      
      // Update state
      updateMotorState('C', { currentPosition: position });
    } catch (error) {
      addNotification(`Pen movement failed: ${error}`, 'error');
    }
  };

  const togglePen = async () => {
    if (!plotterRef.current) return;
    
    try {
      // Use executeCommand for safety
      await executeCommand(async () => {
        const nextState = motorStates.C.currentPosition === PEN_POSITIONS.DOWN ? 'up' : 'down';
        const direction = nextState === 'up' ? 'forward' : 'backward';
        
        try {
          // Use timed movement for reliability
          await plotterRef.current!.runMotor('C', direction, 50);
          await new Promise(resolve => setTimeout(resolve, 400));
          await plotterRef.current!.stopMotor('C');
          
          // Update state after successful movement
          updateMotorState('C', {
            currentPosition: nextState === 'up' ? PEN_POSITIONS.UP : PEN_POSITIONS.DOWN,
            isMoving: false,
            targetPosition: null
          });
        } catch (error) {
          // Clean up motor state on error
          await plotterRef.current!.stopMotor('C');
          updateMotorState('C', {
            isMoving: false,
            targetPosition: null
          });
          throw error; // Rethrow for executeCommand to handle
        }
      });
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
