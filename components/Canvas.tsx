import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Body, Vector2D, Particle, VisualConfig, PhysicsConfig, CoMData, FlightComputerModule, FlightComputerInput, RendezvousSolution } from '../types';
import { calculateForces, calculateOrbitalPoints, calculateEllipsePoints } from '../services/physicsEngine';
import { resolveInput, resolveStringInput, resolveScalarInput, resolveBooleanInput, calculateTransferInfo, performRaycast } from '@/services/orbitalMath';
import { isModuleActive } from './flight_computer/utils';
import { drawShip } from './ship';
import { drawBeautifullPlanetGemini } from './PlanetsGemini';
import { drawBeautifulPlanetOpenAi } from './PlanetsOpenAI';
import { drawApple } from './Apple';

interface CanvasProps {
    bodiesRef: React.MutableRefObject<Body[]>; // CHANGED: Pass Ref
    particlesRef: React.MutableRefObject<Particle[]>; // CHANGED: Pass Ref
    width: number;
    height: number;
    scale: number;
    offset: Vector2D;
    onPan: (dx: number, dy: number) => void;
    onZoom: (delta: number, clientX?: number, clientY?: number) => void;
    onSelectBody: (id: string | null) => void;
    selectedBodyId: string | null;
    visualConfig: VisualConfig;
    physicsConfig: PhysicsConfig;

    // Creation Mode Props
    isCreationMode: boolean;
    creationCandidate: Body | null;
    predictionPaths: { id: string, color: string, points: Vector2D[] }[];
    onCanvasClick: (x: number, y: number) => void;

    // Rocket Props
    isRocketMode: boolean;
    isRocketSpawning: boolean;
    rocketTargetBodyId?: string;

    // Observer Mode Props
    observerBodyIds: { a: string | null; b: string | null };

    // Center of Mass Data
    coMData: CoMData | null;

    // Visualization Toggles
    showTransferWindow: boolean;
    showTheoreticalOrbit: boolean;
    flightComputerModules: FlightComputerModule[];
    rendezvousPoint?: Vector2D | null; // Legacy from RocketPanel
    rendezvousPoints?: Array<{
        point: Vector2D;
        name: string;
        color: string;
        moduleId: string;
        timeToRendezvous: number;
        distance: number;
        deltaVPrograde: number;
        deltaVRadial: number;
        totalDeltaV: number;
    }>;
}

// ... (Star, NebulaCloud, GravitationalWave interfaces remain same)

// ... (Helper functions remain same)

interface Star {
    x: number; // Normalized 0-1
    y: number; // Normalized 0-1
    size: number;
    alpha: number;
    layer: number; // 0 (far) to 2 (close)
    twinkleOffset: number;
}

interface NebulaCloud {
    x: number; // Normalized 0-1
    y: number; // Normalized 0-1
    radius: number;
    color: string;
}

interface GravitationalWave {
    x: number;
    y: number;
    radius: number; // World units
    maxRadius: number;
    alpha: number;
    color: string;
    speed: number; // Expansion speed (World units per frame)
}

const sanitizeMarkerColor = (value?: string | null, fallback = '#ffffff') => {
    if (!value) return fallback;
    const trimmed = value.trim();
    return /^#([0-9a-fA-F]{6})$/.test(trimmed) ? trimmed : fallback;
};

const getPulsePhase = (id: string) => {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = (hash << 5) - hash + id.charCodeAt(i);
        hash |= 0;
    }
    return (hash % 360) / 57.2958; // Convert degrees to radians-ish offset
};

const extractVector = (value: Body | Vector2D | null | undefined): Vector2D | null => {
    if (!value) return null;
    if ('position' in value && value.position) return value.position;
    if ('x' in value && 'y' in value) return value as Vector2D;
    return null;
};

// Helper for deterministic random based on string seed
const seededRandom = (seed: string) => {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        const char = seed.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    const x = Math.sin(hash++) * 10000;
    return x - Math.floor(x);
};

const Canvas: React.FC<CanvasProps> = ({
    bodiesRef,
    particlesRef,
    width,
    height,
    scale,
    offset,
    onPan,
    onZoom,
    onSelectBody,
    selectedBodyId,
    visualConfig,
    physicsConfig,
    isCreationMode,
    creationCandidate,
    predictionPaths,
    onCanvasClick,
    isRocketMode,
    isRocketSpawning,
    rocketTargetBodyId,
    observerBodyIds,
    coMData,
    showTransferWindow,
    showTheoreticalOrbit,
    flightComputerModules,
    rendezvousPoint,
    rendezvousPoints
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationFrameRef = useRef<number | undefined>(undefined); // Store RAF ID
    const [isDragging, setIsDragging] = useState(false);
    const [isClick, setIsClick] = useState(false); // Track if movement happened
    const [lastMousePos, setLastMousePos] = useState<Vector2D>({ x: 0, y: 0 });
    const wavesRef = useRef<GravitationalWave[]>([]);

    // Sync Props to Ref for RAF Loop
    const propsRef = useRef({ width, height, scale, offset, visualConfig, physicsConfig, selectedBodyId, observerBodyIds, showTransferWindow, showTheoreticalOrbit, isCreationMode, creationCandidate, predictionPaths, isRocketMode, isRocketSpawning, rocketTargetBodyId, flightComputerModules, rendezvousPoints, coMData, rendezvousPoint });
    useEffect(() => {
        propsRef.current = { width, height, scale, offset, visualConfig, physicsConfig, selectedBodyId, observerBodyIds, showTransferWindow, showTheoreticalOrbit, isCreationMode, creationCandidate, predictionPaths, isRocketMode, isRocketSpawning, rocketTargetBodyId, flightComputerModules, rendezvousPoints, coMData, rendezvousPoint };
    }, [width, height, scale, offset, visualConfig, physicsConfig, selectedBodyId, observerBodyIds, showTransferWindow, showTheoreticalOrbit, isCreationMode, creationCandidate, predictionPaths, isRocketMode, isRocketSpawning, rocketTargetBodyId, flightComputerModules, rendezvousPoints, coMData, rendezvousPoint]);

    const rendezvousSolutionMap = useMemo<Record<string, RendezvousSolution> | undefined>(() => {
        if (!rendezvousPoints || rendezvousPoints.length === 0) return undefined;
        const map: Record<string, RendezvousSolution> = {};
        rendezvousPoints.forEach(point => {
            map[point.moduleId] = {
                moduleId: point.moduleId,
                name: point.name,
                color: point.color,
                point: point.point,
                timeToRendezvous: point.timeToRendezvous,
                distance: point.distance,
                deltaVPrograde: point.deltaVPrograde,
                deltaVRadial: point.deltaVRadial,
                totalDeltaV: point.totalDeltaV
            };
        });
        return map;
    }, [rendezvousPoints]);

    const resolveMarkerVector = (input?: FlightComputerInput, flightComputerModules?: FlightComputerModule[]): Vector2D | null => {
        if (!input) return null;
        if (!flightComputerModules || flightComputerModules.length === 0) {
            console.log("no flight computer modules..... on Canvas...");
            return null;
        };

        const resolved = resolveInput(input, bodiesRef.current, flightComputerModules, physicsConfig.gravitationalConstant, rendezvousSolutionMap);
        return extractVector(resolved);
    };

    const resolveMarkerStringValue = (input: FlightComputerInput | undefined, fallback: string): string => {
        if (!input) return fallback;
        const resolved = resolveStringInput(input, bodiesRef.current, flightComputerModules, physicsConfig.gravitationalConstant, rendezvousSolutionMap);
        return resolved ?? fallback;
    };

    const resolveMarkerBooleanValue = (input: FlightComputerInput | undefined, fallback: boolean): boolean => {
        if (!input) return fallback;
        const resolved = resolveBooleanInput(input, bodiesRef.current, flightComputerModules, physicsConfig.gravitationalConstant, rendezvousSolutionMap);
        return resolved ?? fallback;
    };

    // Touch State Refs
    const touchRef = useRef<{
        lastX: number;
        lastY: number;
        lastDist: number;
        mode: 'none' | 'drag' | 'zoom';
    }>({ lastX: 0, lastY: 0, lastDist: 0, mode: 'none' });

    // --- Initialize Stars (Normalized Coordinates for Infinite Scroll) ---
    const stars = useMemo(() => {
        const starArray: Star[] = [];
        const count = visualConfig.starDensity;
        for (let i = 0; i < count; i++) {
            const layer = Math.floor(Math.random() * 3); // 0, 1, 2
            starArray.push({
                x: Math.random(),
                y: Math.random(),
                size: Math.random() * (layer + 1) * 0.8 + 0.5,
                alpha: Math.random() * 0.5 + 0.3,
                layer,
                twinkleOffset: Math.random() * 100
            });
        }
        return starArray;
    }, [visualConfig.starDensity]);

    // --- Initialize Background Nebula ---
    const nebulaClouds = useMemo(() => {
        const clouds: NebulaCloud[] = [];
        const colors = ['#1a0b2e', '#0f172a', '#1e1b4b', '#2e1065', '#312e81']; // Deep purples and blues
        const count = visualConfig.nebulaCloudCount;
        for (let i = 0; i < count; i++) {
            clouds.push({
                x: Math.random(),
                y: Math.random(),
                radius: 300 + Math.random() * 600,
                color: colors[Math.floor(Math.random() * colors.length)]
            });
        }
        return clouds;
    }, [visualConfig.nebulaCloudCount]);

    // --- Main Render Loop ---
    useEffect(() => {
        const renderLoop = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            // Get fresh props from ref
            const { width, height, scale, offset, visualConfig, physicsConfig, selectedBodyId, observerBodyIds, showTransferWindow, showTheoreticalOrbit, isCreationMode, creationCandidate, predictionPaths, isRocketMode, isRocketSpawning, rocketTargetBodyId, flightComputerModules, rendezvousPoints, coMData, rendezvousPoint } = propsRef.current;
            const bodies = bodiesRef.current;
            const particles = particlesRef.current;

            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            // Pre-calculate forces for this frame (used for Waves and Observer)
            const forces = calculateForces(bodies, physicsConfig.gravitationalConstant);

            // Screen Center (World Origin in Screen Space)
            const cx = width / 2 + offset.x;
            const cy = height / 2 + offset.y;
            const time = Date.now() / 1000;

            // Helper for infinite wrapping
            const wrap = (val: number, max: number) => ((val % max) + max) % max;

            // 1. Clear Canvas (Deep Space Black)
            ctx.fillStyle = '#020204';
            ctx.fillRect(0, 0, width, height);

            // 2. Draw Nebula (Background Atmosphere - Infinite Parallax)
            if (visualConfig.showNebula) {
                nebulaClouds.forEach(cloud => {
                    const parallaxX = offset.x * 0.05;
                    const parallaxY = offset.y * 0.05;
                    const virtualW = width * 2;
                    const virtualH = height * 2;

                    const sx = wrap((cloud.x * virtualW) + parallaxX, virtualW) - (virtualW / 4);
                    const sy = wrap((cloud.y * virtualH) + parallaxY, virtualH) - (virtualH / 4);
                    const sr = cloud.radius * (scale < 1 ? 1 : Math.pow(scale, 0.3));

                    if (sx + sr < 0 || sx - sr > width || sy + sr < 0 || sy - sr > height) return;
                    // FIX: Check for finite values before gradient creation
                    if (!Number.isFinite(sx) || !Number.isFinite(sy) || !Number.isFinite(sr) || sr <= 0) return;

                    const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
                    grad.addColorStop(0, cloud.color);
                    grad.addColorStop(1, 'transparent');

                    ctx.globalAlpha = visualConfig.nebulaOpacity;
                    ctx.fillStyle = grad;
                    ctx.beginPath();
                    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
                    ctx.fill();
                });
                ctx.globalAlpha = 1.0;
            }

            // 3. Draw Stars (Infinite Parallax + Twinkling)
            if (visualConfig.showStars) {
                stars.forEach(star => {
                    const factor = (star.layer + 1) * 0.03;
                    const sx = wrap((star.x * width) + (offset.x * factor), width);
                    const sy = wrap((star.y * height) + (offset.y * factor), height);

                    const twinkleSpeed = visualConfig.starTwinkleSpeed;
                    const twinkle = Math.sin(time * twinkleSpeed + star.twinkleOffset) * 0.3 + 0.7;

                    if (!Number.isFinite(sx) || !Number.isFinite(sy)) return;

                    ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha * twinkle})`;
                    ctx.beginPath();
                    ctx.arc(sx, sy, star.size, 0, Math.PI * 2);
                    ctx.fill();
                });
            }

            // 4. Draw Gravity Grid
            if (visualConfig.showGrid) {
                ctx.strokeStyle = '#64748b';
                ctx.lineWidth = 1;
                ctx.globalAlpha = visualConfig.gridOpacity;
                ctx.beginPath();

                const targetScreenSpacing = 50;
                const baseGridSpacing = visualConfig.gridSpacing;
                const approximateWorldSpacing = targetScreenSpacing / scale;
                const power = Math.round(Math.log2(approximateWorldSpacing / baseGridSpacing));
                const renderGridSize = baseGridSpacing * Math.pow(2, power);

                const spacing = renderGridSize * scale;

                if (Number.isFinite(spacing) && spacing > 0) {
                    const offsetX = wrap(cx, spacing);
                    const offsetY = wrap(cy, spacing);

                    const kMaxX = Math.ceil(width / spacing) + 1;
                    const kMaxY = Math.ceil(height / spacing) + 1;

                    const getDistortedPoint = (sx: number, sy: number) => {
                        const wx = (sx - cx) / scale;
                        const wy = (sy - cy) / scale;
                        let dx = 0;
                        let dy = 0;

                        for (const body of bodies) {
                            if (body.mass < 10) continue;
                            const bdx = body.position.x - wx;
                            const bdy = body.position.y - wy;
                            const distSq = bdx * bdx + bdy * bdy;
                            if (distSq > 500000 && body.mass < 1000) continue;
                            const dist = Math.sqrt(distSq);
                            if (dist < 1) continue;
                            const force = Math.min(60, (body.mass * 30) / (distSq + 500));
                            dx += (bdx / dist) * force;
                            dy += (bdy / dist) * force;
                        }
                        return { x: cx + (wx + dx) * scale, y: cy + (wy + dy) * scale };
                    };

                    for (let i = -1; i <= kMaxX; i++) {
                        const sx = i * spacing + offsetX - spacing;
                        let first = true;
                        for (let j = -1; j <= kMaxY; j += 0.5) {
                            const sy = j * spacing + offsetY - spacing;
                            const p = getDistortedPoint(sx, sy);
                            if (first) { ctx.moveTo(p.x, p.y); first = false; }
                            else { ctx.lineTo(p.x, p.y); }
                        }
                    }

                    for (let j = -1; j <= kMaxY; j++) {
                        const sy = j * spacing + offsetY - spacing;
                        let first = true;
                        for (let i = -1; i <= kMaxX; i += 0.5) {
                            const sx = i * spacing + offsetX - spacing;
                            const p = getDistortedPoint(sx, sy);
                            if (first) { ctx.moveTo(p.x, p.y); first = false; }
                            else { ctx.lineTo(p.x, p.y); }
                        }
                    }

                    ctx.stroke();
                }
                ctx.globalAlpha = 1.0;
            }

            // 5. Draw Trails
            if (visualConfig.showTrails) {
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                bodies.forEach(body => {
                    if (body.trail.length > 1) {
                        ctx.beginPath();

                        for (let i = 0; i < body.trail.length - 1; i++) {
                            const p1 = body.trail[i];
                            const p2 = body.trail[i + 1];
                            const x1 = cx + p1.x * scale;
                            const y1 = cy + p1.y * scale;
                            const x2 = cx + p2.x * scale;
                            const y2 = cy + p2.y * scale;

                            if ((x1 < -50 && x2 < -50) || (x1 > width + 50 && x2 > width + 50) ||
                                (y1 < -50 && y2 < -50) || (y1 > height + 50 && y2 > height + 50)) continue;

                            ctx.beginPath();
                            ctx.moveTo(x1, y1);
                            ctx.lineTo(x2, y2);

                            const opacity = (i / body.trail.length);
                            ctx.strokeStyle = body.color;
                            ctx.globalAlpha = opacity * 0.6;
                            ctx.lineWidth = Math.max(1, 2 * scale * opacity);
                            if (body.name.includes("Pomme")) {
                                ctx.lineWidth = 0.1;
                            }
                            ctx.stroke();
                        }
                    }
                });
                ctx.globalAlpha = 1.0;
            }

            // --- GENERATE GRAVITATIONAL WAVES (ACCELERATION BASED) ---
            if (visualConfig.showWaves) {
                bodies.forEach((body, idx) => {
                    if (body.mass > 10) {
                        // Calculate Acceleration Magnitude (a = F/m)
                        const f = forces[idx];
                        const acceleration = Math.sqrt(f.x * f.x + f.y * f.y) / body.mass;

                        // Threshold: Only emit waves if experiencing significant acceleration (force)
                        if (acceleration > 0.02) {
                            // Probability increases with acceleration
                            if (Math.random() < Math.min(0.8, acceleration * 0.5)) {
                                wavesRef.current.push({
                                    x: body.position.x,
                                    y: body.position.y,
                                    radius: body.radius,
                                    maxRadius: body.radius * 30 + (body.mass * 0.5),
                                    // Opacity increases with acceleration
                                    alpha: Math.min(0.6, acceleration * 3.0),
                                    color: body.color,
                                    // Wave spread speed
                                    speed: (2 + acceleration * 10) * visualConfig.waveSpeedMultiplier
                                });
                            }
                        }
                    }
                });

                ctx.globalCompositeOperation = 'lighter';
                ctx.lineWidth = 1.5;
                wavesRef.current = wavesRef.current.filter(w => w.alpha > 0.01 && w.radius < w.maxRadius);

                wavesRef.current.forEach(wave => {
                    wave.radius += wave.speed;
                    wave.alpha *= 0.96;
                    const sx = cx + wave.x * scale;
                    const sy = cy + wave.y * scale;
                    const sr = wave.radius * scale;

                    if (sx + sr < 0 || sx - sr > width || sy + sr < 0 || sy - sr > height) return;
                    // FIX: Check for finite values
                    if (!Number.isFinite(sx) || !Number.isFinite(sy) || !Number.isFinite(sr) || sr <= 0) return;

                    ctx.beginPath();
                    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
                    ctx.strokeStyle = wave.color;
                    ctx.globalAlpha = wave.alpha;
                    ctx.stroke();
                });
                ctx.globalCompositeOperation = 'source-over';
                ctx.globalAlpha = 1.0;
            }

            // 6. Draw Particles
            ctx.globalCompositeOperation = 'lighter';
            particles.forEach(p => {
                const sx = cx + p.x * scale;
                const sy = cy + p.y * scale;
                if (sx < -20 || sx > width + 20 || sy < -20 || sy > height + 20) return;

                const rad = Math.max(1.5, p.size * scale);
                // FIX: Check for finite values
                if (!Number.isFinite(sx) || !Number.isFinite(sy) || !Number.isFinite(rad) || rad <= 0) return;

                const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, rad);
                grad.addColorStop(0, p.color);
                grad.addColorStop(1, 'transparent');

                ctx.fillStyle = grad;
                ctx.globalAlpha = p.life;
                ctx.beginPath();
                ctx.arc(sx, sy, rad * 2, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1.0;

            // --- CENTER OF MASS VISUALIZATION ---
            if (visualConfig.showCenterOfMass && coMData) {
                const { refinedCoM, realCoM } = coMData;
                const threshold = visualConfig.centerOfMassThreshold;

                const screenRefinedX = cx + refinedCoM.x * scale;
                const screenRefinedY = cy + refinedCoM.y * scale;

                if (Number.isFinite(screenRefinedX) && Number.isFinite(screenRefinedY)) {
                    const screenRadius = threshold * scale;
                    if (screenRadius > 0 && Number.isFinite(screenRadius)) {
                        ctx.beginPath();
                        ctx.arc(screenRefinedX, screenRefinedY, screenRadius, 0, Math.PI * 2);
                        ctx.fillStyle = 'rgba(255, 0, 0, 0.15)'; // Red Area
                        ctx.fill();
                        ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)'; // Border
                        ctx.lineWidth = 1;
                        ctx.stroke();
                    }

                    // Draw Real CoM (Gray)
                    const screenRealX = cx + realCoM.x * scale;
                    const screenRealY = cy + realCoM.y * scale;
                    if (Number.isFinite(screenRealX) && Number.isFinite(screenRealY)) {
                        ctx.strokeStyle = '#94a3b8'; // Slate 400
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(screenRealX - 6, screenRealY);
                        ctx.lineTo(screenRealX + 6, screenRealY);
                        ctx.moveTo(screenRealX, screenRealY - 6);
                        ctx.lineTo(screenRealX, screenRealY + 6);
                        ctx.stroke();

                        ctx.fillStyle = '#94a3b8';
                        ctx.font = '9px sans-serif';
                        ctx.fillText('Real CoM', screenRealX + 8, screenRealY + 3);
                    }

                    // Draw Refined CoM Crosshair (Indigo)
                    ctx.strokeStyle = '#4f46e5'; // Indigo
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(screenRefinedX - 10, screenRefinedY);
                    ctx.lineTo(screenRefinedX + 10, screenRefinedY);
                    ctx.moveTo(screenRefinedX, screenRefinedY - 10);
                    ctx.lineTo(screenRefinedX, screenRefinedY + 10);
                    ctx.stroke();

                    // Draw Refined CoM Label
                    ctx.fillStyle = '#4f46e5';
                    ctx.font = 'bold 10px sans-serif';
                    ctx.fillText('Refined CoM', screenRefinedX + 12, screenRefinedY + 3);
                }
            }

            // 7. Draw Bodies (Cinematic Rendering)
            const starsList = bodies.filter(b => b.isStar);
            const primaryStar = starsList[0];



            // Helper for body drawing
            const drawBody = (body: Body, isGhost = false) => {
                const screenX = cx + body.position.x * scale;
                const screenY = cy + body.position.y * scale;
                const visualRadius = body.radius * scale;

                if (screenX + visualRadius * 3 < 0 || screenX - visualRadius * 3 > width ||
                    screenY + visualRadius * 3 < 0 || screenY - visualRadius * 3 > height) return;

                // FIX: Critical check for gradient crash
                if (!Number.isFinite(screenX) || !Number.isFinite(screenY) || !Number.isFinite(visualRadius) || visualRadius <= 0) return;

                if (isGhost) ctx.globalAlpha = 0.5;

                // --- BEAUTIFUL ROCKET RENDERING (NOT A TRIANGLE) ---
                if (body.isRocket && false) {
                    const size = Math.max(8, 5 * scale);
                    const angle = body.angle || 0;

                    // Keep these (useful for nav lights / orientation anchors)
                    const tipX = screenX + Math.cos(angle) * size;
                    const tipY = screenY + Math.sin(angle) * size;
                    const backLeftX = screenX + Math.cos(angle + 2.5) * size;
                    const backLeftY = screenY + Math.sin(angle + 2.5) * size;
                    const backRightX = screenX + Math.cos(angle - 2.5) * size;
                    const backRightY = screenY + Math.sin(angle - 2.5) * size;

                    // dummy SaS / ship variables : user will plug ship system to that
                    //const sasMode = "off"; // "prograde" | "retrograde" | "radial-out" | "none"
                    const landed = true;
                    const landing = false;
                    const fuel = 50; // 0..100

                    // modules toggles (user will plug real ones)
                    const hasAutopilot = false;
                    const hasRadar = false;
                    const hasScientificLab = false;
                    const hasMess = false;
                    const hasObservatory = false;
                    const hasSolarPanel = false;
                    const hasLazerGun = false;
                    const hasRoboticArm = true;
                    const hasRotatingRing = false;

                    // module animation placeholders
                    const lazerAngle = Math.sin(Date.now() / 1000) * 3.14;            // world angle
                    const lazerFiring = true;           // draw beam/glow if true
                    const roboticArmAngles = [0.2, -0.6, 0.35]; // base/mid/hand (radians) in LOCAL space
                    const roboticArmExtend = 1.0;        // 0..1 scale (optional)
                    const ringSpin = 1.0;                // multiplier
                    const radarSweep = (Date.now() / 800) % (Math.PI * 2);

                    // thrust presence
                    const thrustOn = !!(body.thrust && (Math.abs(body.thrust.x) > 0.001 || Math.abs(body.thrust.y) > 0.001));

                    // blinkers
                    const t = Date.now();
                    const blinkA = Math.sin(t / 240) > 0.2;
                    const blinkB = Math.sin(t / 510) > 0.6;

                    // small helpers (local-space drawing after rotate)
                    const clamp01 = (v) => Math.max(0, Math.min(1, v));
                    const lerp = (a, b, u) => a + (b - a) * u;

                    // Rocket MUST fit inside original triangle's bounding rectangle in local frame:
                    // x in [-0.801s .. +1.0s], y in [-0.598s .. +0.598s]
                    const xNose = size * 0.98;
                    const xTail = -size * 0.78;
                    const gearX = -size * 0.2;
                    const halfW = size * 0.50;

                    const noseBase = xNose - size * 0.22;
                    const tailShoulder = xTail + size * 0.14;
                    const topY = -halfW * 0.55;
                    const midY = -halfW * 0.28;

                    // landing gear deploy factor
                    const gear = landed ? 1 : (landing ? 0.2 : 0);

                    // Save state
                    ctx.save();
                    ctx.translate(screenX, screenY);
                    ctx.rotate(angle);

                    // nice defaults
                    const prevGA = ctx.globalAlpha;
                    const prevGCO = ctx.globalCompositeOperation;
                    ctx.lineWidth = 1;
                    ctx.lineJoin = "round";
                    ctx.lineCap = "round";

                    // =========================
                    // BODY SHADING (metal + color accents)
                    // =========================
                    const bodyMetal = ctx.createLinearGradient(xTail, 0, xNose, 0);
                    bodyMetal.addColorStop(0.00, "#121418");
                    bodyMetal.addColorStop(0.20, "#3a404a");
                    bodyMetal.addColorStop(0.45, "#9aa3ad");
                    bodyMetal.addColorStop(0.70, "#49515e");
                    bodyMetal.addColorStop(1.00, "#d5dbe2");

                    const bodyWarm = ctx.createLinearGradient(xTail, topY, xNose, -topY);
                    bodyWarm.addColorStop(0.00, "rgba(255,255,255,0.00)");
                    bodyWarm.addColorStop(0.45, "rgba(255,255,255,0.16)");
                    bodyWarm.addColorStop(1.00, "rgba(255,255,255,0.00)");

                    const accent = (body.color && typeof body.color === "string") ? body.color : "#7dd3fc";

                    // =========================
                    // DRAW FUSELAGE (rocket silhouette, not a triangle)
                    // =========================
                    const drawFuselagePath = () => {
                        ctx.beginPath();
                        ctx.moveTo(xNose, 0);
                        ctx.quadraticCurveTo(xNose - size * 0.07, topY * 0.35, noseBase, topY);
                        ctx.lineTo(tailShoulder, topY);
                        ctx.quadraticCurveTo(xTail, topY * 0.88, xTail, midY);
                        ctx.lineTo(xTail, -midY);
                        ctx.quadraticCurveTo(xTail, -topY * 0.88, tailShoulder, -topY);
                        ctx.lineTo(noseBase, -topY);
                        ctx.quadraticCurveTo(xNose - size * 0.07, -topY * 0.35, xNose, 0);
                        ctx.closePath();
                    };

                    // main fill
                    drawFuselagePath();
                    ctx.fillStyle = bodyMetal;
                    ctx.fill();

                    // subtle sheen
                    ctx.globalAlpha = 0.9;
                    drawFuselagePath();
                    ctx.fillStyle = bodyWarm;
                    ctx.fill();
                    ctx.globalAlpha = prevGA;

                    // outline
                    drawFuselagePath();
                    ctx.strokeStyle = "rgba(255,255,255,0.65)";
                    ctx.stroke();

                    // =========================
                    // PANEL LINES / RIVETS / STRIPES (1px details)
                    // =========================
                    // rings
                    ctx.globalAlpha = 0.45;
                    ctx.strokeStyle = "rgba(0,0,0,0.6)";
                    const ringXs = [
                        xTail + size * 0.20,
                        xTail + size * 0.42,
                        xTail + size * 0.64,
                        xTail + size * 0.86
                    ];
                    for (const rx of ringXs) {
                        ctx.beginPath();
                        ctx.moveTo(rx, topY * 0.92);
                        ctx.lineTo(rx, -topY * 0.92);
                        ctx.stroke();
                    }
                    ctx.globalAlpha = prevGA;

                    // accent stripe (integrated, no HUD)
                    ctx.globalAlpha = 0.85;
                    ctx.strokeStyle = accent;
                    ctx.beginPath();
                    ctx.moveTo(noseBase + size * 0.02, topY * 0.35);
                    ctx.lineTo(tailShoulder - size * 0.06, topY * 0.35);
                    ctx.stroke();
                    ctx.globalAlpha = prevGA;

                    // small hatch + bolts
                    ctx.globalAlpha = 0.55;
                    ctx.strokeStyle = "rgba(255,255,255,0.35)";
                    const hatchX = lerp(xTail, xNose, 0.46);
                    const hatchY = topY * 0.10;
                    ctx.beginPath();
                    ctx.roundRect(hatchX - size * 0.12, hatchY - size * 0.07, size * 0.22, size * 0.14, 2);
                    ctx.stroke();

                    ctx.fillStyle = "rgba(255,255,255,0.25)";
                    for (let i = 0; i < 7; i++) {
                        const bx = hatchX - size * 0.10 + i * (size * 0.03);
                        const by = hatchY + ((i % 2) ? size * 0.05 : -size * 0.05);
                        ctx.beginPath();
                        ctx.arc(bx, by, 0.6, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    ctx.globalAlpha = prevGA;

                    // =========================
                    // COCKPIT / WINDOW (glass + reflections)
                    // =========================
                    const cockpitX = xNose - size * 0.40;
                    const cockpitY = 0;
                    const cockpitRx = size * 0.16;
                    const cockpitRy = size * 0.12;

                    const glass = ctx.createRadialGradient(cockpitX - cockpitRx * 0.3, cockpitY - cockpitRy * 0.3, 0, cockpitX, cockpitY, cockpitRx * 1.6);
                    glass.addColorStop(0, "rgba(180,245,255,0.95)");
                    glass.addColorStop(0.28, "rgba(60,170,210,0.65)");
                    glass.addColorStop(0.55, "rgba(10,40,70,0.72)");
                    glass.addColorStop(1, "rgba(0,0,0,0.75)");

                    ctx.beginPath();
                    ctx.ellipse(cockpitX, cockpitY, cockpitRx, cockpitRy, 0, 0, Math.PI * 2);
                    ctx.fillStyle = glass;
                    ctx.fill();
                    ctx.strokeStyle = "rgba(255,255,255,0.55)";
                    ctx.stroke();

                    // specular streak
                    ctx.globalAlpha = 0.55;
                    ctx.beginPath();
                    ctx.ellipse(cockpitX - cockpitRx * 0.25, cockpitY - cockpitRy * 0.25, cockpitRx * 0.35, cockpitRy * 0.25, -0.6, 0, Math.PI * 2);
                    ctx.fillStyle = "rgba(255,255,255,0.55)";
                    ctx.fill();
                    ctx.globalAlpha = prevGA;

                    // =========================
                    // ENGINE SECTION (nozzle + glow + thrust flame)
                    // =========================
                    // nozzle geometry (still inside rocket bbox)
                    const nozX0 = xTail + size * 0.02;
                    const nozX1 = xTail - size * 0.12;
                    const nozR0 = halfW * 0.22;
                    const nozR1 = halfW * 0.32;

                    const nozzleGrad = ctx.createLinearGradient(nozX1, 0, nozX0, 0);
                    nozzleGrad.addColorStop(0, "#0a0b0e");
                    nozzleGrad.addColorStop(0.5, "#2c313a");
                    nozzleGrad.addColorStop(1, "#6b7480");

                    ctx.beginPath();
                    ctx.moveTo(nozX0, -nozR0);
                    ctx.lineTo(nozX1, -nozR1);
                    ctx.lineTo(nozX1, nozR1);
                    ctx.lineTo(nozX0, nozR0);
                    ctx.closePath();
                    ctx.fillStyle = nozzleGrad;
                    ctx.fill();
                    ctx.strokeStyle = "rgba(255,255,255,0.35)";
                    ctx.stroke();

                    // engine glow on thrust
                    if (thrustOn) {
                        ctx.globalCompositeOperation = "lighter";
                        const glow = ctx.createRadialGradient(nozX1, 0, 0, nozX1, 0, size * 1.1);
                        glow.addColorStop(0, "rgba(255,180,60,0.40)");
                        glow.addColorStop(0.2, "rgba(255,90,30,0.22)");
                        glow.addColorStop(1, "rgba(255,0,0,0.00)");

                        ctx.globalAlpha = 0.9;
                        ctx.beginPath();
                        ctx.arc(nozX0, 0, size * 0.65, 0, Math.PI * 2);
                        ctx.fillStyle = glow;
                        ctx.fill();
                        ctx.globalAlpha = prevGA;
                        ctx.globalCompositeOperation = prevGCO;

                        // flame (outside physics ok)
                        const flameLen = (size * 0.9) + (Math.random() * size * 0.8);
                        const flameW = halfW * 0.55;
                        const flicker = 0.75 + Math.random() * 0.35;

                        ctx.save();
                        ctx.globalCompositeOperation = "lighter";

                        const flameGrad = ctx.createLinearGradient(nozX1, 0, nozX1 - flameLen, 0);
                        flameGrad.addColorStop(0.00, "rgba(255,255,255,0.55)");
                        flameGrad.addColorStop(0.12, "rgba(255,210,120,0.75)");
                        flameGrad.addColorStop(0.35, "rgba(255,110,40,0.55)");
                        flameGrad.addColorStop(0.65, "rgba(120,120,255,0.20)");
                        flameGrad.addColorStop(1.00, "rgba(0,0,0,0.00)");

                        ctx.globalAlpha = 0.95;
                        ctx.beginPath();
                        ctx.moveTo(nozX1, -nozR1 * 0.55);
                        ctx.quadraticCurveTo(nozX1 - flameLen * 0.35, -flameW * 0.55 * flicker, nozX1 - flameLen, 0);
                        ctx.quadraticCurveTo(nozX1 - flameLen * 0.35, flameW * 0.55 * flicker, nozX1, nozR1 * 0.55);
                        ctx.closePath();
                        ctx.fillStyle = flameGrad;
                        ctx.fill();

                        // inner core
                        ctx.globalAlpha = 0.75;
                        ctx.beginPath();
                        ctx.moveTo(nozX1, -nozR1 * 0.25);
                        ctx.quadraticCurveTo(nozX1 - flameLen * 0.22, -flameW * 0.22 * flicker, nozX1 - flameLen * 0.70, 0);
                        ctx.quadraticCurveTo(nozX1 - flameLen * 0.22, flameW * 0.22 * flicker, nozX1, nozR1 * 0.25);
                        ctx.closePath();
                        ctx.fillStyle = "rgba(255,255,255,0.35)";
                        ctx.fill();

                        ctx.restore();
                    }

                    // =========================
                    // FINS / RCS PORTS (subtle, realistic)
                    // =========================
                    ctx.globalAlpha = 0.6;
                    ctx.strokeStyle = "rgba(255,255,255,0.30)";

                    // fins
                    const finX = xTail + size * 0.18;
                    const finLen = size * 0.20;
                    const finH = halfW * 0.22;
                    ctx.beginPath();
                    ctx.moveTo(finX, topY * 0.55);
                    ctx.lineTo(finX - finLen, topY * 0.55 - finH);
                    ctx.lineTo(finX - finLen * 0.15, topY * 0.55);
                    ctx.stroke();

                    ctx.beginPath();
                    ctx.moveTo(finX, -topY * 0.55);
                    ctx.lineTo(finX - finLen, -topY * 0.55 + finH);
                    ctx.lineTo(finX - finLen * 0.15, -topY * 0.55);
                    ctx.stroke();

                    // RCS dots
                    ctx.fillStyle = "rgba(255,255,255,0.25)";
                    const rcsXs = [xTail + size * 0.33, xTail + size * 0.70];
                    for (const rx of rcsXs) {
                        ctx.beginPath(); ctx.arc(rx, topY * 0.70, 0.9, 0, Math.PI * 2); ctx.fill();
                        ctx.beginPath(); ctx.arc(rx, -topY * 0.70, 0.9, 0, Math.PI * 2); ctx.fill();
                    }
                    ctx.globalAlpha = prevGA;

                    // =========================
                    // INTEGRATED FUEL INDICATORS (no text, no HUD)
                    // =========================
                    // small pips along lower side of hull: lit amount = fuel%
                    const f = clamp01(fuel / 100);
                    const pipCount = 10;
                    const pipX0 = xTail + size * 0.28;
                    const pipX1 = xNose - size * 0.30;
                    const pipY = topY * 0.62;
                    for (let i = 0; i < pipCount; i++) {
                        const u = i / (pipCount - 1);
                        const px = lerp(pipX0, pipX1, u);
                        const lit = (u <= f);
                        ctx.globalAlpha = lit ? 0.65 : 0.18;
                        ctx.fillStyle = lit ? "rgba(140,255,200,0.85)" : "rgba(255,255,255,0.35)";
                        ctx.beginPath();
                        ctx.roundRect(px - 1.2, pipY - 0.9, 2.4, 1.8, 1);
                        ctx.fill();
                    }
                    ctx.globalAlpha = prevGA;

                    // =========================
                    // LANDING GEAR (deployable visuals; can go outside physics)
                    // =========================
                    if (gear > 0) {
                        const g = clamp01(gear) * 1;
                        const legBaseX = gearX + size * 0.26;
                        const legSpread = halfW * 0.70;
                        const legLen = size * (0.55 + 0.35 * g);
                        const foot = size * 0.10;

                        ctx.globalAlpha = 0.9;
                        ctx.strokeStyle = "rgba(230,235,242,0.75)";

                        for (const s of [-1, 1]) {
                            const by = s * legSpread * 0.55;
                            const kneeX = legBaseX - legLen * 0.35;
                            const kneeY = by + (s * legLen * 0.05);
                            const footX = legBaseX - legLen;
                            const footY = by + (s * legLen * 0.22);

                            ctx.beginPath();
                            ctx.moveTo(legBaseX, by);
                            ctx.lineTo(kneeX, kneeY);
                            ctx.lineTo(footX, footY);
                            ctx.stroke();

                            // foot pad
                            ctx.beginPath();
                            ctx.moveTo(footX - foot, footY - foot * 0.35);
                            ctx.lineTo(footX + foot, footY + foot * 0.35);
                            ctx.stroke();
                        }

                        // dust glow when landing
                        if (landing) {
                            ctx.globalCompositeOperation = "lighter";
                            const dust = ctx.createRadialGradient(xTail + size * 0.6, 0, 0, xTail + size * 0.6, 0, size * 1.6);
                            dust.addColorStop(0, "rgba(255,255,255,0.12)");
                            dust.addColorStop(1, "rgba(255,255,255,0)");
                            ctx.globalAlpha = 0.8;
                            ctx.beginPath();
                            ctx.arc(xTail + size * 0.55, 0, size * 1.2, 0, Math.PI * 2);
                            ctx.fillStyle = dust;
                            ctx.fill();
                            ctx.globalAlpha = prevGA;
                            ctx.globalCompositeOperation = prevGCO;
                        }
                    }

                    // =========================
                    // SAS INDICATORS (3 arrows; graphical only)
                    // =========================
                    const drawChevrons = (dir, col) => {
                        // dir in local radians, draw outside hull
                        const r = size * 1.05;
                        const x = Math.cos(dir) * r;
                        const y = Math.sin(dir) * r;

                        ctx.save();
                        ctx.translate(x, y);
                        ctx.rotate(dir);

                        ctx.globalCompositeOperation = "lighter";
                        ctx.globalAlpha = 0.85;
                        ctx.strokeStyle = col;

                        for (let i = 0; i < 3; i++) {
                            const o = i * 3.0;
                            ctx.beginPath();
                            ctx.moveTo(-6 - o, -3);
                            ctx.lineTo(-1 - o, 0);
                            ctx.lineTo(-6 - o, 3);
                            ctx.stroke();
                        }

                        ctx.restore();
                        ctx.globalCompositeOperation = prevGCO;
                        ctx.globalAlpha = prevGA;
                    };

                    //if (sasMode === "prograde") drawChevrons(0, "rgba(160,255,190,0.95)");
                    //if (sasMode === "retrograde") drawChevrons(Math.PI, "rgba(255,140,140,0.95)");
                    //if (sasMode === "radial-out") drawChevrons(Math.PI / 2, "rgba(140,220,255,0.95)");

                    // =========================
                    // NAV LIGHTS (blink)
                    // =========================
                    // front beacon (uses tipX/tipY in world, but we're in local: draw at nose)
                    ctx.globalCompositeOperation = "lighter";
                    if (blinkA) {
                        ctx.globalAlpha = 0.9;
                        ctx.fillStyle = "rgba(255,255,255,0.75)";
                        ctx.beginPath(); ctx.arc(xNose - 0.8, 0, 1.6, 0, Math.PI * 2); ctx.fill();
                        ctx.globalAlpha = 0.35;
                        ctx.beginPath(); ctx.arc(xNose - 0.8, 0, 5.5, 0, Math.PI * 2); ctx.fill();
                    }
                    if (blinkB) {
                        ctx.globalAlpha = 0.8;
                        ctx.fillStyle = "rgba(255,80,80,0.75)";
                        ctx.beginPath(); ctx.arc(xTail + 1.2, topY * 0.72, 1.3, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = "rgba(80,255,120,0.75)";
                        ctx.beginPath(); ctx.arc(xTail + 1.2, -topY * 0.72, 1.3, 0, Math.PI * 2); ctx.fill();
                    }
                    ctx.globalCompositeOperation = prevGCO;
                    ctx.globalAlpha = prevGA;

                    // =========================
                    // EXTERNAL MODULES (can extend outside physics bbox)
                    // =========================
                    // Autopilot: antenna + blinking node
                    if (hasAutopilot) {
                        const ax = lerp(xTail, xNose, 0.62);
                        const ay = topY * 0.92;
                        ctx.strokeStyle = "rgba(235,240,255,0.70)";
                        ctx.beginPath();
                        ctx.moveTo(ax, ay);
                        ctx.lineTo(ax + size * 0.10, ay - size * 0.22);
                        ctx.stroke();

                        ctx.globalCompositeOperation = "lighter";
                        ctx.globalAlpha = blinkA ? 0.9 : 0.25;
                        ctx.fillStyle = "rgba(120,200,255,0.85)";
                        ctx.beginPath();
                        ctx.arc(ax + size * 0.10, ay - size * 0.22, 1.3, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.globalCompositeOperation = prevGCO;
                        ctx.globalAlpha = prevGA;
                    }

                    // Radar: dish + sweep glow
                    if (hasRadar) {
                        const rx = lerp(xTail, xNose, 0.40);
                        const ry = -topY * 1.10;
                        const rr = size * 0.28;

                        ctx.strokeStyle = "rgba(220,230,245,0.70)";
                        ctx.beginPath();
                        ctx.moveTo(rx, ry);
                        ctx.lineTo(rx, ry + size * 0.18);
                        ctx.stroke();

                        ctx.beginPath();
                        ctx.arc(rx, ry, rr, 0, Math.PI * 2);
                        ctx.stroke();

                        ctx.globalCompositeOperation = "lighter";
                        ctx.globalAlpha = 0.55;
                        ctx.strokeStyle = "rgba(140,220,255,0.80)";
                        ctx.beginPath();
                        ctx.arc(rx, ry, rr, radarSweep - 0.15, radarSweep + 0.15);
                        ctx.stroke();
                        ctx.globalCompositeOperation = prevGCO;
                        ctx.globalAlpha = prevGA;
                    }

                    // Scientific lab: pod with faint blue core
                    if (hasScientificLab) {
                        const lx = lerp(xTail, xNose, 0.28);
                        const ly = topY * 1.18;
                        const lr = size * 0.22;

                        ctx.strokeStyle = "rgba(255,255,255,0.45)";
                        ctx.fillStyle = "rgba(25,30,40,0.85)";
                        ctx.beginPath();
                        ctx.arc(lx, ly, lr, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.stroke();

                        ctx.globalCompositeOperation = "lighter";
                        ctx.globalAlpha = 0.45;
                        ctx.fillStyle = "rgba(130,200,255,0.75)";
                        ctx.beginPath();
                        ctx.arc(lx - lr * 0.18, ly - lr * 0.10, lr * 0.35, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.globalCompositeOperation = prevGCO;
                        ctx.globalAlpha = prevGA;
                    }

                    // Mess: small module with warm windows
                    if (hasMess) {
                        const mx = lerp(xTail, xNose, 0.52);
                        const my = topY * 1.22;
                        const mw = size * 0.52;
                        const mh = size * 0.22;

                        ctx.fillStyle = "rgba(22,24,30,0.9)";
                        ctx.strokeStyle = "rgba(255,255,255,0.35)";
                        ctx.beginPath();
                        ctx.roundRect(mx - mw / 2, my - mh / 2, mw, mh, 4);
                        ctx.fill();
                        ctx.stroke();

                        ctx.globalCompositeOperation = "lighter";
                        for (let i = 0; i < 4; i++) {
                            const wx = mx - mw * 0.30 + i * (mw * 0.20);
                            const wy = my;
                            ctx.globalAlpha = (blinkB && i === 1) ? 0.7 : 0.35;
                            ctx.fillStyle = "rgba(255,200,120,0.85)";
                            ctx.beginPath();
                            ctx.roundRect(wx - 3, wy - 2, 6, 4, 2);
                            ctx.fill();
                        }
                        ctx.globalCompositeOperation = prevGCO;
                        ctx.globalAlpha = prevGA;
                    }

                    // Observatory: telescope tube / lens
                    if (hasObservatory) {
                        const ox = lerp(xTail, xNose, 0.74);
                        const oy = -topY * 1.18;
                        const ol = size * 0.55;

                        ctx.save();
                        ctx.translate(ox, oy);
                        ctx.rotate(-0.25);

                        ctx.fillStyle = "rgba(20,22,28,0.92)";
                        ctx.strokeStyle = "rgba(255,255,255,0.35)";
                        ctx.beginPath();
                        ctx.roundRect(-ol * 0.55, -size * 0.10, ol, size * 0.20, 4);
                        ctx.fill();
                        ctx.stroke();

                        ctx.globalCompositeOperation = "lighter";
                        ctx.globalAlpha = 0.55;
                        ctx.fillStyle = "rgba(140,220,255,0.85)";
                        ctx.beginPath();
                        ctx.arc(ol * 0.45, 0, size * 0.11, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.globalCompositeOperation = prevGCO;
                        ctx.globalAlpha = prevGA;

                        ctx.restore();
                    }

                    // Solar panels: articulated pair with cell grid
                    if (hasSolarPanel) {
                        const px = lerp(xTail, xNose, 0.50);
                        const py = 0;
                        const panelLen = size * 1.10;
                        const panelW = size * 0.26;
                        const hinge = size * 0.10;

                        for (const s of [-1, 1]) {
                            ctx.save();
                            ctx.translate(px, py);
                            ctx.rotate(s * (Math.PI / 2));

                            ctx.strokeStyle = "rgba(255,255,255,0.35)";
                            ctx.beginPath();
                            ctx.moveTo(0, 0);
                            ctx.lineTo(hinge, 0);
                            ctx.stroke();

                            ctx.fillStyle = "rgba(10,30,70,0.75)";
                            ctx.strokeStyle = "rgba(120,180,255,0.55)";
                            ctx.beginPath();
                            ctx.roundRect(hinge, -panelW / 2, panelLen, panelW, 4);
                            ctx.fill();
                            ctx.stroke();

                            // cell grid
                            ctx.globalAlpha = 0.35;
                            ctx.strokeStyle = "rgba(160,210,255,0.55)";
                            for (let i = 1; i <= 5; i++) {
                                const gx = hinge + (panelLen * i) / 6;
                                ctx.beginPath();
                                ctx.moveTo(gx, -panelW / 2);
                                ctx.lineTo(gx, panelW / 2);
                                ctx.stroke();
                            }
                            for (let j = -1; j <= 1; j++) {
                                const gy = (panelW * j) / 3;
                                ctx.beginPath();
                                ctx.moveTo(hinge, gy);
                                ctx.lineTo(hinge + panelLen, gy);
                                ctx.stroke();
                            }
                            ctx.globalAlpha = prevGA;

                            ctx.restore();
                        }
                    }

                    // Rotating gravity ring
                    if (hasRotatingRing) {
                        const ringR = size * 2.05;
                        const spin = ((t / 1000) * 1.35 * ringSpin) % (Math.PI * 2);

                        ctx.save();
                        ctx.globalAlpha = 0.85;
                        ctx.strokeStyle = "rgba(180,200,255,0.22)";
                        ctx.lineWidth = 1;

                        // ring
                        ctx.beginPath();
                        ctx.arc(0, 0, ringR, 0, Math.PI * 2);
                        ctx.stroke();

                        // spokes
                        ctx.globalAlpha = 0.75;
                        for (let i = 0; i < 10; i++) {
                            const a = spin + i * (Math.PI * 2) / 10;
                            const x0 = Math.cos(a) * (ringR * 0.75);
                            const y0 = Math.sin(a) * (ringR * 0.75);
                            const x1 = Math.cos(a) * ringR;
                            const y1 = Math.sin(a) * ringR;
                            ctx.beginPath();
                            ctx.moveTo(x0, y0);
                            ctx.lineTo(x1, y1);
                            ctx.stroke();
                        }

                        // subtle glow
                        ctx.globalCompositeOperation = "lighter";
                        ctx.globalAlpha = 0.18;
                        ctx.beginPath();
                        ctx.arc(0, 0, ringR + 2, 0, Math.PI * 2);
                        ctx.strokeStyle = "rgba(140,220,255,0.45)";
                        ctx.stroke();
                        ctx.globalCompositeOperation = prevGCO;
                        ctx.globalAlpha = prevGA;

                        ctx.restore();
                    }

                    // Lazer gun: turret + barrel (place outside hull), can rotate
                    if (hasLazerGun) {
                        const gunBaseX = lerp(xTail, xNose, 0.58);
                        const gunBaseY = topY * 1.05;
                        const localLazer = (lazerAngle || angle) - angle;

                        ctx.save();
                        ctx.translate(gunBaseX, gunBaseY);
                        ctx.rotate(localLazer);

                        // mount
                        ctx.fillStyle = "rgba(16,18,22,0.95)";
                        ctx.strokeStyle = "rgba(255,255,255,0.35)";
                        ctx.beginPath();
                        ctx.roundRect(-4, -3, 8, 6, 3);
                        ctx.fill();
                        ctx.stroke();

                        // barrel
                        ctx.fillStyle = "rgba(25,28,35,0.95)";
                        ctx.beginPath();
                        ctx.roundRect(2, -1.5, size * 0.70, 3, 2);
                        ctx.fill();

                        // muzzle glow / beam
                        if (lazerFiring) {
                            ctx.globalCompositeOperation = "lighter";
                            ctx.globalAlpha = 0.9;
                            ctx.fillStyle = "rgba(120,240,255,0.65)";
                            ctx.beginPath();
                            ctx.arc(2 + size * 0.70, 0, 2.2, 0, Math.PI * 2);
                            ctx.fill();

                            ctx.globalAlpha = 0.55;
                            ctx.strokeStyle = "rgba(120,240,255,0.55)";
                            ctx.beginPath();
                            ctx.moveTo(2 + size * 0.70, 0);
                            ctx.lineTo(2 + size * 3.2, 0);
                            ctx.stroke();

                            ctx.globalCompositeOperation = prevGCO;
                            ctx.globalAlpha = prevGA;
                        }

                        ctx.restore();
                    }

                    // Robotic arm: 3 bones + hand, movable
                    if (hasRoboticArm) {
                        const armBaseX = lerp(xTail, xNose, 0.34);
                        const armBaseY = -topY * 1.02;

                        const seg0 = size * 0.38 * (0.6 + 0.4 * roboticArmExtend);
                        const seg1 = size * 0.34 * (0.6 + 0.4 * roboticArmExtend);
                        const seg2 = size * 0.28 * (0.6 + 0.4 * roboticArmExtend);

                        ctx.save();
                        ctx.translate(armBaseX, armBaseY);

                        // base mount
                        ctx.fillStyle = "rgba(18,20,25,0.95)";
                        ctx.strokeStyle = "rgba(255,255,255,0.35)";
                        ctx.beginPath();
                        ctx.roundRect(-4, -4, 8, 8, 3);
                        ctx.fill();
                        ctx.stroke();

                        // bones
                        let x = 0, y = 0;
                        let a = roboticArmAngles[0] || 0;
                        ctx.strokeStyle = "rgba(230,235,242,0.75)";
                        ctx.fillStyle = "rgba(255,255,255,0.35)";

                        const drawBone = (len, ang) => {
                            const nx = x + Math.cos(ang) * len;
                            const ny = y + Math.sin(ang) * len;

                            ctx.beginPath();
                            ctx.moveTo(x, y);
                            ctx.lineTo(nx, ny);
                            ctx.stroke();

                            ctx.beginPath();
                            ctx.arc(nx, ny, 1.6, 0, Math.PI * 2);
                            ctx.fill();

                            x = nx; y = ny;
                        };

                        // segment 0
                        drawBone(seg0, a);

                        // segment 1
                        a += (roboticArmAngles[1] || 0);
                        drawBone(seg1, a);

                        // segment 2
                        a += (roboticArmAngles[2] || 0);
                        drawBone(seg2, a);

                        // hand (simple clamp)
                        ctx.save();
                        ctx.translate(x, y);
                        ctx.rotate(a);
                        ctx.strokeStyle = "rgba(230,235,242,0.75)";
                        ctx.beginPath();
                        ctx.moveTo(0, 0);
                        ctx.lineTo(6, -3);
                        ctx.moveTo(0, 0);
                        ctx.lineTo(6, 3);
                        ctx.stroke();

                        // hand light
                        ctx.globalCompositeOperation = "lighter";
                        ctx.globalAlpha = blinkA ? 0.55 : 0.2;
                        ctx.fillStyle = "rgba(140,220,255,0.8)";
                        ctx.beginPath();
                        ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.globalCompositeOperation = prevGCO;
                        ctx.globalAlpha = prevGA;

                        ctx.restore();
                        ctx.restore();
                    }

                    // =========================
                    // FINAL WORLD-SPACE TINY GLOW (ties ship into scene)
                    // =========================
                    ctx.globalCompositeOperation = "lighter";
                    ctx.globalAlpha = 0.12;
                    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 1.9);
                    halo.addColorStop(0, "rgba(170,220,255,0.18)");
                    halo.addColorStop(1, "rgba(0,0,0,0)");
                    ctx.beginPath();
                    ctx.arc(0, 0, size * 1.6, 0, Math.PI * 2);
                    ctx.fillStyle = halo;
                    ctx.fill();
                    ctx.globalCompositeOperation = prevGCO;
                    ctx.globalAlpha = prevGA;

                    // Restore state
                    ctx.restore();
                }

                if (body.isRocket && true) {
                    drawShip(ctx, screenX, screenY, body.angle, body.thrust, visualRadius, body, flightComputerModules);
                }

                // --- STAR RENDERING ---
                else if (body.isStar) {
                    ctx.globalCompositeOperation = 'lighter';
                    if (visualConfig.showGlow) {
                        const glowRadius = visualRadius * 6 * visualConfig.glowIntensity;
                        if (glowRadius > 0 && Number.isFinite(glowRadius)) {
                            const glow = ctx.createRadialGradient(screenX, screenY, visualRadius, screenX, screenY, glowRadius);
                            glow.addColorStop(0, body.color);
                            glow.addColorStop(0.2, body.color);
                            glow.addColorStop(1, 'transparent');
                            ctx.fillStyle = glow;
                            ctx.beginPath(); ctx.arc(screenX, screenY, glowRadius, 0, Math.PI * 2); ctx.fill();
                        }
                    }

                    // Multi-layer turbulent star surface
                    const core = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, visualRadius * 1.2);
                    core.addColorStop(0, '#ffffff');
                    core.addColorStop(0.3, body.color);
                    core.addColorStop(0.8, body.color);
                    core.addColorStop(1, 'transparent');
                    ctx.fillStyle = core;
                    ctx.beginPath(); ctx.arc(screenX, screenY, visualRadius * 1.2, 0, Math.PI * 2); ctx.fill();

                    ctx.globalCompositeOperation = 'source-over';
                }
                // --- PLANET RENDERING (Procedural) ---
                else {
                    // 1. Draw Rings (if Saturn-like)
                    if (body.name.includes('Pomme') && false) {


                        if (body.name.includes('Saturn') || (body.mass > 300 && body.mass < 500)) {
                            ctx.save();
                            ctx.translate(screenX, screenY);
                            ctx.rotate(Math.PI / 6); // Tilt rings
                            ctx.beginPath();
                            ctx.ellipse(0, 0, visualRadius * 2.2, visualRadius * 0.6, 0, 0, Math.PI * 2);
                            ctx.fillStyle = 'rgba(180, 160, 130, 0.4)';
                            ctx.fill();
                            ctx.beginPath();
                            ctx.ellipse(0, 0, visualRadius * 1.8, visualRadius * 0.5, 0, 0, Math.PI * 2);
                            ctx.lineWidth = 2;
                            ctx.strokeStyle = 'rgba(200, 190, 170, 0.3)';
                            ctx.stroke();
                            ctx.restore();
                        }

                        ctx.save();
                        // Clip to planet circle
                        ctx.beginPath();
                        ctx.arc(screenX, screenY, visualRadius, 0, Math.PI * 2);
                        ctx.clip();

                        // Base Color
                        ctx.fillStyle = body.color;
                        ctx.fill();

                        // Procedural Textures based on Mass
                        if (body.mass > 100) {
                            // GAS GIANT: Banded Gradients
                            const bands = 5;
                            const bandHeight = (visualRadius * 2) / bands;
                            ctx.translate(screenX, screenY);
                            ctx.rotate(Math.PI / 8); // Slight axis tilt

                            for (let i = 0; i < bands; i++) {
                                ctx.fillStyle = i % 2 === 0 ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';
                                ctx.fillRect(-visualRadius, -visualRadius + i * bandHeight, visualRadius * 2, bandHeight);
                            }
                        } else {
                            // ROCKY PLANET: Craters / Continents
                            // Use seeded random so it looks static for the same body ID
                            const seed = body.id;

                            // Draw some 'continents' or patches
                            for (let i = 0; i < 3; i++) {
                                const rx = (seededRandom(seed + i + 'x') - 0.5) * visualRadius * 1.5;
                                const ry = (seededRandom(seed + i + 'y') - 0.5) * visualRadius * 1.5;
                                const r = seededRandom(seed + i + 'r') * visualRadius * 0.8;

                                ctx.beginPath();
                                ctx.arc(screenX + rx, screenY + ry, r, 0, Math.PI * 2);
                                ctx.fillStyle = 'rgba(0,0,0,0.15)'; // Dark patches
                                ctx.fill();
                            }

                            // Draw some 'craters' or brighter spots
                            for (let i = 0; i < 2; i++) {
                                const rx = (seededRandom(seed + i + 'cx') - 0.5) * visualRadius * 1.2;
                                const ry = (seededRandom(seed + i + 'cy') - 0.5) * visualRadius * 1.2;
                                const r = seededRandom(seed + i + 'cr') * visualRadius * 0.3;

                                ctx.beginPath();
                                ctx.arc(screenX + rx, screenY + ry, r, 0, Math.PI * 2);
                                ctx.fillStyle = 'rgba(255,255,255,0.1)'; // Light patches
                                ctx.fill();
                            }
                        }
                        ctx.restore(); // Remove clip

                        // Atmosphere Glow (Day Side / Edge)
                        ctx.globalCompositeOperation = 'screen';
                        if (visualConfig.showGlow) {
                            const atmRadius = visualRadius * (1.4 * visualConfig.glowIntensity);
                            if (atmRadius > visualRadius * 0.8 && Number.isFinite(atmRadius)) {
                                const atm = ctx.createRadialGradient(screenX, screenY, visualRadius * 0.85, screenX, screenY, atmRadius);
                                atm.addColorStop(0, body.color);
                                atm.addColorStop(1, 'transparent');
                                ctx.fillStyle = atm;
                                ctx.globalAlpha = isGhost ? 0.3 : 0.3;
                                ctx.beginPath(); ctx.arc(screenX, screenY, atmRadius, 0, Math.PI * 2); ctx.fill();
                                ctx.globalCompositeOperation = 'source-over';
                                ctx.globalAlpha = isGhost ? 0.5 : 1.0;
                            }
                        }

                        // Shadow (Terminator) - Day/Night Cycle
                        if (primaryStar && !isGhost && !body.isStar) {
                            const dx = body.position.x - primaryStar.position.x;
                            const dy = body.position.y - primaryStar.position.y;
                            const angleToSun = Math.atan2(dy, dx);

                            ctx.save();
                            ctx.translate(screenX, screenY);
                            ctx.rotate(angleToSun);

                            // We want to darken the side facing AWAY from the sun.
                            // Since we rotated by angleToSun (vector Star->Body), the positive X axis is the "Shadow Direction".

                            ctx.beginPath();
                            ctx.arc(0, 0, visualRadius, -Math.PI / 2, Math.PI / 2);
                            ctx.closePath();

                            // Soft gradient for terminator
                            // Start slightly inside the lit area to blend
                            const grd = ctx.createLinearGradient(-visualRadius * 0.2, 0, visualRadius * 0.6, 0);
                            grd.addColorStop(0, 'rgba(0,0,0,0)');
                            grd.addColorStop(0.4, 'rgba(0,0,0,0.5)');
                            grd.addColorStop(1, 'rgba(0,0,0,0.95)');

                            ctx.fillStyle = grd;
                            ctx.fill();

                            ctx.restore();
                        }
                    } else if (body.name.includes('Pomme')) {
                        drawApple(ctx, screenX, screenY, visualRadius, 1);
                    } else {
                        const ttime = time * 0;
                        //drawBeautifulPlanetOpenAi(ctx, body, screenX, screenY, visualRadius, body.color, { primaryStar, visualConfig, isGhost, time: ttime });
                        drawBeautifullPlanetGemini(ctx, body, screenX, screenY, visualRadius, { primaryStar, visualConfig, isGhost, time: ttime });
                    }


                    // --- SURFACE OBJECTS RENDERING ---
                    if (body.surfaceObjects && body.surfaceObjects.length > 0) {
                        body.surfaceObjects.forEach(obj => {
                            const angle = obj.angle; // Radians
                            // Position on surface
                            const objX = screenX + Math.cos(angle) * visualRadius;
                            const objY = screenY + Math.sin(angle) * visualRadius;

                            ctx.save();
                            ctx.translate(objX, objY);
                            ctx.rotate(angle + Math.PI / 2); // Align with surface normal

                            const size = Math.max(2, obj.radius * scale);
                            ctx.fillStyle = obj.color;

                            // Draw based on design
                            ctx.beginPath();
                            if (obj.design === 'square') {
                                ctx.fillRect(-size / 2, -size / 2, size, size);
                            } else if (obj.design === 'triangle') {
                                ctx.moveTo(0, -size / 2);
                                ctx.lineTo(size / 2, size / 2);
                                ctx.lineTo(-size / 2, size / 2);
                                ctx.fill();
                            } else if (obj.design === 'hexagon') {
                                ctx.moveTo(size / 2, 0);
                                for (let i = 1; i <= 6; i++) {
                                    ctx.lineTo(size / 2 * Math.cos(i * 2 * Math.PI / 6), size / 2 * Math.sin(i * 2 * Math.PI / 6));
                                }
                                ctx.fill();
                            } else {
                                // Circle (default)
                                ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
                                ctx.fill();
                            }

                            // Optional: Draw name on hover or always? 
                            // Maybe too cluttered. Let's keep it simple for now.

                            ctx.restore();
                        });
                    }
                }
                if (isGhost) ctx.globalAlpha = 1.0;
            };

            bodies.forEach(b => drawBody(b));

            // Selection Ring
            if (selectedBodyId) {
                const body = bodies.find(b => b.id === selectedBodyId);
                if (body) {
                    const screenX = cx + body.position.x * scale;
                    const screenY = cy + body.position.y * scale;
                    const visualRadius = body.radius * scale;
                    const rot = time * 2;
                    if (Number.isFinite(screenX) && Number.isFinite(screenY)) {
                        ctx.beginPath(); ctx.setLineDash([5, 5]);
                        ctx.arc(screenX, screenY, visualRadius + 10, rot, rot + Math.PI * 2);
                        ctx.strokeStyle = body.isRocket ? 'rgba(255, 165, 0, 0.8)' : 'rgba(255, 255, 255, 0.8)';
                        ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
                        ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.shadowColor = 'black'; ctx.shadowBlur = 4;
                        ctx.fillText(body.name, screenX + visualRadius + 14, screenY + 4); ctx.shadowBlur = 0;
                    }

                    // --- ROCKET ORBITAL MARKERS (Pe/Ap) ---
                    if (body.isRocket && isRocketMode && rocketTargetBodyId) {
                        const target = bodies.find(b => b.id === rocketTargetBodyId);
                        const parent = bodies.find(b => b.id === body.orbitReferenceId); // Explicit Parent

                        if (target) {
                            const points = calculateOrbitalPoints(body, target, physicsConfig.gravitationalConstant);
                            if (points) {
                                // Draw theoretical elliptical orbit path
                                if (showTheoreticalOrbit) {
                                    const ellipsePoints = calculateEllipsePoints(body, target, physicsConfig.gravitationalConstant);
                                    if (ellipsePoints && ellipsePoints.length > 0) {
                                        ctx.strokeStyle = body.color || '#ffffff';
                                        ctx.globalAlpha = 0.3;
                                        ctx.lineWidth = 1.5;
                                        ctx.setLineDash([5, 5]);
                                        ctx.beginPath();

                                        ellipsePoints.forEach((point, idx) => {
                                            const px = cx + point.x * scale;
                                            const py = cy + point.y * scale;
                                            if (Number.isFinite(px) && Number.isFinite(py)) {
                                                if (idx === 0) {
                                                    ctx.moveTo(px, py);
                                                } else {
                                                    ctx.lineTo(px, py);
                                                }
                                            }
                                        });

                                        ctx.stroke();
                                        ctx.setLineDash([]);
                                        ctx.globalAlpha = 1.0;
                                    }
                                }

                                // Draw Pe/Ap markers
                                if (points.periapsis) {
                                    const px = cx + points.periapsis.x * scale;
                                    const py = cy + points.periapsis.y * scale;
                                    if (Number.isFinite(px) && Number.isFinite(py)) {
                                        ctx.fillStyle = '#22d3ee'; ctx.font = 'bold 10px sans-serif';
                                        ctx.fillText('Pe', px + 4, py + 4);
                                        ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2); ctx.fill();
                                    }
                                }
                                if (points.apoapsis) {
                                    const ax = cx + points.apoapsis.x * scale;
                                    const ay = cy + points.apoapsis.y * scale;
                                    if (Number.isFinite(ax) && Number.isFinite(ay)) {
                                        ctx.fillStyle = '#f97316'; ctx.font = 'bold 10px sans-serif';
                                        ctx.fillText('Ap', ax + 4, ay + 4);
                                        ctx.beginPath(); ctx.arc(ax, ay, 2, 0, Math.PI * 2); ctx.fill();
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // --- ECLIPSES (Volumetric Shadows) ---
            if (visualConfig.showEclipses && primaryStar) {
                const starX = cx + primaryStar.position.x * scale;
                const starY = cy + primaryStar.position.y * scale;
                const starRad = Math.max(3, primaryStar.radius * scale);

                bodies.forEach(body => {
                    if (body.isStar || body.isRocket || body.name.includes("Pomme_")) return;

                    const bodyX = cx + body.position.x * scale;
                    const bodyY = cy + body.position.y * scale;
                    const bodyRad = Math.max(3, body.radius * scale);

                    // Calculate vector from Star to Body
                    const dx = bodyX - starX;
                    const dy = bodyY - starY;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < bodyRad + starRad) return; // Too close/inside

                    const angle = Math.atan2(dy, dx);
                    const shadowRenderLength = 10000; // Draw off-screen

                    // --- PENUMBRA (Partial Shadow) ---
                    // Region where Earth blocks PART of the Sun. Diverges.
                    // Vertex is between Star and Body.
                    const penumbraVertexDist = (dist * bodyRad) / (starRad + bodyRad);
                    const penumbraHalfAngle = Math.asin((starRad + bodyRad) / dist);

                    // Tangent points on Body (Start of Penumbra)
                    const penP1X = bodyX + Math.cos(angle + Math.PI / 2 - penumbraHalfAngle) * bodyRad;
                    const penP1Y = bodyY + Math.sin(angle + Math.PI / 2 - penumbraHalfAngle) * bodyRad;
                    const penP2X = bodyX + Math.cos(angle - Math.PI / 2 + penumbraHalfAngle) * bodyRad;
                    const penP2Y = bodyY + Math.sin(angle - Math.PI / 2 + penumbraHalfAngle) * bodyRad;

                    // Project outwards from the crossover vertex
                    // Vertex coords relative to body center: -angle direction
                    const penVertexX = bodyX - Math.cos(angle) * penumbraVertexDist;
                    const penVertexY = bodyY - Math.sin(angle) * penumbraVertexDist;

                    // End points (far away)
                    const penEnd1X = penVertexX + Math.cos(angle + penumbraHalfAngle) * (shadowRenderLength + penumbraVertexDist);
                    const penEnd1Y = penVertexY + Math.sin(angle + penumbraHalfAngle) * (shadowRenderLength + penumbraVertexDist);
                    const penEnd2X = penVertexX + Math.cos(angle - penumbraHalfAngle) * (shadowRenderLength + penumbraVertexDist);
                    const penEnd2Y = penVertexY + Math.sin(angle - penumbraHalfAngle) * (shadowRenderLength + penumbraVertexDist);

                    ctx.beginPath();
                    ctx.moveTo(penP1X, penP1Y);
                    ctx.lineTo(penEnd1X, penEnd1Y);
                    ctx.lineTo(penEnd2X, penEnd2Y);
                    ctx.lineTo(penP2X, penP2Y);
                    ctx.closePath();

                    // Gradient for soft penumbra
                    const pGrad = ctx.createLinearGradient(bodyX, bodyY, bodyX + Math.cos(angle) * 200, bodyY + Math.sin(angle) * 200);
                    pGrad.addColorStop(0, 'rgba(0, 0, 0, 0.4)');
                    pGrad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
                    ctx.fillStyle = pGrad;
                    ctx.fill();


                    // --- UMBRA (Full Shadow) ---
                    // Region where Earth blocks ALL of the Sun. Converges.

                    const umbraVertexDist = (dist * bodyRad) / (starRad - bodyRad);
                    // If star < planet (unlikely), dist is negative (diverges). Logic handles sign.

                    const umbraHalfAngle = Math.asin((starRad - bodyRad) / dist);

                    // Tangent points on Body
                    // Radius vector angle is (angle +/- (PI/2 + halfAngle)) because it narrows
                    const umbP1X = bodyX + Math.cos(angle + Math.PI / 2 + umbraHalfAngle) * bodyRad;
                    const umbP1Y = bodyY + Math.sin(angle + Math.PI / 2 + umbraHalfAngle) * bodyRad;
                    const umbP2X = bodyX + Math.cos(angle - Math.PI / 2 - umbraHalfAngle) * bodyRad;
                    const umbP2Y = bodyY + Math.sin(angle - Math.PI / 2 - umbraHalfAngle) * bodyRad;

                    // Tip of Umbra (or projected far if diverging)
                    let umbTipX, umbTipY;

                    if (starRad > bodyRad) {
                        // Converging Cone
                        umbTipX = bodyX + Math.cos(angle) * umbraVertexDist;
                        umbTipY = bodyY + Math.sin(angle) * umbraVertexDist;
                    } else {
                        // Diverging (Antumbra logic effectively) - unlikely in this sim but safe fallback
                        umbTipX = bodyX + Math.cos(angle) * shadowRenderLength;
                        umbTipY = bodyY + Math.sin(angle) * shadowRenderLength;
                    }

                    ctx.beginPath();
                    ctx.moveTo(umbP1X, umbP1Y);
                    ctx.lineTo(umbTipX, umbTipY);
                    ctx.lineTo(umbP2X, umbP2Y);
                    ctx.closePath();

                    // Soften edges
                    const uGrad = ctx.createLinearGradient(bodyX, bodyY, umbTipX, umbTipY);
                    uGrad.addColorStop(0, 'rgba(0,0,0,0.85)');
                    uGrad.addColorStop(1, 'rgba(0,0,0,0.85)'); // Keep dark until tip

                    ctx.fillStyle = uGrad;
                    ctx.fill();
                });
            }

            // --- FLIGHT COMPUTER MODULES VISUALIZATION ---
            flightComputerModules.forEach(module => {
                // Check if module is enabled and active (respects activate input)
                if (!module.isEnabled) return;
                if (!isModuleActive(module, bodies, flightComputerModules, physicsConfig, {})) return;

                const primary = module.primaryBodyId ? bodies.find(b => b.id === module.primaryBodyId) : null;
                const reference = module.referenceBodyId ? bodies.find(b => b.id === module.referenceBodyId) : null;
                const target = module.targetBodyId ? bodies.find(b => b.id === module.targetBodyId) : null;

                if (module.type === 'orbit_info') {
                    // Resolve inputs dynamically to support module chaining (e.g. State Vector -> Orbit Info)
                    const primaryInput = module.inputs?.primary;
                    const referenceInput = module.inputs?.reference;

                    let primary = resolveInput(primaryInput, bodies, flightComputerModules, physicsConfig.gravitationalConstant, rendezvousSolutionMap) as Body;
                    let reference = resolveInput(referenceInput, bodies, flightComputerModules, physicsConfig.gravitationalConstant, rendezvousSolutionMap) as Body;

                    // Fallback to legacy IDs if inputs are not defined
                    if (!primary && module.primaryBodyId) primary = bodies.find(b => b.id === module.primaryBodyId) as Body;
                    if (!reference && module.referenceBodyId) reference = bodies.find(b => b.id === module.referenceBodyId) as Body;

                    if (!primary || !reference || !reference.mass) return;

                    // Calculate and draw theoretical orbit
                    const ellipsePoints = calculateEllipsePoints(primary, reference, physicsConfig.gravitationalConstant);
                    const orbitalPoints = calculateOrbitalPoints(primary, reference, physicsConfig.gravitationalConstant);

                    if (ellipsePoints && ellipsePoints.length > 0) {
                        ctx.beginPath();
                        ctx.moveTo(cx + ellipsePoints[0].x * scale, cy + ellipsePoints[0].y * scale);
                        for (let i = 1; i < ellipsePoints.length; i++) {
                            ctx.lineTo(cx + ellipsePoints[i].x * scale, cy + ellipsePoints[i].y * scale);
                        }
                        ctx.strokeStyle = module.color;
                        ctx.setLineDash([5, 5]);
                        ctx.lineWidth = 1;
                        ctx.globalAlpha = 0.6;
                        ctx.stroke();
                        ctx.setLineDash([]);
                        ctx.globalAlpha = 1.0;
                    }

                    // Draw Pe/Ap markers
                    if (orbitalPoints?.periapsis) {
                        const px = cx + orbitalPoints.periapsis.x * scale;
                        const py = cy + orbitalPoints.periapsis.y * scale;
                        if (Number.isFinite(px) && Number.isFinite(py)) {
                            ctx.fillStyle = module.color; ctx.font = 'bold 10px sans-serif';
                            ctx.fillText('Pe', px + 4, py + 4);
                            ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2); ctx.fill();
                        }
                    }
                    if (orbitalPoints?.apoapsis) {
                        const ax = cx + orbitalPoints.apoapsis.x * scale;
                        const ay = cy + orbitalPoints.apoapsis.y * scale;
                        if (Number.isFinite(ax) && Number.isFinite(ay)) {
                            ctx.fillStyle = module.color; ctx.font = 'bold 10px sans-serif';
                            ctx.fillText('Ap', ax + 4, ay + 4);
                            ctx.beginPath(); ctx.arc(ax, ay, 2, 0, Math.PI * 2); ctx.fill();
                        }
                    }
                } else if (module.type === 'transfer_window') {
                    if (!primary || !reference || !target) return;

                    // Use shared calculation
                    const transferInfo = calculateTransferInfo(primary, reference, target, physicsConfig.gravitationalConstant);

                    const px = cx + reference.position.x * scale;
                    const py = cy + reference.position.y * scale;
                    const primaryX = cx + primary.position.x * scale;
                    const primaryY = cy + primary.position.y * scale;
                    const targetX = cx + target.position.x * scale;
                    const targetY = cy + target.position.y * scale;

                    // Ideal position for target (where it should be for transfer)
                    // We can calculate this from the required phase
                    // requiredPhase is angle(target) - angle(primary)
                    // So angle(target_ideal) = angle(primary) + requiredPhase
                    const primaryAngle = Math.atan2(primary.position.y - reference.position.y, primary.position.x - reference.position.x);
                    const idealTargetAngle = primaryAngle + transferInfo.requiredPhase;

                    const r2 = Math.sqrt(Math.pow(target.position.x - reference.position.x, 2) + Math.pow(target.position.y - reference.position.y, 2));
                    const idealX = cx + (reference.position.x + Math.cos(idealTargetAngle) * r2) * scale;
                    const idealY = cy + (reference.position.y + Math.sin(idealTargetAngle) * r2) * scale;

                    if (Number.isFinite(px) && Number.isFinite(py) && Number.isFinite(primaryX) && Number.isFinite(primaryY) && Number.isFinite(targetX) && Number.isFinite(targetY)) {

                        // 1. Draw the Window Wedge (-5 to +5 degrees from ideal)
                        const windowSizeRad = 5 * Math.PI / 180;
                        const startAngle = idealTargetAngle - windowSizeRad;
                        const endAngle = idealTargetAngle + windowSizeRad;

                        ctx.beginPath();
                        ctx.moveTo(px, py);
                        ctx.arc(px, py, r2 * scale, startAngle, endAngle);
                        ctx.closePath();

                        // Color logic
                        const isReady = transferInfo.ready;
                        const baseColor = module.color;

                        // Helper to convert hex to rgba
                        const hexToRgba = (hex: string, alpha: number) => {
                            const r = parseInt(hex.slice(1, 3), 16);
                            const g = parseInt(hex.slice(3, 5), 16);
                            const b = parseInt(hex.slice(5, 7), 16);
                            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
                        };

                        // Pulsing green if ready, otherwise module color
                        let fillColor = hexToRgba(baseColor, 0.30);
                        let strokeColor = baseColor;

                        if (isReady) {
                            const pulse = 0.3 + Math.sin(time * 8) * 0.2; // Fast pulse
                            fillColor = `rgba(34, 197, 94, ${pulse})`; // Green
                            strokeColor = '#22c55e';
                        }

                        ctx.fillStyle = fillColor;
                        ctx.fill();

                        // 2. Draw the 0-degree error line (White line at ideal angle)
                        ctx.beginPath();
                        ctx.moveTo(px, py);
                        ctx.lineTo(idealX, idealY);
                        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                        ctx.lineWidth = 1.5;
                        ctx.setLineDash([2, 2]);
                        ctx.stroke();
                        ctx.setLineDash([]);

                        // 3. Draw current alignment lines
                        ctx.beginPath();
                        ctx.moveTo(px, py);
                        ctx.lineTo(primaryX, primaryY); // Line to primary
                        ctx.strokeStyle = module.color;
                        ctx.lineWidth = 1;
                        ctx.setLineDash([6, 4]);
                        ctx.stroke();
                        ctx.setLineDash([]);


                    }
                } else if (module.type === 'marker') {
                    const inputs = module.inputs || {};

                    const positionInput = inputs.position || inputs.primary || (module.primaryBodyId ? { type: 'body', value: module.primaryBodyId } : undefined);
                    const markerPos = resolveMarkerVector(positionInput, flightComputerModules);



                    if (!markerPos) return;

                    const screenX = cx + markerPos.x * scale;
                    const screenY = cy + markerPos.y * scale;

                    if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) return;

                    const title = resolveMarkerStringValue(inputs.marker_title, module.markerTitle ?? module.name ?? 'Marker');
                    const description = resolveMarkerStringValue(inputs.marker_description, module.markerDescription ?? '');
                    const baseColor = module.markerColor || module.color || '#a855f7';
                    const resolvedColor = resolveMarkerStringValue(inputs.marker_color, baseColor);
                    const markerColor = sanitizeMarkerColor(resolvedColor, baseColor);
                    const isVisible = (module.markerVisible ?? true) && resolveMarkerBooleanValue(inputs.marker_visible, true);
                    if (!isVisible) return;
                    const shouldPulse = resolveMarkerBooleanValue(inputs.marker_pulse, module.markerPulse ?? false);
                    const shape = module.markerShape || 'ring';
                    const pulseScale = shouldPulse ? 1 + Math.sin(time * 3 + getPulsePhase(module.id)) * 0.25 : 1;
                    const size = 12 * pulseScale;

                    ctx.save();
                    ctx.translate(screenX, screenY);
                    ctx.strokeStyle = markerColor;
                    ctx.fillStyle = markerColor;
                    ctx.lineWidth = 2;
                    ctx.globalAlpha = 0.9;

                    const drawCrosshair = () => {
                        ctx.beginPath();
                        ctx.moveTo(-size * 1.4, 0);
                        ctx.lineTo(size * 1.4, 0);
                        ctx.moveTo(0, -size * 1.4);
                        ctx.lineTo(0, size * 1.4);
                        ctx.stroke();
                    };

                    switch (shape) {
                        case 'diamond':
                            ctx.beginPath();
                            ctx.moveTo(0, -size);
                            ctx.lineTo(size, 0);
                            ctx.lineTo(0, size);
                            ctx.lineTo(-size, 0);
                            ctx.closePath();
                            ctx.stroke();
                            drawCrosshair();
                            break;
                        case 'square':
                            ctx.strokeRect(-size, -size, size * 2, size * 2);
                            drawCrosshair();
                            break;
                        case 'triangle':
                            ctx.beginPath();
                            ctx.moveTo(0, -size);
                            ctx.lineTo(size, size);
                            ctx.lineTo(-size, size);
                            ctx.closePath();
                            ctx.stroke();
                            drawCrosshair();
                            break;
                        case 'pin':
                            ctx.beginPath();
                            ctx.arc(0, -size * 0.3, size * 0.6, 0, Math.PI * 2);
                            ctx.fill();
                            ctx.beginPath();
                            ctx.moveTo(0, size);
                            ctx.lineTo(-size * 0.4, 0);
                            ctx.lineTo(size * 0.4, 0);
                            ctx.closePath();
                            ctx.fill();
                            break;
                        default:
                            ctx.beginPath();
                            ctx.arc(0, 0, size, 0, Math.PI * 2);
                            ctx.stroke();
                            ctx.globalAlpha = 0.5;
                            ctx.beginPath();
                            ctx.arc(0, 0, size * 0.6, 0, Math.PI * 2);
                            ctx.stroke();
                            ctx.globalAlpha = 0.9;
                            drawCrosshair();
                            break;
                    }

                    ctx.restore();

                    ctx.save();
                    ctx.textAlign = 'center';
                    ctx.font = 'bold 11px "JetBrains Mono", monospace';
                    ctx.textBaseline = 'bottom';
                    ctx.lineWidth = 4;
                    ctx.strokeStyle = 'rgba(2, 6, 23, 0.85)';
                    ctx.fillStyle = '#f8fafc';
                    ctx.strokeText(title, screenX, screenY - size - 6);
                    ctx.fillText(title, screenX, screenY - size - 6);
                    if (description) {
                        ctx.font = '10px "JetBrains Mono", monospace';
                        ctx.textBaseline = 'top';
                        ctx.strokeText(description, screenX, screenY + size + 6);
                        ctx.fillText(description, screenX, screenY + size + 6);
                    }
                    ctx.restore();
                }
            });


            // --- OBSERVER MODE VISUALIZATION ---
            if (observerBodyIds.a && observerBodyIds.b) {
                // ... (Existing Observer Mode Logic kept same for brevity, reused drawVectorFromTo)
                const bodyA = bodies.find(b => b.id === observerBodyIds.a);
                const bodyB = bodies.find(b => b.id === observerBodyIds.b);
                if (bodyA && bodyB) {
                    const ax = cx + bodyA.position.x * scale;
                    const ay = cy + bodyA.position.y * scale;
                    const bx = cx + bodyB.position.x * scale;
                    const by = cy + bodyB.position.y * scale;

                    if (Number.isFinite(ax) && Number.isFinite(ay) && Number.isFinite(bx) && Number.isFinite(by)) {
                        // Connection Line
                        ctx.beginPath();
                        ctx.moveTo(ax, ay);
                        ctx.lineTo(bx, by);
                        ctx.strokeStyle = '#22d3ee'; // Cyan
                        ctx.lineWidth = 2;
                        ctx.setLineDash([5, 5]);
                        ctx.stroke();
                        ctx.setLineDash([]);

                        // Revised drawArrow to take explicit TO coordinates for precise length control
                        const drawVectorFromTo = (fromX: number, fromY: number, toX: number, toY: number, color: string) => {
                            const headlen = 10;
                            const angle = Math.atan2(toY - fromY, toX - fromX);

                            ctx.beginPath();
                            ctx.moveTo(fromX, fromY);
                            ctx.lineTo(toX, toY);
                            ctx.strokeStyle = color;
                            ctx.lineWidth = 3;
                            ctx.stroke();

                            ctx.beginPath();
                            ctx.moveTo(toX, toY);
                            ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
                            ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
                            ctx.fillStyle = color;
                            ctx.fill();
                        };

                        // --- 1. Pairwise Force Vectors (Red) ---
                        const FORCE_SCALE = scale * 20;
                        const dx = bodyB.position.x - bodyA.position.x;
                        const dy = bodyB.position.y - bodyA.position.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        const forceMag = (physicsConfig.gravitationalConstant * bodyA.mass * bodyB.mass) / (dist * dist);
                        const dirX = dx / dist;
                        const dirY = dy / dist;
                        const visualForceLen = Math.min(300, forceMag * FORCE_SCALE);

                        drawVectorFromTo(ax, ay, ax + dirX * visualForceLen, ay + dirY * visualForceLen, '#ef4444');
                        drawVectorFromTo(bx, by, bx - dirX * visualForceLen, by - dirY * visualForceLen, '#ef4444');

                        // --- 2. Net Force Vectors (Yellow) ---
                        const drawNetVector = (bodyId: string, startX: number, startY: number) => {
                            const idx = bodies.findIndex(b => b.id === bodyId);
                            if (idx === -1) return;
                            const f = forces[idx];
                            const fMag = Math.sqrt(f.x * f.x + f.y * f.y);
                            if (fMag > 0.0001) {
                                const visualNetLen = Math.min(300, fMag * FORCE_SCALE);
                                const endX = startX + (f.x / fMag) * visualNetLen;
                                const endY = startY + (f.y / fMag) * visualNetLen;
                                drawVectorFromTo(startX, startY, endX, endY, '#fbbf24');
                            }
                        };
                        drawNetVector(observerBodyIds.a, ax, ay);
                        drawNetVector(observerBodyIds.b, bx, by);

                        // --- 3. Velocity Vectors (Green) ---
                        const VELOCITY_SCALE = scale * 20;
                        const drawVelocityVector = (bodyId: string, startX: number, startY: number) => {
                            const body = bodies.find(b => b.id === bodyId);
                            if (!body) return;
                            const vx = body.velocity.x;
                            const vy = body.velocity.y;
                            const vMag = Math.sqrt(vx * vx + vy * vy);
                            if (vMag > 0.01) {
                                const visualLen = Math.min(300, vMag * VELOCITY_SCALE);
                                const endX = startX + (vx / vMag) * visualLen;
                                const endY = startY + (vy / vMag) * visualLen;
                                drawVectorFromTo(startX, startY, endX, endY, '#4ade80');
                            }
                        };
                        drawVelocityVector(observerBodyIds.a, ax, ay);
                        drawVelocityVector(observerBodyIds.b, bx, by);
                    }
                }
            }

            // --- PREDICTION TRAIL RENDERING (Multi-Path) ---
            if (predictionPaths.length > 0) {
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';

                predictionPaths.forEach(path => {
                    if (path.points.length < 2) return;

                    // Optimization: If a path is completely off screen, skip (bounding box check)
                    // But doing a precise check is expensive. We'll rely on canvas clipping mostly.

                    ctx.beginPath();
                    let started = false;

                    for (let i = 0; i < path.points.length; i++) {
                        const p = path.points[i];
                        const px = cx + p.x * scale;
                        const py = cy + p.y * scale;

                        if (Number.isFinite(px) && Number.isFinite(py)) {
                            if (!started) {
                                ctx.moveTo(px, py);
                                started = true;
                            } else {
                                ctx.lineTo(px, py);
                            }
                        }
                    }

                    if (started) {
                        ctx.strokeStyle = path.color;
                        ctx.lineWidth = 1.5;
                        ctx.globalAlpha = 0.5;
                        ctx.setLineDash([4, 4]);
                        ctx.stroke();
                        ctx.setLineDash([]);
                    }
                });
                ctx.globalAlpha = 1.0;
            }

            // --- CREATION MODE GHOST ---
            if (isCreationMode && creationCandidate) {
                drawBody(creationCandidate, true);
                const ghostSx = cx + creationCandidate.position.x * scale;
                const ghostSy = cy + creationCandidate.position.y * scale;

                if (Number.isFinite(ghostSx) && Number.isFinite(ghostSy)) {
                    // Draw Velocity Arrow
                    const vx = creationCandidate.velocity.x;
                    const vy = creationCandidate.velocity.y;
                    const vMag = Math.sqrt(vx * vx + vy * vy);
                    if (vMag > 0.1) {
                        const arrowLen = Math.min(100, vMag * 10 * scale);
                        const endX = ghostSx + (vx / vMag) * arrowLen;
                        const endY = ghostSy + (vy / vMag) * arrowLen;

                        ctx.beginPath();
                        ctx.moveTo(ghostSx, ghostSy);
                        ctx.lineTo(endX, endY);
                        ctx.strokeStyle = creationCandidate.color;
                        ctx.lineWidth = 2;
                        ctx.stroke();
                    }
                }
            }

            // --- RENDEZVOUS MARKERS ---
            // Legacy single rendezvous point from RocketPanel
            if (rendezvousPoint) {
                const rx = cx + rendezvousPoint.x * scale;
                const ry = cy + rendezvousPoint.y * scale;

                if (Number.isFinite(rx) && Number.isFinite(ry)) {
                    const markerSize = 12;
                    const pulseScale = 1 + Math.sin(time * 3) * 0.2;
                    const effectiveSize = markerSize * pulseScale;

                    ctx.save();
                    ctx.translate(rx, ry);

                    // Outer ring
                    ctx.beginPath();
                    ctx.arc(0, 0, effectiveSize, 0, Math.PI * 2);
                    ctx.strokeStyle = '#00ff88';
                    ctx.lineWidth = 2;
                    ctx.globalAlpha = 0.8;
                    ctx.stroke();

                    // Inner ring
                    ctx.beginPath();
                    ctx.arc(0, 0, effectiveSize * 0.7, 0, Math.PI * 2);
                    ctx.strokeStyle = '#00ff88';
                    ctx.lineWidth = 1;
                    ctx.globalAlpha = 0.5;
                    ctx.stroke();

                    // Crosshair
                    ctx.globalAlpha = 0.8;
                    ctx.strokeStyle = '#00ff88';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(-effectiveSize * 1.5, 0);
                    ctx.lineTo(effectiveSize * 1.5, 0);
                    ctx.moveTo(0, -effectiveSize * 1.5);
                    ctx.lineTo(0, effectiveSize * 1.5);
                    ctx.stroke();

                    // Center dot
                    ctx.globalAlpha = 1;
                    ctx.fillStyle = '#00ff88';
                    ctx.beginPath();
                    ctx.arc(0, 0, 3, 0, Math.PI * 2);
                    ctx.fill();

                    // Label
                    ctx.globalAlpha = 1;
                    ctx.font = 'bold 11px monospace';
                    ctx.fillStyle = '#00ff88';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'bottom';
                    ctx.shadowColor = '#00ff88';
                    ctx.shadowBlur = 8;
                    ctx.fillText('RENDEZVOUS', 0, -effectiveSize * 2);
                    ctx.shadowBlur = 0;

                    ctx.restore();
                }
            }

            // Flight Computer rendezvous points (with custom names and colors)
            if (rendezvousPoints && rendezvousPoints.length > 0) {
                rendezvousPoints.forEach((rdv, index) => {
                    const rx = cx + rdv.point.x * scale;
                    const ry = cy + rdv.point.y * scale;

                    if (Number.isFinite(rx) && Number.isFinite(ry)) {
                        const markerSize = 12;
                        const pulseScale = 1 + Math.sin(time * 3 + index * 0.5) * 0.2; // Offset animation per marker
                        const effectiveSize = markerSize * pulseScale;

                        // Format time: only show non-zero values
                        const totalSeconds = Math.floor(rdv.timeToRendezvous);
                        const years = Math.floor(totalSeconds / (365.25 * 24 * 3600));
                        const remainingAfterYears = totalSeconds % (365.25 * 24 * 3600);
                        const months = Math.floor(remainingAfterYears / (30.44 * 24 * 3600));
                        const remainingAfterMonths = remainingAfterYears % (30.44 * 24 * 3600);
                        const days = Math.floor(remainingAfterMonths / (24 * 3600));
                        const remainingAfterDays = remainingAfterMonths % (24 * 3600);
                        const hours = Math.floor(remainingAfterDays / 3600);
                        const minutes = Math.floor((remainingAfterDays % 3600) / 60);
                        const seconds = Math.floor(remainingAfterDays % 60);

                        const timeParts = [];
                        if (years > 0) timeParts.push(`${years}y`);
                        if (months > 0) timeParts.push(`${months}m`);
                        if (days > 0) timeParts.push(`${days}d`);
                        if (hours > 0) timeParts.push(`${hours}h`);
                        if (minutes > 0) timeParts.push(`${minutes}m`);
                        if (seconds > 0 && timeParts.length === 0) timeParts.push(`${seconds}s`); // Show seconds only if everything else is 0

                        const timeStr = timeParts.length > 0 ? timeParts.join(' ') : '0s';
                        const secondsStr = `${rdv.timeToRendezvous.toFixed(1)}s`;

                        ctx.save();
                        ctx.translate(rx, ry);

                        // Outer ring
                        ctx.beginPath();
                        ctx.arc(0, 0, effectiveSize, 0, Math.PI * 2);
                        ctx.strokeStyle = rdv.color;
                        ctx.lineWidth = 2;
                        ctx.globalAlpha = 0.8;
                        ctx.stroke();

                        // Inner ring
                        ctx.beginPath();
                        ctx.arc(0, 0, effectiveSize * 0.7, 0, Math.PI * 2);
                        ctx.strokeStyle = rdv.color;
                        ctx.lineWidth = 1;
                        ctx.globalAlpha = 0.5;
                        ctx.stroke();

                        // Crosshair
                        ctx.globalAlpha = 0.8;
                        ctx.strokeStyle = rdv.color;
                        ctx.lineWidth = 2;
                        ctx.beginPath();
                        ctx.moveTo(-effectiveSize * 1.5, 0);
                        ctx.lineTo(effectiveSize * 1.5, 0);
                        ctx.moveTo(0, -effectiveSize * 1.5);
                        ctx.lineTo(0, effectiveSize * 1.5);
                        ctx.stroke();

                        // Center dot
                        ctx.globalAlpha = 1;
                        ctx.fillStyle = rdv.color;
                        ctx.beginPath();
                        ctx.arc(0, 0, 3, 0, Math.PI * 2);
                        ctx.fill();

                        // Label with custom name
                        ctx.globalAlpha = 1;
                        ctx.font = 'bold 11px monospace';
                        ctx.fillStyle = rdv.color;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'bottom';
                        ctx.shadowColor = rdv.color;
                        ctx.shadowBlur = 8;
                        ctx.fillText(rdv.name.toUpperCase(), 0, -effectiveSize * 2 - 32);

                        // Time labels
                        ctx.font = '9px monospace';
                        ctx.fillText(timeStr, 0, -effectiveSize * 2 - 20);
                        ctx.fillText(secondsStr, 0, -effectiveSize * 2 - 10);

                        // Delta-V labels
                        ctx.fillText(`ΔV: ${rdv.totalDeltaV.toFixed(1)} m/s`, 0, -effectiveSize * 2);
                        ctx.fillText(`P:${rdv.deltaVPrograde.toFixed(1)} R:${rdv.deltaVRadial.toFixed(1)}`, 0, -effectiveSize * 2 + 10);
                        ctx.shadowBlur = 0;

                        ctx.restore();
                    }
                });
            }


            // --- FLIGHT COMPUTER: LINE DRAWER ---
            flightComputerModules.forEach(module => {
                if (module.type !== 'line_drawer' || !module.isEnabled) return;
                if (!isModuleActive(module, bodies, flightComputerModules, physicsConfig, {})) return;

                const inputA = module.inputs?.point_a;
                const inputB = module.inputs?.point_b;

                // If inputs are missing, logic typically fails gracefully
                if (!inputA || !inputB) return;

                const pA = resolveInput(inputA, bodies, flightComputerModules, physicsConfig.gravitationalConstant, rendezvousSolutionMap);
                const pB = resolveInput(inputB, bodies, flightComputerModules, physicsConfig.gravitationalConstant, rendezvousSolutionMap);

                if (pA && pB) {
                    const posA = 'position' in pA ? pA.position : pA;
                    const posB = 'position' in pB ? pB.position : pB;

                    const sxA = cx + posA.x * scale;
                    const syA = cy + posA.y * scale;
                    const sxB = cx + posB.x * scale;
                    const syB = cy + posB.y * scale;

                    if (Number.isFinite(sxA) && Number.isFinite(syA) && Number.isFinite(sxB) && Number.isFinite(syB)) {
                        // Color resolution
                        let color = module.lineColor || module.color || '#00ff00';
                        const colorInput = module.inputs?.color;
                        if (colorInput) {
                            const resolvedColor = resolveStringInput(colorInput, bodies, flightComputerModules, physicsConfig.gravitationalConstant, rendezvousSolutionMap);
                            if (resolvedColor) color = resolvedColor;
                        }

                        // Thickness resolution
                        let thickness = module.lineThickness || 1;
                        const thicknessInput = module.inputs?.thickness;
                        if (thicknessInput) {
                            const resolvedThickness = resolveScalarInput(thicknessInput, bodies, flightComputerModules, physicsConfig.gravitationalConstant, rendezvousSolutionMap);
                            if (resolvedThickness !== null) thickness = resolvedThickness;
                        }

                        ctx.save();

                        // Perform Raycast
                        const hitResult = performRaycast(posA, posB, bodies);

                        if (hitResult.hit && hitResult.position) {
                            // Hit!
                            const hitX = cx + hitResult.position.x * scale;
                            const hitY = cy + hitResult.position.y * scale;

                            // Draw segment A -> Hit
                            ctx.beginPath();
                            ctx.moveTo(sxA, syA);
                            ctx.lineTo(hitX, hitY);
                            ctx.strokeStyle = color;
                            ctx.lineWidth = Math.max(0.5, thickness);
                            ctx.lineCap = 'round';
                            ctx.stroke();

                            // Draw segment Hit -> B (if enabled)
                            if (module.lineShowAfterHit !== false) { // Default to true
                                ctx.beginPath();
                                ctx.moveTo(hitX, hitY);
                                ctx.lineTo(sxB, syB);
                                ctx.strokeStyle = module.lineHitColor || '#ef4444'; // Default hit color
                                ctx.lineWidth = Math.max(0.5, thickness);
                                ctx.lineCap = 'round';
                                ctx.stroke();
                            }
                        } else {
                            // No Hit, draw full line
                            ctx.beginPath();
                            ctx.moveTo(sxA, syA);
                            ctx.lineTo(sxB, syB);
                            ctx.strokeStyle = color;
                            ctx.lineWidth = Math.max(0.5, thickness);
                            ctx.lineCap = 'round';
                            ctx.stroke();
                        }

                        ctx.restore();
                    }
                }
            });



            animationFrameRef.current = requestAnimationFrame(renderLoop);
        };

        animationFrameRef.current = requestAnimationFrame(renderLoop);
        return () => {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        };
    }, []); // Empty deps for RAF loop

    const getClickedBodyId = (mouseX: number, mouseY: number) => {
        const { width, height, offset, scale } = propsRef.current;
        const bodies = bodiesRef.current;
        const cx = width / 2 + offset.x;
        const cy = height / 2 + offset.y;

        for (let i = bodies.length - 1; i >= 0; i--) {
            const b = bodies[i];
            const bx = cx + b.position.x * scale;
            const by = cy + b.position.y * scale;
            const r = Math.max(15, b.radius * scale);
            const dx = mouseX - bx;
            const dy = mouseY - by;
            if (dx * dx + dy * dy <= r * r) {
                return b.id;
            }
        }
        return null;
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.target !== canvasRef.current) return;

        setIsClick(true);
        setIsDragging(true);
        setLastMousePos({ x: e.clientX, y: e.clientY });

        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const clickedBodyId = getClickedBodyId(mouseX, mouseY);
        onSelectBody(clickedBodyId);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (e.target !== canvasRef.current) return;

        if (isDragging) {
            const dx = e.clientX - lastMousePos.x;
            const dy = e.clientY - lastMousePos.y;
            if (Math.abs(dx) > 2 || Math.abs(dy) > 2) setIsClick(false); // It's a drag, not a click
            onPan(dx, dy);
            setLastMousePos({ x: e.clientX, y: e.clientY });
        }
    };

    const handleMouseUp = (e: React.MouseEvent) => {
        if (e.target !== canvasRef.current) {
            setIsDragging(false);
            setIsClick(false);
            return;
        }

        setIsDragging(false);

        if (isClick) {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (rect) {
                onCanvasClick(e.clientX - rect.left, e.clientY - rect.top);
            }
        }
        // Reset click status after processing
        setIsClick(false);
    };

    const handleMouseLeave = () => {
        setIsDragging(false);
        setIsClick(false);
    };

    const handleWheel = (e: React.WheelEvent) => {
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
            onZoom(delta, e.clientX - rect.left, e.clientY - rect.top);
        } else {
            onZoom(delta);
        }
    };

    // --- TOUCH HANDLERS (Tactile Control) ---
    const handleTouchStart = (e: React.TouchEvent) => {
        if (e.target !== canvasRef.current) return;

        // Single Touch (Click or Pan)
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            const rect = canvasRef.current?.getBoundingClientRect();
            if (rect) {
                const id = getClickedBodyId(touch.clientX - rect.left, touch.clientY - rect.top);
                onSelectBody(id);

                touchRef.current = {
                    lastX: touch.clientX,
                    lastY: touch.clientY,
                    lastDist: 0,
                    mode: 'drag'
                };
                setIsClick(true);
            }
        }
        // Multi Touch (Pinch Zoom)
        else if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            touchRef.current = {
                lastX: 0,
                lastY: 0,
                lastDist: dist,
                mode: 'zoom'
            };
            setIsClick(false);
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (e.target !== canvasRef.current) return;

        // Prevent default scrolling behavior (crucial for zooming)
        // Note: 'touch-none' css class is also important

        if (touchRef.current.mode === 'drag' && e.touches.length === 1) {
            const x = e.touches[0].clientX;
            const y = e.touches[0].clientY;
            const dx = x - touchRef.current.lastX;
            const dy = y - touchRef.current.lastY;

            if (Math.abs(dx) > 2 || Math.abs(dy) > 2) setIsClick(false);

            onPan(dx, dy);
            touchRef.current.lastX = x;
            touchRef.current.lastY = y;
        }
        else if (touchRef.current.mode === 'zoom' && e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (touchRef.current.lastDist > 0) {
                const delta = dist / touchRef.current.lastDist;
                // Center point for zoom
                const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;

                const rect = canvasRef.current?.getBoundingClientRect();
                if (rect) {
                    onZoom(delta, cx - rect.left, cy - rect.top);
                }
            }
            touchRef.current.lastDist = dist;
        }
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        // Handle click if it was a tap (single touch released without moving)
        if (touchRef.current.mode === 'drag' && isClick && e.changedTouches.length > 0 && e.touches.length === 0) {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (rect) {
                onCanvasClick(e.changedTouches[0].clientX - rect.left, e.changedTouches[0].clientY - rect.top);
            }
        }

        // Reset mode if no fingers left
        if (e.touches.length === 0) {
            touchRef.current.mode = 'none';
            setIsClick(false);
        }
        // If switching from 2 to 1 finger, re-init drag to prevent jumping
        else if (e.touches.length === 1) {
            const touch = e.touches[0];
            touchRef.current.mode = 'drag';
            touchRef.current.lastX = touch.clientX;
            touchRef.current.lastY = touch.clientY;
        }
    };

    return (
        <canvas
            ref={canvasRef}
            width={width}
            height={height}
            className={`block touch-none ${isCreationMode || (isRocketMode && isRocketSpawning) ? 'cursor-crosshair' : 'cursor-move'}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        />
    );
};

export default Canvas;
