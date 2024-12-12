// lib/plotter.simulation.ts

import type { Device } from './types';
import { Position, PlotterSequence } from '@/lib/types'
import { CommandQueue } from '@/lib/CommandQueue'


interface SimulatedMotor extends Device {
  currentPosition: number;
  targetPosition: number | null;
  currentPower: number;
  isMoving: boolean;
  listeners: Map<string, Function[]>;
  interval?: ReturnType<typeof setInterval>;
}

export class PlotterControl {
  poweredUP: any;
  hub: any;
  motors: Record<string, SimulatedMotor>;
  positionTracking: Record<string, number>;
  intervalId: ReturnType<typeof setInterval> | null;  // Fixed timer type
  isMoving: boolean;
  private positionUpdateCallbacks: ((position: Position) => void)[] = [];
  public commandQueue: CommandQueue;

  constructor(private readonly simulationMode = true) {
    this.hub = {
      name: 'Simulated Hub',
      connect: async () => Promise.resolve(),
      disconnect: async () => Promise.resolve(),
      batteryLevel: 100,
      on: (event: string, callback: Function) => {
        if (event === 'disconnect') {
          // Store disconnect callback if needed
        }
      }
    };

    this.motors = {
      A: this.createSimulatedMotor('A'),
      B: this.createSimulatedMotor('B'),
      C: this.createSimulatedMotor('C')
    };

    this.positionTracking = {
      A: 0,
      B: 0,
      C: 0
    };

    this.intervalId = null;
    this.isMoving = false;
    this.commandQueue = new CommandQueue();
  }

  onPositionUpdate(callback: (position: Position) => void) {
    this.positionUpdateCallbacks.push(callback);
    return () => {
      this.positionUpdateCallbacks = this.positionUpdateCallbacks.filter(cb => cb !== callback);
    };
  }

  private notifyPositionUpdate(position: Position) {
    this.positionUpdateCallbacks.forEach(callback => callback(position));
  }

  private createSimulatedMotor(portName: string): SimulatedMotor {
    return {
      portName,
      typeName: 'motor',
      currentPosition: 0,
      targetPosition: null,
      currentPower: 0,
      isMoving: false,
      listeners: new Map(),
      interval: undefined,

      // Device interface methods
      on(event: string, callback: (data: any) => void): void {
        if (!this.listeners.has(event)) {
          this.listeners.set(event, []);
        }
        this.listeners.get(event)?.push(callback);
      },

      removeAllListeners(event: string): void {
        this.listeners.delete(event);
      },

      async setPower(power: number): Promise<void> {
        this.currentPower = power;
        this.isMoving = power !== 0;
      },

      async brake(): Promise<void> {
        this.currentPower = 0;
        this.isMoving = false;
        this.targetPosition = null;
      },

      async rotateByDegrees(degrees: number, speed: number): Promise<void> {
        this.targetPosition = this.currentPosition + degrees;
        this.currentPower = degrees > 0 ? speed : -speed;
        this.isMoving = true;

        if (this.interval) {
          clearInterval(this.interval);
        }

        return new Promise<void>((resolve) => {
          this.interval = setInterval(() => {
            const increment = (this.currentPower / 100) * 2;
            this.currentPosition += increment;

            if (Math.abs(this.currentPosition - this.targetPosition!) < 0.1) {
              this.currentPosition = this.targetPosition!;
              this.isMoving = false;
              this.currentPower = 0;
              clearInterval(this.interval);
              resolve();
            }

            const rotateListeners = this.listeners.get('rotate') || [];
            rotateListeners.forEach(listener => listener(this.currentPosition));
          }, 50);
        });
      },

      async setAccelerationTime(ms: number): Promise<void> {
        // Simulate acceleration time setting
        await new Promise(resolve => setTimeout(resolve, 10));
      },

      async setDecelerationTime(ms: number): Promise<void> {
        // Simulate deceleration time setting
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    };
  }

  async connect(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 500));
    this.startPositionSimulation();
    return Promise.resolve();
  }

  private startPositionSimulation() {
    this.intervalId = setInterval(() => {
      Object.values(this.motors).forEach(motor => {
        if (motor.isMoving && motor.currentPower !== 0) {
          const increment = (motor.currentPower / 100) * 2;
          motor.currentPosition += increment;
          
          // Stop if target reached
          if (motor.targetPosition !== null && 
              Math.abs(motor.currentPosition - motor.targetPosition) < 0.1) {
            motor.currentPosition = motor.targetPosition;
            motor.isMoving = false;
            motor.currentPower = 0;
          }
          
          this.positionTracking[motor.portName] = motor.currentPosition;
          const rotateListeners = motor.listeners.get('rotate') || [];
          rotateListeners.forEach(listener => listener(motor.currentPosition));
          this.notifyPositionUpdate({
            x: this.positionTracking.B,
            y: this.positionTracking.A
          });
        }
      });
    }, 50);
  }

  async disconnect(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    this.cleanup();
    return Promise.resolve();
  }

  cleanup(): void {
    Object.values(this.motors).forEach(motor => {
      motor.currentPosition = 0;
      motor.currentPower = 0;
      motor.isMoving = false;
      motor.targetPosition = null;
      motor.listeners.clear();
      if (motor.interval) {
        clearInterval(motor.interval);
      }
    });
    
    this.positionTracking = {
      A: 0,
      B: 0,
      C: 0
    };
    this.isMoving = false;
  }

  async runMotor(motorPort: string, direction: string, speed = 50): Promise<void> {
    const motor = this.motors[motorPort];
    if (!motor) throw new Error(`Motor ${motorPort} not connected`);

    motor.currentPower = direction === 'forward' ? speed : -speed;
    motor.isMoving = true;
  }

  async stopMotor(motorPort: string): Promise<void> {
    const motor = this.motors[motorPort];
    if (!motor) throw new Error(`Motor ${motorPort} not connected`);
    
    motor.currentPower = 0;
    motor.isMoving = false;
    motor.targetPosition = null;
  }

  async rotateByDegrees(motorPort: string, degrees: number, speed: number): Promise<void> {
    const motor = this.motors[motorPort];
    if (!motor) throw new Error(`Motor ${motorPort} not connected`);
    
    const targetPosition = motor.currentPosition + degrees;

    motor.targetPosition = targetPosition;
    motor.currentPower = degrees > 0 ? speed : -speed;
    motor.isMoving = true;

    if (motor.interval) {
      clearInterval(motor.interval);
    }

    return new Promise<void>((resolve) => {  // explicit Promise type
      motor.interval = setInterval(() => {
        // Update position based on speed and direction
        const increment = (motor.currentPower / 100) * 2;
        motor.currentPosition += increment;

        // Check if target reached
        if (Math.abs(motor.currentPosition - targetPosition) < 0.1) {
          motor.currentPosition = targetPosition;
          motor.isMoving = false;
          motor.currentPower = 0;
          clearInterval(motor.interval);
          resolve();
        }

        // Emit position update
        const rotateListeners = motor.listeners.get('rotate') || [];
        rotateListeners.forEach(listener => listener(motor.currentPosition));
      }, 50);
    });
  }

  getMotorPosition(motorPort: string): number {
    return this.positionTracking[motorPort];
  }

  getDeviceAtPort(port: string) {
    return this.motors[port];
  }

  // Add these methods to the simulated hub
  isConnected(): boolean {
    if (this.simulationMode) {
      return true;
    }
    // For real hub, check if it exists and has connected property
    return !!this.hub && (
      // Handle both possible PoweredUP hub properties
      ('connected' in this.hub ? this.hub.connected : this.hub.isConnected)
    );
  }

  getRSSI() {
    return -50;  // Simulate good signal strength
  }
}