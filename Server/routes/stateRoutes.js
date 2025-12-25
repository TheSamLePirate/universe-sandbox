import express from "express";
import * as stateService from "../services/stateService.js";
import { setGoveeBrightness, setGoveeColor } from "../services/goveeService.js";

const router = express.Router();

// GET /api/ => {"dataName": <value>, ...}
router.get("/api", (req, res) => {
    return res.json(stateService.getAll());
});

// GET /apiR/:dataName -> Read and Remove
router.get("/apiR/:dataName", (req, res) => {
    const { dataName } = req.params;
    const returnValueError = { [dataName]: 0, error: "not found" };

    if (!stateService.isValidName(dataName)) {
        return res.json(returnValueError);
    }

    if (!stateService.has(dataName)) {
        return res.json(returnValueError);
    }

    const val = stateService.remove(dataName);
    return res.json({ [dataName]: val });
});


// POST /api/:dataName
router.post("/api/:dataName", async (req, res) => {
    const { dataName } = req.params;

    if (!stateService.isValidName(dataName)) {
        return res.status(400).json({ error: "invalid dataName" });
    }

    const value = stateService.normalizeValue(req.body?.value);
    if (value === null) {
        return res.status(400).json({ error: "value must be a string or a finite number" });
    }

    stateService.set(dataName, value);
    console.log(dataName + " = " + value);

    // Business logic side-effect
    if (dataName === "menuAction") {
        try {
            const data = JSON.parse(value);
            if (data.itemId === "brightness" && data.action === "TOGGLE") {
                const result = await setGoveeBrightness(data.value.toFixed(0));
                console.log(result);
            }
            if (data.itemId === "color" && data.action === "TOGGLE") {
                const result = await setGoveeColor(Number(data.value.toFixed(0)));
                console.log(result);
            }
        } catch (e) {
            console.error("Error processing menuAction:", e);
        }
    }

    return res.json({ [dataName]: value });
});

// GET /api/:dataName
// Note: This must be registered last among /api routes to avoid conflict if any other /api/specific route exists
router.get("/api/:dataName", (req, res) => {
    const { dataName } = req.params;
    const returnValueError = { [dataName]: 0, error: "not found" };

    // This check might catch "devices", "presets" if routed incorrectly, but we will handle mounting order in app.js
    if (!stateService.isValidName(dataName)) {
        return res.json(returnValueError);
    }

    if (!stateService.has(dataName)) {
        return res.json(returnValueError);
    }

    return res.json({ [dataName]: stateService.get(dataName) });
});

export default router;
