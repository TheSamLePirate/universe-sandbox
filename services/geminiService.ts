

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

const programManeuverTool: FunctionDeclaration = {
    name: "program_maneuver",
    description: "Program a SINGLE maneuver into the rocket's flight computer.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            rocketName: { type: Type.STRING, description: "Name of the rocket." },
            thrust: { type: Type.NUMBER, description: "Thrust power (0.001-0.1). Rocket mass is typically 0.001." },
            duration: { type: Type.NUMBER, description: "Burn duration in seconds (0.1-10.0)." },
            angleOffset: { type: Type.NUMBER, description: "Angle relative to current heading in degrees (0 = forward)." },
        },
        required: ["rocketName", "thrust", "duration", "angleOffset"],
    },
};

const programFlightPlanTool: FunctionDeclaration = {
    name: "program_flight_plan",
    description: "Program a FULL SEQUENCE of maneuvers (flight plan) for a rocket. Overwrites existing pending maneuvers.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            rocketName: { type: Type.STRING, description: "Name of the rocket." },
            plan: {
                type: Type.ARRAY,
                description: "List of maneuvers to execute in order.",
                items: {
                    type: Type.OBJECT,
                    properties: {
                        thrust: { type: Type.NUMBER, description: "Thrust Power" },
                        duration: { type: Type.NUMBER, description: "Duration in seconds" },
                        angleOffset: { type: Type.NUMBER, description: "Angle offset degrees" }
                    },
                    required: ["thrust", "duration", "angleOffset"]
                }
            }
        },
        required: ["rocketName", "plan"],
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
        programManeuverTool,
        programFlightPlanTool,
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
    
    FLIGHT PLANNING:
    - To create a flight plan, use 'program_flight_plan' with a list of maneuvers.
    - To execute the plan, use 'execute_maneuver_plan'. 
    - The execution tool ONLY executes. You must program the plan first.
    - Note: Rocket mass is very small (0.001). Typical thrust values are 0.01 to 0.1 N.
    
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