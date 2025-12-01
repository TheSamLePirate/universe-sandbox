

export interface Vector2D {
  x: number;
  y: number;
}

export interface Maneuver {
    id: string;
    type: 'burn' | 'wait' | 'rotate' | 'sas' | 'auto_circularize' | 'auto_land' | 'auto_transfer' | 'auto_intercept' | 'manual_node' | 'wait_for_transfer' | 'wait_for_altitude' | 'burn_until_altitude' | 'change_simulation_speed'; // Type of action
    param?: number | string; // Extra data (degrees for rotate, mode for SAS)
    targetBodyId?: string; // For auto maneuvers that require a reference
    parentBodyId?: string; // For transfers that require a central body reference
    thrust: number; // Force strength (for burns)
    duration: number; // Seconds (for burns and waits)
    angleOffset: number; // Relative to current heading (0 = forward)
    startTime?: number; // timestamp
    progress: number; // 0 to 1
    status: 'pending' | 'active' | 'completed';
    // Accurate deltaV tracking for auto maneuvers
    targetDeltaV?: number; // Target deltaV to achieve (for auto maneuvers)
    appliedDeltaV?: number; // Actual deltaV applied so far
    initialDeltaV?: number; // Initial deltaV required (for progress bars in closed-loop maneuvers)
    
    // Manual Maneuver Node Data
    deltaVPrograde?: number;
    deltaVNormal?: number; // (Not used in 2D physics usually, but good for completeness)
    deltaVRadial?: number;
    timeFromNow?: number; // Scheduled time (seconds from creation)
}

export type SASMode = 'off' | 'prograde' | 'retrograde' | 'radial_out' | 'radial_in';

export interface Body {
  id: string;
  name: string;
  mass: number;
  radius: number;
  color: string;
  position: Vector2D;
  velocity: Vector2D;
  trail: Vector2D[];
  description: string;
  realMass?: string; // For display
  realDiameter?: string; // For display
  orbitPeriod?: string; // For display
  isStar?: boolean; // To apply glow effects
  
  // Rocket Specifics
  isRocket?: boolean;
  angle?: number; // Orientation in radians
  thrust?: Vector2D; // Current active thrust vector
  maneuvers?: Maneuver[];
  landedOnBodyId?: string; // ID of the body this rocket is resting on
  landingAngle?: number; // Fixed angle on surface (to prevent drift)
  sasMode?: SASMode; // Stability Assist System mode
  orbitReferenceId?: string; // Explicit parent body ID set by user/flight computer
  
  // Fuel System
  fuel?: number; // Current fuel amount
  maxFuel?: number; // Tank capacity
  dryMass?: number; // Mass without fuel
}

export interface Particle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // 1.0 to 0.0
  decay: number;
  color: string;
  size: number;
}

export interface VisualConfig {
    // Toggles
    showGrid: boolean;
    showWaves: boolean;
    showGlow: boolean;
    showTrails: boolean;
    showStars: boolean;
    showNebula: boolean;
    showCenterOfMass: boolean;
    showEclipses: boolean;
    
    // Numeric Settings
    gridSpacing: number; // Default 100
    gridOpacity: number; // Default 0.25
    waveSpeedMultiplier: number; // Default 1.0
    glowIntensity: number; // Default 1.0
    trailLength: number; // Default 150
    centerOfMassThreshold: number; // Default 2000. Bodies further than this from origin are excluded from CoM
    
    // Starfield & Nebula Settings
    starDensity: number; // Default 800
    starTwinkleSpeed: number; // Default 2.0
    nebulaCloudCount: number; // Default 15
    nebulaOpacity: number; // Default 0.2
}

export interface PhysicsConfig {
    gravitationalConstant: number; // Default 0.5
    collisions: boolean; // Default true
    timeStep: number; // Default 0.5
}

export interface SimulationSaveData {
    version: number;
    timestamp: number;
    bodies: Body[];
    visualConfig: VisualConfig;
    physicsConfig: PhysicsConfig;
    camera: {
        scale: number;
        offset: Vector2D;
    }
}

export interface SimulationState {
  bodies: Body[];
  scale: number; // Simulation units per pixel (wait, no, pixels per unit)
  offset: Vector2D; // Camera offset
  isRunning: boolean;
  speed: number; // Simulation speed multiplier
  selectedBodyId: string | null;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  isLoading?: boolean;
}

export interface Preset {
  id: string;
  name: string;
  bodies: Body[];
  defaultScale: number;
  description: string;
}

export interface SystemEvent {
    type: 'set_speed';
    value: number;
}

export interface PhysicsResult {
  bodies: Body[];
  newParticles: Particle[];
  systemEvents: SystemEvent[];
}

export interface CoMData {
    realCoM: Vector2D;
    refinedCoM: Vector2D;
    included: Body[];
    excluded: Body[];
}

export interface AssistantActions {
    spawnBody: (name: string, mass: number, distance: number, velocity: number, color: string) => string;
    deleteBody: (name: string) => string;
    makeStar: (name: string) => string;
    setSimulationState: (isRunning?: boolean, speed?: number) => string;
    changePreset: (presetId: string) => string;
    selectBody: (bodyName: string) => string;
    followBody: (bodyName: string) => string;
    followCenterOfMass: () => string;
    configureVisuals: (config: Partial<VisualConfig>) => string;
    configurePhysics: (config: Partial<PhysicsConfig>) => string;
    setCamera: (zoom?: number, reset?: boolean) => string;
    
    // Rocket Actions
    spawnRocket: (parentBodyName?: string) => string;
    controlRocket: (rocketName: string, action: 'rotate' | 'thrust' | 'stop', value?: number) => string;
    programAdvancedFlightPlan: (rocketName: string, maneuvers: any[]) => string;
    executeManeuverPlan: (rocketName: string) => string;
    getRocketTelemetry: (rocketName: string, targetBodyName?: string) => string;
    addManualNode: (rocketName: string, timeFromNow: number, deltaVPrograde: number, deltaVRadial: number) => string;
    getRocketFlightPlan: (rocketName: string) => string;
    
    // Flight Computer Actions
    addFlightComputerModule: (moduleType: FlightComputerModuleType, rocketName: string, referenceBodyName: string, targetBodyName?: string, customName?: string, color?: string, maxDistance?: number) => string;
    removeFlightComputerModule: (moduleName: string) => string;
    getFlightComputerData: () => string;
    toggleFlightComputerModule: (moduleName: string, enabled: boolean) => string;
}

export interface RocketSpawnConfig {
    name: string;
    mass: number;
    radius: number;
    color: string;
}

export type FlightComputerModuleType = 'orbit_info' | 'transfer_window' | 'trajectory_prediction' | 'circularize_guide' | 'rendezvous_tracker';

export interface FlightComputerModule {
    id: string;
    type: FlightComputerModuleType;
    isEnabled: boolean;
    primaryBodyId: string; // The subject (e.g., Rocket)
    referenceBodyId: string; // The parent/center (e.g., Earth)
    targetBodyId?: string; // The target (e.g., Moon) - Optional depending on type
    color: string; // For visualization lines
    name?: string; // Custom name for the module (e.g., "Apollo 11 Rendezvous")
    maxDistance?: number; // For rendezvous tracker - max distance threshold
}