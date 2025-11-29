

import { GoogleGenAI, Type, FunctionDeclaration, Tool, Modality, ThinkingLevel } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- Tool Definitions ---

const spawnBodyTool: FunctionDeclaration = {
    name: "spawn_body",
    description: "Create a new planet or star in the simulation.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            name: { type: Type.STRING, description: "Name of the body" },
            mass: { type: Type.NUMBER, description: "Mass of the body (1-1000). Earth is ~45, Jupiter ~600, Sun ~5000." },
            distance: { type: Type.NUMBER, description: "Distance from center (50-1000). Earth is 160." },
            velocity: { type: Type.NUMBER, description: "Tangential velocity (0-10). Earth is ~4.0." },
            color: { type: Type.STRING, description: "Hex color code (e.g. #FF0000) or name." },
        },
        required: ["name", "mass", "distance", "velocity", "color"],
    },
};

const deleteBodyTool: FunctionDeclaration = {
    name: "delete_body",
    description: "Delete/Remove a specific planet or star from the simulation.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            bodyName: { type: Type.STRING, description: "The name of the body to delete." },
        },
        required: ["bodyName"],
    },
};

const makeStarTool: FunctionDeclaration = {
    name: "make_star",
    description: "Convert an existing planet into a star (increases mass, adds glow, turns it into a light source).",
    parameters: {
        type: Type.OBJECT,
        properties: {
            bodyName: { type: Type.STRING, description: "The name of the body to transform into a star." },
        },
        required: ["bodyName"],
    },
};

const controlSimulationTool: FunctionDeclaration = {
    name: "control_simulation",
    description: "Control the simulation playback and speed.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            isRunning: { type: Type.BOOLEAN, description: "True to play, False to pause." },
            speed: { type: Type.NUMBER, description: "Simulation speed multiplier (0.1 to 100.0)." },
        },
    },
};

const changePresetTool: FunctionDeclaration = {
    name: "change_preset",
    description: "Load a specific solar system configuration.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            presetId: { 
                type: Type.STRING, 
                description: "The ID of the preset: 'solar', 'inner', 'binary', 'threebody', 'figure8', 'butterfly', 'moth', 'yinyang', 'equilateral', 'euler', 'trappist', 'random', or 'blank'." 
            },
        },
        required: ["presetId"],
    },
};

const selectBodyTool: FunctionDeclaration = {
    name: "select_body",
    description: "Select and show info for a specific body. Does not lock camera.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            bodyName: { type: Type.STRING, description: "The name of the planet or star to select." },
        },
        required: ["bodyName"],
    },
};

const followBodyTool: FunctionDeclaration = {
    name: "follow_body",
    description: "Lock the camera to follow and center a specific body.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            bodyName: { type: Type.STRING, description: "The name of the body to follow." },
        },
        required: ["bodyName"],
    },
};

const followCenterOfMassTool: FunctionDeclaration = {
    name: "follow_center_of_mass",
    description: "Lock the camera to follow the center of mass of the entire system.",
    parameters: {
        type: Type.OBJECT,
        properties: {},
    },
};

const configureVisualsTool: FunctionDeclaration = {
    name: "configure_visuals",
    description: "Toggle various visual effects and customize rendering parameters.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            showGrid: { type: Type.BOOLEAN, description: "Show the spacetime gravity distortion grid." },
            gridSpacing: { type: Type.NUMBER, description: "Distance between grid lines (50-200)." },
            gridOpacity: { type: Type.NUMBER, description: "Opacity of grid lines (0.1-1.0)." },
            showWaves: { type: Type.BOOLEAN, description: "Show gravitational waves from moving bodies." },
            waveSpeedMultiplier: { type: Type.NUMBER, description: "Multiplier for wave expansion speed (0.5-2.0)." },
            showGlow: { type: Type.BOOLEAN, description: "Show atmospheric and star glows." },
            glowIntensity: { type: Type.NUMBER, description: "Intensity of the glow effect (0.5-2.0)." },
            showTrails: { type: Type.BOOLEAN, description: "Show orbital trails." },
            trailLength: { type: Type.NUMBER, description: "Maximum number of points in the orbital trail (50-5000). Higher = longer trails." },
            centerOfMassThreshold: { type: Type.NUMBER, description: "Max distance from origin for bodies to be included in Center of Mass calculation (500-10000)." },
            showCenterOfMass: { type: Type.BOOLEAN, description: "Show a visual marker for the Center of Mass and its threshold circle." },
            showStars: { type: Type.BOOLEAN, description: "Show the background starfield." },
            showNebula: { type: Type.BOOLEAN, description: "Show background nebula clouds." },
            starDensity: { type: Type.NUMBER, description: "Number of stars in the background (100-2000)." },
            starTwinkleSpeed: { type: Type.NUMBER, description: "Speed of star twinkling (0.1-5.0)." },
            nebulaCloudCount: { type: Type.NUMBER, description: "Number of nebula clouds (0-50)." },
            nebulaOpacity: { type: Type.NUMBER, description: "Opacity of nebula clouds (0.1-1.0)." },
            showEclipses: { type: Type.BOOLEAN, description: "Show volumetric shadows cast by planets." },
        },
    },
};

const configurePhysicsTool: FunctionDeclaration = {
    name: "configure_physics",
    description: "Configure the fundamental constants of the simulation physics engine.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            gravitationalConstant: { type: Type.NUMBER, description: "The Big G constant. Default is 0.5. Higher values = stronger gravity." },
            collisions: { type: Type.BOOLEAN, description: "Enable or disable collisions and merging of bodies." },
            timeStep: { type: Type.NUMBER, description: "Base physics time step. Default 0.5. Range 0.001 to 2.0. Lower = more accurate, Higher = faster/unstable." }
        },
    },
};

const setCameraTool: FunctionDeclaration = {
    name: "set_camera",
    description: "Control the camera zoom level or reset the view.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            zoom: { type: Type.NUMBER, description: "Zoom level (0.1 to 5.0). 1.0 is default." },
            reset: { type: Type.BOOLEAN, description: "Reset camera to center and default zoom." },
        },
    },
};

const spawnRocketTool: FunctionDeclaration = {
    name: "spawn_rocket",
    description: "Spawn a new rocket ship. Can spawn in free space or landed on a planet.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            parentBodyName: { type: Type.STRING, description: "Optional name of the planet to spawn/land on. If omitted, spawns in free space near the center." },
        },
    },
};

const controlRocketTool: FunctionDeclaration = {
    name: "control_rocket",
    description: "Real-time control for a rocket ship.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            rocketName: { type: Type.STRING, description: "Name of the rocket to control." },
            action: { type: Type.STRING, description: "'rotate' (turn by degrees), 'thrust' (manual main engine on/off), or 'stop' (kill engines)." },
            value: { type: Type.NUMBER, description: "For 'rotate', the degrees to turn (e.g., 90, -45). For 'thrust', treated as power (default 0.05) if non-zero." },
        },
        required: ["rocketName", "action"],
    },
};

const programAdvancedFlightPlanTool: FunctionDeclaration = {
    name: "program_advanced_flight_plan",
    description: `Program a comprehensive flight plan with multiple maneuver types. Supports all maneuver types:
    - 'burn': Timed thrust burn with specific angle
    - 'wait': Passive wait for specified duration
    - 'rotate': Rotate rocket by degrees
    - 'sas': Set Stability Assist System mode
    - 'auto_land': Automatic landing on target body
    - 'auto_transfer': Automatic Hohmann transfer to target
    - 'auto_circularize': Circularize orbit around target
    - 'wait_for_transfer': Wait for optimal transfer window
    - 'wait_for_altitude': Wait until reaching target altitude (ascending/descending)
    - 'burn_until_altitude': Burn continuously until reaching target altitude`,
    parameters: {
        type: Type.OBJECT,
        properties: {
            rocketName: { type: Type.STRING, description: "Name of the rocket." },
            maneuvers: {
                type: Type.ARRAY,
                description: "List of maneuvers to execute in sequence.",
                items: {
                    type: Type.OBJECT,
                    properties: {
                        type: { 
                            type: Type.STRING, 
                            description: "Maneuver type: 'burn', 'wait', 'rotate', 'sas', 'auto_land', 'auto_transfer', 'auto_circularize', 'wait_for_transfer', 'wait_for_altitude', 'burn_until_altitude'" 
                        },
                        // For 'burn' and 'burn_until_altitude'
                        thrust: { type: Type.NUMBER, description: "Thrust power (0.001-0.1). Required for 'burn' and 'burn_until_altitude'." },
                        duration: { type: Type.NUMBER, description: "Duration in seconds. Required for 'burn' and 'wait'." },
                        angleOffset: { type: Type.NUMBER, description: "Angle offset in degrees relative to rocket heading. Required for 'burn' and 'burn_until_altitude'." },
                        
                        // For 'rotate'
                        rotationAngle: { type: Type.NUMBER, description: "Rotation angle in degrees (e.g., 90, -45). Required for 'rotate'." },
                        
                        // For 'sas'
                        sasMode: { 
                            type: Type.STRING, 
                            description: "SAS mode: 'off', 'prograde', 'retrograde', 'radial_out', 'radial_in'. Required for 'sas'." 
                        },
                        
                        // For auto maneuvers and altitude maneuvers
                        targetBodyName: { 
                            type: Type.STRING, 
                            description: "Name of target body. Required for 'auto_land', 'auto_transfer', 'auto_circularize', 'wait_for_transfer'." 
                        },
                        parentBodyName: { 
                            type: Type.STRING, 
                            description: "Name of parent/reference body (optional, auto-detects if not specified). For transfers and altitude maneuvers." 
                        },
                        
                        // For 'wait_for_transfer'
                        phaseAngleError: { 
                            type: Type.NUMBER, 
                            description: "Phase angle error margin in degrees (e.g., 0.5-2.0). Required for 'wait_for_transfer'." 
                        },
                        
                        // For 'wait_for_altitude' and 'burn_until_altitude'
                        targetAltitude: { 
                            type: Type.NUMBER, 
                            description: "Target altitude in kilometers. Required for 'wait_for_altitude' and 'burn_until_altitude'." 
                        },
                        altitudeDirection: { 
                            type: Type.STRING, 
                            description: "'ascending' (going up) or 'descending' (going down). Required for 'wait_for_altitude'." 
                        },
                    },
                    required: ["type"]
                }
            }
        },
        required: ["rocketName", "maneuvers"],
    },
};

const executeManeuverPlanTool: FunctionDeclaration = {
    name: "execute_maneuver_plan",
    description: "Execute the programmed flight plan for a rocket. This only activates the pending plan, it does not define it.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            rocketName: { type: Type.STRING, description: "Name of the rocket." },
        },
        required: ["rocketName"],
    },
};

const getRocketTelemetryTool: FunctionDeclaration = {
    name: "get_rocket_telemetry",
    description: "Get current speed, distance to a target body, bearing, and relative velocity (Delta V) for a rocket.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            rocketName: { type: Type.STRING, description: "Name of the rocket." },
            targetBodyName: { type: Type.STRING, description: "Name of the reference body (e.g. 'Earth', 'Moon'). Optional." },
        },
        required: ["rocketName"],
    },
};

const tools: Tool[] = [{
    functionDeclarations: [
        spawnBodyTool, 
        deleteBodyTool,
        makeStarTool,
        controlSimulationTool, 
        changePresetTool, 
        selectBodyTool, 
        followBodyTool, 
        followCenterOfMassTool,
        configureVisualsTool,
        configurePhysicsTool,
        setCameraTool,
        spawnRocketTool,
        controlRocketTool,
        programAdvancedFlightPlanTool,
        executeManeuverPlanTool,
        getRocketTelemetryTool
    ]
}];

export const createChatSession = (initialHistory: { role: 'user' | 'model', text: string }[] = []) => {
    const systemInstruction = `You are "Cosmos", an omnipotent AI astronomer and controller of this N-body gravity simulation.
    
    You have DIRECT CONTROL over the simulation via tools. 
    - Creation/Destruction: Use 'spawn_body' to create. Use 'delete_body' to remove planets. Use 'make_star' to ignite a planet into a sun.
    - Physics: Use 'control_simulation' for pause/speed. Use 'configure_physics' for gravity (G), collisions, and time steps.
    - Presets: Use 'change_preset' for 'solar', 'inner', 'binary', 'threebody', 'figure8', 'butterfly', 'moth', 'yinyang', 'equilateral', 'euler', 'trappist', 'random', or 'blank'.
    - Navigation: Use 'select_body' (info) or 'follow_body' (lock camera). Use 'follow_center_of_mass' to track the system's balance point.
    - Camera: Use 'set_camera' to zoom in/out or reset view.
    - Visuals: Use 'configure_visuals' to toggle effects OR tune them. You can control star density, twinkling, nebula opacity, trail lengths, show the center of mass, show eclipses (shadows), and more.
    - Rockets: You can 'spawn_rocket' on planets or in space. You can 'control_rocket' to rotate or thrust manually.
    - Telemetry: Use 'get_rocket_telemetry' to find a rocket's speed, or its distance/angle/delta-v relative to a planet.
    
    ADVANCED FLIGHT PLANNING:
    You can create sophisticated mission plans using 'program_advanced_flight_plan' with these maneuver types:
    
    1. BURN: Timed thrust burn
       - Parameters: thrust (0.001-0.1), duration (seconds), angleOffset (degrees)
       - Example: {type: "burn", thrust: 0.01, duration: 2.0, angleOffset: 0}
    
    2. WAIT: Passive coast for duration
       - Parameters: duration (seconds)
       - Example: {type: "wait", duration: 5.0}
    
    3. ROTATE: Turn rocket by degrees
       - Parameters: rotationAngle (degrees)
       - Example: {type: "rotate", rotationAngle: 90}
    
    4. SAS: Set stability assist mode
       - Parameters: sasMode ("off", "prograde", "retrograde", "radial_out", "radial_in")
       - Example: {type: "sas", sasMode: "prograde"}
    
    5. AUTO_LAND: Automatic landing on target
       - Parameters: targetBodyName
       - Example: {type: "auto_land", targetBodyName: "Moon"}
    
    6. AUTO_TRANSFER: Automatic Hohmann transfer
       - Parameters: targetBodyName, parentBodyName (optional)
       - Example: {type: "auto_transfer", targetBodyName: "Mars", parentBodyName: "Sun"}
    
    7. AUTO_CIRCULARIZE: Circularize current orbit
       - Parameters: targetBodyName
       - Example: {type: "auto_circularize", targetBodyName: "Earth"}
    
    8. WAIT_FOR_TRANSFER: Wait for optimal transfer window
       - Parameters: targetBodyName, parentBodyName (optional), phaseAngleError (degrees, e.g., 0.5-2.0)
       - Example: {type: "wait_for_transfer", targetBodyName: "Mars", phaseAngleError: 1.0}
    
    9. WAIT_FOR_ALTITUDE: Wait until reaching altitude
       - Parameters: targetAltitude (km), altitudeDirection ("ascending" or "descending"), parentBodyName (optional)
       - Example: {type: "wait_for_altitude", targetAltitude: 200, altitudeDirection: "ascending"}
       - Use "ascending" to wait for apoapsis, "descending" for periapsis
    
    10. BURN_UNTIL_ALTITUDE: Burn continuously until altitude reached
        - Parameters: targetAltitude (km), thrust, angleOffset (degrees), parentBodyName (optional)
        - Example: {type: "burn_until_altitude", targetAltitude: 300, thrust: 0.01, angleOffset: 0}
    
    EXAMPLE MISSION PLANS:
    
    Earth to Moon Transfer:
    [
      {type: "burn_until_altitude", targetAltitude: 200, thrust: 0.01, angleOffset: 0},
      {type: "wait_for_altitude", targetAltitude: 190, altitudeDirection: "ascending"},
      {type: "sas", sasMode: "prograde"},
      {type: "wait_for_transfer", targetBodyName: "Moon", phaseAngleError: 1.0},
      {type: "auto_transfer", targetBodyName: "Moon"},
      {type: "auto_land", targetBodyName: "Moon"}
    ]
    
    Orbit Circularization:
    [
      {type: "wait_for_altitude", targetAltitude: 150, altitudeDirection: "ascending"},
      {type: "auto_circularize", targetBodyName: "Earth"}
    ]
    
    To execute: Use 'execute_maneuver_plan' after programming.
    Note: Rocket mass is very small (0.001). Typical thrust values are 0.01 to 0.1 N.
    
    Be helpful, scientific, and concise. If you execute a tool, strictly confirm what you did in the text response.
    `;

    return ai.chats.create({
        model: 'gemini-3-pro-preview',
        config: { 
            systemInstruction,
            tools: tools,
            temperature: 0.7,
            thinkingConfig: {
                thinkingLevel: ThinkingLevel.LOW,
            },
        },
        history: initialHistory.map(h => ({
            role: h.role,
            parts: [{ text: h.text }]
        }))
    });
};

export const generateSpeech = async (text: string): Promise<string | undefined> => {
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Kore' },
                    },
                },
            },
        });
        return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    } catch (error) {
        console.error("TTS Error:", error);
        return undefined;
    }
}