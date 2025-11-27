

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Canvas from './components/Canvas';
import Controls from './components/Controls';
import InfoPanel from './components/InfoPanel';
import Assistant from './components/Assistant';
import BuilderPanel, { NewBodyData } from './components/BuilderPanel';
import ManualCreationPanel from './components/ManualCreationPanel';
import SettingsPanel from './components/SettingsPanel';
import GravityObserverPanel from './components/GravityObserverPanel';
import CoMInfoPanel from './components/CoMInfoPanel';
import RocketPanel from './components/RocketPanel';
import RocketDataPanel from './components/RocketDataPanel';
import PredictionPanel from './components/PredictionPanel';
import { PRESETS, createBody, DEFAULT_VISUAL_CONFIG, DEFAULT_PHYSICS_CONFIG } from './constants';
import { updatePhysics, predictSystemTrajectories } from './services/physicsEngine';
import { Body, Vector2D, AssistantActions, Particle, VisualConfig, PhysicsConfig, SimulationSaveData, Preset, CoMData, Maneuver, RocketSpawnConfig } from './types';
import { Terminal, Activity } from 'lucide-react';

const App: React.FC = () => {
  // --- State ---
  const defaultPreset = PRESETS.find(p => p.id === 'blank') || PRESETS[0];

  const [currentPresetId, setCurrentPresetId] = useState(defaultPreset.id);
  const [importedPreset, setImportedPreset] = useState<Preset | null>(null);
  
  const availablePresets = useMemo(() => {
      return importedPreset ? [...PRESETS, importedPreset] : PRESETS;
  }, [importedPreset]);

  const [bodies, setBodies] = useState<Body[]>(defaultPreset.bodies);
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

  // Manual Creation Mode State
  const [isCreationMode, setIsCreationMode] = useState(false);
  const [creationCandidate, setCreationCandidate] = useState<Body | null>(null);
  const [predictionPaths, setPredictionPaths] = useState<{ id: string, color: string, points: Vector2D[] }[]>([]);


  const [visualConfig, setVisualConfig] = useState<VisualConfig>(DEFAULT_VISUAL_CONFIG);
  const [physicsConfig, setPhysicsConfig] = useState<PhysicsConfig>(DEFAULT_PHYSICS_CONFIG);
  const [currentCoMData, setCurrentCoMData] = useState<CoMData | null>(null);
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [fps, setFps] = useState(0);
  
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

  // Refs for Prediction Logic (to access fresh state inside animate loop)
  // Refs for Prediction Logic (to access fresh state inside animate loop)
  const selectedBodyIdRef = useRef(selectedBodyId);
  const isCreationModeRef = useRef(isCreationMode);
  const creationCandidateRef = useRef(creationCandidate);
  const predictionStepsRef = useRef(predictionSteps);
  const isPredictionEnabledRef = useRef(isPredictionEnabled);
  const predictionBodyIdsRef = useRef(predictionBodyIds);

  useEffect(() => { bodiesRef.current = bodies; }, [bodies]);
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

  useEffect(() => {
      if (bodies.length === 0) {
          lastRefinedCoMRef.current = null;
      }
  }, [bodies.length]);

  useEffect(() => {
    const handleResize = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
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
      
      let nextParticles = particlesRef.current.map(p => ({
          ...p,
          x: p.x + p.vx * dt,
          y: p.y + p.vy * dt,
          life: p.life - p.decay * speed 
      })).filter(p => p.life > 0);

      if (physicsResult.newParticles.length > 0) {
          nextParticles = [...nextParticles, ...physicsResult.newParticles];
      }

      bodiesRef.current = nextBodies;
      particlesRef.current = nextParticles;
      setBodies(nextBodies);
      setParticles(nextParticles);

      // --- PREDICTION TRAILS (Throttled: Every 10 frames) ---
      // --- PREDICTION TRAILS (Throttled: Every 10 frames) ---
      if (frameCountRef.current % 10 === 0) {
          let newPaths: { id: string, color: string, points: Vector2D[] }[] = [];
          
          if (isCreationModeRef.current && creationCandidateRef.current) {
               const allBodies = [...bodiesRef.current, creationCandidateRef.current];
               newPaths = predictSystemTrajectories(
                   allBodies, 
                   predictionStepsRef.current, 
                   physicsConfigRef.current.timeStep, 
                   physicsConfigRef.current.gravitationalConstant,
                   [creationCandidateRef.current.id] 
               );
          } else if (isPredictionEnabledRef.current) {
               newPaths = predictSystemTrajectories(
                  bodiesRef.current,
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
      
      const nextScale = Math.max(0.05, Math.min(10.0, currentScale * factor));
      
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
              newCandidate.velocity = { x: 2, y: 0 }; 
              setCreationCandidate(newCandidate);
          }
      }
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
      programManeuver: (rocketName, thrust, duration, angleOffset) => {
          const rocket = bodiesRef.current.find(b => b.isRocket && b.name.toLowerCase().includes(rocketName.toLowerCase()));
          if (!rocket) return `Rocket '${rocketName}' not found.`;
          
          const newManeuver: Maneuver = {
            id: `m_${Date.now()}`,
            type: 'burn',
            thrust,
            duration,
            angleOffset: (angleOffset * Math.PI) / 180,
            progress: 0,
            status: 'pending'
          };
          
          const updated = rocket.maneuvers ? [...rocket.maneuvers, newManeuver] : [newManeuver];
          updateRocket(rocket.id, { maneuvers: updated });
          
          return `Maneuver programmed for ${rocket.name}: ${thrust}N for ${duration}s. Use 'Control Panel' to execute.`;
      },
      programFlightPlan: (rocketName, plan) => {
          const rocket = bodiesRef.current.find(b => b.isRocket && b.name.toLowerCase().includes(rocketName.toLowerCase()));
          if (!rocket) return `Rocket '${rocketName}' not found.`;
          
          const newManeuvers: Maneuver[] = plan.map((p, idx) => ({
             id: `m_${Date.now()}_${idx}`,
             type: 'burn',
             thrust: p.thrust,
             duration: p.duration,
             angleOffset: (p.angleOffset * Math.PI) / 180,
             progress: 0,
             status: 'pending'
          }));
          
          const existingNonPending = rocket.maneuvers ? rocket.maneuvers.filter(m => m.status !== 'pending') : [];
          updateRocket(rocket.id, { maneuvers: [...existingNonPending, ...newManeuvers] });
          
          return `Flight plan programmed for ${rocket.name} with ${newManeuvers.length} steps. Ready to execute.`;
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
      />

      {/* DEBUG PANEL */}
      <div className="fixed bottom-4 left-4 z-50 pointer-events-none font-mono text-xs">
          <div className="bg-slate-900/80 border border-slate-700 text-green-400 px-3 py-2 rounded-lg shadow-lg backdrop-blur-sm flex items-center gap-3">
              <Terminal size={12} />
              <div className="font-bold">
                  T+ {simulationTimeRef.current.toFixed(2)}s
              </div>
              <div className="h-4 w-px bg-slate-700 mx-2"></div>
              <div className={`font-bold flex items-center gap-2 ${fps < 30 ? 'text-red-400' : 'text-blue-400'}`}>
                  <Activity size={12} /> {fps} FPS
              </div>
          </div>
      </div>
      
      {showAssistant && (
          <Assistant 
            selectedBodyName={selectedBodyId ? bodies.find(b => b.id === selectedBodyId)?.name || null : null}
            actions={assistantActions}
            bodies={bodies}
          />
      )}
      
      {/* NEW ROCKET HUD */}
      {showRocketPanel && selectedBodyId && bodies.find(b => b.id === selectedBodyId)?.isRocket && (
          <RocketDataPanel 
             rocket={bodies.find(b => b.id === selectedBodyId)!}
             bodies={bodies}
             physicsConfig={physicsConfig}
             parentBodyId={rocketParentBodyId}
             targetBodyId={rocketTargetBodyId}
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
            assistantActions={assistantActions}
          />
      )}

      {selectedBodyId && !isCreationMode && !isRocketSpawning && (
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
            onUpdate={(u) => setCreationCandidate(prev => prev ? ({ ...prev, ...u }) : null)}
            onStepsChange={setPredictionSteps}
            onSpawn={handleSpawnManual}
            onCancel={toggleCreationMode}
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