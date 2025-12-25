import express from "express";
import * as fileService from "../services/fileService.js";

const router = express.Router();

router.get("/presets", (req, res) => {
    try {
        const data = fileService.getPresets();
        // The original code passed JSON.stringify(presetsToReturn) to res.json().
        // res.json(obj) automatically stringifies. 
        // passing a string to res.json() will send it as JSON string (double encoded?)
        // Original: return res.json(JSON.stringify(presetsToReturn));
        // If presetsToReturn is an object/array, JSON.stringify makes it a string.
        // res.json(string) sends "string" (quotes included) as body, with application/json header.
        // This seems weird but per user instruction "Keep every functionality as it is (100%)", I must replicate it exactly.
        return res.json(JSON.stringify(data));
    } catch (e) {
        console.error(e);
        res.status(500).send("Error reading presets");
    }
});

router.get("/flightComputerModules", (req, res) => {
    try {
        const data = fileService.getFlightComputerModules();
        return res.json(JSON.stringify(data));
    } catch (e) {
        console.error(e);
        res.status(500).send("Error reading flight computer modules");
    }
});

router.get("/gameData", (req, res) => {
    try {
        const data = fileService.getGameData();
        return res.json(data); // Original code: return res.json(JSON.parse(gameData)); (already parsed in service)
    } catch (e) {
        console.error(e);
        res.status(500).send("Error reading game data");
    }
});

export default router;
