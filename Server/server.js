import https from "node:https";
import app from "./app.js";
import { PORT, getSSLOptions } from "./config.js";

try {
  const sslOptions = getSSLOptions();
  https.createServer(sslOptions, app).listen(PORT, "0.0.0.0", () => {
    console.log(`https://localhost:${PORT}`);
  });
} catch (error) {
  console.error("Failed to start server:", error);
  process.exit(1);
}

//app.listen(PORT, () => console.log(`https://localhost:${PORT}`));