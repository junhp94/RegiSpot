/**
 * Reset a user's password (for members who forgot theirs).
 * Run (from server/): npm run reset-password -- <email> <newPassword>
 * Uses DATABASE_URL from server/.env, so it acts on whichever DB that points at.
 */
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import pg from "pg";
import { resetPassword } from "../lib/resetPassword.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
if (process.env.NODE_ENV !== "production") {
  const { default: dotenv } = await import("dotenv");
  dotenv.config({ path: join(__dirname, "../../.env") });
}

const [email, newPassword] = process.argv.slice(2);
if (!email || !newPassword) {
  console.error("Usage: npm run reset-password -- <email> <newPassword>");
  process.exitCode = 1;
} else {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL });
  try {
    const { email: stored } = await resetPassword(pool, email, newPassword);
    console.log(`Password reset for ${stored}`);
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
