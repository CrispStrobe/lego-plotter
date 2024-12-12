// lib/pathUtils.ts

import { SimpleCalibration, CalibrationSettings, Point, PathSegment, PlotterMove, DrawingArea, PlotterSequence, BoundingBox, MOVEMENT_BOUNDS, Device } from '@/lib/types'
import { MovementValidator } from '@/lib/MovementValidator'
import { PlotterControl } from '@/lib/plotter'

export class PathProcessor {
  static validateAndScalePath(
    moves: PlotterMove[], 
    drawingArea: DrawingArea,
    simulationMode: boolean = false
  ): PlotterMove[] {
    // In simulation mode, we might want to be more lenient with bounds
    if (simulationMode) {
      return moves.map(move => ({
        ...move,
        x: Math.max(0, Math.min(move.x, drawingArea.width)),
        y: Math.max(0, Math.min(move.y, drawingArea.height))
      }));
    }
    
    // First pass: find bounds
    const bounds = moves.reduce((acc, move) => ({
      minX: Math.min(acc.minX, move.x),
      maxX: Math.max(acc.maxX, move.x),
      minY: Math.min(acc.minY, move.y),
      maxY: Math.max(acc.maxY, move.y),
    }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });

    // Calculate required scaling
    const xScale = drawingArea.width / (bounds.maxX - bounds.minX);
    const yScale = drawingArea.height / (bounds.maxY - bounds.minY);
    const scale = Math.min(xScale, yScale) * 0.9; // 90% to leave margin

    // Second pass: scale and validate
    const scaledMoves = moves.map(move => ({
      ...move,
      x: (move.x - bounds.minX) * scale,
      y: (move.y - bounds.minY) * scale,
    }));

    // Validate all moves are within bounds
    const invalid = scaledMoves.find(move => 
      move.x < 0 || move.x > drawingArea.width ||
      move.y < 0 || move.y > drawingArea.height
    );

    if (invalid) {
      throw new Error('Path contains moves outside drawing area');
    }

    return scaledMoves;
  }

  static calculateBoundingBox(moves: PlotterMove[]): BoundingBox {
    if (!moves.length) {
      return { minX: 0, maxX: 0, minY: 0, maxY: 0 }
    }

    return moves.reduce(
      (box, move) => ({
        minX: Math.min(box.minX, move.x),
        maxX: Math.max(box.maxX, move.x),
        minY: Math.min(box.minY, move.y),
        maxY: Math.max(box.maxY, move.y)
      }),
      { 
        minX: Infinity, 
        maxX: -Infinity, 
        minY: Infinity, 
        maxY: -Infinity 
      }
    )
  }

  static optimizePlotterMoves(
    moves: PlotterMove[], 
    simulationMode: boolean = false
  ): PlotterMove[] {
    // In simulation mode, we might want to skip optimization
    if (simulationMode) {
      return moves;
    }

    // Original optimization logic
    return moves.reduce((acc, move, i) => {
      if (i === 0) return [move];
      
      const prev = acc[acc.length - 1];
      if (prev.type === move.type && move.type === 'draw') {
        prev.x = move.x;
        prev.y = move.y;
        return acc;
      }
      
      return [...acc, move];
    }, [] as PlotterMove[]);
  }
}

export class PathOptimizer {
  static optimizePath(
    segments: PathSegment[],
    simulationMode: boolean = false
  ): PathSegment[] {
    // In simulation mode, we might want to skip optimization
    if (simulationMode) {
      return segments;
    }
    if (segments.length <= 1) return segments

    const optimized: PathSegment[] = [segments[0]]
    
    for (let i = 1; i < segments.length; i++) {
      const current = segments[i]
      const previous = optimized[optimized.length - 1]

      // If endpoints match and types are the same, combine paths
      if (current.type === previous.type &&
          current.start.x === previous.end.x &&
          current.start.y === previous.end.y) {
        previous.end = current.end
      } else {
        optimized.push(current)
      }
    }

    return optimized
  }

  static calculatePathLength(segments: PathSegment[]): number {
    return segments.reduce((total, segment) => {
      const dx = segment.end.x - segment.start.x
      const dy = segment.end.y - segment.start.y
      return total + Math.sqrt(dx * dx + dy * dy)
    }, 0)
  }

  static estimateExecutionTime(
    segments: PathSegment[],
    moveSpeed: number,
    drawSpeed: number,
    simulationMode: boolean = false
  ): number {
    // In simulation mode, we might want to return a simplified estimate
    if (simulationMode) {
      return segments.length * 100; // 100ms per segment in simulation
    }
    return segments.reduce((total, segment) => {
      const distance = Math.sqrt(
        Math.pow(segment.end.x - segment.start.x, 2) +
        Math.pow(segment.end.y - segment.start.y, 2)
      )
      const speed = segment.type === 'move' ? moveSpeed : drawSpeed
      return total + (distance / speed)
    }, 0)
  }
}

export class PathExecutor {
  private readonly validator: MovementValidator;  // Declare as class property
  private readonly calibration: SimpleCalibration;
  private currentX: number = 0;
  private currentY: number = 0;

  constructor(
    private readonly plotter: PlotterControl,
    calibrationSettings: CalibrationSettings,
    private readonly simulationMode: boolean = false,
    private readonly moveSpeed: number = 50,
    private readonly drawSpeed: number = 30,
    validatorOverride?: MovementValidator
  ) {
    // Convert CalibrationSettings to SimpleCalibration
    this.calibration = {
      x: calibrationSettings.degreesPerMM.X,
      y: calibrationSettings.degreesPerMM.Y
    };
    
    // Initialize validator
    this.validator = validatorOverride || new MovementValidator(
      MOVEMENT_BOUNDS, 
      this.calibration,
      simulationMode
    );
  }

  async executeSequence(
    sequence: PlotterSequence,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    try {
      // Validate sequence
      const validationResult = this.validator.validateSequence(sequence);
      if (!validationResult.valid) {
        throw new Error(`Invalid sequence: ${validationResult.reason}`);
      }

      // Optimize moves
      const optimizedMoves = PathProcessor.optimizePlotterMoves(sequence.moves);
      const totalMoves = optimizedMoves.length;

      // Execute each move
      for (let i = 0; i < totalMoves; i++) {
        const move = optimizedMoves[i];

        if (this.simulationMode) {
          await this.simulateMove(move);
        } else {
          await this.executeMove(move);
        }

        // Update progress
        if (onProgress) {
          onProgress((i + 1) / totalMoves * 100);
        }
      }

      // Ensure pen is up at end
      if (!this.simulationMode) {
        await this.plotter.rotateByDegrees('C', 0, 30); // Pen up
      }

    } catch (error) {
      console.error('Sequence execution failed:', error);
      throw error;
    }
  }

  private async executeMove(move: PlotterMove): Promise<void> {
    try {
      // Handle pen movement first if needed
      if (typeof move.z === 'number') {
        await this.plotter.rotateByDegrees('C', move.z, 30);
      }

      // Calculate move parameters
      const deltaX = move.x - this.currentX;
      const deltaY = move.y - this.currentY;
      const degreesX = deltaX * this.calibration.x;
      const degreesY = deltaY * this.calibration.y;

      // Calculate speed based on distance
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      const baseSpeed = move.type === 'move' ? this.moveSpeed : this.drawSpeed;
      const time = distance / baseSpeed;

      // Adjust speeds to maintain straight line
      const speedX = Math.abs(degreesX / time);
      const speedY = Math.abs(degreesY / time);

      // Execute coordinated movement
      await Promise.all([
        this.plotter.rotateByDegrees('B', degreesX, speedX),
        this.plotter.rotateByDegrees('A', degreesY, speedY)
      ]);

      // Update current position
      this.currentX = move.x;
      this.currentY = move.y;

    } catch (error) {
      console.error('Move execution failed:', error);
      throw error;
    }
  }

  private async simulateMove(move: PlotterMove): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 100));
    this.currentX = move.x;
    this.currentY = move.y;
  }

  async executePath(segments: PathSegment[]): Promise<void> {
    try {
      const optimizedPath = PathOptimizer.optimizePath(segments, this.simulationMode);

      for (const segment of optimizedPath) {
        if (this.simulationMode) {
          await this.simulatePathSegment(segment);
        } else {
          await this.executePathSegment(segment);
        }
      }

      // Ensure pen is up at end
      if (!this.simulationMode) {
        await this.plotter.rotateByDegrees('C', 0, 30); // Pen up
      }

    } catch (error) {
      console.error('Path execution failed:', error);
      throw error;
    }
  }

  private async executePathSegment(segment: PathSegment): Promise<void> {
    try {
      // Set pen position
      const penDegrees = segment.type === 'move' ? 0 : -45;
      await this.plotter.rotateByDegrees('C', penDegrees, 30);

      // Calculate movement parameters
      const dx = segment.end.x - segment.start.x;
      const dy = segment.end.y - segment.start.y;
      const degreesX = dx * this.calibration.x;
      const degreesY = dy * this.calibration.y;

      // Calculate speed based on distance
      const distance = Math.sqrt(dx * dx + dy * dy);
      const baseSpeed = segment.type === 'move' ? this.moveSpeed : this.drawSpeed;
      const time = distance / baseSpeed;

      // Adjust speeds to maintain straight line
      const speedX = Math.abs(degreesX / time);
      const speedY = Math.abs(degreesY / time);

      // Execute coordinated movement
      await Promise.all([
        this.plotter.rotateByDegrees('B', degreesX, speedX),
        this.plotter.rotateByDegrees('A', degreesY, speedY)
      ]);

      // Update position
      this.currentX = segment.end.x;
      this.currentY = segment.end.y;

    } catch (error) {
      console.error('Path segment execution failed:', error);
      throw error;
    }
  }

  private async simulatePathSegment(segment: PathSegment): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 100));
    this.currentX = segment.end.x;
    this.currentY = segment.end.y;
  }

  // Utility methods
  getCurrentPosition(): { x: number, y: number } {
    return { x: this.currentX, y: this.currentY };
  }

  resetPosition(): void {
    this.currentX = 0;
    this.currentY = 0;
  }
}