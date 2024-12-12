// lib/plotter.ts
import { Position, PlotterSequence } from '@/lib/types'
import { CommandQueue } from '@/lib/CommandQueue'

declare global {
  interface Window {
    PoweredUP: any
  }
}

export class PlotterControl {
  poweredUP: any;
  hub: any;
  motors: Record<string, any> = {
    A: null,
    B: null,
    C: null
  };
  private readonly simulationMode: boolean;
  private positionUpdateCallbacks: ((position: Position) => void)[] = [];
  public commandQueue: CommandQueue;    

  constructor(simulationMode: boolean = false) {
    this.simulationMode = simulationMode;
    this.commandQueue = new CommandQueue();  // Initialize CommandQueue
    if (typeof window !== 'undefined' && window.PoweredUP) {
      this.poweredUP = new window.PoweredUP.PoweredUP();
    }
  }

  async connect(): Promise<void> {
    if (!this.poweredUP && !this.simulationMode) {
      throw new Error('PoweredUP not initialized');
    }

    return new Promise((resolve, reject) => {
      this.poweredUP.on('discover', async (discoveredHub: any) => {
        try {
          console.log('Hub discovered:', discoveredHub);
          await discoveredHub.connect();
          this.hub = discoveredHub;
          console.log('Connected to hub:', discoveredHub.name);

          discoveredHub.on('attach', (device: any) => {
            console.log('Device attached:', {
              port: device.portName,
              type: device.type,
              typeName: device.typeName
            });

            if (['A', 'B', 'C'].includes(device.portName)) {
              this.motors[device.portName] = device;
            }
          });

          discoveredHub.on('disconnect', () => {
            this.hub = null;
            this.motors = { A: null, B: null, C: null };
          });

          resolve();
        } catch (error) {
          console.error('Connection failed:', error);
          reject(error);
        }
      });

      try {
        console.log('Starting scan...');
        this.poweredUP.scan();
      } catch (error) {
        console.error('Scan failed:', error);
        reject(error);
      }
    });
  }

  async disconnect(): Promise<void> {
    if (this.hub) {
      await this.hub.disconnect();
      this.motors = { A: null, B: null, C: null };
      this.hub = null;
    }
  }

  onPositionUpdate(callback: (position: Position) => void) {
    this.positionUpdateCallbacks.push(callback);
    return () => {
      this.positionUpdateCallbacks = this.positionUpdateCallbacks.filter(cb => cb !== callback);
    };
  }

  //notify position updates
  private notifyPositionUpdate(position: Position) {
    this.positionUpdateCallbacks.forEach(callback => callback(position));
  }

  isConnected(): boolean {
    return !!this.hub?.connected;
  }

  getDeviceAtPort(port: string) {
    // First check our motors object
    if (this.motors[port]) {
      return this.motors[port];
    }
    // Then check the hub if available
    if (this.hub?.getDeviceAtPort) {
      const device = this.hub.getDeviceAtPort(port);
      if (device) {
        // Cache the device in our motors object
        this.motors[port] = device;
        return device;
      }
    }
    return null;
  }

  async rotateByDegrees(port: string, degrees: number, speed: number): Promise<void> {
    const motor = this.getDeviceAtPort(port);
    if (!motor) {
      throw new Error(`Motor ${port} not found or not properly initialized`);
    }

    try {
      await motor.rotateByDegrees(degrees, speed);
    } catch (error) {
      console.error(`Error rotating motor ${port}:`, error);
      throw error;
    }
  }

  async setPower(port: string, power: number): Promise<void> {
    const motor = this.getDeviceAtPort(port);
    if (!motor) return;
    
    try {
      await motor.setPower(power);
    } catch (error) {
      console.error(`Error setting power for motor ${port}:`, error);
      throw error;
    }
  }

  async brake(port: string): Promise<void> {
    const motor = this.getDeviceAtPort(port);
    if (!motor) return;
    
    try {
      await motor.brake();
    } catch (error) {
      console.error(`Error braking motor ${port}:`, error);
      throw error;
    }
  }

  getMotorPosition(port: string): number {
    const motor = this.getDeviceAtPort(port);
    return motor?.currentPosition || 0;
  }

  getMotorStatus(port: string) {
    const motor = this.getDeviceAtPort(port);
    return {
      exists: !!motor,
      isAbsoluteMotor: motor && typeof motor.rotateByDegrees === 'function',
      position: this.getMotorPosition(port)
    };
  }

  async setAccelerationTime(port: string, ms: number): Promise<void> {
    const motor = this.getDeviceAtPort(port);
    if (!motor) return;
    await motor.setAccelerationTime(ms);
  }

  async setDecelerationTime(port: string, ms: number): Promise<void> {
    const motor = this.getDeviceAtPort(port);
    if (!motor) return;
    await motor.setDecelerationTime(ms);
  }

  // Add these for compatibility with existing code
  async runMotor(port: string, direction: string, speed = 50): Promise<void> {
    const motor = this.getDeviceAtPort(port);
    if (!motor) return;

    try {
      const power = direction === 'forward' ? speed : -speed;
      await motor.setPower(power);
    } catch (error) {
      console.error(`Error running motor ${port}:`, error);
      throw error;
    }
  }

  async stopMotor(port: string): Promise<void> {
    return this.brake(port);
  }

  // Position movement
  async moveTo(x: number, y: number): Promise<void> {
    try {
      const motorX = this.motors['B']; // Pen left/right
      const motorY = this.motors['A']; // Paper roll
      
      if (!motorX || !motorY) {
        throw new Error('Motors not initialized. Check connection and motor ports A (Y) and B (X).');
      }

      // Calculate degrees based on calibration
      const degreesX = x * 10; // Using default calibration or this.calibration.x
      const degreesY = y * 10; // Using default calibration or this.calibration.y

      // Execute movements with proper error handling
      await Promise.all([
        this.rotateByDegrees('B', degreesX, 50),
        this.rotateByDegrees('A', degreesY, 50)
      ]);
    } catch (error) {
      console.error('Position movement failed:', error);
      throw error;
    }
  }

  // manually update position (useful for simulation)
  updatePosition(x: number, y: number) {
    this.notifyPositionUpdate({ x, y });
  }
}