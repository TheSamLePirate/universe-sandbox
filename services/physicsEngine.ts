

import { Body, Vector2D, Particle, PhysicsResult, SASMode } from '../types';

// Reduced softening for better accuracy at close range (allows tighter slingshots)
const SOFTENING = 0.15; 
// Velocity threshold for a safe landing (relative velocity magnitude)
const LANDING_MAX_VELOCITY = 3.5;
// Fuel consumption factor (Fuel units per Thrust Unit per Second)
// Tuned for mass ~0.001 rocket. Lower = fuel lasts longer.
const FUEL_CONSUMPTION_RATE = 0.5; 
// Max thrust clamp for autopilot to prevent physics breaking
const MAX_ROCKET_THRUST = 0.01;

export const calculateForces = (bodies: Body[], gConst: number): Vector2D[] => {
  const forces: Vector2D[] = bodies.map(() => ({ x: 0, y: 0 }));

  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const bodyA = bodies[i];
      const bodyB = bodies[j];

      const dx = bodyB.position.x - bodyA.position.x;
      const dy = bodyB.position.y - bodyA.position.y;
      const distSq = dx * dx + dy * dy;
      const dist = Math.sqrt(distSq);

      // Newton's Law of Universal Gravitation
      const f = (gConst * bodyA.mass * bodyB.mass) / (distSq * dist + SOFTENING);

      const fx = f * dx;
      const fy = f * dy;

      forces[i].x += fx;
      forces[i].y += fy;
      forces[j].x -= fx;
      forces[j].y -= fy;
    }
  }

  return forces;
};

const createExplosion = (x: number, y: number, color: string, intensity: number): Particle[] => {
    const particles: Particle[] = [];
    const count = Math.min(50, Math.floor(intensity * 10)); // Cap particles for performance
    
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 2 + 0.5;
        particles.push({
            id: `p_${Date.now()}_${i}`,
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1.0,
            decay: 0.01 + Math.random() * 0.03,
            color: color,
            size: Math.random() * 2 + 1
        });
    }
    return particles;
};

// --- ORBITAL MANEUVER MATH ---
const normalize = (v: Vector2D) => {
    const m = Math.sqrt(v.x*v.x + v.y*v.y);
    return m === 0 ? {x:0, y:0} : {x: v.x/m, y: v.y/m};
};

export const calculateOrbitalManeuver = (
    rocket: Body,
    target: Body,
    type: 'auto_circularize' | 'auto_land' | 'auto_transfer',
    gConst: number,
    bodies: Body[],
    parentId?: string
): { deltaV: number; angle: number } | null => {
    if (!rocket || !target) return null;

    // Relative Position/Velocity
    const relPos = { x: rocket.position.x - target.position.x, y: rocket.position.y - target.position.y };
    const relVel = { x: rocket.velocity.x - target.velocity.x, y: rocket.velocity.y - target.velocity.y };
    const r = Math.sqrt(relPos.x*relPos.x + relPos.y*relPos.y);

    if (type === 'auto_circularize') {
        const mu = gConst * target.mass;
        const v_circ_mag = Math.sqrt(mu / r);
        // Desired velocity vector direction (tangent)
        const t1 = normalize({ x: -relPos.y, y: relPos.x });
        const t2 = normalize({ x: relPos.y, y: -relPos.x });
        // Choose tangent closest to current velocity direction
        const dot1 = t1.x * relVel.x + t1.y * relVel.y;
        const desiredDir = dot1 > 0 ? t1 : t2;
        
        const desiredVel = { x: desiredDir.x * v_circ_mag, y: desiredDir.y * v_circ_mag };
        const deltaVVec = { x: desiredVel.x - relVel.x, y: desiredVel.y - relVel.y };
        
        return {
            deltaV: Math.sqrt(deltaVVec.x*deltaVVec.x + deltaVVec.y*deltaVVec.y),
            angle: Math.atan2(deltaVVec.y, deltaVVec.x)
        };
    } else if (type === 'auto_land') {
        // Kill Relative Velocity
        const dvMag = Math.sqrt(relVel.x*relVel.x + relVel.y*relVel.y);
        const dvAngle = Math.atan2(-relVel.y, -relVel.x);
        return { deltaV: dvMag, angle: dvAngle };
    } else if (type === 'auto_transfer') {
        // Hohmann Transfer Logic
        let parent = null;
        if (parentId) {
            parent = bodies.find(b => b.id === parentId);
        }

        if (!parent) {
            // Auto-detect parent
            let strongestG = 0;
            bodies.forEach(other => {
                if (other.id === rocket.id || other.isRocket || other.id === target.id) return;
                const dx = other.position.x - rocket.position.x;
                const dy = other.position.y - rocket.position.y;
                const distSq = dx*dx + dy*dy;
                const gForce = other.mass / distSq; 
                if (gForce > strongestG) {
                    strongestG = gForce;
                    parent = other;
                }
            });
        }
        
        if (!parent) return null;

        const mu = gConst * parent.mass;

        // 1. Calculate Rocket State relative to Parent
        const rPos = { x: rocket.position.x - parent.position.x, y: rocket.position.y - parent.position.y };
        const rVel = { x: rocket.velocity.x - parent.velocity.x, y: rocket.velocity.y - parent.velocity.y };
        const r1 = Math.sqrt(rPos.x*rPos.x + rPos.y*rPos.y);
        const v1 = Math.sqrt(rVel.x*rVel.x + rVel.y*rVel.y);

        // 2. Calculate Target State relative to Parent
        const tPos = { x: target.position.x - parent.position.x, y: target.position.y - parent.position.y };
        const tVel = { x: target.velocity.x - parent.velocity.x, y: target.velocity.y - parent.velocity.y };
        const rTargetCurr = Math.sqrt(tPos.x*tPos.x + tPos.y*tPos.y);
        const vTargetCurr = Math.sqrt(tVel.x*tVel.x + tVel.y*tVel.y);

        // 3. Determine r2 (Destination Radius)
        // Instead of using current distance, use Semi-Major Axis of target to handle eccentricity better
        const targetEnergy = (vTargetCurr*vTargetCurr)/2 - mu/rTargetCurr;
        
        // Safety check if target is parabolic/hyperbolic relative to parent (shouldn't happen for stable planets)
        if (targetEnergy >= 0) return null;

        const r2 = -mu / (2 * targetEnergy); // Semi-major axis of target

        // 4. Hohmann Transfer Calculation
        // Energy of transfer orbit
        const transferEnergy = -mu / (r1 + r2);
        // Velocity needed at r1 (Vis-Viva Equation)
        const vNeeded = Math.sqrt(2 * (transferEnergy + mu/r1));

        // 5. Delta V
        const deltaVMag = vNeeded - v1;

        // 6. Direction (Prograde or Retrograde)
        // Prograde angle is the direction of current velocity
        const progradeAngle = Math.atan2(rVel.y, rVel.x);
        
        // If deltaV is positive, we speed up (Prograde). 
        // If negative, we slow down (Retrograde, which is Prograde + PI).
        const burnAngle = progradeAngle + (deltaVMag < 0 ? Math.PI : 0);

        return {
            deltaV: Math.abs(deltaVMag),
            angle: burnAngle
        };
    }

    return null;
};

export const updatePhysics = (
    bodies: Body[], 
    totalDt: number, 
    gConst: number, 
    trailLength: number,
    enableCollisions: boolean
): PhysicsResult => {
  
  // Adaptive Sub-stepping
  const TARGET_DT = 0.05;
  const numSteps = Math.ceil(Math.abs(totalDt) / TARGET_DT);
  const steps = Math.min(numSteps, 100); 
  const dt = totalDt / steps;

  let currentBodies = bodies;
  let allNewParticles: Particle[] = [];

  for (let s = 0; s < steps; s++) {
      // 1. Calculate Forces (Gravity)
      const forces = calculateForces(currentBodies, gConst);

      // 2. Flight Computer & Thrust
      currentBodies = currentBodies.map((body, idx) => {
          let updatedBody = { ...body };

          // --- ROCKET LOGIC ---
          if (updatedBody.isRocket) {
              
              // A. Identify Parent Body (for SAS / Navigation)
              let parent: Body | null = null;
              
              // 1. Prefer explicit user selection
              if (updatedBody.orbitReferenceId) {
                  parent = currentBodies.find(b => b.id === updatedBody.orbitReferenceId) || null;
              }
              
              // 2. Fallback to strongest gravity
              if (!parent) {
                  let strongestG = 0;
                  currentBodies.forEach(other => {
                      if (other.id === updatedBody.id || other.isRocket) return;
                      const dx = other.position.x - updatedBody.position.x;
                      const dy = other.position.y - updatedBody.position.y;
                      const distSq = dx*dx + dy*dy;
                      const gForce = other.mass / distSq; 
                      if (gForce > strongestG) {
                          strongestG = gForce;
                          parent = other;
                      }
                  });
              }

              // B. SAS Autopilot
              if (updatedBody.sasMode && updatedBody.sasMode !== 'off' && parent) {
                  const relVx = updatedBody.velocity.x - parent.velocity.x;
                  const relVy = updatedBody.velocity.y - parent.velocity.y;
                  const relX = updatedBody.position.x - parent.position.x;
                  const relY = updatedBody.position.y - parent.position.y;
                  
                  let targetAngle = updatedBody.angle || 0;

                  if (updatedBody.sasMode === 'prograde') {
                      targetAngle = Math.atan2(relVy, relVx);
                  } else if (updatedBody.sasMode === 'retrograde') {
                      targetAngle = Math.atan2(relVy, relVx) + Math.PI;
                  } else if (updatedBody.sasMode === 'radial_out') {
                      targetAngle = Math.atan2(relY, relX);
                  } else if (updatedBody.sasMode === 'radial_in') {
                      targetAngle = Math.atan2(relY, relX) + Math.PI;
                  }
                  updatedBody.angle = targetAngle;
              }

              // C. Process Maneuvers
              if (updatedBody.maneuvers && updatedBody.maneuvers.length > 0) {
                  // Find first 'active' maneuver. 
                  const activeIdx = updatedBody.maneuvers.findIndex(m => m.status === 'active');
                  
                  if (activeIdx !== -1) {
                      let m = { ...updatedBody.maneuvers[activeIdx] };
                      
                      // Handle Instant Starts
                      if (m.type === 'rotate') {
                          updatedBody.angle = (updatedBody.angle || 0) + ((m.param as number) * Math.PI / 180);
                          m.status = 'completed';
                          m.progress = 1;
                      } 
                      else if (m.type === 'sas') {
                          updatedBody.sasMode = m.param as any;
                          m.status = 'completed';
                          m.progress = 1;
                      }
                      else if (m.type.startsWith('auto_')) {
                          const target = currentBodies.find(b => b.id === m.targetBodyId);
                          // Use explicitly recorded parent or fallback to current parent
                          const refParentId = m.parentBodyId || (parent ? parent.id : undefined);
                          
                          if (target) {
                                const res = calculateOrbitalManeuver(updatedBody, target, m.type as any, gConst, currentBodies, refParentId);
                                if (res) {
                                    // Mass Change Correction: Estimate avg mass during burn for better duration accuracy
                                    const estimatedBurnMass = updatedBody.mass * 0.98; // Adjusted down for safety
                                    
                                    // CLAMP thrust to prevent physics instability
                                    let thrust = (estimatedBurnMass * res.deltaV) / (res.deltaV > 1 ? 0.05 : 0.02); // Initial guess
                                    
                                    if (thrust > MAX_ROCKET_THRUST) {
                                        thrust = MAX_ROCKET_THRUST;
                                        // Recalculate needed duration for this thrust
                                        // F * t = m * dv  => t = (m*dv)/F
                                        var calcDuration = (estimatedBurnMass * res.deltaV) / thrust;
                                    } else {
                                        var calcDuration = (estimatedBurnMass * res.deltaV) / thrust;
                                    }
                                    
                                    let currentHeading = updatedBody.angle || 0;
                                    let angleOffset = res.angle - currentHeading;
                                    while (angleOffset > Math.PI) angleOffset -= 2*Math.PI;
                                    while (angleOffset < -Math.PI) angleOffset += 2*Math.PI;
                                    
                                    m.type = 'burn';
                                    m.thrust = thrust;
                                    m.duration = calcDuration;
                                    m.angleOffset = angleOffset;
                                    // Don't complete yet, it is now a burn
                                } else {
                                    m.status = 'completed';
                                }
                          } else {
                              m.status = 'completed';
                          }
                      }

                      // Handle Time-Based (Burn/Wait)
                      if (m.status === 'active' && (m.type === 'burn' || m.type === 'wait')) {
                          if (m.type === 'burn') {
                              const heading = updatedBody.angle || 0;
                              const thrustAngle = heading + m.angleOffset;
                              updatedBody.thrust = {
                                  x: Math.cos(thrustAngle) * m.thrust,
                                  y: Math.sin(thrustAngle) * m.thrust
                              };
                          } else {
                              updatedBody.thrust = { x: 0, y: 0 };
                          }

                          if (m.duration > 0) {
                              const progressInc = dt / m.duration;
                              m.progress += progressInc;
                              if (m.progress >= 1) {
                                  m.progress = 1;
                                  m.status = 'completed';
                                  updatedBody.thrust = { x: 0, y: 0 };
                              }
                          } else {
                              m.status = 'completed';
                          }
                      }

                      // Save updated maneuver
                      const newManeuvers = [...updatedBody.maneuvers];
                      newManeuvers[activeIdx] = m;
                      updatedBody.maneuvers = newManeuvers;
                  }
              }
          }

          if (updatedBody.thrust && (Math.abs(updatedBody.thrust.x) > 0 || Math.abs(updatedBody.thrust.y) > 0)) {
              // Check Fuel
              if (updatedBody.isRocket && updatedBody.fuel !== undefined && updatedBody.fuel <= 0) {
                  // Out of fuel
                  updatedBody.thrust = { x: 0, y: 0 };
                  updatedBody.fuel = 0;
              } else {
                  // Apply Thrust Force
                  forces[idx].x += updatedBody.thrust.x;
                  forces[idx].y += updatedBody.thrust.y;

                  // Consume Fuel
                  if (updatedBody.isRocket && updatedBody.fuel !== undefined) {
                      const thrustMag = Math.sqrt(updatedBody.thrust.x**2 + updatedBody.thrust.y**2);
                      const consumed = thrustMag * FUEL_CONSUMPTION_RATE * dt;
                      updatedBody.fuel = Math.max(0, updatedBody.fuel - consumed);
                      
                      // Update Mass (Mass = DryMass + FuelMass)
                      if (updatedBody.dryMass) {
                          const fuelMassRatio = 0.5; // Fuel is heavy
                          const currentFuelMass = (updatedBody.fuel / (updatedBody.maxFuel || 100)) * (updatedBody.dryMass * fuelMassRatio);
                          updatedBody.mass = updatedBody.dryMass + currentFuelMass;
                      }
                  }
              }
          }
          return updatedBody;
      });

      // 3. Move Bodies
      const movedBodies = currentBodies.map((body, index) => {
        // --- LANDED ROCKET LOGIC ---
        if (body.landedOnBodyId) {
            // Check if we are applying thrust to takeoff
            const isThrusting = body.thrust && (Math.abs(body.thrust.x) > 0.001 || Math.abs(body.thrust.y) > 0.001);
            
            if (isThrusting) {
                return {
                    ...body,
                    landedOnBodyId: undefined
                };
            }

            // Find parent to stick to
            const parent = currentBodies.find(b => b.id === body.landedOnBodyId);
            if (parent) {
                const dx = body.position.x - parent.position.x;
                const dy = body.position.y - parent.position.y;
                const currentAngle = Math.atan2(dy, dx);
                const surfaceDist = parent.radius + body.radius; 
                
                const newX = parent.position.x + Math.cos(currentAngle) * surfaceDist;
                const newY = parent.position.y + Math.sin(currentAngle) * surfaceDist;
                
                return {
                    ...body,
                    position: { x: newX, y: newY },
                    velocity: { ...parent.velocity }, 
                    trail: [] 
                };
            } else {
                return { ...body, landedOnBodyId: undefined };
            }
        }

        // --- STANDARD PHYSICS ---
        const ax = forces[index].x / body.mass;
        const ay = forces[index].y / body.mass;

        const newVx = body.velocity.x + ax * dt;
        const newVy = body.velocity.y + ay * dt;

        const newX = body.position.x + newVx * dt;
        const newY = body.position.y + newVy * dt;

        let newTrail = body.trail;
        if (s === steps - 1) {
            if (Math.random() > 0.5) { 
                newTrail = [...body.trail, { x: newX, y: newY }];
                const limit = trailLength || 150;
                if (newTrail.length > limit) {
                    newTrail = newTrail.slice(-limit);
                }
            }
        }

        return {
          ...body,
          velocity: { x: newVx, y: newVy },
          position: { x: newX, y: newY },
          trail: newTrail,
        };
      });

      // 4. Resolve Collisions
      if (!enableCollisions) {
          currentBodies = movedBodies;
      } else {
          const survivedBodies: Body[] = [];
          const mergedIndices = new Set<number>();

          for (let i = 0; i < movedBodies.length; i++) {
              if (mergedIndices.has(i)) continue;

              let currentBody = { ...movedBodies[i] };
              
              for (let j = i + 1; j < movedBodies.length; j++) {
                  if (mergedIndices.has(j)) continue;

                  const otherBody = movedBodies[j];
                  const dx = currentBody.position.x - otherBody.position.x;
                  const dy = currentBody.position.y - otherBody.position.y;
                  const dist = Math.sqrt(dx * dx + dy * dy);
                  const minDist = (currentBody.radius + otherBody.radius) * 0.9; 

                  if (dist < minDist) {
                      // COLLISION
                      const isRocketA = !!currentBody.isRocket;
                      const isRocketB = !!otherBody.isRocket;
                      
                      if (isRocketA !== isRocketB) {
                          const rocket = isRocketA ? currentBody : otherBody;
                          const planet = isRocketA ? otherBody : currentBody;
                          
                          const dvx = rocket.velocity.x - planet.velocity.x;
                          const dvy = rocket.velocity.y - planet.velocity.y;
                          const relVel = Math.sqrt(dvx*dvx + dvy*dvy);

                          if (relVel < LANDING_MAX_VELOCITY) {
                              if (isRocketA) {
                                  currentBody.landedOnBodyId = planet.id;
                                  currentBody.velocity = { ...planet.velocity };
                                  const landAngle = Math.atan2(currentBody.position.y - otherBody.position.y, currentBody.position.x - otherBody.position.x);
                                  currentBody.position = {
                                      x: otherBody.position.x + Math.cos(landAngle) * (otherBody.radius + currentBody.radius),
                                      y: otherBody.position.y + Math.sin(landAngle) * (otherBody.radius + currentBody.radius)
                                  };
                                  continue;
                              } else {
                                  movedBodies[j] = {
                                      ...otherBody,
                                      landedOnBodyId: currentBody.id,
                                      velocity: { ...currentBody.velocity },
                                      position: {
                                          x: currentBody.position.x - (dx/dist) * (currentBody.radius + otherBody.radius),
                                          y: currentBody.position.y - (dy/dist) * (currentBody.radius + otherBody.radius)
                                      }
                                  };
                                  continue; 
                              }
                          }
                      }
                      
                      mergedIndices.add(j);

                      const totalMass = currentBody.mass + otherBody.mass;
                      const vX = (currentBody.velocity.x * currentBody.mass + otherBody.velocity.x * otherBody.mass) / totalMass;
                      const vY = (currentBody.velocity.y * currentBody.mass + otherBody.velocity.y * otherBody.mass) / totalMass;

                      const newRadius = Math.cbrt(Math.pow(currentBody.radius, 3) + Math.pow(otherBody.radius, 3));

                      const pX = (currentBody.position.x * currentBody.mass + otherBody.position.x * otherBody.mass) / totalMass;
                      const pY = (currentBody.position.y * currentBody.mass + otherBody.position.y * otherBody.mass) / totalMass;

                      allNewParticles.push(...createExplosion(pX, pY, currentBody.mass > otherBody.mass ? otherBody.color : currentBody.color, Math.sqrt(otherBody.mass)));

                      currentBody = {
                          ...currentBody,
                          mass: totalMass,
                          radius: newRadius,
                          position: { x: pX, y: pY },
                          velocity: { x: vX, y: vY },
                          name: currentBody.mass > otherBody.mass ? currentBody.name : otherBody.name, 
                          description: `${currentBody.name} merged with ${otherBody.name}`,
                          trail: [],
                          landedOnBodyId: undefined 
                      };
                  }
              }
              survivedBodies.push(currentBody);
          }
          currentBodies = survivedBodies;
      }
  }

  return { bodies: currentBodies, newParticles: allNewParticles };
};

export const predictSystemTrajectories = (
    bodies: Body[],
    steps: number,
    dt: number,
    gConst: number,
    bodyIds?: string[] 
): { id: string, color: string, points: Vector2D[] }[] => {
    let simBodies = bodies.map(b => ({ ...b }));
    
    const paths = (bodyIds && bodyIds.length > 0 
        ? simBodies.filter(b => bodyIds.includes(b.id)) 
        : simBodies
    ).map(b => ({
        id: b.id,
        color: b.color,
        points: [] as Vector2D[]
    }));

    const stride = Math.max(1, Math.floor(steps / 500));

    for(let k=0; k<steps; k++) {
        const forces = calculateForces(simBodies, gConst);

        simBodies = simBodies.map((b, i) => {
            const ax = forces[i].x / b.mass;
            const ay = forces[i].y / b.mass;
            const newVx = b.velocity.x + ax * dt;
            const newVy = b.velocity.y + ay * dt;
            const newX = b.position.x + newVx * dt;
            const newY = b.position.y + newVy * dt;
            
            return {
                ...b,
                velocity: { x: newVx, y: newVy },
                position: { x: newX, y: newY }
            };
        });

        if (k % stride === 0) {
            paths.forEach(path => {
                const currentSimBody = simBodies.find(sb => sb.id === path.id);
                if (currentSimBody) {
                    path.points.push(currentSimBody.position);
                }
            });
        }
    }
    return paths;
};

export const predictPath = (
    currentBodies: Body[],
    candidate: Body,
    steps: number,
    dt: number,
    gConst: number
): Vector2D[] => {
    const all = [...currentBodies, candidate];
    const results = predictSystemTrajectories(all, steps, dt, gConst, [candidate.id]);
    const candidatePath = results.find(r => r.id === candidate.id);
    return candidatePath ? candidatePath.points : [];
};

export const calculateOrbitalPoints = (
    body: Body,
    parent: Body,
    gConst: number
): { periapsis: Vector2D; apoapsis: Vector2D | null } | null => {
    const mu = gConst * parent.mass;
    if (mu <= 0) return null;

    const rx = body.position.x - parent.position.x;
    const ry = body.position.y - parent.position.y;
    // Relative Velocity for accuracy
    const vx = body.velocity.x - parent.velocity.x;
    const vy = body.velocity.y - parent.velocity.y;

    const r = Math.sqrt(rx * rx + ry * ry);
    const vSq = vx * vx + vy * vy;

    const h = rx * vy - ry * vx;

    const ex = (vy * h) / mu - rx / r;
    const ey = (-vx * h) / mu - ry / r;
    const eccentricity = Math.sqrt(ex * ex + ey * ey);

    const epsilon = vSq / 2 - mu / r;

    const a = -mu / (2 * epsilon);

    const rPe = a * (1 - eccentricity);
    
    const rAp = a * (1 + eccentricity);

    let eNormX = 0, eNormY = 0;
    if (eccentricity > 0.0001) {
        eNormX = ex / eccentricity;
        eNormY = ey / eccentricity;
    } else {
        return null;
    }

    const periapsis = {
        x: parent.position.x + eNormX * rPe,
        y: parent.position.y + eNormY * rPe
    };

    let apoapsis: Vector2D | null = null;
    if (eccentricity < 0.99 && epsilon < 0) {
        apoapsis = {
            x: parent.position.x - eNormX * rAp,
            y: parent.position.y - eNormY * rAp
        };
    }

    return { periapsis, apoapsis };
};

/**
 * Calculate points along an elliptical orbit for visualization
 * Returns an array of points that form the theoretical ellipse
 */
export const calculateEllipsePoints = (
    body: Body,
    parent: Body,
    gConst: number,
    numPoints: number = 64
): Vector2D[] | null => {
    const mu = gConst * parent.mass;
    if (mu <= 0) return null;

    const rx = body.position.x - parent.position.x;
    const ry = body.position.y - parent.position.y;
    const vx = body.velocity.x - parent.velocity.x;
    const vy = body.velocity.y - parent.velocity.y;

    const r = Math.sqrt(rx * rx + ry * ry);
    const vSq = vx * vx + vy * vy;

    const h = rx * vy - ry * vx;

    const ex = (vy * h) / mu - rx / r;
    const ey = (-vx * h) / mu - ry / r;
    const eccentricity = Math.sqrt(ex * ex + ey * ey);

    const epsilon = vSq / 2 - mu / r;

    // Only draw ellipse for bound orbits
    if (epsilon >= 0 || eccentricity >= 0.99) return null;

    const a = -mu / (2 * epsilon);
    const b = a * Math.sqrt(1 - eccentricity * eccentricity);

    // Eccentricity vector points from focus (parent) toward periapsis
    // Get the angle of the eccentricity vector (direction to periapsis)
    let eAngle = 0;
    if (eccentricity > 0.0001) {
        eAngle = Math.atan2(ey, ex);
    }

    // The parent body is at one focus of the ellipse
    // The center of the ellipse is offset from the parent by distance 'c' 
    // in the direction OPPOSITE to periapsis (away from eccentricity vector)
    const c = a * eccentricity;
    const centerX = parent.position.x - c * Math.cos(eAngle);
    const centerY = parent.position.y - c * Math.sin(eAngle);

    // Generate points along the ellipse
    const points: Vector2D[] = [];
    for (let i = 0; i <= numPoints; i++) {
        const theta = (i / numPoints) * 2 * Math.PI;
        
        // Point on ellipse in local coordinates (centered at origin)
        // theta = 0 corresponds to periapsis direction
        const localX = a * Math.cos(theta);
        const localY = b * Math.sin(theta);
        
        // Rotate by eccentricity angle (periapsis direction)
        const rotatedX = localX * Math.cos(eAngle) - localY * Math.sin(eAngle);
        const rotatedY = localX * Math.sin(eAngle) + localY * Math.cos(eAngle);
        
        // Translate to world coordinates
        points.push({
            x: centerX + rotatedX,
            y: centerY + rotatedY
        });
    }

    return points;
};