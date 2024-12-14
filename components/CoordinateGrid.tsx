// components/CoordinateGrid.tsx
import React, { useEffect, useRef, useState, useCallback } from 'react'
import type { PlotterSequence, PreviewPath, Position } from '@/lib/types'

interface CoordinateGridProps {
  currentX: number;
  currentY: number;
  maxX: number;
  maxY: number;
  onPositionClick: (x: number, y: number) => void;
  previewSequence: PlotterSequence | null;
  executionProgress: number;
  isDrawingMode: boolean;
  onDrawingComplete: (paths: PreviewPath[]) => void;
  setDrawnSequence: (sequence: PlotterSequence | null) => void;    
  setPreviewSequence: (sequence: PlotterSequence | null) => void;  
  onPlot: (sequence: PlotterSequence) => void;  
  isMoving: boolean;
}

interface CurrentPosition {
  x: number;
  y: number;
}

interface GridState {
  isDrawing: boolean;
  isPlotting: boolean;
  isPreviewMode: boolean;
  plotProgress: number;
}

export function CoordinateGrid({
  currentX,
  currentY,
  maxX,
  maxY,
  onPositionClick,
  previewSequence,
  executionProgress = 0,
  isDrawingMode: externalDrawingMode = false,
  onDrawingComplete,
  setDrawnSequence,    
  setPreviewSequence,  
  onPlot,
  isMoving
}: CoordinateGridProps) {
  // Core refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isCleaningUp = useRef(false);
  const lastPoint = useRef<{x: number, y: number} | null>(null);

  // Path management
  const [allPaths, setAllPaths] = useState<PreviewPath[]>([]);
  const [currentPath, setCurrentPath] = useState<PreviewPath[]>([]);
  const plotterSequenceRef = useRef<PreviewPath[]>([]);

  // State management
  const [gridState, setGridState] = useState<GridState>({
    isDrawing: false,
    isPlotting: false,
    isPreviewMode: false,
    plotProgress: 0
  });
  
  const [currentPosition, setCurrentPosition] = useState<CurrentPosition>({ 
    x: currentX, 
    y: currentY 
  });
  
  const [mode, setMode] = useState<'draw' | 'plot'>('draw');

  // Synchronize position with plotter in plot mode
  useEffect(() => {
    if (mode === 'plot' && !gridState.isPlotting && 
        (currentPosition.x !== currentX || currentPosition.y !== currentY)) {
      setCurrentPosition({ x: currentX, y: currentY });
    }
  }, [currentX, currentY, mode, gridState.isPlotting, currentPosition.x, currentPosition.y]);

  // Reset state handler
  const resetState = useCallback((keepPaths: boolean = false) => {
    isCleaningUp.current = true;
    
    // Cancel any ongoing animations
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Reset state
    setGridState({
      isDrawing: false,
      isPlotting: false,
      isPreviewMode: false,
      plotProgress: 0
    });

    // Only clear paths if explicitly told to
    if (!keepPaths) {
      setAllPaths([]);
      setCurrentPath([]);
      plotterSequenceRef.current = [];
      setPreviewSequence(null);
      setDrawnSequence(null);
    } else {
      // If keeping paths, ensure plotterSequenceRef is synced
      plotterSequenceRef.current = [...allPaths];
    }

    // Sync position with current mode
    setCurrentPosition({ 
      x: mode === 'plot' ? currentX : 0, 
      y: mode === 'plot' ? currentY : 0 
    });

    isCleaningUp.current = false;
  }, [mode, currentX, currentY, setPreviewSequence, setDrawnSequence, allPaths]);

  // Mode switching handler
  const handleModeSwitch = useCallback((newMode: 'draw' | 'plot') => {
    // Don't reset everything, just update the necessary state
    setGridState(prev => ({
      ...prev,
      isDrawing: false,
      isPlotting: false,
      isPreviewMode: false,
      plotProgress: 0
    }));
    
    setMode(newMode);
    
    if (newMode === 'plot') {
      setCurrentPosition({ x: currentX, y: currentY });
      // Ensure plotter sequence is synced with paths
      plotterSequenceRef.current = [...allPaths];
    }
  }, [currentX, currentY, allPaths]);

  // Coordinate conversion helper
  const getPlotterCoordinates = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left) / 2);
    const y = Math.round((e.clientY - rect.top) / 2);
    
    return {
      x: Math.max(0, Math.min(x, maxX)),
      y: Math.max(0, Math.min(y, maxY))
    };
  }, [maxX, maxY]);

  // Animation functions
  const startPlotting = useCallback(() => {
    if (isCleaningUp.current || gridState.isPlotting) return;

    setGridState(prev => ({ ...prev, isPlotting: true, isPreviewMode: true }));
    animatePlotter();

    return () => {
      setGridState(prev => ({ ...prev, isPlotting: false, isPreviewMode: false }));
    };
  }, [gridState.isPlotting]);

  const animatePlotter = useCallback(() => {
    const ANIMATION_DURATION = 10000; // 10 seconds for preview
    const startTime = Date.now();
    const sequence = [...plotterSequenceRef.current];
    
    const animate = () => {
      if (isCleaningUp.current) return;

      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / ANIMATION_DURATION, 1);
      const currentIndex = Math.floor(progress * sequence.length);
      
      if (currentIndex < sequence.length) {
        const segment = sequence[currentIndex];
        const segmentProgress = (progress * sequence.length) % 1;
        
        const x = segment.startX + (segment.endX - segment.startX) * segmentProgress;
        const y = segment.startY + (segment.endY - segment.startY) * segmentProgress;
        
        setCurrentPosition({ x, y });
        setGridState(prev => ({ ...prev, plotProgress: progress * 100 }));
        
        if (progress < 1 && !isCleaningUp.current) {
          animationFrameRef.current = requestAnimationFrame(animate);
        } else {
          // Animation complete
          const finalSegment = sequence[sequence.length - 1];
          setCurrentPosition({ x: finalSegment.endX, y: finalSegment.endY });
          setGridState(prev => ({ 
            ...prev, 
            isPlotting: false, 
            isPreviewMode: false,
            plotProgress: 0 
          }));
        }
      }
    };
    
    if (!isCleaningUp.current && sequence.length > 0) {
      setCurrentPosition({ x: sequence[0].startX, y: sequence[0].startY });
      animationFrameRef.current = requestAnimationFrame(animate);
    }
  }, []);

  // Drawing handlers
  const startDrawing = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (mode !== 'draw') return;
    
    const point = getPlotterCoordinates(e);
    if (!point) return;

    setGridState(prev => ({ ...prev, isDrawing: true }));
    lastPoint.current = point;
    setCurrentPath([]);
  }, [mode, getPlotterCoordinates]);

  const continueDrawing = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (mode !== 'draw' || !lastPoint.current || !gridState.isDrawing) return;

    const point = getPlotterCoordinates(e);
    if (!point) return;

    // Only add a new segment if the point has actually moved
    if (point.x === lastPoint.current.x && point.y === lastPoint.current.y) return;

    const newSegment: PreviewPath = {
      startX: lastPoint.current.x,
      startY: lastPoint.current.y,
      endX: point.x,
      endY: point.y,
      type: 'draw'
    };

    setCurrentPath(prev => [...prev, newSegment]);
    lastPoint.current = point;
  }, [mode, gridState.isDrawing, getPlotterCoordinates]);

  const finishDrawing = useCallback(() => {
    if (!gridState.isDrawing) return;

    setGridState(prev => ({ ...prev, isDrawing: false }));
    
    if (currentPath.length > 0) {
      const newPaths = [...allPaths, ...currentPath];
      setAllPaths(newPaths);
      const lastPathPoint = currentPath[currentPath.length - 1];
      lastPoint.current = { x: lastPathPoint.endX, y: lastPathPoint.endY };
      onDrawingComplete(newPaths);
    }
    
    setCurrentPath([]);
  }, [gridState.isDrawing, currentPath, allPaths, onDrawingComplete]);

  // Canvas drawing function
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
  
    const GRID_SPACING = 40;
    const POSITION_RADIUS = 4;
    const PATH_WIDTH = 2;
  
    const colors = {
      grid: '#ddd',
      completedPath: 'rgba(220, 0, 0, 0.9)',
      currentPath: 'rgba(220, 0, 0, 0.6)',
      previewPath: 'rgba(0, 100, 255, 0.8)',
      plotPath: 'rgba(220, 0, 0, 0.9)',
      position: {
        preview: 'blue',
        plot: 'red'
      }
    };
  
    // Clear canvas with white background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  
    // Draw grid
    const drawGrid = () => {
      ctx.save();
      ctx.strokeStyle = colors.grid;
      ctx.lineWidth = 0.5;
  
      // Vertical lines
      for (let x = 0; x <= maxX * 2; x += GRID_SPACING) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
  
      // Horizontal lines
      for (let y = 0; y <= maxY * 2; y += GRID_SPACING) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
  
      // Add axis labels every 40mm
      ctx.fillStyle = '#666';
      ctx.font = '10px Arial';
      ctx.textAlign = 'center';
      
      for (let x = 0; x <= maxX * 2; x += GRID_SPACING) {
        ctx.fillText(`${x/2}`, x, canvas.height - 5);
      }
      for (let y = 0; y <= maxY * 2; y += GRID_SPACING) {
        ctx.fillText(`${y/2}`, 10, y + 3);
      }
      
      ctx.restore();
    };
  
    // Draw paths helper function with anti-aliasing
    const drawPaths = (paths: PreviewPath[], style: { color: string, width: number }) => {
      ctx.beginPath();
      ctx.strokeStyle = style.color;
      ctx.lineWidth = style.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
  
      paths.forEach(path => {
        ctx.moveTo(path.startX, path.startY);
        ctx.lineTo(path.endX, path.endY);
      });
      
      ctx.stroke();
    };
  
    // Draw preview/plotting animation
    const drawPreview = () => {
      if (previewSequence && executionProgress > 0) {
        const sequence = previewSequence.moves;
        const currentMoveIndex = Math.floor((sequence.length * executionProgress) / 100);
    
        // Draw paths up to current position
        ctx.beginPath();
        ctx.strokeStyle = colors.plotPath;
        ctx.lineWidth = PATH_WIDTH;
    
        for (let i = 0; i < currentMoveIndex; i++) {
          const move = sequence[i];
          if (i === 0) {
            ctx.moveTo(move.x, move.y);
          } else {
            ctx.lineTo(move.x, move.y);
          }
        }
        ctx.stroke();
      }
    
      // Handle regular preview animation
      else if (gridState.isPlotting && plotterSequenceRef.current.length > 0) {
        const sequence = plotterSequenceRef.current;
        const currentSegmentIndex = Math.floor(sequence.length * (gridState.plotProgress / 100));
        
        // Draw completed segments
        ctx.beginPath();
        ctx.strokeStyle = colors.previewPath;
        ctx.lineWidth = PATH_WIDTH;
        
        for (let i = 0; i < currentSegmentIndex; i++) {
          const segment = sequence[i];
          if (i === 0) {
            ctx.moveTo(segment.startX, segment.startY);
          }
          ctx.lineTo(segment.endX, segment.endY);
        }
        ctx.stroke();
    
        // Draw current segment if in progress
        if (currentSegmentIndex < sequence.length) {
          const currentSegment = sequence[currentSegmentIndex];
          ctx.beginPath();
          ctx.moveTo(currentSegment.startX, currentSegment.startY);
          ctx.lineTo(currentPosition.x, currentPosition.y);
          ctx.stroke();
        }
      }
    };
  
    // Draw position indicator
    const drawPosition = () => {
      // Always draw position indicator when in plot mode or during execution
      if ((mode === 'plot' || executionProgress > 0) && !gridState.isDrawing) {
        ctx.fillStyle = executionProgress > 0 ? colors.position.plot : colors.position.preview;
        ctx.beginPath();
        ctx.arc(currentX, currentY, POSITION_RADIUS, 0, Math.PI * 2);
        ctx.fill();
    
        // Add crosshair
        ctx.beginPath();
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 1;
        ctx.moveTo(currentX - POSITION_RADIUS * 2, currentY);
        ctx.lineTo(currentX + POSITION_RADIUS * 2, currentY);
        ctx.moveTo(currentX, currentY - POSITION_RADIUS * 2);
        ctx.lineTo(currentX, currentY + POSITION_RADIUS * 2);
        ctx.stroke();
    
        // Show coordinates
        ctx.fillStyle = '#333';
        ctx.font = '12px Arial';
        ctx.fillText(
          `(${currentX.toFixed(1)}, ${currentY.toFixed(1)})`,
          currentX + 10,
          currentY - 10
        );
      }
    };
  
    try {
      // Main drawing sequence
      drawGrid();
  
      // Apply scaling for path drawing
      ctx.save();
      ctx.scale(2, 2);
  
      // Draw paths
      if (!gridState.isPlotting) {
        if (allPaths.length) {
          drawPaths(allPaths, { color: colors.completedPath, width: PATH_WIDTH });
        }
        if (currentPath.length) {
          drawPaths(currentPath, { color: colors.currentPath, width: PATH_WIDTH });
        }
      }
  
      drawPreview();
      drawPosition();
  
      ctx.restore();
    } catch (error) {
      console.error('Canvas drawing error:', error);
    }
  }, [
    maxX,
    maxY,
    mode,
    currentPosition,
    currentX,
    currentY,
    gridState,
    allPaths,
    currentPath,
    executionProgress,
    previewSequence,
    plotterSequenceRef.current
  ]);

  // Update canvas
  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  // Cleanup effect
  useEffect(() => {
    return () => {
      isCleaningUp.current = true;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      // Don't call resetState here - just clean up animations
    };
  }, []);

  // Click handler for plot mode
  const handleClick = useCallback(async (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (mode === 'plot' && !gridState.isPlotting) {
      const point = getPlotterCoordinates(e);
      if (point) {
        try {
          await onPositionClick(point.x, point.y);
        } catch (error) {
          console.error('Movement failed:', error);
        }
      }
    }
  }, [mode, gridState.isPlotting, getPlotterCoordinates, onPositionClick]);

  // Plot handler
  const handlePlot = useCallback(() => {
    if (isCleaningUp.current || gridState.isPlotting || allPaths.length === 0) return;
  
    try {
      // Create plotter sequence from drawn paths
      const plotterSequence: PlotterSequence = {
        name: 'Manual Drawing',
        moves: allPaths.map((path, index) => ({
          type: path.type,
          x: path.endX,
          y: path.endY,
          // Add pen up/down movements between disconnected paths
          z: index === 0 ? -45 : 
             (path.startX !== allPaths[index-1]?.endX || 
              path.startY !== allPaths[index-1]?.endY) ? 0 : -45
        })),
        boundingBox: {
          minX: Math.min(...allPaths.map(p => Math.min(p.startX, p.endX))),
          maxX: Math.max(...allPaths.map(p => Math.max(p.startX, p.endX))),
          minY: Math.min(...allPaths.map(p => Math.min(p.startY, p.endY))),
          maxY: Math.max(...allPaths.map(p => Math.max(p.startY, p.endY)))
        }
      };
  
      // Store for preview
      plotterSequenceRef.current = [...allPaths];
      
      // Start preview animation
      setGridState(prev => ({ 
        ...prev, 
        isPlotting: true, 
        isPreviewMode: true 
      }));
  
      // Show preview for 3 seconds then execute
      setTimeout(() => {
        if (!isCleaningUp.current) {
          setGridState(prev => ({ ...prev, isPreviewMode: false }));
          onPlot(plotterSequence); // This calls handleLoadSequence
        }
      }, 3000);
  
    } catch (error) {
      console.error('Failed to create plot sequence:', error);
      //addNotification(`Failed to create plot sequence: ${error}`, 'error');
    }
  
    return () => {
      resetState();
    };
  }, [allPaths, isCleaningUp, onPlot, resetState]);

  return (
    <div className="border rounded-lg p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-bold">Coordinate Grid</h2>
        <div className="flex gap-4 items-center">
          {/* Mode toggle buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => handleModeSwitch('draw')}
              disabled={isMoving || gridState.isPlotting}
              className={`px-3 py-1 text-sm rounded transition-colors ${
                mode === 'draw' 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-gray-200 text-gray-700'
              } ${(isMoving || gridState.isPlotting) ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Draw Mode
            </button>
            <button
              onClick={() => handleModeSwitch('plot')}
              disabled={isMoving || gridState.isPlotting}
              className={`px-3 py-1 text-sm rounded transition-colors ${
                mode === 'plot' 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-gray-200 text-gray-700'
              } ${(isMoving || gridState.isPlotting) ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Plot Mode
            </button>
          </div>

          {/* Drawing status */}
          {mode === 'draw' && (
            <span className="text-sm text-gray-500">
              {gridState.isDrawing ? 'Drawing...' : 'Click and drag to draw'}
            </span>
          )}

          {/* Plot button */}
          {mode === 'plot' && allPaths.length > 0 && !gridState.isPlotting && (
            <button
              onClick={handlePlot}
              disabled={isMoving}
              className={`px-3 py-1 text-sm rounded transition-colors ${
                isMoving 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-green-500 hover:bg-green-600'
              } text-white`}
            >
              {gridState.isPreviewMode ? 'Previewing...' : 'Plot Drawn Path'}
            </button>
          )}

          {/* Clear button */}
          {(allPaths.length > 0 || currentPath.length > 0 || gridState.isPlotting) && (
            <button
              onClick={() => resetState(false)}
              disabled={isMoving}
              className="px-3 py-1 text-sm rounded transition-colors 
                bg-red-500 hover:bg-red-600 text-white"
            >
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={maxX * 2}
        height={maxY * 2}
        onClick={mode === 'plot' ? handleClick : undefined}
        onMouseDown={mode === 'draw' ? startDrawing : undefined}
        onMouseMove={mode === 'draw' ? continueDrawing : undefined}
        onMouseUp={mode === 'draw' ? finishDrawing : undefined}
        onMouseLeave={mode === 'draw' ? finishDrawing : undefined}
        className={`border bg-white ${
          mode === 'draw' 
            ? 'cursor-crosshair' 
            : gridState.isPlotting || isMoving 
              ? 'cursor-not-allowed' 
              : 'cursor-pointer'
        }`}
        style={{ pointerEvents: gridState.isPlotting || isMoving ? 'none' : 'auto' }}
      />

      {/* Progress indicators */}
      {(executionProgress > 0 || gridState.plotProgress > 0) && (
        <div className="mt-2">
          {executionProgress > 0 && (
            <div>
              <div className="text-sm text-gray-600">
                Execution Progress: {Math.round(executionProgress)}%
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${executionProgress}%` }}
                />
              </div>
            </div>
          )}
          {gridState.plotProgress > 0 && (
            <div className="mt-2">
              <div className="text-sm text-gray-600">
                Preview Progress: {Math.round(gridState.plotProgress)}%
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-green-500 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${gridState.plotProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}