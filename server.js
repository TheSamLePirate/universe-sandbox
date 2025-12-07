// server.js
import express from "express";
import cors from "cors";

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

// GET /api/:dataName  -> { "<dataName>": <value> }
app.get("/api/:dataName", (req, res) => {
  console.log("Get " + new Date().toISOString());
  const { dataName } = req.params;

  if (!isValidName(dataName)) {
    return res.status(400).json({ error: "invalid dataName" });
  }

  if (!sharedValues.has(dataName)) {
    return res.status(404).json({ error: "not found" });
  }

  return res.json({ [dataName]: sharedValues.get(dataName) });
});

// POST /api/:dataName with body { "value": <string|number> } -> { "<dataName>": <value> }
// creates or updates
app.post("/api/:dataName", (req, res) => {
  console.log("Post " + new Date().toISOString());
  const { dataName } = req.params;

  if (!isValidName(dataName)) {
    return res.status(400).json({ error: "invalid dataName" });
  }

  const value = normalizeValue(req.body?.value);
  if (value === null) {
    return res.status(400).json({ error: "value must be a string or a finite number" });
  }

  sharedValues.set(dataName, value);
  return res.json({ [dataName]: sharedValues.get(dataName) });
});

const PORT = 3009;
app.listen(PORT, () => console.log(`http://localhost:${PORT}`));