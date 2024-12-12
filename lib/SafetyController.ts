// lib/SafetyController.ts

import { MONITORING_INTERVAL, NotificationType } from '@/lib/types'

interface SafetyLimits {
  maxSpeed: number
  maxAcceleration: number
  minDegrees: number
  maxDegrees: number
  maxCurrent: number
  maxTemperature: number
  maxMotorLoad: number
}

interface MotorStatus {
  currentPosition: number
  speed: number
  current: number
  temperature: number
  load: number
}

export class SafetyController {
  private limits: Record<string, SafetyLimits>
  private hub: any
  private notifyViolation: (message: string, type: NotificationType) => void
  private stopRequested: boolean = false
  private monitoringInterval: NodeJS.Timeout | null = null

  constructor(
    hub: any, 
    notifyViolation: (message: string, type: NotificationType) => void
  ) {
    this.hub = hub
    this.notifyViolation = notifyViolation
    this.limits = {
      A: {
        maxSpeed: 100,
        maxAcceleration: 500,
        minDegrees: -360,
        maxDegrees: 360,
        maxCurrent: 1000,
        maxTemperature: 50,
        maxMotorLoad: 90
      },
      B: {
        maxSpeed: 100,
        maxAcceleration: 500,
        minDegrees: -180,
        maxDegrees: 180,
        maxCurrent: 1000,
        maxTemperature: 50,
        maxMotorLoad: 90
      },
      C: {
        maxSpeed: 50,
        maxAcceleration: 200,
        minDegrees: -45,
        maxDegrees: 45,
        maxCurrent: 500,
        maxTemperature: 50,
        maxMotorLoad: 90
      }
    }
  }

  startMonitoring() {
    if (this.monitoringInterval) return

    this.monitoringInterval = setInterval(async () => {
      if (!this.hub || typeof this.hub.isConnected !== 'function' || !this.hub.isConnected()) {
        this.stopMonitoring()
        this.notifyViolation('Hub disconnected, stopping safety monitoring', 'error')
        return
      }

      try {
        for (const port of ['A', 'B', 'C']) {
          const status = await this.getMotorStatus(port)
          if (status) {
            this.checkLimits(port, status)
          }
        }
      } catch (error) {
        console.error('Safety monitoring error:', error)
        this.notifyViolation(`Safety monitoring error: ${error}`, 'error')
      }
    }, MONITORING_INTERVAL)
  }

  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = null
    }
  }

  private async getMotorStatus(port: string): Promise<MotorStatus | null> {
    const motor = this.hub.getDeviceAtPort(port)
    if (!motor) return null

    try {
      return {
        currentPosition: typeof motor.getCurrentPosition === 'function' ? await motor.getCurrentPosition() : 0,
        speed: typeof motor.getCurrentSpeed === 'function' ? await motor.getCurrentSpeed() : 0,
        current: typeof motor.getCurrent === 'function' ? await motor.getCurrent() : 0,
        temperature: typeof motor.getTemperature === 'function' ? await motor.getTemperature() : 0,
        load: typeof motor.getLoad === 'function' ? await motor.getLoad() : 0
      }
    } catch (error) {
      this.notifyViolation(`Failed to get motor ${port} status: ${error}`, 'error')
      return null
    }
  }

  private checkLimits(port: string, status: MotorStatus) {
    const limits = this.limits[port]
    
    // Position limits
    if (status.currentPosition < limits.minDegrees) {
      this.handleViolation(port, 'Position below minimum limit', status.currentPosition)
    }
    if (status.currentPosition > limits.maxDegrees) {
      this.handleViolation(port, 'Position above maximum limit', status.currentPosition)
    }

    // Speed and acceleration
    if (Math.abs(status.speed) > limits.maxSpeed) {
      this.handleViolation(port, 'Speed exceeds maximum limit', status.speed)
    }

    // Current draw
    if (status.current > limits.maxCurrent) {
      this.handleViolation(port, 'Current draw too high', status.current)
    }

    // Temperature
    if (status.temperature > limits.maxTemperature) {
      this.handleViolation(port, 'Temperature too high', status.temperature)
    }

    // Motor load
    if (status.load > limits.maxMotorLoad) {
      this.handleViolation(port, 'Motor load too high', status.load)
    }
  }

  private async handleViolation(port: string, reason: string, value: number) {
    const message = `Safety violation on motor ${port}: ${reason} (${value})`
    this.notifyViolation(message, 'error')
    
    if (!this.stopRequested) {
      this.stopRequested = true
      await this.emergencyStop()
      
      // Reset stop request after a delay
      setTimeout(() => {
        this.stopRequested = false
      }, 1000)
    }
  }

  async emergencyStop() {
    this.stopMonitoring()
    
    try {
      await Promise.all(['A', 'B', 'C'].map(async (port) => {
        const motor = this.hub.getDeviceAtPort(port)
        if (motor) {
          try {
            await motor.brake()
          } catch (error) {
            console.error(`Failed to stop motor ${port}:`, error)
            this.notifyViolation(`Failed to stop motor ${port}: ${error}`, 'error')
          }
        }
      }))
      
      this.notifyViolation('Emergency stop activated', 'info')
    } catch (error) {
      this.notifyViolation(`Emergency stop failed: ${error}`, 'error')
    }
  }

  updateLimits(port: string, newLimits: Partial<SafetyLimits>): boolean {
    if (!this.hub) {
      this.notifyViolation('Cannot update limits: No hub connected', 'error');
      return false;
    }
  
    if (!['A', 'B', 'C'].includes(port)) {
      this.notifyViolation(`Invalid port ${port} for limit update`, 'error');
      return false;
    }
  
    this.limits[port] = {
      ...this.limits[port],
      ...newLimits
    };
    
    this.notifyViolation(`Updated limits for motor ${port}`, 'info');
    return true;
  }

  getLimits(port: string): SafetyLimits | null {
    if (!['A', 'B', 'C'].includes(port)) {
      this.notifyViolation(`Invalid port ${port} for getting limits`, 'error')
      return null
    }
    return { ...this.limits[port] }
  }
}