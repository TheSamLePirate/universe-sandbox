import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Canvas from './components/Canvas';
import Canvas3D from './components/Canvas3D';
import Controls from './components/Controls';
import RocketDataPanel from './components/RocketDataPanel';
import ManualCreationPanel from './components/ManualCreationPanel';
import InfoPanel from './components/InfoPanel';
import BuilderPanel, { NewBodyData } from './components/BuilderPanel';
import SettingsPanel from './components/SettingsPanel';
import GravityObserverPanel from './components/GravityObserverPanel';
import CoMInfoPanel from './components/CoMInfoPanel';
import RocketPanel from './components/RocketPanel';
import PredictionPanel from './components/PredictionPanel';
import Assistant from './components/Assistant';
import FlightComputerPanel from './components/FlightComputerPanel';
import { PRESETS, createBody, DEFAULT_VISUAL_CONFIG, DEFAULT_PHYSICS_CONFIG } from './constants';
import { updatePhysics, predictSystemTrajectories } from './services/physicsEngine';
import { Body, Vector2D, VisualConfig, PhysicsConfig, Preset, RocketSpawnConfig, Maneuver, CoMData, AssistantActions, Particle, SimulationSaveData, FlightComputerModule, FlightComputerModuleType } from './types';
import { Terminal, Activity, MemoryStick, Trash2 } from 'lucide-react';
import useIsMobile from './hooks/useIsMobile';
import { useRocketSound } from './hooks/useRocketSound';

const App: React.FC = () => {
  // --- State ---
  const isMobile = useIsMobile();
  const defaultPreset = PRESETS.find(p => p.id === 'blank') || PRESETS[0];

  const [currentPresetId, setCurrentPresetId] = useState(defaultPreset.id);
  const [importedPreset, setImportedPreset] = useState<Preset | null>(null);
  
  const availablePresets = useMemo(() => {
      return importedPreset ? [...PRESETS, importedPreset] : PRESETS;
  }, [importedPreset]);

  const [bodies, setBodies] = useState<Body[]>(defaultPreset.bodies);
  
  // Enable Rocket Sound
  useRocketSound(bodies);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [isRunning, setIsRunning] = useState(false); // Default to false
  const [speed, setSpeed] = useState(1.0);
  const [scale, setScale] = useState(defaultPreset.defaultScale); 
  const [offset, setOffset] = useState<Vector2D>({ x: 0, y: 0 }); 
  const [selectedBodyId, setSelectedBodyId] = useState<string | null>(null);
  const [followingBodyId, setFollowingBodyId] = useState<string | null>(null);
  const [followingCoM, setFollowingCoM] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAssistant, setShowAssistant] = useState(false);
  
  // Observer Mode
  const [showObserver, setShowObserver] = useState(false);
  const [observerBodyIds, setObserverBodyIds] = useState<{a: string | null, b: string | null}>({ a: null, b: null });

  // Global Prediction State
  const [isPredictionEnabled, setIsPredictionEnabled] = useState(false);
  const [predictionBodyIds, setPredictionBodyIds] = useState<string[]>([]);
  const [predictionSteps, setPredictionSteps] = useState(500);

  // Rocket System Mode
  const [showRocketPanel, setShowRocketPanel] = useState(false);
  const [isRocketSpawning, setIsRocketSpawning] = useState(false);
  
  // Rocket Spawn Configuration
  const [rocketSpawnConfig, setRocketSpawnConfig] = useState<RocketSpawnConfig>({
      name: 'Explorer 1',
      mass: 0.001, // Reduced mass for realism
      radius: 2.0,
      color: '#f97316'
  });

  const [rocketTargetBodyId, setRocketTargetBodyId] = useState<string>('');
  const [rocketParentBodyId, setRocketParentBodyId] = useState<string>('');
  
  // Visualization toggles for performance
  const [showTransferWindow, setShowTransferWindow] = useState(true);
  const [showTheoreticalOrbit, setShowTheoreticalOrbit] = useState(true);

  // Manual Creation Mode State
  const [isCreationMode, setIsCreationMode] = useState(false);
  const [creationCandidate, setCreationCandidate] = useState<Body | null>(null);
  const [predictionPaths, setPredictionPaths] = useState<{ id: string, color: string, points: Vector2D[] }[]>([]);


  const [visualConfig, setVisualConfig] = useState<VisualConfig>(DEFAULT_VISUAL_CONFIG);
  const [physicsConfig, setPhysicsConfig] = useState<PhysicsConfig>(DEFAULT_PHYSICS_CONFIG);
  const [currentCoMData, setCurrentCoMData] = useState<CoMData | null>(null);
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [fps, setFps] = useState(0);
  const [memoryUsage, setMemoryUsage] = useState<{ used: number; total: number; percent: number } | null>(null);
  const [use3D, setUse3D] = useState(false);
  
  const bodiesRef = useRef(bodies);
  const particlesRef = useRef(particles);
  const requestRef = useRef<number | undefined>(undefined);
  const lastTimeRef = useRef<number | undefined>(undefined);
  const followingBodyIdRef = useRef(followingBodyId);
  const followingCoMRef = useRef(followingCoM);
  
  // Crucial Refs for smooth zooming
  const scaleRef = useRef(scale);
  const offsetRef = useRef(offset);

  const physicsConfigRef = useRef(physicsConfig);
  const visualConfigRef = useRef(visualConfig);
  const lastRefinedCoMRef = useRef<Vector2D | null>(null);
  
  // Accurate Simulation Time Tracking for Recorder
  const simulationTimeRef = useRef(0);
  
  // FPS Tracking
  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(0);
  
  // Throttle prediction calculations to avoid memory leaks
  const lastPredictionTimeRef = useRef(0);
  const PREDICTION_UPDATE_INTERVAL = 100; // Update predictions every 500ms to reduce memory pressure

  // Refs for Prediction Logic (to access fresh state inside animate loop)
  // Refs for Prediction Logic (to access fresh state inside animate loop)
  const selectedBodyIdRef = useRef(selectedBodyId);
  const isCreationModeRef = useRef(isCreationMode);
  const creationCandidateRef = useRef(creationCandidate);
  const predictionStepsRef = useRef(predictionSteps);
  const isPredictionEnabledRef = useRef(isPredictionEnabled);
  const predictionBodyIdsRef = useRef(predictionBodyIds);
  const rocketTargetBodyIdRef = useRef(rocketTargetBodyId);
  const rocketParentBodyIdRef = useRef(rocketParentBodyId);

  // Flight Computer State
  const [flightComputerModules, setFlightComputerModules] = useState<FlightComputerModule[]>([]);

  const handleAddModule = (type: FlightComputerModuleType) => {
      const newModule: FlightComputerModule = {
          id: `fc_mod_${Date.now()}`,
          type,
          isEnabled: true,
          primaryBodyId: selectedBodyId || bodies[0]?.id || '',
          referenceBodyId: bodies.find(b => b.mass > (bodies.find(s => s.id === (selectedBodyId || bodies[0]?.id))?.mass || 0))?.id || bodies[0]?.id || '',
          color: '#a855f7' // Default purple
      };
      setFlightComputerModules(prev => [...prev, newModule]);
  };

  const handleRemoveModule = (id: string) => {
      setFlightComputerModules(prev => prev.filter(m => m.id !== id));
  };

  const handleUpdateModule = (id: string, updates: Partial<FlightComputerModule>) => {
      setFlightComputerModules(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
  };

  const handleToggleModule = (id: string) => {
      setFlightComputerModules(prev => prev.map(m => m.id === id ? { ...m, isEnabled: !m.isEnabled } : m));
  };
  useEffect(() => { particlesRef.current = particles; }, [particles]);
  useEffect(() => { followingBodyIdRef.current = followingBodyId; }, [followingBodyId]);
  useEffect(() => { followingCoMRef.current = followingCoM; }, [followingCoM]);
  
  // Sync refs with state, but careful about race conditions if state update lags
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { offsetRef.current = offset; }, [offset]);

  useEffect(() => { physicsConfigRef.current = physicsConfig; }, [physicsConfig]);
  useEffect(() => { visualConfigRef.current = visualConfig; }, [visualConfig]);

  // Sync Prediction Refs
  // Sync Prediction Refs
  useEffect(() => { selectedBodyIdRef.current = selectedBodyId; }, [selectedBodyId]);
  useEffect(() => { isCreationModeRef.current = isCreationMode; }, [isCreationMode]);
  useEffect(() => { creationCandidateRef.current = creationCandidate; }, [creationCandidate]);
  useEffect(() => { predictionStepsRef.current = predictionSteps; }, [predictionSteps]);
  useEffect(() => { isPredictionEnabledRef.current = isPredictionEnabled; }, [isPredictionEnabled]);
  useEffect(() => { predictionBodyIdsRef.current = predictionBodyIds; }, [predictionBodyIds]);
  useEffect(() => { rocketTargetBodyIdRef.current = rocketTargetBodyId; }, [rocketTargetBodyId]);
  useEffect(() => { rocketParentBodyIdRef.current = rocketParentBodyId; }, [rocketParentBodyId]);

  useEffect(() => {
      if (bodies.length === 0) {
          lastRefinedCoMRef.current = null;
      }
  }, [bodies.length]);

  // --- Window Resize ---
  useEffect(() => {
    const handleResize = () => setDimensions({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- Memory Monitoring ---
  useEffect(() => {
    const updateMemory = () => {
      if ('memory' in performance && (performance as any).memory) {
        const mem = (performance as any).memory;
        const used = mem.usedJSHeapSize / (1024 * 1024); // MB
        const total = mem.jsHeapSizeLimit / (1024 * 1024); // MB
        const percent = (used / total) * 100;
        setMemoryUsage({ used, total, percent });
      }
    };

    updateMemory();
    const interval = setInterval(updateMemory, 1000); // Update every second
    return () => clearInterval(interval);
  }, []);

  // --- Animation Loop ---
  const animate = useCallback((time: number) => {
    // Calculate FPS
    frameCountRef.current++;
    if (time - lastFpsTimeRef.current >= 1000) {
        setFps(Math.round((frameCountRef.current * 1000) / (time - lastFpsTimeRef.current)));
        frameCountRef.current = 0;
        lastFpsTimeRef.current = time;
    }

    if (lastTimeRef.current !== undefined && isRunning) {
      const dt = physicsConfigRef.current.timeStep * speed; 
      simulationTimeRef.current += dt;
      
      // Update Physics (Logic for Flight Computer has moved inside updatePhysics for sub-stepping accuracy)
      const physicsResult = updatePhysics(
          bodiesRef.current, 
          dt, 
          physicsConfigRef.current.gravitationalConstant,
          visualConfigRef.current.trailLength,
          physicsConfigRef.current.collisions
      );
      const nextBodies = physicsResult.bodies;
      
      // Handle System Events (e.g. Speed Change from Flight Computer)
      if (physicsResult.systemEvents) {
          physicsResult.systemEvents.forEach(event => {
              if (event.type === 'set_speed') {
                  setSpeed(event.value);
              }
          });
      }
      
      // Clean up references to destroyed bodies
      const bodyIds = new Set(nextBodies.map(b => b.id));
      
      // If selected body was destroyed, deselect it
      if (selectedBodyIdRef.current && !bodyIds.has(selectedBodyIdRef.current)) {
          setSelectedBodyId(null);
          selectedBodyIdRef.current = null;
      }
      
      // If following body was destroyed, stop following
      if (followingBodyIdRef.current && !bodyIds.has(followingBodyIdRef.current)) {
          setFollowingBodyId(null);
          followingBodyIdRef.current = null;
      }
      
      // Clean up prediction body IDs
      if (predictionBodyIdsRef.current.length > 0) {
          const validPredictionIds = predictionBodyIdsRef.current.filter(id => bodyIds.has(id));
          if (validPredictionIds.length !== predictionBodyIdsRef.current.length) {
              setPredictionBodyIds(validPredictionIds);
              predictionBodyIdsRef.current = validPredictionIds;
          }
      }
      
      // Clean up target/parent references
      if (rocketTargetBodyIdRef.current && !bodyIds.has(rocketTargetBodyIdRef.current)) {
          setRocketTargetBodyId('');
          rocketTargetBodyIdRef.current = '';
      }
      if (rocketParentBodyIdRef.current && !bodyIds.has(rocketParentBodyIdRef.current)) {
          setRocketParentBodyId('');
          rocketParentBodyIdRef.current = '';
      }
      
      let nextParticles = particlesRef.current.map(p => ({
          ...p,
          x: p.x + p.vx * dt,
          y: p.y + p.vy * dt,
          life: p.life - p.decay * speed 
      })).filter(p => p.life > 0);

      if (physicsResult.newParticles.length > 0) {
          nextParticles = [...nextParticles, ...physicsResult.newParticles];
      }
      
      // Hard limit on particles to prevent memory issues
      const MAX_PARTICLES = 10000;
      if (nextParticles.length > MAX_PARTICLES) {
          nextParticles = nextParticles.slice(-MAX_PARTICLES);
      }

      bodiesRef.current = nextBodies;
      particlesRef.current = nextParticles;
      setBodies(nextBodies);
      setParticles(nextParticles);

      // --- PREDICTION TRAILS (Throttled to prevent memory leaks) ---
      const shouldUpdatePredictions = time - lastPredictionTimeRef.current >= PREDICTION_UPDATE_INTERVAL;
      
      if (shouldUpdatePredictions) {
          lastPredictionTimeRef.current = time;
          let newPaths: { id: string, color: string, points: Vector2D[] }[] = [];
          
          if (isCreationModeRef.current && creationCandidateRef.current) {
              const allBodies = [...nextBodies, creationCandidateRef.current];
              newPaths = predictSystemTrajectories(
                  allBodies, 
                  predictionStepsRef.current, 
                  physicsConfigRef.current.timeStep,
                  physicsConfigRef.current.gravitationalConstant,
                  [creationCandidateRef.current.id]
              );
          } else if (isPredictionEnabledRef.current && predictionBodyIdsRef.current.length > 0) {
              // Pass ALL bodies for simulation, but only return paths for selected ones
              newPaths = predictSystemTrajectories(
                  nextBodies,
                  predictionStepsRef.current,
                  physicsConfigRef.current.timeStep,
                  physicsConfigRef.current.gravitationalConstant,
                  predictionBodyIdsRef.current
              );
          }
          
          setPredictionPaths(newPaths);
      }

      const calcCoM = followingCoMRef.current || visualConfigRef.current.showCenterOfMass;
      
      if (calcCoM) {
          const threshold = visualConfigRef.current.centerOfMassThreshold;
          
          let tMass = 0, tX = 0, tY = 0;
          for (const b of nextBodies) {
             tMass += b.mass;
             tX += b.mass * b.position.x;
             tY += b.mass * b.position.y;
          }

          if (tMass > 0) {
              const realX = tX / tMass;
              const realY = tY / tMass;
              const realCoM = { x: realX, y: realY };

              const anchorX = lastRefinedCoMRef.current ? lastRefinedCoMRef.current.x : realX;
              const anchorY = lastRefinedCoMRef.current ? lastRefinedCoMRef.current.y : realY;

              let fMass = 0, fX = 0, fY = 0;
              const included: Body[] = [];
              const excluded: Body[] = [];

              for (const b of nextBodies) {
                  const dx = b.position.x - anchorX;
                  const dy = b.position.y - anchorY;
                  const distSq = dx*dx + dy*dy;
                  
                  if (distSq <= threshold * threshold) {
                      included.push(b);
                      fMass += b.mass;
                      fX += b.mass * b.position.x;
                      fY += b.mass * b.position.y;
                  } else {
                      excluded.push(b);
                  }
              }

              let refinedCoM = { x: anchorX, y: anchorY };
              if (fMass > 0) {
                  refinedCoM = { x: fX / fMass, y: fY / fMass };
                  lastRefinedCoMRef.current = refinedCoM;
              }

              setCurrentCoMData({
                  realCoM,
                  refinedCoM,
                  included,
                  excluded
              });

              if (followingCoMRef.current) {
                  const currentScale = scaleRef.current;
                  setOffset({
                      x: -refinedCoM.x * currentScale,
                      y: -refinedCoM.y * currentScale
                  });
              }
          } else {
              setCurrentCoMData(null);
          }
      }

      if (followingBodyIdRef.current) {
          const targetBody = nextBodies.find(b => b.id === followingBodyIdRef.current);
          if (targetBody) {
              const currentScale = scaleRef.current;
              setOffset({
                  x: -targetBody.position.x * currentScale,
                  y: -targetBody.position.y * currentScale
              });
          }
      } 
    }
    lastTimeRef.current = time;
    requestRef.current = requestAnimationFrame(animate);
  }, [isRunning, speed]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [animate]);




  const handlePan = (dx: number, dy: number) => {
    setFollowingBodyId(null); 
    setFollowingCoM(false);
    setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
  };

  const handleZoom = (factor: number, mouseX?: number, mouseY?: number) => {
      const currentScale = scaleRef.current;
      const currentOffset = offsetRef.current;
      
      const nextScale = Math.max(0.01, Math.min(100.0, currentScale * factor));
      
      if (Math.abs(nextScale - currentScale) < 0.000001) return;

      const cx = dimensions.width / 2;
      const cy = dimensions.height / 2;

      // Use mouse position if available, otherwise center of screen
      const mx = mouseX ?? cx;
      const my = mouseY ?? cy;

      // Calculate the world coordinates of the point under the mouse/center
      const worldX = (mx - cx - currentOffset.x) / currentScale;
      const worldY = (my - cy - currentOffset.y) / currentScale;
      
      // Calculate new offset such that worldX, worldY projects back to mx, my
      const newOffsetX = mx - cx - worldX * nextScale;
      const newOffsetY = my - cy - worldY * nextScale;
      
      const newOffset = { x: newOffsetX, y: newOffsetY };

      // Update refs immediately for rapid inputs
      scaleRef.current = nextScale;
      offsetRef.current = newOffset;

      setScale(nextScale);
      setOffset(newOffset);
  };

  const handleSelectBody = (id: string | null) => {
    if (!isCreationMode && !isRocketSpawning) {
        setSelectedBodyId(id);
    }
  };

  const handleToggleFollow = (id: string) => {
      setFollowingCoM(false);
      if (followingBodyId === id) {
          setFollowingBodyId(null);
      } else {
          setFollowingBodyId(id);
          const body = bodies.find(b => b.id === id);
          if (body) {
              setOffset({
                  x: -body.position.x * scale,
                  y: -body.position.y * scale
              });
          }
      }
  };

  const handleToggleFollowCoM = () => {
      setFollowingBodyId(null);
      setFollowingCoM(prev => {
          const next = !prev;
          if (!next) {
              lastRefinedCoMRef.current = null;
          }
          return next;
      });
  };

  const handleDeleteBody = (id: string) => {
      setBodies(prev => prev.filter(b => b.id !== id));
      if (selectedBodyId === id) setSelectedBodyId(null);
      if (followingBodyId === id) setFollowingBodyId(null);
      if (observerBodyIds.a === id) setObserverBodyIds(prev => ({ ...prev, a: null }));
      if (observerBodyIds.b === id) setObserverBodyIds(prev => ({ ...prev, b: null }));
  };

  const handleMakeStar = (id: string) => {
      setBodies(prev => prev.map(b => {
          if (b.id === id) {
              return {
                  ...b,
                  isStar: true,
                  mass: Math.max(b.mass, 2000), 
                  radius: Math.max(b.radius, 25),
                  color: b.color === '#FDB813' ? b.color : '#FDB813', 
                  description: b.description + ' (Ignited into a Star)'
              };
          }
          return b;
      }));
  };

  const handleReset = () => {
    const preset = availablePresets.find(p => p.id === currentPresetId) || availablePresets[0];
    const freshBodies = JSON.parse(JSON.stringify(preset.bodies));
    
    setIsRunning(false);
    bodiesRef.current = freshBodies;
    particlesRef.current = [];
    setBodies(freshBodies);
    setParticles([]);
    setOffset({ x: 0, y: 0 });
    setScale(preset.defaultScale);
    setFollowingBodyId(null);
    setFollowingCoM(true); 
    lastRefinedCoMRef.current = null; 
    setObserverBodyIds({ a: null, b: null });
    setPredictionPaths([]);
    simulationTimeRef.current = 0; // Reset simulation clock
    setTimeout(() => setIsRunning(true), 100);
  };

  const handleResetSettings = () => {
      setVisualConfig(DEFAULT_VISUAL_CONFIG);
      setPhysicsConfig(DEFAULT_PHYSICS_CONFIG);
  };

  const handleExportState = () => {
    const bodiesWithoutTrails = bodies.map(b => ({
        ...b,
        trail: []
    }));

    const data: SimulationSaveData = {
      version: 1,
      timestamp: Date.now(),
      bodies: bodiesWithoutTrails,
      visualConfig: visualConfig,
      physicsConfig: physicsConfig,
      camera: {
          scale: scale,
          offset: offset
      }
    };
    
    try {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `nebula-orbit-save-${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (e) {
        console.error("Export failed:", e);
        alert("Failed to export simulation state.");
    }
  };

  const handleImportState = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
          try {
              const data = JSON.parse(event.target?.result as string) as SimulationSaveData;
              if (!data.bodies || !data.visualConfig || !data.physicsConfig) {
                  alert("Invalid save file format. Missing required fields.");
                  return;
              }
              setIsRunning(false);

              const loadedBodies = data.bodies.map(b => ({
                  ...b,
                  trail: []
              }));

              const newPreset: Preset = {
                  id: 'imported_save',
                  name: 'Imported System',
                  bodies: loadedBodies,
                  defaultScale: data.camera?.scale || 1.0,
                  description: `Imported state from ${new Date(data.timestamp).toLocaleString()}`
              };

              setImportedPreset(newPreset);
              setCurrentPresetId('imported_save');

              setBodies(loadedBodies);
              bodiesRef.current = loadedBodies;
              setVisualConfig(data.visualConfig);
              setPhysicsConfig(data.physicsConfig);
              
              setScale(data.camera?.scale || 1.0);
              setOffset({ x: 0, y: 0 });
              
              setParticles([]);
              particlesRef.current = [];
              setSelectedBodyId(null);
              setFollowingBodyId(null);
              setFollowingCoM(true); 
              lastRefinedCoMRef.current = null;
              setObserverBodyIds({ a: null, b: null });
              setPredictionPaths([]);
              simulationTimeRef.current = 0; // Reset clock for imported state
              
              setTimeout(() => setIsRunning(true), 100);
              //alert("Simulation loaded successfully!");
          } catch (err) {
              console.error("Import error", err);
              alert("Failed to load file.");
          }
      };
      reader.readAsText(file);
      e.target.value = '';
  };

  const handlePresetChange = (id: string) => {
      const preset = availablePresets.find(p => p.id === id);
      if (preset) {
          setCurrentPresetId(id);
          const freshBodies = JSON.parse(JSON.stringify(preset.bodies));
          setIsRunning(false);
          setBodies(freshBodies);
          setParticles([]);
          bodiesRef.current = freshBodies;
          particlesRef.current = [];
          setScale(preset.defaultScale);
          setOffset({ x: 0, y: 0 });
          setSelectedBodyId(null);
          setFollowingBodyId(null);
          setFollowingCoM(true); 
          lastRefinedCoMRef.current = null;
          setObserverBodyIds({ a: null, b: null });
          setPredictionPaths([]);
          simulationTimeRef.current = 0; // Reset clock for preset
          if (id !== 'imported_save') {
             setPhysicsConfig({ gravitationalConstant: 0.5, collisions: true, timeStep: 0.5 });
          }
          setTimeout(() => setIsRunning(true), 100);
      }
  };

  const handleAddBody = (data: NewBodyData) => {
    const newBody = createBody(
        `custom_${Date.now()}`,
        data.name,
        data.mass,
        data.radius,
        data.color,
        data.distance,
        data.velocity,
        'A user-created celestial object.',
        `${data.mass} units`,
        `${data.radius * 2} units`
    );

    const updated = [...bodiesRef.current, newBody];
    bodiesRef.current = updated;
    setBodies(updated);
  };

  const toggleCreationMode = () => {
      if (isCreationMode) {
          setIsCreationMode(false);
          setCreationCandidate(null);
          setPredictionPaths([]);
          setIsRunning(true);
      } else {
          setIsCreationMode(true);
          setIsRunning(false);
      }
  };

  const updateRocket = (id: string, updates: Partial<Body>) => {
      const updated = bodies.map(b => b.id === id ? { ...b, ...updates } : b);
      setBodies(updated);
      bodiesRef.current = updated;
  };

  const handleSpawnRocket = (parentBodyName?: string) => {
      let spawnPos = { x: 0, y: 0 };
      let spawnVel = { x: 0, y: 0 };
      let angle = 0;
      let parentBody = null;

      if (parentBodyName) {
          parentBody = bodiesRef.current.find(b => b.name.toLowerCase().includes(parentBodyName.toLowerCase()));
      }
      
      if (parentBody) {
          const spawnDist = parentBody.radius + rocketSpawnConfig.radius;
          spawnPos = { x: parentBody.position.x, y: parentBody.position.y - spawnDist };
          spawnVel = { ...parentBody.velocity };
          angle = -Math.PI / 2;
      } else {
          spawnPos = { x: 50, y: 50 }; 
      }

      const newRocket = createBody(
          `rocket_${Date.now()}`,
          rocketSpawnConfig.name,
          rocketSpawnConfig.mass, 
          rocketSpawnConfig.radius, 
          rocketSpawnConfig.color,
          0, 0,
          'A maneuverable spacecraft.'
      );
      newRocket.position = spawnPos;
      newRocket.velocity = spawnVel;
      newRocket.isRocket = true;
      newRocket.angle = angle;
      newRocket.thrust = { x: 0, y: 0 };
      newRocket.maneuvers = [];
      newRocket.landedOnBodyId = parentBody?.id; 
      newRocket.fuel = 100;
      newRocket.maxFuel = 100;
      newRocket.dryMass = rocketSpawnConfig.mass;

      const updated = [...bodiesRef.current, newRocket];
      setBodies(updated);
      bodiesRef.current = updated;
      setSelectedBodyId(newRocket.id);
      setShowRocketPanel(true); 
      return newRocket.id;
  };

  const handleCanvasClick = (screenX: number, screenY: number) => {
      const cx = dimensions.width / 2 + offset.x;
      const cy = dimensions.height / 2 + offset.y;
      const worldX = (screenX - cx) / scale;
      const worldY = (screenY - cy) / scale;

      if (showRocketPanel && isRocketSpawning) {
          let spawnPos = { x: worldX, y: worldY };
          let spawnVel = { x: 0, y: 0 };
          let nearestDist = Infinity;
          let parentBody: Body | null = null;

          for (const b of bodies) {
              const dx = worldX - b.position.x;
              const dy = worldY - b.position.y;
              const dist = Math.sqrt(dx*dx + dy*dy);
              if (dist < b.radius * 2) { 
                  if (dist < nearestDist) {
                      nearestDist = dist;
                      parentBody = b;
                  }
              }
          }

          if (parentBody) {
              const angle = Math.atan2(worldY - parentBody.position.y, worldX - parentBody.position.x);
              const spawnDist = parentBody.radius + rocketSpawnConfig.radius; 
              spawnPos = {
                  x: parentBody.position.x + Math.cos(angle) * spawnDist,
                  y: parentBody.position.y + Math.sin(angle) * spawnDist
              };
              spawnVel = { ...parentBody.velocity }; 
          }

          const newRocket = createBody(
              `rocket_${Date.now()}`,
              rocketSpawnConfig.name,
              rocketSpawnConfig.mass, 
              rocketSpawnConfig.radius, 
              rocketSpawnConfig.color, 
              0, 0,
              'A maneuverable spacecraft.'
          );
          
          newRocket.position = spawnPos;
          newRocket.velocity = spawnVel;
          newRocket.isRocket = true;
          newRocket.angle = parentBody ? Math.atan2(worldY - parentBody.position.y, worldX - parentBody.position.x) : 0;
          newRocket.thrust = { x: 0, y: 0 };
          newRocket.maneuvers = [];
          if (parentBody) newRocket.landedOnBodyId = parentBody.id;
          
          newRocket.fuel = 100; 
          newRocket.maxFuel = 100;
          newRocket.dryMass = rocketSpawnConfig.mass;

          setBodies(prev => [...prev, newRocket]);
          bodiesRef.current = [...bodiesRef.current, newRocket];
          setSelectedBodyId(newRocket.id);
          setIsRocketSpawning(false); 
          return;
      }

      if (isCreationMode) {
          if (creationCandidate) {
              setCreationCandidate(prev => prev ? ({
                  ...prev,
                  position: { x: worldX, y: worldY }
              }) : null);
          } else {
              const newCandidate = createBody(
                  `manual_${Date.now()}`,
                  'New Body',
                  20, 8, '#4ECDC4', 0, 0, 'Manually placed body'
              );
              newCandidate.position = { x: worldX, y: worldY };
              newCandidate.velocity = { x: 0, y: 0 }; 
              setCreationCandidate(newCandidate);
              
              // Calculate initial prediction
              const allBodies = [...bodies, newCandidate];
              const newPaths = predictSystemTrajectories(
                allBodies,
                predictionSteps,
                physicsConfig.timeStep,
                physicsConfig.gravitationalConstant,
                [newCandidate.id]
              );
              setPredictionPaths(newPaths);
          }
      }
  };

  const handleUpdateCandidate = (updates: Partial<Body>) => {
    if (!creationCandidate) return;
    const updated = { ...creationCandidate, ...updates };
    setCreationCandidate(updated);
    
    // Recalculate prediction for the updated candidate
    const allBodies = [...bodies, updated];
    const newPaths = predictSystemTrajectories(
      allBodies,
      predictionSteps,
      physicsConfig.timeStep,
      physicsConfig.gravitationalConstant,
      [updated.id]
    );
    setPredictionPaths(newPaths);
  };

  const handleSpawnManual = () => {
      if (creationCandidate) {
          setBodies(prev => [...prev, creationCandidate]);
          bodiesRef.current = [...bodiesRef.current, creationCandidate];
          setCreationCandidate(null); 
      }
  };

  const assistantActions: AssistantActions = {
      spawnBody: (name, mass, distance, velocity, color) => {
          handleAddBody({ name, mass, distance, velocity, color, radius: Math.max(4, Math.log(mass) * 3) });
          return `Created body '${name}' successfully.`;
      },
      deleteBody: (name) => {
          const body = bodiesRef.current.find(b => b.name.toLowerCase().includes(name.toLowerCase()));
          if (body) {
              handleDeleteBody(body.id);
              return `Deleted ${body.name} from the simulation.`;
          }
          return `Could not find body named '${name}' to delete.`;
      },
      makeStar: (name) => {
          const body = bodiesRef.current.find(b => b.name.toLowerCase().includes(name.toLowerCase()));
          if (body) {
              handleMakeStar(body.id);
              return `Ignited ${body.name} into a star!`;
          }
          return `Could not find body named '${name}'.`;
      },
      setSimulationState: (run, spd) => {
          if (run !== undefined) setIsRunning(run);
          if (spd !== undefined) setSpeed(spd);
          return `Simulation state updated. Running: ${run ?? isRunning}, Speed: ${spd ?? speed}`;
      },
      changePreset: (presetId) => {
          const preset = availablePresets.find(p => p.id === presetId);
          if (preset) {
            handlePresetChange(presetId);
            return `Loaded preset: ${preset.name}`;
          }
          return `Preset '${presetId}' not found.`;
      },
      selectBody: (bodyName) => {
          const body = bodiesRef.current.find(b => b.name.toLowerCase().includes(bodyName.toLowerCase()));
          if (body) {
              setSelectedBodyId(body.id);
              return `Selected ${body.name}`;
          }
          return `Could not find body named '${bodyName}'.`;
      },
      followBody: (bodyName) => {
        const body = bodiesRef.current.find(b => b.name.toLowerCase().includes(bodyName.toLowerCase()));
        if (body) {
            handleToggleFollow(body.id);
            setFollowingBodyId(body.id); 
            setSelectedBodyId(body.id);
            return `Camera locked on ${body.name}.`;
        }
        return `Could not find body named '${bodyName}'.`;
      },
      followCenterOfMass: () => {
          handleToggleFollowCoM();
          return followingCoM ? "Stopped following Center of Mass." : "Camera locked on the system's Center of Mass.";
      },
      configureVisuals: (config) => {
          setVisualConfig(prev => ({ ...prev, ...config }));
          return "Visual settings updated.";
      },
      configurePhysics: (config) => {
          setPhysicsConfig(prev => ({ ...prev, ...config }));
          return "Physics constants updated.";
      },
      setCamera: (zoom, reset) => {
          if (reset) {
             setOffset({ x: 0, y: 0 });
             setFollowingBodyId(null);
             setFollowingCoM(false);
             setScale(availablePresets.find(p => p.id === currentPresetId)?.defaultScale || 1);
             return "Camera reset to default.";
          }
          if (zoom) {
              setScale(Math.max(0.05, Math.min(10.0, zoom)));
              return `Zoom set to ${zoom}.`;
          }
          return "No camera changes made.";
      },
      spawnRocket: (parentBodyName) => {
          handleSpawnRocket(parentBodyName);
          return `Rocket spawned${parentBodyName ? ` on ${parentBodyName}` : ' in space'}. Panel opened.`;
      },
      controlRocket: (rocketName, action, value) => {
          const rocket = bodiesRef.current.find(b => b.isRocket && b.name.toLowerCase().includes(rocketName.toLowerCase()));
          if (!rocket) return `Rocket '${rocketName}' not found.`;
          
          if (action === 'rotate') {
              const delta = (value || 0) * Math.PI / 180;
              updateRocket(rocket.id, { angle: (rocket.angle || 0) + delta });
              return `Rotated ${rocket.name} by ${value} degrees.`;
          } else if (action === 'thrust') {
              const power = value !== undefined ? value : 0.05;
              const angle = rocket.angle || 0;
              updateRocket(rocket.id, { 
                  thrust: { x: Math.cos(angle)*power, y: Math.sin(angle)*power } 
              });
              return `Main engines engaged on ${rocket.name} at ${power}N.`;
          } else if (action === 'stop') {
              updateRocket(rocket.id, { thrust: { x: 0, y: 0 } });
              return `Engines cut on ${rocket.name}.`;
          }
          return "Unknown action.";
      },
      programAdvancedFlightPlan: (rocketName, maneuvers) => {
          const rocket = bodiesRef.current.find(b => b.isRocket && b.name.toLowerCase().includes(rocketName.toLowerCase()));
          if (!rocket) return `Rocket '${rocketName}' not found.`;
          
          const newManeuvers: Maneuver[] = maneuvers.map((m: any, idx: number) => {
             const maneuver: Maneuver = {
                 id: `m_${Date.now()}_${idx}`,
                 type: m.type,
                 thrust: m.thrust || 0,
                 duration: m.duration || 0,
                 angleOffset: m.angleOffset ? (m.angleOffset * Math.PI) / 180 : 0,
                 progress: 0,
                 status: 'pending'
             };

             // Map specific parameters
             if (m.type === 'rotate') {
                 maneuver.param = m.rotationAngle;
             } else if (m.type === 'sas') {
                 maneuver.param = m.sasMode;
             } else if (m.type === 'wait_for_transfer') {
                 maneuver.param = m.phaseAngleError || 1.0;
             } else if (m.type === 'wait_for_altitude') {
                 maneuver.param = `${m.targetAltitude}:${m.altitudeDirection || 'ascending'}`;
             } else if (m.type === 'burn_until_altitude') {
                 maneuver.param = m.targetAltitude;
             } else if (m.type === 'change_simulation_speed') {
                 maneuver.param = m.simulationSpeed;
             }

             // Map body references
             if (m.targetBodyName) {
                 const target = bodiesRef.current.find(b => b.name.toLowerCase() === m.targetBodyName.toLowerCase());
                 if (target) maneuver.targetBodyId = target.id;
             }
             if (m.parentBodyName) {
                 const parent = bodiesRef.current.find(b => b.name.toLowerCase() === m.parentBodyName.toLowerCase());
                 if (parent) maneuver.parentBodyId = parent.id;
             }

             return maneuver;
          });
          
          updateRocket(rocket.id, { maneuvers: newManeuvers });
          return `Flight plan with ${newManeuvers.length} maneuvers programmed for ${rocket.name}.`;
      },
      executeManeuverPlan: (rocketName) => {
          const rocket = bodiesRef.current.find(b => b.isRocket && b.name.toLowerCase().includes(rocketName.toLowerCase()));
          if (!rocket) return `Rocket '${rocketName}' not found.`;
          
          if (!rocket.maneuvers || rocket.maneuvers.filter(m => m.status === 'pending').length === 0) {
              return `No pending maneuvers found for ${rocket.name}. Program a flight plan first.`;
          }

          const updated = rocket.maneuvers.map(m => {
              if (m.status === 'pending') return { ...m, status: 'active' as const };
              return m;
          });
          updateRocket(rocket.id, { maneuvers: updated });
          return `Flight plan execution started for ${rocket.name}.`;
      },
      getRocketTelemetry: (rocketName, targetBodyName) => {
          const rocket = bodiesRef.current.find(b => b.isRocket && b.name.toLowerCase().includes(rocketName.toLowerCase()));
          if (!rocket) return `Rocket '${rocketName}' not found.`;
          
          const speed = Math.sqrt(rocket.velocity.x**2 + rocket.velocity.y**2).toFixed(2);
          let result = `Rocket: ${rocket.name}\nSpeed: ${speed} units/s\nHeading: ${((rocket.angle||0) * 180 / Math.PI).toFixed(1)}°\nFuel: ${rocket.fuel?.toFixed(1)}/${rocket.maxFuel}`;
          
          if (targetBodyName) {
              const target = bodiesRef.current.find(b => b.name.toLowerCase().includes(targetBodyName.toLowerCase()));
              if (target) {
                  const dx = target.position.x - rocket.position.x;
                  const dy = target.position.y - rocket.position.y;
                  const dist = Math.sqrt(dx*dx + dy*dy);
                  const dvx = rocket.velocity.x - target.velocity.x;
                  const dvy = rocket.velocity.y - target.velocity.y;
                  const dv = Math.sqrt(dvx*dvx + dvy*dvy);
                  
                  result += `\nTarget: ${target.name}\nDistance: ${dist.toFixed(1)} units\nDelta V: ${dv.toFixed(2)} units/s`;
              } else {
                  result += `\nTarget body '${targetBodyName}' not found.`;
              }
          }
          return result;
      }
  };

  return (
    <div className="relative w-full h-full bg-black overflow-hidden select-none">
      {use3D ? (
        <Canvas3D 
            bodies={bodies} 
            particles={particles}
            width={dimensions.width}
            height={dimensions.height}
            scale={scale}
            offset={offset}
            onPan={handlePan}
            onZoom={handleZoom}
            onSelectBody={handleSelectBody}
            selectedBodyId={selectedBodyId}
            visualConfig={visualConfig}
            physicsConfig={physicsConfig}
            isCreationMode={isCreationMode}
            creationCandidate={creationCandidate}
            predictionPaths={predictionPaths}
            onCanvasClick={handleCanvasClick}
            isRocketMode={showRocketPanel}
            isRocketSpawning={isRocketSpawning}
            rocketTargetBodyId={rocketTargetBodyId}
            observerBodyIds={observerBodyIds}
            coMData={currentCoMData}
            showTransferWindow={showTransferWindow}
            showTheoreticalOrbit={showTheoreticalOrbit}
            followingBodyId={followingBodyId}
            followingCoM={followingCoM}
            flightComputerModules={flightComputerModules}
        />
      ) : (
        <Canvas 
            bodies={bodies} 
            particles={particles}
            width={dimensions.width}
            height={dimensions.height}
            scale={scale}
            offset={offset}
            onPan={handlePan}
            onZoom={handleZoom}
            onSelectBody={handleSelectBody}
            selectedBodyId={selectedBodyId}
            visualConfig={visualConfig}
            physicsConfig={physicsConfig}
            isCreationMode={isCreationMode}
            creationCandidate={creationCandidate}
            predictionPaths={predictionPaths}
            onCanvasClick={handleCanvasClick}
            isRocketMode={showRocketPanel}
            isRocketSpawning={isRocketSpawning}
            rocketTargetBodyId={rocketTargetBodyId}
            observerBodyIds={observerBodyIds}
            coMData={currentCoMData}
            showTransferWindow={showTransferWindow}
            showTheoreticalOrbit={showTheoreticalOrbit}
            flightComputerModules={flightComputerModules}
        />
      )}

      {/* DEBUG PANEL */}
      <div className={`fixed ${isMobile ? 'top-0 right-0' : 'top-4 right-4'} z-10 pointer-events-auto font-mono text-xs`}>
          <div className="bg-slate-900/90 border border-slate-700 text-green-400 px-3 py-2 rounded-lg shadow-lg backdrop-blur-sm space-y-2">
              {/* Time and FPS Row */}
              <div className="flex items-center gap-3">
                  <Terminal size={12} />
                  <div className="font-bold">
                      {(() => {
                          const totalSeconds = Math.floor(simulationTimeRef.current);
                          const years = Math.floor(totalSeconds / (365.25 * 24 * 3600));
                          const months = Math.floor((totalSeconds % (365.25 * 24 * 3600)) / (30.44 * 24 * 3600));
                          const days = Math.floor((totalSeconds % (30.44 * 24 * 3600)) / (24 * 3600));
                          const hours = Math.floor((totalSeconds % (24 * 3600)) / 3600);
                          const minutes = Math.floor((totalSeconds % 3600) / 60);
                          let seconds = totalSeconds % 60;  

                          const parts = [];
                          if (years > 0) parts.push(`${years}y`);
                          if (months > 0) parts.push(months < 10 ? `0${months}mo` : `${months}mo`);
                          if (days > 0) parts.push(days < 10 ? `0${days}d` : `${days}d`);
                          if (hours > 0) parts.push(hours < 10 ? `0${hours}h` : `${hours}h`);
                          if (minutes > 0) parts.push(minutes < 10 ? `0${minutes}m` : `${minutes}m`);
                          else if (parts.length > 0) parts.push('00m');
                          if (seconds > 0) parts.push(seconds < 10 ? `0${seconds}s` : `${seconds}s`);
                          else if (parts.length > 0) parts.push('00s');
                          
                          return parts.length > 0 ? parts.join(' ') : `${totalSeconds.toFixed(1)}s`;
                      })()}
                  </div>
                  <div className="w-px h-3 bg-slate-700 mx-1" />
                  <div className={fps < 30 ? "text-red-400" : "text-green-400"}>{fps.toFixed(0)} FPS</div>
              </div>

              {/* Extended Debug Info (Desktop Only) */}
              {!isMobile && (
                  <>
                    <div className="h-px bg-slate-700/50" />
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-slate-400">
                        <div>Bodies: <span className="text-slate-200">{bodies.length}</span></div>
                        <div>Particles: <span className="text-slate-200">{particles.length}</span></div>
                        <div>Scale: <span className="text-slate-200">{scale.toExponential(2)}</span></div>
                        <div>Physics: <span className="text-slate-200">{physicsConfig.timeStep * 1000}ms</span></div>
                        {memoryUsage && (
                             <div className="col-span-2 flex items-center gap-1 mt-1 pt-1 border-t border-slate-700/30">
                                <MemoryStick size={10} />
                                <span>{memoryUsage.used.toFixed(0)}MB / {memoryUsage.total.toFixed(0)}MB ({memoryUsage.percent.toFixed(0)}%)</span>
                             </div>
                        )}
                    </div>
                  </>
              )}
          </div>
      </div>
      
      {/* Flight Computer Panel */}
      <FlightComputerPanel 
          modules={flightComputerModules}
          bodies={bodies}
          physicsConfig={physicsConfig}
          onAddModule={handleAddModule}
          onRemoveModule={handleRemoveModule}
          onUpdateModule={handleUpdateModule}
          onToggleModule={handleToggleModule}
      />

      {/* Assistant */}
      {showAssistant && (
          <Assistant 
            selectedBodyName={selectedBodyId ? bodies.find(b => b.id === selectedBodyId)?.name || null : null}
            actions={assistantActions}
            bodies={bodies}
          />
      )}
      
      {/* NEW ROCKET HUD */}
      {!isMobile && showRocketPanel && selectedBodyId && bodies.find(b => b.id === selectedBodyId)?.isRocket && (
          <RocketDataPanel 
             rocket={bodies.find(b => b.id === selectedBodyId)!}
             bodies={bodies}
             physicsConfig={physicsConfig}
             parentBodyId={rocketParentBodyId}
             targetBodyId={rocketTargetBodyId}
             predictionPaths={predictionPaths}
             predictionSteps={predictionSteps}
             predictSystem={isPredictionEnabled}
          />
      )}

      {/* Global Prediction Panel */}
      <PredictionPanel 
          bodies={bodies}
          isEnabled={isPredictionEnabled}
          onToggleEnabled={setIsPredictionEnabled}
          predictionSteps={predictionSteps}
          onStepsChange={setPredictionSteps}
          selectedBodyIds={predictionBodyIds}
          onToggleBody={(id) => {
              setPredictionBodyIds(prev => 
                  prev.includes(id) ? prev.filter(bId => bId !== id) : [...prev, id]
              );
          }}
          followingBodyId={followingBodyId}
          onFollowBody={handleToggleFollow}
      />

      {showRocketPanel && (
          <RocketPanel 
            onClose={() => setShowRocketPanel(false)}
            onSpawnToggle={() => setIsRocketSpawning(!isRocketSpawning)}
            isSpawning={isRocketSpawning}
            spawnConfig={rocketSpawnConfig}
            onUpdateSpawnConfig={setRocketSpawnConfig}
            selectedRocket={bodies.find(b => b.id === selectedBodyId && b.isRocket) || null}
            onUpdateRocket={updateRocket}
            isFollowing={followingBodyId === selectedBodyId}
            onToggleFollow={() => selectedBodyId && handleToggleFollow(selectedBodyId)}
            bodies={bodies}
            physicsConfig={physicsConfig}
            targetBodyId={rocketTargetBodyId}
            onTargetChange={setRocketTargetBodyId}
            speed={speed}
            onSpeedChange={setSpeed}
            onUpdatePhysicsConfig={(c) => setPhysicsConfig(prev => ({ ...prev, ...c }))}
            getSimulationTime={() => simulationTimeRef.current}
            parentBodyId={rocketParentBodyId}
            onParentChange={setRocketParentBodyId}
            showTransferWindow={showTransferWindow}
            onToggleTransferWindow={() => setShowTransferWindow(!showTransferWindow)}
            showTheoreticalOrbit={showTheoreticalOrbit}
            onToggleTheoreticalOrbit={() => setShowTheoreticalOrbit(!showTheoreticalOrbit)}
            predictionPaths={predictionPaths}
            predictionSteps={predictionSteps}
            predictSystem={isPredictionEnabled}
          />
      )}

      {selectedBodyId && !isCreationMode && !isRocketSpawning && !showRocketPanel && (
        <InfoPanel 
            body={bodies.find(b => b.id === selectedBodyId) || null} 
            onClose={() => setSelectedBodyId(null)}
            allBodies={bodies}
            isFollowing={followingBodyId === selectedBodyId}
            onToggleFollow={() => selectedBodyId && handleToggleFollow(selectedBodyId)}
            onDelete={handleDeleteBody}
            onMakeStar={handleMakeStar}
        />
      )}

      {showBuilder && (
          <BuilderPanel 
            onClose={() => setShowBuilder(false)}
            onAddBody={handleAddBody}
          />
      )}

      {isCreationMode && creationCandidate && (
          <ManualCreationPanel
            candidate={creationCandidate}
            predictionSteps={predictionSteps}
            onUpdate={handleUpdateCandidate}
            onStepsChange={setPredictionSteps}
            onSpawn={handleSpawnManual}
            onCancel={() => {
                setIsCreationMode(false);
                setCreationCandidate(null);
            }}
          />
      )}

      {showSettings && (
          <SettingsPanel
            visualConfig={visualConfig}
            setVisualConfig={setVisualConfig}
            physicsConfig={physicsConfig}
            setPhysicsConfig={setPhysicsConfig}
            onClose={() => setShowSettings(false)}
            onReset={handleResetSettings}
            onExport={handleExportState}
            onImport={handleImportState}
            use3D={use3D}
            setUse3D={setUse3D}
          />
      )}

      {showObserver && (
          <GravityObserverPanel
            bodies={bodies}
            bodyIdA={observerBodyIds.a}
            bodyIdB={observerBodyIds.b}
            onSelectA={(id) => setObserverBodyIds(prev => ({ ...prev, a: id }))}
            onSelectB={(id) => setObserverBodyIds(prev => ({ ...prev, b: id }))}
            onClose={() => setShowObserver(false)}
            gConstant={physicsConfig.gravitationalConstant}
          />
      )}

      {currentCoMData && visualConfig.showCenterOfMass && (
          <CoMInfoPanel
             coMData={currentCoMData}
             threshold={visualConfig.centerOfMassThreshold}
             onThresholdChange={(v) => setVisualConfig(prev => ({ ...prev, centerOfMassThreshold: v }))}
          />
      )}

      <Controls 
        isRunning={isRunning} 
        onTogglePlay={() => setIsRunning(!isRunning)} 
        onReset={handleReset}
        speed={speed}
        onSpeedChange={setSpeed}
        onZoom={(factor) => handleZoom(factor)} // Passed wrapped
        onOpenBuilder={() => setShowBuilder(true)}
        onOpenSettings={() => setShowSettings(true)}
        presets={availablePresets}
        currentPresetId={currentPresetId}
        onSelectPreset={handlePresetChange}
        showGrid={visualConfig.showGrid}
        onToggleGrid={() => setVisualConfig(prev => ({ ...prev, showGrid: !prev.showGrid }))}
        showAssistant={showAssistant}
        onToggleAssistant={() => setShowAssistant(!showAssistant)}
        isCreationMode={isCreationMode}
        onToggleCreationMode={toggleCreationMode}
        showObserver={showObserver}
        onToggleObserver={() => setShowObserver(!showObserver)}
        isFollowingCoM={followingCoM}
        onToggleFollowCoM={handleToggleFollowCoM}
        showCenterOfMass={visualConfig.showCenterOfMass}
        onToggleShowCoM={() => setVisualConfig(prev => ({ ...prev, showCenterOfMass: !prev.showCenterOfMass }))}
        showRocketPanel={showRocketPanel}
        onToggleRocketPanel={() => setShowRocketPanel(!showRocketPanel)}
      />
    </div>
  );
};

export default App;