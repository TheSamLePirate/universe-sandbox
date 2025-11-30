# Agent Guide for Nebula Orbit

## Build Commands
- **Dev Server**: `npm run dev` (runs Vite on port 3000)
- **Build**: `npm run build` (TypeScript compilation + Vite build)
- **Preview**: `npm run preview` (preview production build)
- **No test framework configured** - tests should be added with your preferred framework

## Code Style & Conventions

### Imports
- Use TypeScript imports with explicit extensions: `from '../types'` (no .ts extension due to `allowImportingTsExtensions`)
- Use `@/` path alias for root imports (e.g., `@/types`, `@/services/physicsEngine`)
- Group imports: React/external libs first, then local components, then types/services

### TypeScript
- **Strict typing**: Define interfaces in `types.ts` for all data structures
- **No `any` types**: Use proper interfaces (Body, Vector2D, Maneuver, etc.)
- **React components**: Use `React.FC<PropsInterface>` pattern
- **State hooks**: Always type useState with explicit types
- **Config**: Target ES2022, JSX react-jsx, bundler module resolution

### Naming Conventions
- **Files**: PascalCase for components (Canvas3D.tsx), camelCase for services (physicsEngine.ts)
- **Components**: PascalCase (BodyMesh, SceneContent)
- **Hooks**: camelCase with 'use' prefix (useIsMobile, useRocketSound)
- **Interfaces/Types**: PascalCase (Body, SimulationState, FlightComputerModule)
- **Constants**: UPPER_SNAKE_CASE for true constants (MAX_PARTICLES, LANDING_MAX_VELOCITY)

### Code Organization
- **Services**: Pure functions for physics/calculations in `services/` (no side effects)
- **Components**: UI components in `components/`, keep them focused and composable
- **State management**: useState + useRef pattern for animation loops (see App.tsx animate callback)
- **Performance**: Use refs for values needed in animation loops to avoid stale closures

### Error Handling
- No formal error boundary yet - use try/catch for file I/O operations
- Validate user input before state updates (see handleImportState)
- Graceful degradation: check for null/undefined before accessing nested properties

### Environment
- API keys via `.env` file (GEMINI_API_KEY)
- Vite defines: `process.env.GEMINI_API_KEY` available at runtime

## Project Structure & Architecture

### Overview
Nebula Orbit is an interactive **N-body gravity simulation** and **rocket sandbox** built with React, Three.js, and Google Gemini AI. It simulates a universe where celestial bodies interact via gravity, allowing users to build solar systems, pilot rockets with realistic orbital mechanics, and control the simulation via an AI assistant.

### Architecture

#### 1. Core Simulation Engine (`services/physicsEngine.ts`)
This is the heart of the simulation, operating as a set of pure functions to ensure determinism and performance.
- **N-Body Gravity**: Calculates forces between all bodies ($F = G \frac{m_1 m_2}{r^2}$) with softening to prevent singularities.
- **Physics Integration**: Uses adaptive sub-stepping for precision.
- **Rocket Physics**: Handles thrust vectors, fuel consumption, mass ratios, and collision detection (elastic/inelastic).
- **Orbital Mechanics**: Utilities for calculating Hohmann Transfers, circularization burns, and intercept trajectories.

#### 2. State Management (`App.tsx`)
The application uses a **hybrid state model** to balance UI reactivity with simulation performance:
- **React State**: Manages UI state (active panels, buttons, configuration, selection).
- **Ref-based Loop**: The high-frequency physics loop (60 FPS) runs inside `requestAnimationFrame` using `useRef` hooks to bypass React's render cycle. This avoids stale closures and performance bottlenecks associated with frequent state updates.

#### 3. Visualization Layers
- **3D Renderer (`components/Canvas3D.tsx`)**: A rich Three.js scene (via `@react-three/fiber`) featuring:
    - Volumetric lighting (star coronas, atmospheric glows).
    - Gravity Grid (visualizing spacetime distortion).
    - Dynamic Shadows (eclipses, umbra/penumbra).
    - Particle systems for exhausts and explosions.
- **2D Renderer (`components/Canvas.tsx`)**: A lightweight HTML5 Canvas fallback for schematic views or lower-end devices.

#### 4. Flight Systems
- **Rocket Control (`components/RocketPanel.tsx`)**: Cockpit interface for manual control, SAS (autopilot) modes, and mission planning.
- **Flight Computer (`components/FlightComputerPanel.tsx`)**: Real-time telemetry dashboard calculating orbital parameters (Apoapsis, Periapsis, Period) and transfer windows.
- **Telemetry (`components/RocketDataPanel.tsx`)**: Heads-up display for velocity, fuel, and target relative data.

#### 5. AI & Audio
- **"Cosmos" AI (`components/Assistant.tsx`)**: Integrated with Google Gemini via `services/geminiService.ts`. The AI has tool access to spawn bodies, execute maneuvers, and explain physics based on current simulation context.
- **Audio Engine (`hooks/useRocketSound.ts`)**: Procedural audio generation using Web Audio API for engine roar (filtered white noise) and interface beeps.

### Key File Structure

```
/
├── components/             # React UI Components
│   ├── Canvas3D.tsx        # Main 3D Three.js renderer
│   ├── Canvas.tsx          # 2D Canvas renderer fallback
│   ├── Assistant.tsx       # AI Chat interface (Cosmos)
│   ├── RocketPanel.tsx     # Rocket controls & mission planner
│   ├── FlightComputerPanel.tsx # Orbital telemetry dashboard
│   ├── Controls.tsx        # Main playback & camera controls
│   └── ... (Panels for Info, Settings, Building, etc.)
├── services/               # Core Logic (Pure Functions)
│   ├── physicsEngine.ts    # N-body gravity, collisions, orbital math
│   └── geminiService.ts    # Google Generative AI integration
├── hooks/                  # Custom React Hooks
│   ├── useRocketSound.ts   # Procedural audio engine
│   └── useIsMobile.ts      # Responsive layout detection
├── types.ts                # TypeScript interfaces (Body, Maneuver, etc.)
├── constants.ts            # Simulation constants & Solar System presets
├── App.tsx                 # Main entry point & Simulation Loop
└── AGENTS.md               # This guide
```
