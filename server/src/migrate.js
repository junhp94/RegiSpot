/**
 * migrate.js — apply schema.sql to the database on every startup.
 * Running this repeatedly is safe because every statement uses IF NOT EXISTS.
 * Render's free tier starts the process fresh on each deploy, so this
 * guarantees the schema is always up to date without a separate migration step.
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import pg from "pg";

// Support running standalone ("node src/migrate.js") or via import from index.js
const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env only when running directly (not in production where env vars are injected)
if (process.env.NODE_ENV !== "production") {
  const { default: dotenv } = await import("dotenv");
  dotenv.config({ path: join(__dirname, "../.env") });
}

const sql = readFileSync(join(__dirname, "schema.sql"), "utf8");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log("✓ Schema applied");
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
