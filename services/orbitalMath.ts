import { Body, Vector2D, FlightComputerModule, FlightComputerInput, RendezvousSolution } from '../types';

export interface OrbitInfo {
    altitude: number;
    periapsis: number;
    apoapsis: number;
    period: number;
    isBound: boolean;
    pePoint?: Vector2D; // Position of Periapsis in world space
    paPoint?: Vector2D; // Position of Apoapsis in world space
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
    const dist = Math.sqrt(dx*dx + dy*dy);
    const dvx = pVel.x - rVel.x;
    const dvy = pVel.y - rVel.y;
    const vSq = dvx*dvx + dvy*dvy;
    
    const mu = gravitationalConstant * reference.mass;
    const E = (vSq / 2) - (mu / dist);
    const altitude = dist - reference.radius;

    let periapsis = -1;
    let apoapsis = -1;
    let period = 0;
    let pePoint: Vector2D | undefined;
    let paPoint: Vector2D | undefined;

    if (E < 0) {
        const a = -mu / (2 * E);
        
        // Angular momentum vector h = r x v
        // In 2D: h = x*vy - y*vx
        const h = (dx * dvy) - (dy * dvx);
        
        const eccentricity = Math.sqrt(1 + (2 * E * h * h) / (mu * mu));
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
        
        const rvDot = dx*dvx + dy*dvy;
        const ex = ((vSq - mu/dist)*dx - rvDot*dvx) / mu;
        const ey = ((vSq - mu/dist)*dy - rvDot*dvy) / mu;
        const eMag = Math.sqrt(ex*ex + ey*ey);
        
        if (eMag > 0.0001) {
            // Periapsis is in direction of e
            const peDist = a * (1 - eccentricity);
            pePoint = {
                x: rPos.x + (ex/eMag) * peDist,
                y: rPos.y + (ey/eMag) * peDist
            };
            
            // Apoapsis is in opposite direction of e
            const paDist = a * (1 + eccentricity);
            paPoint = {
                x: rPos.x - (ex/eMag) * paDist,
                y: rPos.y - (ey/eMag) * paDist
            };
        }
    }

    return { altitude, periapsis, apoapsis, period, isBound: E < 0, pePoint, paPoint };
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
        if (!module) return null;

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

            if (outputKey === 'primary_body') {
                return resolveInput(primaryInput, bodies, modules, gravitationalConstant, rendezvousSolutions);
            }
            if (outputKey === 'reference_body') {
                return resolveInput(referenceInput, bodies, modules, gravitationalConstant, rendezvousSolutions);
            }
            if (outputKey === 'target_body') {
                return resolveInput(targetInput, bodies, modules, gravitationalConstant, rendezvousSolutions);
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

export const calculateTransferInfo = (
    primary: Body, 
    reference: Body, 
    target: Body,
    gravitationalConstant: number
) => {
    // Phase Angle Calculation
    const primaryAngle = Math.atan2(primary.position.y - reference.position.y, primary.position.x - reference.position.x);
    const targetAngle = Math.atan2(target.position.y - reference.position.y, target.position.x - reference.position.x);
    
    let currentPhase = (targetAngle - primaryAngle) * 180 / Math.PI;
    while (currentPhase > 180) currentPhase -= 360;
    while (currentPhase < -180) currentPhase += 360;

    const r1 = Math.sqrt(Math.pow(primary.position.x - reference.position.x, 2) + Math.pow(primary.position.y - reference.position.y, 2));
    const r2 = Math.sqrt(Math.pow(target.position.x - reference.position.x, 2) + Math.pow(target.position.y - reference.position.y, 2));
    const period_target = 2 * Math.PI * Math.sqrt(Math.pow(r2, 3) / (gravitationalConstant * reference.mass));
    const a_transfer = (r1 + r2) / 2;
    const period_transfer = 2 * Math.PI * Math.sqrt(Math.pow(a_transfer, 3) / (gravitationalConstant * reference.mass));
    
    const travelTime = period_transfer / 2;
    
    // Determine direction (prograde vs retrograde)
    const tPos = { x: target.position.x - reference.position.x, y: target.position.y - reference.position.y };
    const tVel = { x: target.velocity.x - reference.velocity.x, y: target.velocity.y - reference.velocity.y };
    const h = tPos.x * tVel.y - tPos.y * tVel.x;
    const direction = h >= 0 ? 1 : -1;

    const targetMotion = direction * (360 / period_target) * travelTime;
    
    // 180 - targetMotion works for both prograde and retrograde
    // because 180 and -180 are congruent modulo 360
    const requiredPhase = 180 - targetMotion;
    
    let normalizedRequired = requiredPhase;
    while (normalizedRequired > 180) normalizedRequired -= 360;
    while (normalizedRequired < -180) normalizedRequired += 360;

    const error = Math.abs(currentPhase - normalizedRequired);
    
    return { currentPhase, requiredPhase: normalizedRequired, error, ready: error < 5 };
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
            const nInput = module.inputs?.primary || (module.primaryBodyId ? { type: 'body', value: module.primaryBodyId } : undefined);
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
        } else if (module.type === 'custom_script' && outputKey === 'result') {
            const res = module.customScriptLastResult;
            return typeof res === 'string' ? res : null;
        }
    }
    
    return null;
};
