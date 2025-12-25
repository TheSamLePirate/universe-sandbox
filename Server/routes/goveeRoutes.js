import express from "express";
import { proxyToGovee } from "../services/goveeService.js";

const router = express.Router();

// 1. List Devices
router.get("/devices", (req, res) => {
    console.log("Hit /api/devices proxy");
    return proxyToGovee(req, res, "/api/devices", "GET");
});

// 2. Set Color
router.post("/color", (req, res) => {
    return proxyToGovee(req, res, "/api/color", "POST");
});

// 3. Set Brightness
router.post("/brightness", (req, res) => {
    // Original code had this line, preserving it:
    req.body.brightness = req.body.value;
    return proxyToGovee(req, res, "/api/brightness", "POST");
});

// 4. Fade Effect
router.post("/fade", (req, res) => {
    return proxyToGovee(req, res, "/api/fade", "POST");
});

export default router;
