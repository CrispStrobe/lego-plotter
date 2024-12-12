// lib/PathPlanner.ts

import parseSVG from 'svg-path-parser';
import { 
  PlotterMove, 
  PlotterSequence, 
  BoundingBox,
  MOVEMENT_BOUNDS,
  PreviewPath
} from '@/lib/types'
import { MovementValidator } from '@/lib/MovementValidator'
import { PathProcessor } from '@/lib/pathUtils'

export class PathPlanner {
  private static validator: MovementValidator

  static initialize(calibration: { x: number, y: number }) {
    this.validator = new MovementValidator(MOVEMENT_BOUNDS, calibration)
  }

  static convertPreviewPathsToSequence(
    paths: PreviewPath[],
    name: string = 'Manual Path'
  ): PlotterSequence {
    const moves: PlotterMove[] = paths.map(path => ({
      type: path.type,
      x: path.endX,
      y: path.endY,
      z: path.type === 'move' ? 0 : -45
    }))

    return {
      name,
      moves: this.optimizePath(moves),
      boundingBox: PathProcessor.calculateBoundingBox(moves)
    }
  }

  static parseSVGPath(svgPath: string, scale: number = 1): PlotterMove[] {
    const commands = parseSVG(svgPath);
    const moves: PlotterMove[] = [];
    let penDown = false;

    for (const cmd of commands) {
      // Add type assertion or type check
      if (!cmd.x || !cmd.y) continue;  // Skip commands without coordinates
      
      switch (cmd.code) {
        case 'M': // Move
          moves.push({
            type: 'move',
            x: cmd.x * scale,
            y: cmd.y * scale,
            z: 0  // Pen up
          });
          penDown = false;
          break;

        case 'L': // Line
          if (!penDown) {
            moves.push({ type: 'move', x: cmd.x * scale, y: cmd.y * scale, z: -45 }) // Pen down
            penDown = true
          }
          moves.push({ type: 'draw', x: cmd.x * scale, y: cmd.y * scale })
          break

        case 'C': // Cubic Bezier
            // Type check before using
            if (cmd.x0 === undefined || cmd.y0 === undefined || 
                cmd.x1 === undefined || cmd.y1 === undefined ||
                cmd.x2 === undefined || cmd.y2 === undefined ||
                cmd.x === undefined || cmd.y === undefined) {
              continue;
            }
            
            const points = this.approximateBezier(
              cmd.x0, cmd.y0, cmd.x1, cmd.y1,
              cmd.x2, cmd.y2, cmd.x, cmd.y,
              10  // Number of segments
            )
          
          for (const point of points) {
            if (!penDown) {
              moves.push({ type: 'move', x: point.x * scale, y: point.y * scale, z: -45 })
              penDown = true
            }
            moves.push({ type: 'draw', x: point.x * scale, y: point.y * scale })
          }
          break

        case 'Z': // Close path
          if (moves.length > 0) {
            const first = moves[0]
            moves.push({ type: 'draw', x: first.x, y: first.y })
          }
          break
      }
    }

    // End with pen up
    if (moves.length > 0) {
      moves.push({ ...moves[moves.length - 1], z: 0 })
    }

    // Validate and scale the moves
    const scaledMoves = PathProcessor.validateAndScalePath(moves, {
      width: MOVEMENT_BOUNDS.paperWidth,
      height: MOVEMENT_BOUNDS.paperHeight
    })

    return scaledMoves
  }

  // Helper function to approximate Bezier curves
  private static approximateBezier(
    x0: number, y0: number,
    x1: number, y1: number,
    x2: number, y2: number,
    x3: number, y3: number,
    segments: number
  ): { x: number, y: number }[] {
    const points: { x: number, y: number }[] = []
    for (let i = 0; i <= segments; i++) {
      const t = i / segments
      const mt = 1 - t
      
      // Cubic Bezier formula
      const x = mt * mt * mt * x0 + 
                3 * mt * mt * t * x1 + 
                3 * mt * t * t * x2 + 
                t * t * t * x3
      const y = mt * mt * mt * y0 + 
                3 * mt * mt * t * y1 + 
                3 * mt * t * t * y2 + 
                t * t * t * y3
      
      points.push({ x, y })
    }
    return points
  }

  // Load sequence from JSON
  static loadSequence(json: string): PlotterSequence {
    try {
      const data = JSON.parse(json)
      if (!data.moves?.length) {
        throw new Error('Invalid sequence: no moves found')
      }

      const sequence = {
        name: data.name || 'Unnamed Sequence',
        moves: data.moves,
        boundingBox: PathProcessor.calculateBoundingBox(data.moves)
      }

      // Validate sequence
      if (this.validator) {
        const validation = this.validator.validateSequence(sequence)
        if (!validation.valid) {
          throw new Error(`Invalid sequence: ${validation.reason}`)
        }
      }

      return sequence
    } catch (error) {
      throw new Error(`Failed to load sequence: ${error}`)
    }
  }

  // Optimize path to minimize pen movements
  static optimizePath(moves: PlotterMove[]): PlotterMove[] {
    return PathProcessor.optimizePlotterMoves(moves)
  }

  static optimizePath_old(moves: PlotterMove[]): PlotterMove[] {
    const optimized: PlotterMove[] = []
    let currentX = 0, currentY = 0

    // Group moves by pen state
    const penDownMoves: PlotterMove[][] = [[]]
    let currentGroup = 0

    for (const move of moves) {
      if (move.z === 0 && penDownMoves[currentGroup].length > 0) {
        // Pen up, start new group
        currentGroup++
        penDownMoves[currentGroup] = []
      } else if (move.z === -45) {
        // Pen down, add to current group
        penDownMoves[currentGroup].push(move)
      }
    }

    // Optimize each group
    for (const group of penDownMoves) {
      if (group.length === 0) continue

      // Find nearest point to current position
      let nearest = 0
      let minDist = Infinity

      for (let i = 0; i < group.length; i++) {
        const dist = Math.hypot(
          group[i].x - currentX,
          group[i].y - currentY
        )
        if (dist < minDist) {
          minDist = dist
          nearest = i
        }
      }

      // Move to nearest point
      optimized.push({
        type: 'move',
        x: group[nearest].x,
        y: group[nearest].y,
        z: 0
      })

      // Add pen down move
      optimized.push({
        ...group[nearest],
        z: -45
      })

      // Add remaining moves in nearest neighbor order
      const remaining = [...group]
      remaining.splice(nearest, 1)

      while (remaining.length > 0) {
        const last = optimized[optimized.length - 1]
        nearest = 0
        minDist = Infinity

        for (let i = 0; i < remaining.length; i++) {
          const dist = Math.hypot(
            remaining[i].x - last.x,
            remaining[i].y - last.y
          )
          if (dist < minDist) {
            minDist = dist
            nearest = i
          }
        }

        optimized.push(remaining[nearest])
        remaining.splice(nearest, 1)
      }

      // Update current position
      currentX = optimized[optimized.length - 1].x
      currentY = optimized[optimized.length - 1].y
    }

    // End with pen up
    optimized.push({
      type: 'move',
      x: currentX,
      y: currentY,
      z: 0
    })

    return optimized
  }

}
