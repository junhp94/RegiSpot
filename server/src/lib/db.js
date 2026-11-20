/**
 * Shared pg Pool for the whole server.
 * A Pool reuses TCP connections across requests, which matters on a long-running
 * Express server (unlike Lambda which creates a new connection per invocation).
 * Neon's pooled connection string (port 5432 on pooler.neon.tech) is preferred
 * over the direct string — it multiplexes many app connections onto fewer
 * Postgres backend connections, staying within Neon's free-tier limit.
 */
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  // Neon closes idle connections after ~5 min; keep the pool small so we
  // don't exhaust the free-tier connection limit (10 on Neon free).
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export default pool;
