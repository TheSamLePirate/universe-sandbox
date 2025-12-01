import { Body, Vector2D, FlightComputerModule, FlightComputerInput } from '../types';

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
    gravitationalConstant: number
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
            // We need to re-calculate the orbit info to get the point
            // This might be expensive if done every frame, but okay for now
            const primaryId = module.inputs?.primary?.value;
            const referenceId = module.inputs?.reference?.value;
            
            // Resolve inputs for that module first
            let primaryInput = module.inputs?.primary;
            if (!primaryInput && module.primaryBodyId) primaryInput = { type: 'body', value: module.primaryBodyId };
            
            let referenceInput = module.inputs?.reference;
            if (!referenceInput && module.referenceBodyId) referenceInput = { type: 'body', value: module.referenceBodyId };

            const primary = resolveInput(primaryInput, bodies, modules, gravitationalConstant);
            const reference = resolveInput(referenceInput, bodies, modules, gravitationalConstant);
            
            if (primary && reference && 'mass' in reference) { // Reference must be a Body
                 const info = calculateOrbitInfo(primary, reference as Body, gravitationalConstant);
                 if (info) {
                     if (outputKey === 'pe_point') return info.pePoint || null;
                     if (outputKey === 'pa_point') return info.paPoint || null;
                 }
            }
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
    const targetMotion = (360 / period_target) * travelTime;
    const requiredPhase = 180 - targetMotion;
    
    let normalizedRequired = requiredPhase;
    while (normalizedRequired > 180) normalizedRequired -= 360;
    while (normalizedRequired < -180) normalizedRequired += 360;

    const error = Math.abs(currentPhase - normalizedRequired);
    
    return { currentPhase, requiredPhase: normalizedRequired, error, ready: error < 5 };
};
