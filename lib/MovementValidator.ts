// lib/MovementValidator.ts
import { 
  MOVEMENT_BOUNDS, 
  PlotterSequence, 
  ValidationResult,
  MovementValidatorConfig 
} from '@/lib/types'
//import React, { createContext, useContext } from 'react';

interface MovementBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  // paper size
  paperWidth: number;  // A5 width 148mm
  paperHeight: number; // A5 height 210mm
  safeZones?: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }[];
  dangerZones?: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }[];
}

export class MovementValidator {
  private bounds: MovementBounds
  private calibration: { x: number, y: number }
  private readonly simulationMode: boolean

  constructor(
    bounds: MovementBounds = MOVEMENT_BOUNDS,
    calibration: { x: number, y: number },
    simulationMode: boolean = false
    
  ) {
    this.bounds = bounds;
    this.calibration = calibration;
    this.simulationMode = simulationMode;
  }

  validatePosition(x: number, y: number): { valid: boolean, reason?: string } {
    if (this.simulationMode) {
      return { valid: true };
    }

    // Check basic bounds
    if (x < this.bounds.minX || x > this.bounds.maxX) {
      return {
        valid: false,
        reason: `X position ${x} outside bounds (${this.bounds.minX}-${this.bounds.maxX})`
      }
    }

    if (y < this.bounds.minY || y > this.bounds.maxY) {
      return {
        valid: false,
        reason: `Y position ${y} outside bounds (${this.bounds.minY}-${this.bounds.maxY})`
      }
    }

    // Check paper bounds
    if (x < 0 || x > this.bounds.paperWidth || 
      y < 0 || y > this.bounds.paperHeight) {
      return {
        valid: false,
        reason: 'Position outside paper bounds'
      }
    }

    // Check danger zones
    if (this.bounds.dangerZones) {
      for (const zone of this.bounds.dangerZones) {
        if (this.isInZone(x, y, zone)) {
          return {
            valid: false,
            reason: 'Position is in danger zone'
          }
        }
      }
    }

    return { valid: true }
  }

  validatePath(
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ): { valid: boolean, reason?: string } {
    if (this.simulationMode) {
      return { valid: true };
    }

    // Validate start and end points
    const startValid = this.validatePosition(startX, startY)
    if (!startValid.valid) return startValid

    const endValid = this.validatePosition(endX, endY)
    if (!endValid.valid) return endValid

    // Check path length
    const dx = endX - startX
    const dy = endY - startY
    const pathLength = Math.sqrt(dx * dx + dy * dy)
    
    if (pathLength > Math.max(this.bounds.paperWidth, this.bounds.paperHeight)) {
      return {
        valid: false,
        reason: 'Path length exceeds maximum allowed distance'
      }
    }

    // Check if path intersects with any danger zones
    if (this.bounds.dangerZones) {
      for (const zone of this.bounds.dangerZones) {
        if (this.doesLineIntersectZone(
          startX, startY, endX, endY, zone
        )) {
          return {
            valid: false,
            reason: 'Path crosses danger zone'
          }
        }
      }
    }

    // Calculate required motor movements
    
    const degreesX = dx * this.calibration.x
    const degreesY = dy * this.calibration.y

    // Check if motor movements are within reasonable bounds
    const MAX_DEGREES_PER_MOVE = 360
    if (Math.abs(degreesX) > MAX_DEGREES_PER_MOVE || 
        Math.abs(degreesY) > MAX_DEGREES_PER_MOVE) {
      return {
        valid: false,
        reason: 'Movement requires excessive motor rotation'
      }
    }

    return { valid: true }
  }

  validateSequence(sequence: PlotterSequence): ValidationResult {
    if (this.simulationMode) {
      return { valid: true };
    }

    // Check sequence bounds
    if (sequence.boundingBox.maxX > this.bounds.paperWidth ||
        sequence.boundingBox.maxY > this.bounds.paperHeight ||
        sequence.boundingBox.minX < 0 ||
        sequence.boundingBox.minY < 0) {
      return {
        valid: false,
        reason: 'Sequence exceeds paper bounds'
      };
    }
  
    // Validate moves
    let currentX = 0
    let currentY = 0
    
    for (const move of sequence.moves) {
      const pathValid = this.validatePath(currentX, currentY, move.x, move.y)
      if (!pathValid.valid) {
        return {
          valid: false,
          reason: `Invalid move at (${move.x}, ${move.y}): ${pathValid.reason}`
        }
      }
      currentX = move.x
      currentY = move.y
    }
  
    return { valid: true }
  }

  private isInZone(
    x: number,
    y: number,
    zone: { x1: number, y1: number, x2: number, y2: number }
  ): boolean {
    return x >= zone.x1 && x <= zone.x2 && y >= zone.y1 && y <= zone.y2
  }

  private doesLineIntersectZone(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    zone: { x1: number, y1: number, x2: number, y2: number }
  ): boolean {
    // Check if line intersects with rectangle using line segment intersection
    const lines = [
      // Top line
      { x1: zone.x1, y1: zone.y1, x2: zone.x2, y2: zone.y1 },
      // Right line
      { x1: zone.x2, y1: zone.y1, x2: zone.x2, y2: zone.y2 },
      // Bottom line
      { x1: zone.x1, y1: zone.y2, x2: zone.x2, y2: zone.y2 },
      // Left line
      { x1: zone.x1, y1: zone.y1, x2: zone.x1, y2: zone.y2 }
    ]

    return lines.some(line => 
      this.doLinesIntersect(x1, y1, x2, y2, line.x1, line.y1, line.x2, line.y2)
    )
  }

  private doLinesIntersect(
    x1: number, y1: number, x2: number, y2: number,
    x3: number, y3: number, x4: number, y4: number
  ): boolean {
    const denominator = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3)
    if (denominator === 0) return false

    const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denominator
    const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denominator

    return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1
  }
}
