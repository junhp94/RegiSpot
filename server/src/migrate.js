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
import bcrypt from "bcryptjs";

// Support running standalone ("node src/migrate.js") or via import from index.js
const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env only when running directly (not in production where env vars are injected)
if (process.env.NODE_ENV !== "production") {
  const { default: dotenv } = await import("dotenv");
  dotenv.config({ path: join(__dirname, "../.env") });
}

const sql = readFileSync(join(__dirname, "schema.sql"), "utf8");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Create (or update) the default admin account from env vars.
 * ADMIN_USERNAME / ADMIN_PASSWORD live only in Render's env — never in the repo.
 * The username is stored in the email column; it has no "@", so it can never
 * collide with a normal signup (register requires an email).
 * Re-running updates the password, so changing ADMIN_PASSWORD + redeploying resets it.
 */
async function seedAdmin(client) {
  const username = (process.env.ADMIN_USERNAME || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";
  if (!username || !password) return;
  const hash = await bcrypt.hash(password, 10);
  await client.query(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
     ON CONFLICT ((lower(email))) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [username, "Admin", hash]
  );
  console.log(`✓ Admin account ready (${username})`);
}

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log("✓ Schema applied");
    await seedAdmin(client);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
