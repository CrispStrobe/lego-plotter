# LEGO Plotter

A web-based control interface for a LEGO-based plotter/drawing machine. This project provides both manual control and path drawing capabilities, with real-time feedback and safety features.

## Installation

1. Clone the repository:
```bash
git clone https://github.com/CrispStrobe/lego-plotter.git
cd lego-plotter
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:3000`

### Requirements

- Node.js 18.0 or higher
- NPM 9.0 or higher
- Modern web browser with WebSocket support
- LEGO PoweredUP compatible hardware

## Project Structure

```
lego-plotter/
├── app/                    # Next.js app directory
├── components/            # React components
│   ├── CalibrationTool
│   ├── CoordinateGrid     # Main drawing interface
│   ├── ManualControl
│   ├── MotorControl
│   ├── MovementPreview
│   ├── Notifications
│   ├── PositionPresets
│   ├── SafetyDiagnostics
│   ├── SequenceManager
│   ├── StatusMonitor
│   └── VisualFeedback
├── lib/                   # Core functionality
│   ├── CommandQueue       # Command sequencing
│   ├── ConnectionMonitor  # Hardware connection
│   ├── MovementValidator  # Safety checks
│   ├── PathPlanner        # Path optimization
│   ├── plotter           # Hardware control
│   ├── SafetyController  # Safety features
│   └── types             # TypeScript types
└── public/               # Static assets
```

## Features

### Drawing Interface
- Interactive canvas for creating drawings
- Real-time path preview
- Support for continuous drawing
- Path optimization
- Preview animation before plotting

### Hardware Control
- Direct plotter position control
- Grid-based coordinate system
- Real-time position feedback
- Safety bounds checking
- Error recovery

### Safety Features
- Movement validation
- Connection monitoring
- Emergency stop
- Position limit enforcement
- Error recovery procedures

## Usage

### Drawing Mode
1. Select "Draw Mode"
2. Click and drag on the canvas to create paths
3. Release to complete a path segment
4. Click "Plot Drawn Path" to execute
5. Preview animation will play before plotting

### Plot Mode
1. Select "Plot Mode"
2. Click any point on the grid to move the plotter
3. Wait for movement to complete
4. Current position is highlighted
5. Grid provides coordinate reference

## Development

### Available Scripts

```bash
# Development server
npm run dev

# Production build
npm run build

# Start production server
npm run start

# Lint code
npm run lint
```

### Key Dependencies

- Next.js 15.0
- React 19.0
- WebSocket (ws) for hardware communication
- Tailwind CSS for styling
- PoweredUP library for LEGO hardware control

## Acknowledgments

- LEGO PoweredUP SDK
- Next.js team
- React community
