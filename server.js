// server.js
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";

const app = express();

app.use(cors());
app.use(express.json());

// Store arbitrary values by name (reactive-style shared state)
const sharedValues = new Map(); // key: dataName (string) -> value: string | number

const isValidName = (name) =>
  typeof name === "string" &&
  name.length > 0 &&
  name.length <= 128 &&
  /^[A-Za-z0-9_.-]+$/.test(name);

const normalizeValue = (v) => {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
};



//Get all Preset from ./importAtStartup/Presets
//there are multiple files, each one is a preset
//each file is a json
//each json is a preset
//return a array of [{name:<filename sans .json>, preset:<content of the file>}]
//no require, use fs
app.get("/api/presets", (req, res) => {

  const presets = fs.readdirSync(path.join(".", "importAtStartup", "Presets"));
  const presetsToReturn = presets.map(preset => {
    const presetPath = path.join(".", "importAtStartup", "Presets", preset);
    const presetContent = fs.readFileSync(presetPath, "utf-8");
    return { name: preset.replace(".json", ""), preset: JSON.parse(presetContent) };
  });
  return res.json(JSON.stringify(presetsToReturn));
});

//the same for FlightComputerModules
app.get("/api/flightComputerModules", (req, res) => {
  const modules = fs.readdirSync(path.join(".", "importAtStartup", "FlightComputerModules"));
  const modulesToReturn = modules.map(module => {
    const modulePath = path.join(".", "importAtStartup", "FlightComputerModules", module);
    const moduleContent = fs.readFileSync(modulePath, "utf-8");
    return { name: module.replace(".json", ""), module: JSON.parse(moduleContent) };
  });
  return res.json(JSON.stringify(modulesToReturn));
});





//GET /api/ => {"dataName": <value>, "dataName": <value>, ...}
// Get all data
app.get("/api", (req, res) => {
  return res.json({...sharedValues});
});

// GET /api/:dataName  -> { "<dataName>": <value> }
app.get("/api/:dataName", (req, res) => {
  
  const { dataName } = req.params;

  const returnValueError={ [dataName]: 0,error:"not found"};

  if (!isValidName(dataName)) {
    return res.json(returnValueError);
  }

  if (!sharedValues.has(dataName)) {
    return res.json(returnValueError);
  }

  //console.log("Get " + dataName + " = " + sharedValues.get(dataName));

  return res.json({ [dataName]: sharedValues.get(dataName) });
});

// GET /api/:dataName  -> { "<dataName>": <value> }
// returns the value of a variable and remove it from the sharedValues map
app.get("/apiR/:dataName", (req, res) => {
  
  const { dataName } = req.params;

  const returnValueError={ [dataName]: 0,error:"not found"};

  if (!isValidName(dataName)) {
    return res.json(returnValueError);
  }

  if (!sharedValues.has(dataName)) {
    return res.json(returnValueError);
  }

  const returnValue={ [dataName]: sharedValues.get(dataName) };
  sharedValues.delete(dataName);
  return res.json(returnValue);
});

// POST /api/:dataName with body { "value": <string|number> } -> { "<dataName>": <value> }
// creates or updates
app.post("/api/:dataName", (req, res) => {
  //console.log("Post " + new Date().toISOString());
  const { dataName } = req.params;

  if (!isValidName(dataName)) {
    return res.status(400).json({ error: "invalid dataName" });
  }

  const value = normalizeValue(req.body?.value);
  if (value === null) {
    return res.status(400).json({ error: "value must be a string or a finite number" });
  }

  sharedValues.set(dataName, value);
  //console.log(dataName + " = " + value);
  return res.json({ [dataName]: sharedValues.get(dataName) });
});

const PORT = 3009;
app.listen(PORT, () => console.log(`http://macbook-pro-de-olivier.local:${PORT}`));