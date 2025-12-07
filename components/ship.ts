import { FlightComputerModule } from "@/types";
import { isModuleActive } from "./flight_computer/utils";


/**
 * Pure Canvas rendering function for the Sci-Fi Rocket.
 * Call this inside your game loop's render method.
 * 
 * @param ctx - The Canvas Rendering Context
 * @param centerX - Screen X position
 * @param centerY - Screen Y position
 * @param angle - Ship rotation in radians
 * @param thrust - Thrust vector {x, y} to calculate engine flame intensity
 */
export function drawShip(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    angle: number,
    thrust: { x: number, y: number },
    scale: number,
    body: any,
    flightComputerModules: FlightComputerModule[],
) {

    // --- 1. DUMMY VARIABLES / CONFIGURATION ---
    scale=scale/2;
    
    const time = performance.now() / 20; // Global animation timer

    let landing=false;
    // Physics / Status
    const fuel = body.fuel/body.maxFuel*100; // 0 to 100
    const landed = body.landedOnBodyId !== undefined;
    const sasMode = body.sasMode; // 'none', 'prograde', 'retrograde', 'radial-out'

    // Modules (Flags)
    let hasSolarPanel = false;
    let hasGravityRing = false;
    let hasObservatory = false;
    let hasRadar = false;
    let hasLaser = false;
    let fireLaser=false;
    let hasRoboticArm = false;

    // Dynamic Module State
    let laserAngle = 0;
    let gravityRingSpeed = 2;
    let roboticArm = { 
        shoulder: Math.PI/4, 
        elbow: -Math.PI/2, 
        wrist: 0, 
        grab: false 
    };

    //data from flight computer modules
    flightComputerModules.forEach(module => {
            // Check if module is enabled and active (respects activate input)
            if (!module.isEnabled) return;
            if (module.type === 'custom_script') {
                if (module.customScriptLastResult) {
                    try {
                        const datas=module.customScriptLastResult.split(':');
                        if(datas[0]==="landing" && datas[1]===body.id){
                            landing=true;
                        }
                        if(datas[0]==="solarOn" && datas[1]===body.id){
                            hasSolarPanel=true;
                        }
                        if(datas[0]==="solarOff" && datas[1]===body.id){
                            hasSolarPanel=false;
                        }
                        if(datas[0]==="hasObservatory" && datas[1]===body.id){
                            hasObservatory=true;
                        }
                        if(datas[0]==="hasObservatoryOff" && datas[1]===body.id){
                            hasObservatory=false;
                        }
                        if(datas[0]==="hasRadar" && datas[1]===body.id){
                            hasRadar=true;
                        }
                        if(datas[0]==="hasRadarOff" && datas[1]===body.id){
                            hasRadar=false;
                        }
                        if(datas[0]==="hasLaser" && datas[1]===body.id && datas[2] && datas[3]){
                            hasLaser=true;
                            laserAngle=Number(datas[2]);
                            fireLaser=datas[3]==="true";

                        }
                        if(datas[0]==="hasLaserOff" && datas[1]===body.id){
                            hasLaser=false;
                        }
                        if(datas[0]==="hasGravityRing" && datas[1]===body.id){
                            hasGravityRing=true;
                        }
                        if(datas[0]==="hasGravityRingOff" && datas[1]===body.id){
                            hasGravityRing=false;
                        }
                        if(datas[0]==="gravityRingSpeed" && datas[1]===body.id){
                            gravityRingSpeed=Number(datas[2]);
                        }
                        if(datas[0]==="laserAngle" && datas[1]===body.id){
                            laserAngle=Number(datas[2]);
                        }
                        if(datas[0]==="roboticArm" && datas[1]===body.id){
                            hasRoboticArm=true;
                            const ggrab=datas[5]==="true";
                            roboticArm={
                                shoulder: Number(datas[2]),
                                elbow: Number(datas[3]),
                                wrist: Number(datas[4]),
                                grab: ggrab
                            };
                        }
                        


                    } catch (error) {
                        //do nothing, no console log


                    }
                }
            }
    });
    
    


    // --- 2. SETUP & TRANSFORMS ---
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(angle);

    // "Size" is roughly the radius or half-length of the ship
    const size =  5 * scale;

    // --- 3. RENDERING PIPELINE ---

    // Layer 1: Behind Hull
    if (hasSolarPanel) drawSolarPanels(ctx, size);
    if (hasGravityRing) drawGravityRing(ctx, size, time, gravityRingSpeed);

    // Layer 2: Main Body
    drawHull(ctx, size, fuel,body.color);

    // Layer 3: Modules
    if (hasObservatory) {
        drawObservatory(ctx, size);
    } else {
        drawCockpit(ctx, size);
    }
    

    if (hasRadar) drawRadar(ctx, size, time);
    if (hasLaser) drawLaser(ctx, size, laserAngle,fireLaser);
    if (hasRoboticArm) drawRoboticArm(ctx, size, roboticArm);

    // Layer 4: Landing Gear
    if (landed || landing) {
        // Simple animation: if landed, full extension (1.0), if landing/flying logic needed, pass a float 0..1
        const extension = landed ? 1.0 : 0.6; 
        drawLandingGear(ctx, size, extension);
    }

    // Layer 5: FX
    drawEngine(ctx, size, thrust, time);
    drawRCS(ctx, size, sasMode, time);
    drawIndicators(ctx, size, sasMode, landed, time);

    ctx.restore();
}


// --- SUB-DRAW HELPER FUNCTIONS ---

function drawHull(ctx: CanvasRenderingContext2D, size: number, fuel: number,color:string) {
    const width = size * 0.8;

    function shadeHexColor(hex, factor) {
        if (typeof hex !== "string") throw new TypeError("hex must be a string");
        let h = hex.trim().replace(/^#/, "");

        if (h.length === 3) h = h.split("").map(ch => ch + ch).join("");
        if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new TypeError("Invalid hex color");

        const f = Math.min(1, Math.max(0, Number(factor)));
        const t = (f - 0.5) * 2; // -1..1

        const to2 = (n) => n.toString(16).padStart(2, "0");

        const r = parseInt(h.slice(0, 2), 16);
        const g = parseInt(h.slice(2, 4), 16);
        const b = parseInt(h.slice(4, 6), 16);

        const adj = (c) => {
            const v = t >= 0 ? c + t * (255 - c) : c * (1 + t);
            return Math.min(255, Math.max(0, Math.round(v)));
        };

        return `#${to2(adj(r))}${to2(adj(g))}${to2(adj(b))}`;
    }

    

    const arrayColor=[
        shadeHexColor(color,0.2),    // Dark Slate (Shadow)
        shadeHexColor(color,0.4), // Lighter Slate
        '#cbd5e1', // Highlight (Specular)
        color, 
        shadeHexColor(color,0.8),    // Dark Bottom
    ];
    
    // Metallic Hull Gradient
    const hullGrad = ctx.createLinearGradient(0, -width/2, 0, width/2);
    hullGrad.addColorStop(0, arrayColor[0]);    // Dark Slate (Shadow)
    hullGrad.addColorStop(0.2, arrayColor[1]); // Lighter Slate
    hullGrad.addColorStop(0.5, arrayColor[2]); // Highlight (Specular)
    hullGrad.addColorStop(0.8, arrayColor[3]); 
    hullGrad.addColorStop(1, arrayColor[4]);    // Dark Bottom

    ctx.fillStyle = hullGrad;
    ctx.beginPath();
    // Nose
    ctx.moveTo(size, 0); 
    // Upper Body Curve
    ctx.bezierCurveTo(size * 0.5, -width * 0.45, -size * 0.5, -width * 0.5, -size * 0.9, -width * 0.35);
    // Engine Mount
    ctx.lineTo(-size, -width * 0.25);
    ctx.lineTo(-size, width * 0.25);
    // Lower Body Curve
    ctx.lineTo(-size * 0.9, width * 0.35);
    ctx.bezierCurveTo(-size * 0.5, width * 0.5, size * 0.5, width * 0.45, size, 0);
    ctx.fill();

    // Panel Lines (1px details)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();
    
    // Cross-section lines
    ctx.beginPath();
    ctx.moveTo(size * 0.3, -width * 0.42); ctx.lineTo(size * 0.3, width * 0.42);
    ctx.moveTo(-size * 0.2, -width * 0.48); ctx.lineTo(-size * 0.2, width * 0.48);
    ctx.stroke();

    // Bolts/Rivets
    ctx.fillStyle = 'rgba(255, 255, 255, 0)';
    for(let i=0; i<5; i++) {
        ctx.fillRect(size * 0.3, -width * 0.2 + (i * width * 0.1), 1, 1);
    }

    // Fuel Gauge
    const fuelH = width * 0.5;
    const fuelW = size * 0.15;
    const fuelX = -size * 0.4;
    const currentFuelH = fuelH * (fuel / 100);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(fuelX, -fuelH/2, fuelW, fuelH); // Background
    
    ctx.fillStyle = fuel > 20 ? '#10b981' : '#ef4444'; // Green or Red
    ctx.fillRect(fuelX, (fuelH/2) - currentFuelH, fuelW, currentFuelH); // Bar
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(fuelX, -fuelH/2, fuelW, fuelH/2); // Glass Reflection
    
    ctx.strokeStyle = '#475569';
    ctx.strokeRect(fuelX, -fuelH/2, fuelW, fuelH); // Border
}

function drawCockpit(ctx: CanvasRenderingContext2D, size: number) {
    ctx.save();
    // Glass Gradient
    const glassGrad = ctx.createLinearGradient(size*0.4, -size*0.1, size*0.6, size*0.1);
    glassGrad.addColorStop(0, '#0ea5e9'); // Sky Blue
    glassGrad.addColorStop(1, '#0369a1'); // Dark Blue

    ctx.fillStyle = glassGrad;
    ctx.beginPath();
    ctx.ellipse(size * 0.5, 0, size * 0.18, size * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Glare
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();
    ctx.ellipse(size * 0.55, -size * 0.04, size * 0.06, size * 0.03, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawObservatory(ctx: CanvasRenderingContext2D, size: number) {
    ctx.fillStyle = '#4f46e5'; 
    ctx.shadowColor = '#818cf8';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.ellipse(size * 0.4, 0, size * 0.25, size * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(size * 0.4, -size * 0.2); ctx.lineTo(size * 0.4, size * 0.2); 
    ctx.moveTo(size * 0.15, 0); ctx.lineTo(size * 0.65, 0); 
    ctx.stroke();
}

function drawEngine(ctx: CanvasRenderingContext2D, size: number, thrust: {x: number, y: number}, time: number) {
    const thrustPower = Math.sqrt(thrust.x*thrust.x + thrust.y*thrust.y)*500;
    const isThrusting = thrustPower > 0.001;

    // Nozzle
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.moveTo(-size * 0.9, -size * 0.25);
    ctx.lineTo(-size * 1.1, -size * 0.35);
    ctx.lineTo(-size * 1.1, size * 0.35);
    ctx.lineTo(-size * 0.9, size * 0.25);
    ctx.fill();
    
    // Detail
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-size * 1.1, -size * 0.35); ctx.lineTo(-size * 1.1, size * 0.35);
    ctx.stroke();

    if (isThrusting) {
        ctx.globalCompositeOperation = 'lighter';
        const flicker = Math.sin(time * 0.8) * 0.1 + 0.9; 
        const flameLen = size * 1.8 * flicker * Math.min(thrustPower * 0.5, 2);

        // Flame Core
        const gradient = ctx.createLinearGradient(-size * 1.1, 0, -size * 1.1 - flameLen, 0);
        gradient.addColorStop(0, '#ffffff');      
        gradient.addColorStop(0.1, '#fff7ed');    
        gradient.addColorStop(0.4, '#f97316');    
        gradient.addColorStop(0.8, '#dc2626');    
        gradient.addColorStop(1, 'rgba(0,0,0,0)'); 

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(-size * 1.1, -size * 0.3);
        ctx.lineTo(-size * 1.1 - flameLen, 0);
        ctx.lineTo(-size * 1.1, size * 0.3);
        ctx.fill();
        
        // Ambient Glow
        const glowRad = ctx.createRadialGradient(-size * 1.1, 0, 0, -size * 1.1, 0, size);
        glowRad.addColorStop(0, 'rgba(249, 115, 22, 0.4)');
        glowRad.addColorStop(1, 'rgba(249, 115, 22, 0)');
        ctx.fillStyle = glowRad;
        ctx.beginPath();
        ctx.arc(-size * 1.1, 0, size, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalCompositeOperation = 'source-over';
    }
}

function drawRCS(ctx: CanvasRenderingContext2D, size: number, sas: string, time: number) {
    if (sas === 'none') return;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    const puffSize = size * 0.3;
    
    // Simple blinking puff effect
    if (Math.sin(time * 0.8) > 0) {
        if (sas === 'prograde' || sas === 'radial_out') {
            // Front puffs
            ctx.beginPath();
            ctx.arc(size * 0.8, 0, size * 0.05, 0, Math.PI * 2);
            ctx.fill();
        }
        
        if (sas === 'retrograde') {
             // Rear puffs
             ctx.beginPath();
             ctx.arc(-size * 0.8, 0, size * 0.05, 0, Math.PI * 2);
             ctx.fill();
        }
    }
}

function drawSolarPanels(ctx: CanvasRenderingContext2D, size: number) {
    const panelW = size * 1.2;
    const panelH = size * 0.5;
    
    ctx.save();
    ctx.translate(-size * 0.2, 0); 

    const drawPanel = (yOffset: number) => {
        ctx.fillStyle = '#0f172a'; 
        ctx.fillRect(-panelH/2, yOffset, panelH, panelW);
        
        // Solar Cells
        const rows = 4;
        const cellH = (panelW - 4) / rows;
        for(let i=0; i<rows; i++) {
            const cellGrad = ctx.createLinearGradient(0, yOffset + 2 + (i*cellH), 0, yOffset + 2 + ((i+1)*cellH));
            cellGrad.addColorStop(0, '#3b82f6');
            cellGrad.addColorStop(1, '#1e40af');
            ctx.fillStyle = cellGrad;
            
            ctx.fillRect(-panelH/2 + 2, yOffset + 2 + (i*cellH), panelH - 4, cellH - 1);
        }
    };

    drawPanel(-size * 0.4 - panelW); // Top
    drawPanel(size * 0.4);           // Bottom

    // Mounts
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(0, -size * 0.4);
    ctx.moveTo(0, 0); ctx.lineTo(0, size * 0.4);
    ctx.stroke();

    ctx.restore();
}

function drawGravityRing(ctx: CanvasRenderingContext2D, size: number, time: number, speed: number) {
    const rx = size * 0.25;
    const ry = size * 1.3;
    
    ctx.save();
    ctx.translate(-size * 0.4, 0); 

    const drawRingArc = (start: number, end: number, color: string, w: number) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, start, end);
        ctx.stroke();
    };

    // Back (Darker)
    drawRingArc(Math.PI/2, Math.PI * 1.5, '#1e293b', size * 0.15);
    drawRingArc(Math.PI/2, Math.PI * 1.5, '#334155', size * 0.1);

    // Front (Lighter)
    drawRingArc(-Math.PI/2, Math.PI * 0.5, '#475569', size * 0.15);
    drawRingArc(-Math.PI/2, Math.PI * 0.5, '#94a3b8', size * 0.1);

    // Lights
    const numLights = 6;
    for(let i=0; i<numLights; i++) {
        const phase = (time * speed * 0.05 + (i * (Math.PI * 2 / numLights))) % (Math.PI * 2);
        const z = Math.cos(phase);
        
        if (z > -0.2) { 
            const lx = Math.cos(phase) * rx;
            const ly = Math.sin(phase) * ry;
            
            ctx.fillStyle = z > 0 ? '#facc15' : '#854d0e';
            ctx.shadowColor = '#facc15';
            ctx.shadowBlur = z > 0 ? 5 : 0;
            ctx.beginPath();
            ctx.arc(lx, ly, size * 0.03 * (0.8 + z*0.2), 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }
    ctx.restore();
}

function drawLandingGear(ctx: CanvasRenderingContext2D, size: number, extension: number) {
    if (extension <= 0) return;
    const legLen = size * 0.7 * extension;
    const legSpread = size * 0.6;

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const drawLeg = (dir: number) => {
        const startY = dir * size * 0.2;
        const kneeY = dir * (size * 0.2 + legLen * 0.5);
        const footY = dir * (size * 0.2 + legLen);
        const kneeX = -size * 0.5;
        const footX = -size * 0.6 - legSpread * 0.5; 

        ctx.beginPath();
        ctx.moveTo(-size * 0.4, startY);
        ctx.lineTo(kneeX, kneeY);
        ctx.lineTo(footX, footY);
        ctx.stroke();

        ctx.fillStyle = '#64748b';
        ctx.beginPath(); ctx.arc(kneeX, kneeY, 2, 0, Math.PI*2); ctx.fill();
        
        ctx.fillStyle = '#cbd5e1';
        ctx.beginPath(); ctx.ellipse(footX, footY, size*0.02, size*0.08, 0, 0, Math.PI*2); ctx.fill();
    };

    drawLeg(-1); // Top
    drawLeg(1);  // Bottom
}

function drawRoboticArm(ctx: CanvasRenderingContext2D, size: number, armState: any) {
    console.log("size",size);
    ctx.save();
    ctx.translate(0, size * 0.25); 
    
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = size * 0.06;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const drawJoint = (r: number) => {
        ctx.fillStyle = '#334155';
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI*2); ctx.fill();
        ctx.stroke(); 
    };

    drawJoint(size * 0.05);
    ctx.rotate(armState.shoulder);
    
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(size * 0.4, 0); ctx.stroke();
    ctx.translate(size * 0.4, 0);

    drawJoint(size * 0.04);
    ctx.rotate(armState.elbow);
    
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(size * 0.35, 0); ctx.stroke();
    ctx.translate(size * 0.35, 0);

    ctx.rotate(armState.wrist);
    
    const clawColor = armState.grab ? '#f59e0b' : '#94a3b8';
    ctx.strokeStyle = clawColor;
    ctx.lineWidth = 2;
    const open = armState.grab ? 0.05 : 0.4;
    
    ctx.beginPath();
    ctx.moveTo(0, -size*0.02); 
    ctx.bezierCurveTo(size*0.1, -size*0.02, size*0.15, -size*0.1 - (open*size*0.2), size*0.2, -size*0.05);
    ctx.moveTo(0, size*0.02); 
    ctx.bezierCurveTo(size*0.1, size*0.02, size*0.15, size*0.1 + (open*size*0.2), size*0.2, size*0.05);
    ctx.stroke();

    ctx.restore();
}

function drawRadar(ctx: CanvasRenderingContext2D, size: number, time: number) {
    ctx.save();
    ctx.translate(size * 0.2, -size * 0.35);
    
    const angle = time * 0.02;
    
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.moveTo(-4, 0); ctx.lineTo(4, 0); ctx.lineTo(2, -4); ctx.lineTo(-2, -4);
    ctx.fill();

    ctx.rotate(angle);
    ctx.translate(0, -5);
    
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.12, 0, Math.PI, true);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#cbd5e1';
    ctx.stroke();

    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0, -size*0.15); ctx.stroke();
    ctx.fillStyle = 'red'; 
    ctx.beginPath(); ctx.arc(0, -size*0.15, 1.5, 0, Math.PI*2); ctx.fill();

    ctx.restore();
}

function drawLaser(ctx: CanvasRenderingContext2D, size: number, angle: number, fire: boolean) {
    ctx.save();
    ctx.translate(size * 0.6, size * 0.3);
    
    ctx.fillStyle = '#1e293b';
    ctx.beginPath(); ctx.arc(0, 0, size * 0.09, 0, Math.PI*2); ctx.fill();

    ctx.rotate(angle);
    ctx.fillStyle = '#ef4444'; 
    ctx.fillRect(0, -2, size * 0.35, 4);
    
    ctx.fillStyle = '#000';
    ctx.fillRect(size * 0.35, -3, size * 0.08, 2);
    ctx.fillRect(size * 0.35, 1, size * 0.08, 2);

    
    if(fire){
        //draw the green laser beam line (infinite)
        ctx.beginPath();
        ctx.moveTo(size * 0.35, 0);
        ctx.lineTo(1000, 0);
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    ctx.restore();
}

function drawIndicators(ctx: CanvasRenderingContext2D, size: number, sas: string, landed: boolean, time: number) {
    const blink = Math.floor(time / 40) % 2 === 0;
    const halfBlink = Math.floor(time / 20) % 2 === 0;
    const width = size * 0.8;

    // Navigation Lights
    if (blink) {

        
        if(halfBlink){
            // Red Left Bottom
            ctx.fillStyle = '#ef4444';
            ctx.shadowColor = '#ef4444';
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(-size * 0.9, -width*0.4, 2, 0, Math.PI*2);
            ctx.fill();
            ctx.shadowBlur = 5;
        }
        else{
            // Green RightBottom
            ctx.fillStyle = '#22c55e';
            ctx.shadowColor = '#22c55e';
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(-size * 0.9, width*0.4, 2, 0, Math.PI*2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }

       

        

        
    }
    else{
        // Blue top
        ctx.fillStyle = '#01a2ffff';
        ctx.shadowColor = '#01a2ffff';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(size, 0, 2, 0, Math.PI*2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }


}
