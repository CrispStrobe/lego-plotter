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

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw grid
    ctx.save();
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 0.5;

    // Draw grid lines
    for (let x = 0; x <= maxX * 2; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    for (let y = 0; y <= maxY * 2; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
    
    ctx.restore();
    
    // Apply scaling
    ctx.save();
    ctx.scale(2, 2);

    // Draw paths
    const drawPaths = (paths: PreviewPath[], style: { color: string, width: number }) => {
      paths.forEach(path => {
        ctx.beginPath();
        ctx.moveTo(path.startX, path.startY);
        ctx.strokeStyle = style.color;
        ctx.lineWidth = style.width;
        ctx.lineTo(path.endX, path.endY);
        ctx.stroke();
      });
    };

    // Draw current and completed paths
    if (!gridState.isPlotting) {
      drawPaths(allPaths, { color: 'rgba(220, 0, 0, 0.9)', width: 2 });
      drawPaths(currentPath, { color: 'rgba(220, 0, 0, 0.6)', width: 2 });
    }

    // Draw preview/plotting animation
    if (gridState.isPlotting || gridState.isPreviewMode) {
      const sequence = plotterSequenceRef.current;
      let segmentFound = false;
      
      sequence.forEach((segment, index) => {
        if (segmentFound) return;
        
        ctx.beginPath();
        ctx.moveTo(segment.startX, segment.startY);
        ctx.strokeStyle = gridState.isPreviewMode ? 
          'rgba(0, 100, 255, 0.8)' : 
          'rgba(220, 0, 0, 0.9)';
        ctx.lineWidth = 2;
        
        if (index === Math.floor(sequence.length * (gridState.plotProgress / 100))) {
          ctx.lineTo(currentPosition.x, currentPosition.y);
          segmentFound = true;
        } else {
          ctx.lineTo(segment.endX, segment.endY);
        }
        
        ctx.stroke();
      });
    }

    // Draw current position
    if (mode === 'plot' || gridState.isPlotting) {
      const posX = currentPosition.x;
      const posY = currentPosition.y;
      
      // Position indicator
      ctx.fillStyle = gridState.isPreviewMode ? 'blue' : 'red';
      ctx.beginPath();
      ctx.arc(posX, posY, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }, [
    maxX, maxY, mode, currentPosition, 
    gridState, allPaths, currentPath
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

    const plotterSequence: PlotterSequence = {
      name: 'Manual Drawing',
      moves: allPaths.map(path => ({
        x: path.endX,
        y: path.endY,
        z: path.type === 'draw' ? 1 : 0,
        type: path.type
      })),
      boundingBox: {
        minX: Math.min(...allPaths.map(p => Math.min(p.startX, p.endX))),
        maxX: Math.max(...allPaths.map(p => Math.max(p.startX, p.endX))),
        minY: Math.min(...allPaths.map(p => Math.min(p.startY, p.endY))),
        maxY: Math.max(...allPaths.map(p => Math.max(p.startY, p.endY)))
      }
    };

    plotterSequenceRef.current = [...allPaths];
    setGridState(prev => ({ ...prev, isPlotting: true, isPreviewMode: true }));
    
    // Start preview animation
    startPlotting();
    
    // Send to plotter after preview
    const plotTimeout = setTimeout(() => {
      if (!isCleaningUp.current) {
        onPlot(plotterSequence);
        setGridState(prev => ({ ...prev, isPreviewMode: false }));
      }
    }, 10000);

    return () => {
      clearTimeout(plotTimeout);
      resetState();
    };
  }, [allPaths, isCleaningUp, startPlotting, onPlot, resetState]);

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