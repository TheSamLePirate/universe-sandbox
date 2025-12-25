import fs from "fs";
import path from "path";

// Note: Paths are relative to the process.cwd(), assuming the server is started from the Server directory
// existing code used path.join("..", ...)

export const getPresets = () => {
    const presetsDir = path.join("..", "importAtStartup", "Presets");
    const presets = fs.readdirSync(presetsDir);
    return presets.map(preset => {
        const presetPath = path.join(presetsDir, preset);
        const presetContent = fs.readFileSync(presetPath, "utf-8");
        return { name: preset.replace(".json", ""), preset: JSON.parse(presetContent) };
    });
};

export const getFlightComputerModules = () => {
    const modulesDir = path.join("..", "importAtStartup", "FlightComputerModules");
    const modules = fs.readdirSync(modulesDir);
    return modules.map(module => {
        const modulePath = path.join(modulesDir, module);
        const moduleContent = fs.readFileSync(modulePath, "utf-8");
        return { name: module.replace(".json", ""), module: JSON.parse(moduleContent) };
    });
};

export const getGameData = () => {
    const gameDataPath = path.join("..", "importAtStartup", "GameData", "gamedata.json");
    const gameData = fs.readFileSync(gameDataPath, "utf-8");
    return JSON.parse(gameData);
};
