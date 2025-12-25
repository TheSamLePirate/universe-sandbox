import express from "express";
import cors from "cors";
import goveeRoutes from "./routes/goveeRoutes.js";
import staticDataRoutes from "./routes/staticDataRoutes.js";
import stateRoutes from "./routes/stateRoutes.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Mount specific API sub-routes
// These will capture /api/devices, /api/presets, etc.
app.use("/api", goveeRoutes);
app.use("/api", staticDataRoutes);

// Mount state routes at root because it handles /api (generic) and /apiR
// Since middleware executes in order, and govee/static routes are specific,
// they should match first. If they fail (fall through), or if the path is not specific (like /api/someVar),
// it will reach stateRoutes.
app.use("/", stateRoutes);

export default app;
