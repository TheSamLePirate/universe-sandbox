import { Body, Vector2D, FlightComputerModule, FlightComputerInput, RendezvousSolution } from '../types';

export interface OrbitInfo {
    altitude: number;
    periapsis: number;
    apoapsis: number;
    period: number;
    isBound: boolean;
    pePoint?: Vector2D; // Position of Periapsis in world space
    paPoint?: Vector2D; // Position of Apoapsis in world space
    eccentricity: number;
}

export const calculateOrbitInfo = (
    primary: Body | Vector2D,
    reference: Body,
    gravitationalConstant: number
): OrbitInfo | null => {
    if (!primary || !reference) return null;

    // Handle both Body and Vector2D inputs for primary
    const pPos = 'position' in primary ? primary.position : primary;
    const pVel = 'velocity' in primary ? primary.velocity : { x: 0, y: 0 };

    // Reference must be a Body (for mass/radius)
    const rPos = reference.position;
    const rVel = reference.velocity;

    const dx = pPos.x - rPos.x;
    const dy = pPos.y - rPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const dvx = pVel.x - rVel.x;
    const dvy = pVel.y - rVel.y;
    const vSq = dvx * dvx + dvy * dvy;

    const mu = gravitationalConstant * reference.mass;
    const E = (vSq / 2) - (mu / dist);
    const altitude = dist - reference.radius;

    let periapsis = -1;
    let apoapsis = -1;
    let period = 0;
    let pePoint: Vector2D | undefined;
    let paPoint: Vector2D | undefined;
    let eccentricity = -1;

    if (E < 0) {
        const a = -mu / (2 * E);

        // Angular momentum vector h = r x v
        // In 2D: h = x*vy - y*vx
        const h = (dx * dvy) - (dy * dvx);

        eccentricity = Math.sqrt(1 + (2 * E * h * h) / (mu * mu));
        periapsis = (a * (1 - eccentricity)) - reference.radius;
        apoapsis = (a * (1 + eccentricity)) - reference.radius;
        period = 2 * Math.PI * Math.sqrt(Math.pow(a, 3) / mu);

        // Calculate Pe/Pa positions
        // Argument of Periapsis calculation
        // Eccentricity vector e = (v x h)/mu - r/|r|
        // v x h in 2D: (vy*h, -vx*h) ? No, h is scalar in 2D (z-component)
        // Vector triple product v x (r x v) ...
        // Let's use the eccentricity vector formula directly:
        // e = ( (v^2 - mu/r)*r - (r.v)*v ) / mu

        const rvDot = dx * dvx + dy * dvy;
        const ex = ((vSq - mu / dist) * dx - rvDot * dvx) / mu;
        const ey = ((vSq - mu / dist) * dy - rvDot * dvy) / mu;
        const eMag = Math.sqrt(ex * ex + ey * ey);

        if (eMag > 0.0001) {
            // Periapsis is in direction of e
            const peDist = a * (1 - eccentricity);
            pePoint = {
                x: rPos.x + (ex / eMag) * peDist,
                y: rPos.y + (ey / eMag) * peDist
            };

            // Apoapsis is in opposite direction of e
            const paDist = a * (1 + eccentricity);
            paPoint = {
                x: rPos.x - (ex / eMag) * paDist,
                y: rPos.y - (ey / eMag) * paDist
            };
        }
    }

    return { altitude, periapsis, apoapsis, period, isBound: E < 0, pePoint, paPoint, eccentricity };
};

export const resolveInput = (
    input: FlightComputerInput | undefined,
    bodies: Body[],
    modules: FlightComputerModule[],
    gravitationalConstant: number,
    rendezvousSolutions?: Record<string, RendezvousSolution>
): Body | Vector2D | null => {

    if (!input) return null;

    if (input.type === 'body') {
        return bodies.find(b => b.id === input.value) || null;
    } else if (input.type === 'module_output') {
        const [moduleId, outputKey] = input.value.split(':');

        const module = modules.find(m => m.id === moduleId);
        if (!module) {
            return null;
        }

        // Recursively resolve module output
        // For now, let's handle specific module types we know about
        if (module.type === 'orbit_info') {
            // Resolve inputs for that module first
            let primaryInput = module.inputs?.primary;
            if (!primaryInput && module.primaryBodyId) primaryInput = { type: 'body', value: module.primaryBodyId };

            let referenceInput = module.inputs?.reference;
            if (!referenceInput && module.referenceBodyId) referenceInput = { type: 'body', value: module.referenceBodyId };

            const primary = resolveInput(primaryInput, bodies, modules, gravitationalConstant, rendezvousSolutions);
            const reference = resolveInput(referenceInput, bodies, modules, gravitationalConstant, rendezvousSolutions);

            if (outputKey === 'primary_body') {
                return primary;
            }
            if (outputKey === 'reference_body') {
                return reference && 'mass' in reference ? (reference as Body) : null;
            }

            if (primary && reference && 'mass' in reference) { // Reference must be a Body
                const info = calculateOrbitInfo(primary, reference as Body, gravitationalConstant);
                if (info) {
                    if (outputKey === 'pe_point') return info.pePoint || null;
                    if (outputKey === 'pa_point') return info.paPoint || null;
                }
            }
        } else if (module.type === 'transfer_window') {
            const primaryInput = module.inputs?.primary || (module.primaryBodyId ? { type: 'body', value: module.primaryBodyId } : undefined);
            const referenceInput = module.inputs?.reference || (module.referenceBodyId ? { type: 'body', value: module.referenceBodyId } : undefined);
            const targetInput = module.inputs?.target || (module.targetBodyId ? { type: 'body', value: module.targetBodyId } : undefined);

            const resolvedPrimary = primaryInput ? resolveInput(primaryInput, bodies, modules, gravitationalConstant, rendezvousSolutions) : null;
            const resolvedReference = referenceInput ? resolveInput(referenceInput, bodies, modules, gravitationalConstant, rendezvousSolutions) : null;
            const resolvedTarget = targetInput ? resolveInput(targetInput, bodies, modules, gravitationalConstant, rendezvousSolutions) : null;

            if (outputKey === 'primary_body') {
                return resolvedPrimary;
            }
            if (outputKey === 'reference_body') {
                return resolvedReference;
            }
            if (outputKey === 'target_body') {
                return resolvedTarget;
            }

            if (
                resolvedPrimary &&
                resolvedReference &&
                resolvedTarget &&
                'mass' in resolvedPrimary &&
                'mass' in resolvedReference &&
                'mass' in resolvedTarget
            ) {
                const transferData = calculateTransferInfo(
                    resolvedPrimary as Body,
                    resolvedReference as Body,
                    resolvedTarget as Body,
                    gravitationalConstant
                );

                if (outputKey === 'insertion_point') return transferData.insertionPoint;
                if (outputKey === 'intercept_point') return transferData.interceptPoint;
                if (outputKey === 'intercept_point_transfer') return transferData.interceptPointTransfer;
            }
        } else if (module.type === 'marker') {
            const positionInput = module.inputs?.position || module.inputs?.primary || (module.primaryBodyId ? { type: 'body', value: module.primaryBodyId } : undefined);
            if (outputKey === 'position' && positionInput) {
                return resolveInput(positionInput, bodies, modules, gravitationalConstant, rendezvousSolutions);
            }
        } else if (module.type === 'rendezvous_tracker') {
            const rendezvous = rendezvousSolutions?.[module.id];
            if (outputKey === 'primary_body') {
                const rocketInput = module.inputs?.primary || (module.primaryBodyId ? { type: 'body', value: module.primaryBodyId } : undefined);
                return resolveInput(rocketInput, bodies, modules, gravitationalConstant, rendezvousSolutions);
            }
            if (outputKey === 'target_body') {
                const targetInput = module.inputs?.target || (module.targetBodyId ? { type: 'body', value: module.targetBodyId } : undefined);
                return resolveInput(targetInput, bodies, modules, gravitationalConstant, rendezvousSolutions);
            }
            if (!rendezvous) return null;
            if (outputKey === 'position') return rendezvous.point;
        } else if ((module.type === 'track_distance' || module.type === 'track_velocity') && (outputKey === 'primary_body' || outputKey === 'target_body')) {
            const primaryInput = module.inputs?.primary || (module.primaryBodyId ? { type: 'body', value: module.primaryBodyId } : undefined);
            const targetInput = module.inputs?.target || (module.targetBodyId ? { type: 'body', value: module.targetBodyId } : undefined);

            if (outputKey === 'primary_body') {
                return resolveInput(primaryInput, bodies, modules, gravitationalConstant, rendezvousSolutions);
            }
            if (outputKey === 'target_body') {
                return resolveInput(targetInput, bodies, modules, gravitationalConstant, rendezvousSolutions);
            }
        } else if (module.type === 'selector' && outputKey === 'body') {
            const bodyId = module.selectorBodyId;
            if (!bodyId) return null;
            return bodies.find(b => b.id === bodyId) || null;
        } else if (module.type === 'body_by' && outputKey === 'body') {
            const mode = module.bodyByMode || 'id';

            // Try to resolve from input first, then fall back to direct value
            let value = '';
            if (module.inputs?.value) {
                const resolved = resolveStringInput(module.inputs.value, bodies, modules, gravitationalConstant, rendezvousSolutions);
                value = resolved || '';
            } else {
                value = module.bodyByValue || '';
            }

            if (!value) return null;

            if (mode === 'id') {
                return bodies.find(b => b.id === value) || null;
            } else {
                return bodies.find(b => b.name.toLowerCase() === value.toLowerCase()) || null;
            }
        } else if (module.type === 'custom_script' && outputKey === 'result') {
            const res = module.customScriptLastResult;
            // Return only if it looks like a body or vector
            if (res && typeof res === 'object' && 'x' in res && 'y' in res) {
                return res as Vector2D | Body;
            }
            return null;
        }
    }

    return null;
};



const normalizeAngleDeg = (d: number) => {
    d = ((d + 180) % 360 + 360) % 360 - 180; // [-180, 180)
    if (d === -180) d = 180; // optional: map -180 to +180
    return d;
};

type Vec2 = { x: number; y: number };

const TAU = 2 * Math.PI;

const normalizeAngleRad = (a: number) => {
    a = ((a + Math.PI) % TAU + TAU) % TAU - Math.PI; // [-π, π)
    if (a === -Math.PI) a = Math.PI;
    return a;
};

const sign = (v: number) => (v >= 0 ? 1 : -1);

const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
const scale = (v: Vec2, s: number): Vec2 => ({ x: v.x * s, y: v.y * s });
const fromPolar = (r: number, ang: number): Vec2 => ({ x: r * Math.cos(ang), y: r * Math.sin(ang) });
const angleOf = (v: Vec2) => Math.atan2(v.y, v.x);
const crossZ = (r: Vec2, v: Vec2) => r.x * v.y - r.y * v.x;

export const calculateTransferInfo = (
    primary: Body,
    reference: Body,
    target: Body,
    gravitationalConstant: number
) => {
    const rPos = sub(primary.position, reference.position);
    const tPos = sub(target.position, reference.position);

    const angle1 = angleOf(rPos);
    const angle2 = angleOf(tPos);

    const currentPhase = normalizeAngleRad(angle2 - angle1);

    const r1 = Math.hypot(rPos.x, rPos.y);
    const r2 = Math.hypot(tPos.x, tPos.y);
    const mu = gravitationalConstant * reference.mass;

    // directions (sign of angular momentum)
    const pVel = sub(primary.velocity, reference.velocity);
    const tVel = sub(target.velocity, reference.velocity);
    const dirP = sign(crossZ(rPos, pVel));
    const dirT = sign(crossZ(tPos, tVel));

    // Hohmann transfer
    const a_transfer = (r1 + r2) / 2;
    const t_transfer = Math.PI * Math.sqrt(Math.pow(a_transfer, 3) / mu);

    // mean motions (circular)
    const omega_primary = dirP * Math.sqrt(mu / Math.pow(r1, 3));
    const omega_target = dirT * Math.sqrt(mu / Math.pow(r2, 3));

    // required phase at burn time
    const angle_change = omega_target * t_transfer;
    const requiredPhase = normalizeAngleRad(Math.PI - angle_change);

    // signed smallest angle current -> required
    const errorAngle = normalizeAngleRad(requiredPhase - currentPhase);

    // ---- NEW: wait time until insertion (burn) ----
    const omega_rel = omega_target - omega_primary; // d/dt(angle2-angle1)
    const eps = 1e-12;

    let waitTime = 0;
    if (Math.abs(omega_rel) < eps) {
        // essentially locked phase; only "now" works (or never), keep 0
        waitTime = 0;
    } else {
        // solve: (currentPhase + omega_rel * t) == requiredPhase  (mod 2π)
        // => omega_rel * t == errorAngle (mod 2π)
        waitTime = errorAngle / omega_rel;

        const periodRel = TAU / Math.abs(omega_rel);
        while (waitTime < 0) waitTime += periodRel;
        // optional: pick earliest positive solution already satisfied by loop
    }

    // insertion angle (future primary angle at burn time)
    const insertionAngle = normalizeAngleRad(angle1 + omega_primary * waitTime);
    const insertionPointRel = fromPolar(r1, insertionAngle);
    const insertionPoint = add(reference.position, insertionPointRel);

    // arrival time
    const arrivalTime = waitTime + t_transfer;

    // interception point = target future position at arrival
    const interceptAngleTarget = normalizeAngleRad(angle2 + omega_target * arrivalTime);
    const interceptPointTargetRel = fromPolar(r2, interceptAngleTarget);
    const interceptPoint = add(reference.position, interceptPointTargetRel);

    // same point but predicted from transfer ellipse geometry (apoapsis)
    const interceptAngleTransfer = normalizeAngleRad(insertionAngle + dirT * Math.PI);
    const interceptPointTransfer = add(reference.position, fromPolar(r2, interceptAngleTransfer));
    const errorAngleDeg = normalizeAngleDeg((errorAngle * 180) / Math.PI);

    return {
        currentPhase,
        requiredPhase,
        errorAngle, // rad
        ready: Math.abs((errorAngle * 180) / Math.PI) < 5,
        error: errorAngleDeg,


        transferTime: t_transfer,
        waitTime,
        arrivalTime,

        insertionAngle,              // rad
        interceptAngleTarget,        // rad
        interceptAngleTransfer,      // rad

        insertionPoint,              // world coords
        interceptPoint,              // world coords (propagated target)
        interceptPointTransfer,      // world coords (transfer apoapsis)
    };
};

export const calculateDistance = (obj1: Body | Vector2D, obj2: Body | Vector2D): number => {
    const p1 = 'position' in obj1 ? obj1.position : obj1;
    const p2 = 'position' in obj2 ? obj2.position : obj2;

    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
};

export const calculateRelativeSpeed = (obj1: Body | Vector2D, obj2: Body | Vector2D): number => {
    const v1 = 'velocity' in obj1 ? obj1.velocity : { x: 0, y: 0 };
    const v2 = 'velocity' in obj2 ? obj2.velocity : { x: 0, y: 0 };

    // Relative velocity vector
    const rvx = v1.x - v2.x;
    const rvy = v1.y - v2.y;

    return Math.sqrt(rvx * rvx + rvy * rvy);
};

export const resolveScalarInput = (
    input: FlightComputerInput | undefined,
    bodies: Body[],
    modules: FlightComputerModule[],
    gravitationalConstant: number,
    rendezvousSolutions?: Record<string, RendezvousSolution>
): number | null => {
    if (!input) return null;

    if (input.type === 'module_output') {
        const [moduleId, outputKey] = input.value.split(':');
        const module = modules.find(m => m.id === moduleId);
        if (!module) return null;

        // Resolve based on module type
        if (module.type === 'track_distance') {
            const primaryInput = module.inputs?.primary || (module.primaryBodyId ? { type: 'body', value: module.primaryBodyId } : undefined);
            const targetInput = module.inputs?.target || (module.targetBodyId ? { type: 'body', value: module.targetBodyId } : undefined);

            const p1 = resolveInput(primaryInput, bodies, modules, gravitationalConstant, rendezvousSolutions);
            const p2 = resolveInput(targetInput, bodies, modules, gravitationalConstant, rendezvousSolutions);

            if (p1 && p2 && outputKey === 'distance') {
                return calculateDistance(p1, p2);
            }
        } else if (module.type === 'track_velocity') {
            const primaryInput = module.inputs?.primary || (module.primaryBodyId ? { type: 'body', value: module.primaryBodyId } : undefined);
            const targetInput = module.inputs?.target || (module.targetBodyId ? { type: 'body', value: module.targetBodyId } : undefined);

            const p1 = resolveInput(primaryInput, bodies, modules, gravitationalConstant, rendezvousSolutions);
            const p2 = resolveInput(targetInput, bodies, modules, gravitationalConstant, rendezvousSolutions);

            if (p1 && p2 && outputKey === 'speed') {
                return calculateRelativeSpeed(p1, p2);
            }
        } else if (module.type === 'orbit_info') {
            // Re-resolve orbit info for scalar outputs
            const primaryInput = module.inputs?.primary || (module.primaryBodyId ? { type: 'body', value: module.primaryBodyId } : undefined);
            const referenceInput = module.inputs?.reference || (module.referenceBodyId ? { type: 'body', value: module.referenceBodyId } : undefined);

            const primary = resolveInput(primaryInput, bodies, modules, gravitationalConstant, rendezvousSolutions);
            const reference = resolveInput(referenceInput, bodies, modules, gravitationalConstant, rendezvousSolutions);

            if (primary && reference && 'mass' in reference) {
                const info = calculateOrbitInfo(primary, reference as Body, gravitationalConstant);
                if (info) {
                    if (outputKey === 'altitude') return info.altitude;
                    if (outputKey === 'periapsis') return info.periapsis;
                    if (outputKey === 'apoapsis') return info.apoapsis;
                    if (outputKey === 'period') return info.period;
                    if (outputKey === 'eccentricity') return info.eccentricity;
                }
            }
        } else if (module.type === 'transfer_window') {
            const primaryInput = module.inputs?.primary || (module.primaryBodyId ? { type: 'body', value: module.primaryBodyId } : undefined);
            const referenceInput = module.inputs?.reference || (module.referenceBodyId ? { type: 'body', value: module.referenceBodyId } : undefined);
            const targetInput = module.inputs?.target || (module.targetBodyId ? { type: 'body', value: module.targetBodyId } : undefined);

            const primary = resolveInput(primaryInput, bodies, modules, gravitationalConstant, rendezvousSolutions);
            const reference = resolveInput(referenceInput, bodies, modules, gravitationalConstant, rendezvousSolutions);
            const target = resolveInput(targetInput, bodies, modules, gravitationalConstant, rendezvousSolutions);

            if (
                primary &&
                reference &&
                target &&
                'mass' in primary &&
                'mass' in reference &&
                'mass' in target
            ) {
                const transferData = calculateTransferInfo(primary as Body, reference as Body, target as Body, gravitationalConstant);
                switch (outputKey) {
                    case 'error':
                        return transferData.error;
                    case 'wait_time':
                        return transferData.waitTime;
                    case 'transfer_time':
                        return transferData.transferTime;
                    case 'arrival_time':
                        return transferData.arrivalTime;
                    case 'current_phase':
                        return transferData.currentPhase;
                    case 'required_phase':
                        return transferData.requiredPhase;
                    case 'error_angle':
                        return transferData.errorAngle;
                    case 'insertion_angle':
                        return transferData.insertionAngle;
                    case 'intercept_angle_target':
                        return transferData.interceptAngleTarget;
                    case 'intercept_angle_transfer':
                        return transferData.interceptAngleTransfer;
                    default:
                        return null;
                }
            }
        } else if (module.type === 'rendezvous_tracker') {
            const rendezvous = rendezvousSolutions?.[module.id];
            if (!rendezvous) return null;

            switch (outputKey) {
                case 'time':
                    return rendezvous.timeToRendezvous;
                case 'distance':
                    return rendezvous.distance;
                case 'delta_v_total':
                    return rendezvous.totalDeltaV;
                case 'delta_v_prograde':
                    return rendezvous.deltaVPrograde;
                case 'delta_v_radial':
                    return rendezvous.deltaVRadial;
                default:
                    return null;
            }
        } else if (module.type === 'maneuver_executor') {
            if (outputKey === 'progress') {
                return module.maneuverExecutorProgress ?? 0;
            }
        } else if (module.type === 'body_info') {
            const bodyInput = module.inputs?.target;
            if (!bodyInput) return null;

            const body = resolveInput(bodyInput, bodies, modules, gravitationalConstant, rendezvousSolutions);
            if (!body || !('mass' in body)) return null;

            const bodyData = body as Body;

            // Return numeric properties as scalars
            switch (outputKey) {
                case 'mass': return bodyData.mass;
                case 'radius': return bodyData.radius;
                case 'pos_x': return bodyData.position.x;
                case 'pos_y': return bodyData.position.y;
                case 'vel_x': return bodyData.velocity.x;
                case 'vel_y': return bodyData.velocity.y;
                case 'angle': return bodyData.angle ? (bodyData.angle * 180 / Math.PI) : null;
                case 'thrust_x': return bodyData.thrust ? bodyData.thrust.x : null;
                case 'thrust_y': return bodyData.thrust ? bodyData.thrust.y : null;
                case 'fuel': return bodyData.fuel ?? null;
                case 'max_fuel': return bodyData.maxFuel ?? null;
                case 'dry_mass': return bodyData.dryMass ?? null;
                default: return null;
            }
        } else if (module.type === 'maths' && outputKey === 'result') {
            // Use direct scalar values if no input is connected, otherwise resolve from input
            const valA = module.inputs?.valueA
                ? (resolveScalarInput(module.inputs.valueA, bodies, modules, gravitationalConstant, rendezvousSolutions) ?? 0)
                : (module.mathValueA ?? 0);
            const valB = module.inputs?.valueB
                ? (resolveScalarInput(module.inputs.valueB, bodies, modules, gravitationalConstant, rendezvousSolutions) ?? 0)
                : (module.mathValueB ?? 0);

            switch (module.mathOperator) {
                case 'add': return valA + valB;
                case 'subtract': return valA - valB;
                case 'multiply': return valA * valB;
                case 'divide': return valB !== 0 ? valA / valB : 0;
                default: return 0;
            }
        } else if (module.type === 'custom_script' && outputKey === 'result') {
            const res = module.customScriptLastResult;
            return typeof res === 'number' ? res : null;
        } else if (module.type === 'slider' && outputKey === 'value') {
            return module.sliderValue ?? module.sliderMin ?? 0;
        } else if (module.type === 'music_controller' && outputKey === 'volume') {
            return module.musicVolume ?? 0;
        }
    }

    return null;
};

export const resolveBooleanInput = (
    input: FlightComputerInput | undefined,
    bodies: Body[],
    modules: FlightComputerModule[],
    gravitationalConstant: number,
    rendezvousSolutions?: Record<string, RendezvousSolution>
): boolean | null => {
    if (!input) return null;

    if (input.type === 'module_output') {
        const [moduleId, outputKey] = input.value.split(':');
        const module = modules.find(m => m.id === moduleId);
        if (!module) return null;

        if (module.type === 'notify' && outputKey === 'triggered') {
            // Re-evaluate notify logic
            const nInput = module.inputs?.inputA || (module.primaryBodyId ? { type: 'body', value: module.primaryBodyId } : undefined);
            const currentValue = resolveScalarInput(nInput, bodies, modules, gravitationalConstant, rendezvousSolutions);
            const operator = module.comparisonOperator || '>';
            const threshold = module.comparisonValue || 0;

            if (currentValue !== null) {
                switch (operator) {
                    case '>': return currentValue > threshold;
                    case '<': return currentValue < threshold;
                    case '=': return Math.abs(currentValue - threshold) < 0.1;
                    case '>=': return currentValue >= threshold;
                    case '<=': return currentValue <= threshold;
                }
            }
            return false;
        } else if (module.type === 'transfer_window' && outputKey === 'ready') {
            const primaryInput = module.inputs?.primary || (module.primaryBodyId ? { type: 'body', value: module.primaryBodyId } : undefined);
            const referenceInput = module.inputs?.reference || (module.referenceBodyId ? { type: 'body', value: module.referenceBodyId } : undefined);
            const targetInput = module.inputs?.target || (module.targetBodyId ? { type: 'body', value: module.targetBodyId } : undefined);

            const primary = resolveInput(primaryInput, bodies, modules, gravitationalConstant, rendezvousSolutions);
            const reference = resolveInput(referenceInput, bodies, modules, gravitationalConstant, rendezvousSolutions);
            const target = resolveInput(targetInput, bodies, modules, gravitationalConstant, rendezvousSolutions);

            if (
                primary &&
                reference &&
                target &&
                'mass' in primary &&
                'mass' in reference &&
                'mass' in target
            ) {
                const transferData = calculateTransferInfo(primary as Body, reference as Body, target as Body, gravitationalConstant);
                return transferData.ready;
            }
            return null;
        } else if (module.type === 'marker') {
            if (outputKey === 'visible') {
                const baseVisible = module.markerVisible ?? true;
                const controlInput = module.inputs?.marker_visible;
                if (!controlInput) return baseVisible;
                const resolved = resolveBooleanInput(controlInput, bodies, modules, gravitationalConstant, rendezvousSolutions);
                if (resolved === null) return baseVisible;
                return baseVisible && resolved;
            }
            if (outputKey === 'pulse') {
                const basePulse = module.markerPulse ?? false;
                const controlInput = module.inputs?.marker_pulse;
                if (!controlInput) return basePulse;
                const resolved = resolveBooleanInput(controlInput, bodies, modules, gravitationalConstant, rendezvousSolutions);
                return resolved ?? basePulse;
            }
        } else if (module.type === 'logic_gate' && outputKey === 'result') {
            // Recursive resolution for Logic Gate
            const inputA = resolveBooleanInput(module.inputs?.inputA, bodies, modules, gravitationalConstant, rendezvousSolutions);
            const inputB = resolveBooleanInput(module.inputs?.inputB, bodies, modules, gravitationalConstant, rendezvousSolutions);
            const op = module.logicOperator || 'AND';

            if (inputA === null) return null; // A is always required
            // B is required for binary operators
            if (op !== 'NOT' && inputB === null) return null;

            switch (op) {
                case 'AND': return inputA && (inputB as boolean);
                case 'OR': return inputA || (inputB as boolean);
                case 'NOR': return !(inputA || (inputB as boolean));
                case 'NAND': return !(inputA && (inputB as boolean));
                case 'XOR': return inputA !== inputB;
                case 'XNOR': return inputA === inputB;
                case 'NOT': return !inputA;
            }
        } else if (module.type === 'thrust_burst' && outputKey === 'done') {
            return module.thrustBurstCompleted ?? false;
        } else if (module.type === 'button' && outputKey === 'state') {
            return module.buttonState ?? false;

        } else if (module.type === 'custom_script' && outputKey === 'result') {
            const res = module.customScriptLastResult;
            return typeof res === 'boolean' ? res : null;
        } else if (module.type === 'custom_script' && outputKey === 'state') {
            // Default to true (finished) if undefined
            return module.customScriptAsyncState ?? true;
        } else if (module.type === 'keyboard' && outputKey === 'state') {
            return module.keyboardState ?? false;
        } else if (module.type === 'music_controller' && outputKey === 'state') {
            return module.musicPlaying ?? false;
        } else if (module.type === 'edge_detector' && outputKey === 'triggered') {
            return module.edgeTriggered ?? false;
        }
    }
    return null;
};

export const resolveStringInput = (
    input: FlightComputerInput | undefined,
    bodies: Body[],
    modules: FlightComputerModule[],
    gravitationalConstant: number,
    rendezvousSolutions?: Record<string, RendezvousSolution>
): string | null => {
    if (!input) return null;

    if (input.type === 'module_output') {
        const [moduleId, outputKey] = input.value.split(':');
        const module = modules.find(m => m.id === moduleId);
        if (!module) return null;

        if (module.type === 'body_info') {
            const bodyInput = module.inputs?.target;
            if (!bodyInput) return null;

            const body = resolveInput(bodyInput, bodies, modules, gravitationalConstant, rendezvousSolutions);
            if (!body || !('mass' in body)) return null;

            const bodyData = body as Body;

            // Return specific property based on outputKey
            switch (outputKey) {
                case 'name': return bodyData.name;
                case 'id': return bodyData.id;
                case 'mass': return bodyData.mass.toString();
                case 'radius': return bodyData.radius.toString();
                case 'pos_x': return bodyData.position.x.toString();
                case 'pos_y': return bodyData.position.y.toString();
                case 'vel_x': return bodyData.velocity.x.toString();
                case 'vel_y': return bodyData.velocity.y.toString();
                case 'angle': return bodyData.angle ? (bodyData.angle * 180 / Math.PI).toString() : '';
                case 'thrust_x': return bodyData.thrust ? bodyData.thrust.x.toString() : '';
                case 'thrust_y': return bodyData.thrust ? bodyData.thrust.y.toString() : '';
                case 'fuel': return bodyData.fuel !== undefined ? bodyData.fuel.toString() : '';
                case 'max_fuel': return bodyData.maxFuel !== undefined ? bodyData.maxFuel.toString() : '';
                case 'dry_mass': return bodyData.dryMass !== undefined ? bodyData.dryMass.toString() : '';
                case 'landed_on': return bodyData.landedOnBodyId || '';
                case 'sas_mode': return bodyData.sasMode || '';
                default: return null;
            }
        } else if (module.type === 'marker') {
            switch (outputKey) {
                case 'title':
                    return module.markerTitle || module.name || 'Marker';
                case 'description':
                    return module.markerDescription || '';
                case 'color':
                    return module.markerColor || module.color || '#a855f7';
                default:
                    return null;
            }
        } else if (module.type === 'custom_script' && outputKey === 'result') {
            const res = module.customScriptLastResult;
            return typeof res === 'string' ? res : null;
        } else if (module.type === 'keyboard' && outputKey === 'key') {
            return module.keyboardKey || '';
        }
    }

    return null;
};
