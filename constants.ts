

import { Body, Preset, VisualConfig, PhysicsConfig } from './types';

// Gravitational Constant for the simulation (tuned for visual stability with these units)
export const G_CONST = 0.5; 

export const DEFAULT_VISUAL_CONFIG: VisualConfig = {
    showGrid: false,
    gridSpacing: 100,
    gridOpacity: 0.25,
    showWaves: true,
    waveSpeedMultiplier: 0.1,
    showGlow: true,
    glowIntensity: 1.0,
    showTrails: true,
    trailLength: 150,
    centerOfMassThreshold: 2000,
    showStars: true,
    showNebula: true,
    starDensity: 800,
    starTwinkleSpeed: 2.0,
    nebulaCloudCount: 15,
    nebulaOpacity: 0.2,
    showCenterOfMass: false,
    showEclipses: false
};

export const DEFAULT_PHYSICS_CONFIG: PhysicsConfig = {
    gravitationalConstant: 0.5,
    collisions: true,
    timeStep: 0.5
};

export const createBody = (
  id: string,
  name: string,
  mass: number,
  radius: number,
  color: string,
  distance: number, // Distance from 0,0 (Sun)
  velocity: number, // Tangential velocity
  description: string,
  realMass: string = 'Unknown',
  realDiameter: string = 'Unknown',
  orbitPeriod: string = 'Unknown',
  isStar: boolean = false
): Body => ({
  id,
  name,
  mass,
  radius,
  color,
  position: { x: distance, y: 0 },
  velocity: { x: 0, y: velocity },
  trail: [],
  description,
  realMass,
  realDiameter,
  orbitPeriod,
  isStar
});

const SYSTEM_SOLAR: Body[] = [
  createBody(
    'sun', 'Sun', 5000, 35, '#FDB813', 0, 0,
    'The star at the center of the Solar System. It is a nearly perfect sphere of hot plasma.',
    '1.989 × 10^30 kg', '1.39 million km', 'N/A', true
  ),
  createBody(
    'mercury', 'Mercury', 5, 4, '#A5A5A5', 70, 5.9, 
    'The smallest planet in the Solar System and the closest to the Sun.',
    '3.285 × 10^23 kg', '4,880 km', '88 days'
  ),
  createBody(
    'venus', 'Venus', 40, 8, '#E3BB76', 110, 4.7, 
    'The second planet from the Sun. It has a thick, toxic atmosphere filled with carbon dioxide.',
    '4.867 × 10^24 kg', '12,104 km', '225 days'
  ),
  createBody(
    'earth', 'Earth', 45, 8.5, '#22A6B3', 160, 3.95, 
    'Our home planet. The only astronomical object known to harbor life.',
    '5.972 × 10^24 kg', '12,742 km', '365.25 days'
  ),
  createBody(
    'mars', 'Mars', 15, 5, '#EB4D4B', 220, 3.3, 
    'The fourth planet from the Sun and the second-smallest planet in the Solar System.',
    '6.39 × 10^23 kg', '6,779 km', '687 days'
  ),
  createBody(
    'jupiter', 'Jupiter', 600, 18, '#D980FA', 360, 2.6, 
    'The largest planet in the Solar System. It is a gas giant with a mass more than two and a half times that of all the other planets combined.',
    '1.898 × 10^27 kg', '139,820 km', '11.86 years'
  ),
  createBody(
    'saturn', 'Saturn', 400, 16, '#F79F1F', 500, 2.2, 
    'The sixth planet from the Sun and the second-largest in the Solar System, famous for its ring system.',
    '5.683 × 10^26 kg', '116,460 km', '29.45 years'
  ),
  createBody(
    'uranus', 'Uranus', 120, 12, '#7ED6DF', 650, 1.95, 
    'The seventh planet from the Sun. It has the third-largest planetary radius and fourth-largest planetary mass in the Solar System.',
    '8.681 × 10^25 kg', '50,724 km', '84 years'
  ),
  createBody(
    'neptune', 'Neptune', 130, 12, '#30336B', 780, 1.78, 
    'The eighth and farthest-known Solar planet from the Sun. It is 17 times the mass of Earth.',
    '1.024 × 10^26 kg', '49,244 km', '164.8 years'
  )
];

const SYSTEM_BINARY: Body[] = [
    {
        ...createBody('star1', 'Alpha Primary', 3000, 25, '#ff4757', -100, -2.5, 'A red giant star in a binary system.', 'Unknown', 'Unknown', 'N/A', true),
        velocity: { x: 0, y: -2.5 },
        position: { x: -100, y: 0 }
    },
    {
        ...createBody('star2', 'Beta Secondary', 3000, 25, '#3742fa', 100, 2.5, 'A blue star locked in orbit with Alpha.', 'Unknown', 'Unknown', 'N/A', true),
        velocity: { x: 0, y: 2.5 },
        position: { x: 100, y: 0 }
    },
    createBody('planet1', 'Tatooine', 20, 6, '#eccc68', 300, 3.5, 'A desert planet orbiting the binary pair.', 'Unknown', 'Unknown', 'N/A')
];

const SYSTEM_THREE_BODY: Body[] = [
    {
        ...createBody('tri1', 'Alpha Centauri A', 2500, 28, '#FFA500', 0, 0, 'Primary star in the triple system.', 'Unknown', 'Unknown', 'N/A', true),
        position: { x: -80, y: 0 },
        velocity: { x: 0, y: -2.0 }
    },
    {
        ...createBody('tri2', 'Alpha Centauri B', 2500, 24, '#FFD700', 0, 0, 'Secondary star orbiting the primary.', 'Unknown', 'Unknown', 'N/A', true),
        position: { x: 80, y: 0 },
        velocity: { x: 0, y: 2.0 }
    },
    {
        ...createBody('tri3', 'Proxima', 600, 15, '#FF6B6B', 0, 0, 'A distant red dwarf orbiting the central binary pair in a wide stable orbit.', 'Unknown', 'Unknown', 'N/A', true),
        position: { x: 0, y: 450 },
        velocity: { x: -2.4, y: 0 }
    }
];

// Scaled for G=0.5 and Mass=500
const SYSTEM_FIGURE_8: Body[] = [
    {
        ...createBody('f8_1', 'Body A', 500, 15, '#FF6B6B', 0, 0, 'Part of a stable Figure-8 3-body system.', '500 units', '30 units', 'N/A', true),
        position: { x: 97.000436, y: -24.308753 },
        velocity: { x: 0.4662036850 * 1.58, y: 0.4323657300 * 1.58 }
    },
    {
        ...createBody('f8_2', 'Body B', 500, 15, '#4ECDC4', 0, 0, 'Part of a stable Figure-8 3-body system.', '500 units', '30 units', 'N/A', true),
        position: { x: -97.000436, y: 24.308753 },
        velocity: { x: 0.4662036850 * 1.58, y: 0.4323657300 * 1.58 }
    },
    {
        ...createBody('f8_3', 'Body C', 500, 15, '#FFE66D', 0, 0, 'Part of a stable Figure-8 3-body system.', '500 units', '30 units', 'N/A', true),
        position: { x: 0, y: 0 },
        velocity: { x: -2 * 0.4662036850 * 1.58, y: -2 * 0.4323657300 * 1.58 }
    }
];

// --- 3-BODY CHOREOGRAPHIES (Scaled) ---
// Base mass M=500. Distance Scale D=120. G=0.5.
// Velocity Scale Factor K = sqrt(G*M/D) = sqrt(0.5*500/120) = 1.443
const choreoScaleV = 1.443;
const choreoScaleD = 120;
const choreoMass = 500;

const SYSTEM_BUTTERFLY: Body[] = [
    { ...createBody('bf_1', 'Wing 1', choreoMass, 15, '#f368e0', 0, 0, 'Butterfly Choreography', '500', '30', 'N/A', true),
      position: { x: 1 * choreoScaleD, y: 0 }, velocity: { x: 0.30689 * choreoScaleV, y: 0.12551 * choreoScaleV } },
    { ...createBody('bf_2', 'Wing 2', choreoMass, 15, '#0abde3', 0, 0, 'Butterfly Choreography', '500', '30', 'N/A', true),
      position: { x: -1 * choreoScaleD, y: 0 }, velocity: { x: 0.30689 * choreoScaleV, y: 0.12551 * choreoScaleV } },
    { ...createBody('bf_3', 'Body', choreoMass, 15, '#ff9f43', 0, 0, 'Butterfly Choreography', '500', '30', 'N/A', true),
      position: { x: 0, y: 0 }, velocity: { x: -2 * 0.30689 * choreoScaleV, y: -2 * 0.12551 * choreoScaleV } }
];

const SYSTEM_MOTH: Body[] = [
    { ...createBody('mt_1', 'Wing L', choreoMass, 15, '#1dd1a1', 0, 0, 'Moth Choreography', '500', '30', 'N/A', true),
      position: { x: 1 * choreoScaleD, y: 0 }, velocity: { x: 0.46444 * choreoScaleV, y: 0.39606 * choreoScaleV } },
    { ...createBody('mt_2', 'Wing R', choreoMass, 15, '#5f27cd', 0, 0, 'Moth Choreography', '500', '30', 'N/A', true),
      position: { x: -1 * choreoScaleD, y: 0 }, velocity: { x: 0.46444 * choreoScaleV, y: 0.39606 * choreoScaleV } },
    { ...createBody('mt_3', 'Head', choreoMass, 15, '#c8d6e5', 0, 0, 'Moth Choreography', '500', '30', 'N/A', true),
      position: { x: 0, y: 0 }, velocity: { x: -2 * 0.46444 * choreoScaleV, y: -2 * 0.39606 * choreoScaleV } }
];

const SYSTEM_YIN_YANG: Body[] = [
    { ...createBody('yy_1', 'Yin', choreoMass, 15, '#2e86de', 0, 0, 'Yin-Yang / Goggle Choreography', '500', '30', 'N/A', true),
      position: { x: 1 * choreoScaleD, y: 0 }, velocity: { x: 0.08330 * choreoScaleV, y: 0.12789 * choreoScaleV } },
    { ...createBody('yy_2', 'Yang', choreoMass, 15, '#ee5253', 0, 0, 'Yin-Yang / Goggle Choreography', '500', '30', 'N/A', true),
      position: { x: -1 * choreoScaleD, y: 0 }, velocity: { x: 0.08330 * choreoScaleV, y: 0.12789 * choreoScaleV } },
    { ...createBody('yy_3', 'Balance', choreoMass, 15, '#ffffff', 0, 0, 'Yin-Yang / Goggle Choreography', '500', '30', 'N/A', true),
      position: { x: 0, y: 0 }, velocity: { x: -2 * 0.08330 * choreoScaleV, y: -2 * 0.12789 * choreoScaleV } }
];

// Lagrange Equilateral Triangle
// 3 Equal masses in a perfect triangle. Velocity v = sqrt(GM / (R * sqrt(3)))
const SYSTEM_EQUILATERAL: Body[] = [];
const eqMass = 400;
const eqR = 150;
const eqV = Math.sqrt((G_CONST * eqMass) / (eqR * Math.sqrt(3)));

for(let i=0; i<3; i++) {
    const angle = i * (2 * Math.PI / 3);
    SYSTEM_EQUILATERAL.push({
        ...createBody(`eq_${i}`, `Star ${i+1}`, eqMass, 20, ['#FF6B6B', '#4ECDC4', '#FFE66D'][i], 0, 0, 'One of three equal stars in a Lagrange Equilateral configuration.', '400 units', '40 units', 'N/A', true),
        position: { x: Math.cos(angle) * eqR, y: Math.sin(angle) * eqR },
        velocity: { x: Math.cos(angle + Math.PI/2) * eqV, y: Math.sin(angle + Math.PI/2) * eqV }
    });
}

// Euler's Line (Unstable exact solution)
// M - m - m rotating in a line.
// v = sqrt( G(M + m/4) / r )
const SYSTEM_EULER: Body[] = [
    {
        ...createBody('euler_center', 'Central Star', 1000, 30, '#FDB813', 0, 0, 'The pivot of Euler\'s Line.', '1000 units', '60 units', 'N/A', true),
        position: { x: 0, y: 0 },
        velocity: { x: 0, y: 0 }
    }
];
const eulerDist = 200;
const eulerSmallMass = 100;
const eulerV = Math.sqrt((G_CONST * (1000 + eulerSmallMass/4)) / eulerDist);

SYSTEM_EULER.push({
    ...createBody('euler_1', 'Planet A', eulerSmallMass, 12, '#48dbfb', 0, 0, 'Locked in unstable equilibrium.', '100 units', '24 units', 'N/A'),
    position: { x: -eulerDist, y: 0 },
    velocity: { x: 0, y: -eulerV }
});
SYSTEM_EULER.push({
    ...createBody('euler_2', 'Planet B', eulerSmallMass, 12, '#ff9f43', 0, 0, 'Locked in unstable equilibrium.', '100 units', '24 units', 'N/A'),
    position: { x: eulerDist, y: 0 },
    velocity: { x: 0, y: eulerV }
});

// Trappist-1 Inspired (Ultra Compact)
const SYSTEM_TRAPPIST: Body[] = [
     createBody('trappist_star', 'Trappist', 2000, 30, '#e74c3c', 0, 0, 'An ultra-cool red dwarf.', 'Unknown', 'Unknown', 'N/A', true)
];
const distances = [60, 80, 100, 120, 140, 160, 180];
distances.forEach((d, i) => {
    const v = Math.sqrt(G_CONST * 2000 / d);
    SYSTEM_TRAPPIST.push({
        ...createBody(`trap_${i}`, String.fromCharCode(98+i), 15 + Math.random() * 10, 5, `hsl(${10 + i * 30}, 70%, 60%)`, d, 0, 'A terrestrial planet in a compact resonant chain.', 'Unknown', '10 units', 'N/A'),
        position: { x: d, y: 0 },
        velocity: { x: 0, y: v * (i%2===0 ? 1 : -1) } // Alternate directions for chaos? No, keep same for stability
    });
    // Actually keep same direction for stability
    SYSTEM_TRAPPIST[SYSTEM_TRAPPIST.length-1].velocity = { x: 0, y: v };
});

const generateRandomSystem = (): Body[] => {
    const bodies = [createBody('sun', 'Sun', 5000, 30, '#FDB813', 0, 0, 'Central Star', 'Unknown', 'Unknown', 'N/A', true)];
    for(let i=0; i<200; i++) {
        const dist = (25 * i)+(Math.random() * 10);
        let multiplier=1;
        if (i%2==0){
            multiplier=-1;
        }
        const speed = multiplier*Math.sqrt(G_CONST * 5000 / dist); // Orbital velocity formula v = sqrt(GM/r)
        bodies.push(createBody(
            `rnd_${i}`, 
            `Planet ${i+1}`, 
            1 + Math.random() * 2, 
            4 + Math.random() * 8, 
            `hsl(${Math.random() * 360}, 70%, 60%)`,
            dist,
            speed,
            'A randomly generated world.'
        ));
    }
    return bodies;
};

// Empty System
const SYSTEM_BLANK: Body[] = [];

export const PRESETS: Preset[] = [
    {
        id: 'solar',
        name: 'Solar System',
        bodies: SYSTEM_SOLAR,
        defaultScale: 0.8,
        description: 'Our home system.'
    },
    {
        id: 'inner',
        name: 'Inner Planets',
        bodies: SYSTEM_SOLAR.slice(0, 5), // Sun through Mars
        defaultScale: 2.5,
        description: 'Zoomed in view of the rocky planets.'
    },
    {
        id: 'binary',
        name: 'Binary Stars',
        bodies: SYSTEM_BINARY,
        defaultScale: 1.0,
        description: 'Two massive stars orbiting a common center of mass.'
    },
    {
        id: 'threebody',
        name: '3-Body Stable',
        bodies: SYSTEM_THREE_BODY,
        defaultScale: 0.7,
        description: 'A stable hierarchical triple star system.'
    },
    {
        id: 'figure8',
        name: 'Figure-8 Loop',
        bodies: SYSTEM_FIGURE_8,
        defaultScale: 1.5,
        description: 'Three equal masses chasing each other in a stable figure-eight pattern.'
    },
    {
        id: 'butterfly',
        name: 'Butterfly',
        bodies: SYSTEM_BUTTERFLY,
        defaultScale: 1.3,
        description: 'A stable choreography where bodies trace a butterfly shape.'
    },
    {
        id: 'moth',
        name: 'Moth',
        bodies: SYSTEM_MOTH,
        defaultScale: 1.3,
        description: 'A complex, stable periodic orbit resembling a moth.'
    },
    {
        id: 'yinyang',
        name: 'Yin-Yang',
        bodies: SYSTEM_YIN_YANG,
        defaultScale: 1.3,
        description: 'A beautiful periodic choreography also known as the Goggle orbit.'
    },
    {
        id: 'equilateral',
        name: 'Lagrange Triangle',
        bodies: SYSTEM_EQUILATERAL,
        defaultScale: 1.2,
        description: 'Three equal-mass stars in a perfect equilateral triangle rotation.'
    },
    {
        id: 'euler',
        name: 'Euler\'s Line',
        bodies: SYSTEM_EULER,
        defaultScale: 1.0,
        description: 'A theoretically exact (but unstable) solution with 3 bodies in a line.'
    },
    {
        id: 'trappist',
        name: 'Compact System',
        bodies: SYSTEM_TRAPPIST,
        defaultScale: 1.5,
        description: 'Inspired by TRAPPIST-1. Seven planets packed in tight orbit.'
    },
    {
        id: 'random',
        name: 'Chaos Cluster',
        bodies: generateRandomSystem(),
        defaultScale: 1.2,
        description: 'Random generated bodies. May be unstable!'
    },
    {
        id: 'blank',
        name: 'Empty Void',
        bodies: SYSTEM_BLANK,
        defaultScale: 1.0,
        description: 'A completely empty universe. Start from scratch.'
    }
];

export const INITIAL_BODIES = SYSTEM_SOLAR;