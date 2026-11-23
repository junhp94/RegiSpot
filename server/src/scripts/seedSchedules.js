/**
 * One-off, idempotent seed of 밴민턴's two weekly schedules.
 * Run: npm run seed:schedules   (from server/)
 * Re-running is safe: a weekday that already has a schedule is skipped.
 */
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { randomBytes } from "crypto";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
if (process.env.NODE_ENV !== "production") {
  const { default: dotenv } = await import("dotenv");
  dotenv.config({ path: join(__dirname, "../../.env") });
}

const GROUP_ID = "SipoHV4S"; // 밴민턴
const LOCATION = "Belvedere club, Richmond, BC";
const SCHEDULES = [
  { weekday: 2, name: "Tuesday", start: "20:00", end: "22:00", courts: 2, capacity: 13 },
  { weekday: 0, name: "Sunday", start: "18:00", end: "20:00", courts: 3, capacity: 18 },
];

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL });

try {
  const g = await pool.query("SELECT name FROM groups WHERE id = $1", [GROUP_ID]);
  if (!g.rows[0]) {
    console.error(`Group ${GROUP_ID} not found — nothing seeded.`);
    process.exitCode = 1;
  } else {
    for (const s of SCHEDULES) {
      const exists = await pool.query(
        "SELECT 1 FROM schedules WHERE group_id = $1 AND weekday = $2", [GROUP_ID, s.weekday]
      );
      if (exists.rows[0]) {
        console.log(`${s.name}: exists`);
        continue;
      }
      await pool.query(
        `INSERT INTO schedules (id, group_id, weekday, start_time, end_time, location, court_count, capacity, open_days_before)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 5)`,
        [randomBytes(6).toString("base64url"), GROUP_ID, s.weekday, s.start, s.end, LOCATION, s.courts, s.capacity]
      );
      console.log(`${s.name}: inserted`);
    }
  }
} finally {
  await pool.end();
}
