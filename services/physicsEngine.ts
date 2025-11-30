

import { Body, Vector2D, Particle, PhysicsResult, SASMode, SystemEvent } from '../types';

// Reduced softening for better accuracy at close range (allows tighter slingshots)
const SOFTENING = 0.15; 
// Velocity threshold for a safe landing (relative velocity magnitude)
const LANDING_MAX_VELOCITY = 3.5;
// Fuel consumption factor (Fuel units per Thrust Unit per Second)
// Tuned for mass ~0.001 rocket. Lower = fuel lasts longer.
const FUEL_CONSUMPTION_RATE = 100; 
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
    const count = Math.min(300, Math.floor(intensity * 100)); // Increased multiplier from 10 to 100, cap at 5000
    
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 10 + 5;
        particles.push({
            id: `p_${Date.now()}_${i}`,
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 2.0,
            decay: 0.01 + Math.random() * 0.01,
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
): { deltaV: number; angle: number; duration?: number } | null => {
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
        // PRECISE HOHMANN TRANSFER LOGIC
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
        // Use Semi-Major Axis of target to handle eccentricity better
        const targetEnergy = (vTargetCurr*vTargetCurr)/2 - mu/rTargetCurr;
        if (targetEnergy >= 0) return null; // Hyperbolic/Parabolic target orbit not supported
        const r2 = -mu / (2 * targetEnergy); 

        // 4. Hohmann Transfer Calculation
        const transferEnergy = -mu / (r1 + r2);
        const vNeeded = Math.sqrt(2 * (transferEnergy + mu/r1));
        const deltaVMag = vNeeded - v1;

        // 5. Direction (Prograde or Retrograde)
        const progradeAngle = Math.atan2(rVel.y, rVel.x);
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
  const TARGET_DT = 0.008;
  const numSteps = Math.ceil(Math.abs(totalDt) / TARGET_DT);
  const steps = Math.min(numSteps, 100); 
  const dt = totalDt / steps;

  let currentBodies = bodies;
  let allNewParticles: Particle[] = [];
  let systemEvents: SystemEvent[] = [];

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
                          // Store reference body for SAS if provided
                          if (m.parentBodyId) {
                              updatedBody.orbitReferenceId = m.parentBodyId;
                          }
                          m.status = 'completed';
                          m.progress = 1;
                      }
                      else if (m.type === 'change_simulation_speed') {
                          systemEvents.push({
                              type: 'set_speed',
                              value: Number(m.param) || 1.0
                          });
                          m.status = 'completed';
                          m.progress = 1;
                      }
                      else if (m.type.startsWith('auto_')) {
                          const target = currentBodies.find(b => b.id === m.targetBodyId);
                          // Use explicitly recorded parent or fallback to current parent
                          const refParentId = m.parentBodyId || (parent ? parent.id : undefined);
                          
                          if (target) {
                                // CONTINUOUS CONTROL FOR CIRCULARIZE (Closed Loop)
                                if (m.type === 'auto_circularize') {
                                    const res = calculateOrbitalManeuver(updatedBody, target, 'auto_circularize', gConst, currentBodies, refParentId);
                                    
                                    // Use a tight tolerance for "perfect" circularization
                                    if (res && res.deltaV > 0.05) { 
                                        let thrustMag = MAX_ROCKET_THRUST;
                                        
                                        // Proportional control for final approach to prevent overshoot/oscillation
                                        // If deltaV is small, scale down thrust
                                        if (res.deltaV < 0.5) {
                                            thrustMag = MAX_ROCKET_THRUST * (res.deltaV / 0.5);
                                        }

                                        updatedBody.thrust = {
                                            x: Math.cos(res.angle) * thrustMag,
                                            y: Math.sin(res.angle) * thrustMag
                                        };
                                        
                                        // Store initial DeltaV for progress bar
                                        if (!(m as any).initialDeltaV) {
                                            (m as any).initialDeltaV = res.deltaV;
                                        }
                                        const initialDV = (m as any).initialDeltaV || res.deltaV;
                                        if (initialDV > 0) {
                                            m.progress = Math.max(0, Math.min(1, 1 - (res.deltaV / initialDV)));
                                        }
                                    } else {
                                        // Target reached
                                        m.status = 'completed';
                                        m.progress = 1;
                                        updatedBody.thrust = { x: 0, y: 0 };
                                    }
                                } 
                                // ONE-SHOT BURN CALCULATION FOR OTHERS (Transfer, Land)
                                else {
                                    const res = calculateOrbitalManeuver(updatedBody, target, m.type as any, gConst, currentBodies, refParentId);
                                    if (res) {
                                        // PRECISE BURN CALCULATION
                                        // Use a fixed thrust that is high enough to be precise but low enough to be stable
                                        // Or use max thrust.
                                        let thrust = MAX_ROCKET_THRUST; 
                                        
                                        // Calculate burn duration
                                        // Since fuel is weightless, Mass is CONSTANT.
                                        // F = ma => a = F/m
                                        // dv = a * t => t = dv / a = dv / (F/m) = (dv * m) / F
                                        
                                        const mass = updatedBody.mass;
                                        const duration = (mass * res.deltaV) / thrust;
                                        
                                        // Store the absolute burn angle (not relative to heading)
                                        m.type = 'burn';
                                        m.thrust = thrust;
                                        m.duration = duration;
                                        m.angleOffset = res.angle; // Store absolute angle
                                        m.param = 'absolute'; // Flag to indicate this is an absolute angle, not offset
                                        m.progress = 0;
                                        // NEW: Store target deltaV for accurate tracking
                                        m.targetDeltaV = res.deltaV;
                                        m.appliedDeltaV = 0;
                                    } else {
                                        m.status = 'completed';
                                    }
                                }
                          } else {
                              m.status = 'completed';
                          }
                      }
                      // Handle wait_for_transfer
                      else if (m.type === 'wait_for_transfer') {
                          const target = currentBodies.find(b => b.id === m.targetBodyId);
                          let refParent = currentBodies.find(b => b.id === m.parentBodyId);
                          
                          if (!refParent && target) {
                              // Auto-detect parent (most massive body)
                              refParent = currentBodies.filter(b => !b.isRocket && b.id !== target.id).sort((a,b) => b.mass - a.mass)[0];
                          }
                          
                          if (target && refParent) {
                              // Calculate current phase angle
                              const rPos = { x: updatedBody.position.x - refParent.position.x, y: updatedBody.position.y - refParent.position.y };
                              const tPos = { x: target.position.x - refParent.position.x, y: target.position.y - refParent.position.y };
                              
                              const angle1 = Math.atan2(rPos.y, rPos.x);
                              const angle2 = Math.atan2(tPos.y, tPos.x);
                              
                              let currentPhase = angle2 - angle1;
                              while (currentPhase > Math.PI) currentPhase -= 2 * Math.PI;
                              while (currentPhase < -Math.PI) currentPhase += 2 * Math.PI;
                              
                              // Calculate required phase angle for Hohmann transfer
                              const r1 = Math.sqrt(rPos.x*rPos.x + rPos.y*rPos.y);
                              const r2 = Math.sqrt(tPos.x*tPos.x + tPos.y*tPos.y);
                              const mu = gConst * refParent.mass;
                              
                              const a_transfer = (r1 + r2) / 2;
                              const t_transfer = Math.PI * Math.sqrt(Math.pow(a_transfer, 3) / mu);
                              const omega_target = Math.sqrt(mu / Math.pow(r2, 3));
                              const angle_change = omega_target * t_transfer;
                              
                              let requiredPhase = Math.PI - angle_change;
                              while (requiredPhase > Math.PI) requiredPhase -= 2 * Math.PI;
                              while (requiredPhase < -Math.PI) requiredPhase += 2 * Math.PI;
                              
                              // Check if within error margin
                              // Use a very tight margin for precision
                              const errorMargin = 0.5 * Math.PI / 180; // 0.5 degrees
                              let diff = Math.abs(currentPhase - requiredPhase);
                              if (diff > Math.PI) diff = 2 * Math.PI - diff;
                              
                              if (diff < errorMargin) {
                                  m.status = 'completed';
                                  m.progress = 1;
                              }
                          } else {
                              m.status = 'completed';
                          }
                      }
                      // Handle wait_for_altitude
                      else if (m.type === 'wait_for_altitude') {
                          let refParent = currentBodies.find(b => b.id === m.parentBodyId);
                          
                          if (!refParent) {
                              // Auto-detect parent (most massive body)
                              refParent = currentBodies.filter(b => !b.isRocket).sort((a,b) => b.mass - a.mass)[0];
                          }
                          
                          if (refParent) {
                              const dx = updatedBody.position.x - refParent.position.x;
                              const dy = updatedBody.position.y - refParent.position.y;
                              const distance = Math.sqrt(dx*dx + dy*dy);
                              const altitude = distance - refParent.radius; // Altitude above surface
                              
                              // Parse param: "altitude:direction" or just altitude for backward compatibility
                              let targetAltitude = 100;
                              let direction: 'ascending' | 'descending' = 'ascending';
                              
                              if (typeof m.param === 'string' && m.param.includes(':')) {
                                  const parts = m.param.split(':');
                                  targetAltitude = Number(parts[0]) || 100;
                                  direction = parts[1] as 'ascending' | 'descending';
                              } else {
                                  targetAltitude = Number(m.param) || 100;
                              }
                              
                              // Store previous altitude to detect direction of change
                              if (m.progress === 0 && !m.startTime) {
                                  m.startTime = Date.now();
                                  (m as any).previousAltitude = altitude;
                              }
                              
                              const previousAltitude = (m as any).previousAltitude || altitude;
                              const isAscending = altitude > previousAltitude;
                              const isDescending = altitude < previousAltitude;
                              
                              // Check if we've reached the target altitude in the correct direction
                              if (direction === 'ascending') {
                                  // Wait for altitude to be rising and reach target
                                  if (altitude >= targetAltitude && (isAscending || previousAltitude < targetAltitude)) {
                                      m.status = 'completed';
                                      m.progress = 1;
                                  }
                              } else {
                                  // Wait for altitude to be falling and reach target
                                  if (altitude <= targetAltitude && (isDescending || previousAltitude > targetAltitude)) {
                                      m.status = 'completed';
                                      m.progress = 1;
                                  }
                              }
                              
                              // Update previous altitude for next frame
                              (m as any).previousAltitude = altitude;
                          } else {
                              m.status = 'completed';
                          }
                      }
                      // Handle burn_until_altitude
                      else if (m.type === 'burn_until_altitude') {
                          let refParent = currentBodies.find(b => b.id === m.parentBodyId);
                          
                          if (!refParent) {
                              // Auto-detect parent (most massive body)
                              refParent = currentBodies.filter(b => !b.isRocket).sort((a,b) => b.mass - a.mass)[0];
                          }
                          
                          if (refParent) {
                              const dx = updatedBody.position.x - refParent.position.x;
                              const dy = updatedBody.position.y - refParent.position.y;
                              const distance = Math.sqrt(dx*dx + dy*dy);
                              const altitude = distance - refParent.radius;
                              const targetAltitude = Number(m.param) || 100;
                              
                              if (altitude >= targetAltitude) {
                                  // Target reached, complete maneuver
                                  m.status = 'completed';
                                  m.progress = 1;
                                  updatedBody.thrust = { x: 0, y: 0 };
                              } else {
                                  // Continue burning in specified direction
                                  const heading = updatedBody.angle || 0;
                                  const thrustAngle = heading + (m.angleOffset || 0);
                                  const thrust = m.thrust || 0.005;
                                  
                                  updatedBody.thrust = {
                                      x: Math.cos(thrustAngle) * thrust,
                                      y: Math.sin(thrustAngle) * thrust
                                  };
                                  m.progress = altitude / targetAltitude; // Progress based on altitude
                              }
                          } else {
                              m.status = 'completed';
                          }
                      }

                      // Handle Time-Based (Burn/Wait)
                      if (m.status === 'active' && (m.type === 'burn' || m.type === 'wait')) {
                          if (m.type === 'burn') {
                              // Check if this burn uses accurate deltaV tracking
                              const useAccurateDV = m.targetDeltaV !== undefined && m.targetDeltaV > 0;
                              
                              // Store initial velocity if not already stored (first frame of burn)
                              if (useAccurateDV && !(m as any).initialVelocity) {
                                  (m as any).initialVelocity = { 
                                      x: updatedBody.velocity.x, 
                                      y: updatedBody.velocity.y 
                                  };
                              }
                              
                              // Check if this is an absolute angle (from auto-maneuvers) or relative offset
                              let thrustAngle;
                              if (m.param === 'absolute') {
                                  // Use the angle directly (it's already absolute)
                                  thrustAngle = m.angleOffset;
                              } else {
                                  // Traditional burn: angle is relative to rocket's heading/orientation
                                  const heading = updatedBody.angle || 0;
                                  thrustAngle = heading + m.angleOffset;
                              }
                              
                              // Check if we've achieved target deltaV (for accurate burns)
                              if (useAccurateDV && (m as any).initialVelocity) {
                                  const dvX = updatedBody.velocity.x - (m as any).initialVelocity.x;
                                  const dvY = updatedBody.velocity.y - (m as any).initialVelocity.y;
                                  const currentDV = Math.sqrt(dvX * dvX + dvY * dvY);
                                  m.appliedDeltaV = currentDV;
                                  
                                  // Complete if we've reached or exceeded target deltaV
                                  if (currentDV >= m.targetDeltaV) {
                                      m.progress = 1;
                                      m.status = 'completed';
                                      updatedBody.thrust = { x: 0, y: 0 };
                                  } else {
                                      // Continue burning - update progress based on deltaV
                                      m.progress = currentDV / m.targetDeltaV;
                                  }
                              }
                              
                              // Only apply thrust if not completed
                              if (m.status === 'active') {
                                  // TIME-STEP INDEPENDENT BURN LOGIC
                                  // Check how much time is remaining in the burn
                                  const remainingTime = m.duration * (1 - m.progress);
                                  
                                  // If remaining time is less than dt, we only burn for remainingTime
                                  const burnDt = Math.min(dt, remainingTime);
                                  
                                  if (burnDt > 0) {
                                      // Apply thrust for this partial step
                                      // We apply the force scaled by the fraction of the step we are burning
                                      // F_effective = F_actual * (burnDt / dt)
                                      const scale = burnDt / dt;
                                      
                                      updatedBody.thrust = {
                                          x: Math.cos(thrustAngle) * m.thrust * scale,
                                          y: Math.sin(thrustAngle) * m.thrust * scale
                                      };
                                  } else {
                                      updatedBody.thrust = { x: 0, y: 0 };
                                  }

                                  // For non-accurate burns, use time-based completion
                                  if (!useAccurateDV) {
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
                              }
                          } else {
                              // Wait maneuver
                              updatedBody.thrust = { x: 0, y: 0 };
                              if (m.duration > 0) {
                                  const progressInc = dt / m.duration;
                                  m.progress += progressInc;
                                  if (m.progress >= 1) {
                                      m.progress = 1;
                                      m.status = 'completed';
                                  }
                              } else {
                                  m.status = 'completed';
                              }
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
                      
                      // WEIGHTLESS FUEL: Do NOT update mass.
                      // Mass remains constant (Dry Mass + Fuel Mass is fixed, or just Dry Mass).
                      // This ensures constant acceleration for precise maneuvers.
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
                    landedOnBodyId: undefined,
                    landingAngle: undefined // Clear landing angle so it can be recalculated on next landing
                };
            }

            // Find parent to stick to
            const parent = currentBodies.find(b => b.id === body.landedOnBodyId);
            if (parent) {
                // Store the landing angle to maintain fixed position on surface
                // If not stored yet, calculate and store it
                if (body.landingAngle === undefined) {
                    const dx = body.position.x - parent.position.x;
                    const dy = body.position.y - parent.position.y;
                    body.landingAngle = Math.atan2(dy, dx);
                }
                
                const surfaceDist = parent.radius + body.radius;
                const newX = parent.position.x + Math.cos(body.landingAngle) * surfaceDist;
                const newY = parent.position.y + Math.sin(body.landingAngle) * surfaceDist;
                
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
            // Only add trail points 50% of the time to reduce memory
            if (Math.random() > 0.5) { 
                newTrail = [...body.trail, { x: newX, y: newY }];
                // Aggressive trail limiting - max 50 points per body
                const limit = trailLength || 150;;
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


                      const lightBody = currentBody.mass > otherBody.mass ? otherBody : currentBody;
                      const heavyBody = currentBody.mass > otherBody.mass ? currentBody : otherBody;

                      const pX = (currentBody.position.x * currentBody.mass + otherBody.position.x * otherBody.mass) / totalMass;
                      const pY = (currentBody.position.y * currentBody.mass + otherBody.position.y * otherBody.mass) / totalMass;

                      //collision point is at the intersection of the two circles
                      const collisionPointX = currentBody.position.x + (otherBody.position.x - currentBody.position.x) * (currentBody.radius / (currentBody.radius + otherBody.radius));
                      const collisionPointY = currentBody.position.y + (otherBody.position.y - currentBody.position.y) * (currentBody.radius / (currentBody.radius + otherBody.radius)); 


                      // Calculate intensity on the collision based on masses and speeds
                      const intensity = Math.sqrt(lightBody.mass) + Math.sqrt(heavyBody.mass) + Math.sqrt(lightBody.velocity.x*lightBody.velocity.x + lightBody.velocity.y*lightBody.velocity.y) + Math.sqrt(heavyBody.velocity.x*heavyBody.velocity.x + heavyBody.velocity.y*heavyBody.velocity.y);

                      // Create explosion particles
                      // For rockets, use minimum intensity to ensure visible explosion
                      const isRocketCollision = isRocketA || isRocketB;
                      let explosionIntensity = intensity;
                      if (isRocketCollision) {
                          explosionIntensity = Math.max(explosionIntensity, 1000); // Minimum intensity of 1000 for rockets (10,000 particles)
                      }
                      allNewParticles.push(...createExplosion(collisionPointX, collisionPointY, lightBody.color, explosionIntensity));


                      
                      currentBody = {
                          ...currentBody,
                          mass: totalMass,
                          radius: newRadius,
                          position: { x: pX, y: pY },
                          velocity: { x: vX, y: vY },
                          name: currentBody.mass > otherBody.mass ? currentBody.name : otherBody.name, 
                          description: `${currentBody.name} merged with ${otherBody.name}`,
                          trail: currentBody.mass > otherBody.mass ? currentBody.trail : otherBody.trail,
                          landedOnBodyId: undefined 
                          
                      };
                  }
              }
              survivedBodies.push(currentBody);
          }
          currentBodies = survivedBodies;
      }
  }

  return { bodies: currentBodies, newParticles: allNewParticles, systemEvents };
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

    // Limit points to prevent memory issues - max 10000 points per path
    const MAX_POINTS = 10000;
    const stride = Math.max(1, Math.ceil(steps / MAX_POINTS));

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

        // Only record points at stride intervals to limit memory
        if (k % stride === 0) {
            paths.forEach(path => {
                const body = simBodies.find(sb => sb.id === path.id);
                if (body && path.points.length < MAX_POINTS) {
                    path.points.push({ x: body.position.x, y: body.position.y });
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