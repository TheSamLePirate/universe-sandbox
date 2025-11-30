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
