// Entry point — load env vars first, then start the server.
// dotenv/config is a no-op in production where Render injects env vars directly.
import "dotenv/config";
import app from "./app.js";

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`RegiSpot API listening on :${PORT}`));
