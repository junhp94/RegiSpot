/**
 * Integration tests — run against a real Postgres (DATABASE_URL env var).
 * Uses node:test (built into Node 18+) and node's built-in fetch.
 *
 * Run: DATABASE_URL=... node --test src/test/app.test.js
 *
 * Each test suite gets a fresh set of users/groups so tests are independent.
 */
import { before, after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "../../.env");

// dotenv MUST be loaded before the dynamic import of app.js below.
// Static imports (import app from ...) are hoisted before all module code,
// so they run before dotenv. Using a dynamic import here ensures DATABASE_URL
// is set before db.js initialises its pg.Pool.
try {
  const { default: dotenv } = await import("dotenv");
  dotenv.config({ path: envPath });
} catch { /* .env is optional in CI — env vars are injected directly */ }

// Dynamic import AFTER dotenv so db.js sees DATABASE_URL
const { default: app } = await import("../app.js");
const { vancouverToday, addDays } = await import("../lib/vancouverTime.js");

// Vancouver date offset from today — sessions must be inside the 5-day window to register.
const vanDate = (offsetDays) => addDays(vancouverToday(new Date()), offsetDays);

// Use the DIRECT (unpooled) connection for schema migration and test cleanup.
// PgBouncer in transaction mode (the pooled URL) rejects multi-statement queries
// and some session-level operations. The direct URL is safe for both.
const directPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
});

// Apply schema before all tests
const schema = readFileSync(join(__dirname, "../schema.sql"), "utf8");
await directPool.query(schema);

// Start the server on a random port
let server, BASE;
before(async () => {
  await new Promise((res) => {
    server = app.listen(0, () => {
      BASE = `http://localhost:${server.address().port}`;
      res();
    });
  });
});
after(async () => {
  server.close();
  await directPool.end();
});

// Helpers
async function api(method, path, body, token) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

// Clean up test data. Uses the direct pool to avoid PgBouncer multi-statement limits.
// Delete in FK order: signups → members → sessions → groups → users.
async function cleanup(emails) {
  for (const email of emails) {
    // Find the user id
    const r = await directPool.query("SELECT id FROM users WHERE lower(email)=lower($1)", [email]);
    if (!r.rows[0]) continue;
    const uid = r.rows[0].id;

    // Remove signups the user made in any session
    await directPool.query("DELETE FROM signups WHERE user_id=$1", [uid]);
    // Remove memberships in groups they didn't create
    await directPool.query("DELETE FROM members WHERE user_id=$1", [uid]);
    // Delete groups they own — cascades to members, sessions, signups
    await directPool.query("DELETE FROM groups WHERE owner_id=$1", [uid]);
    // Any orphaned sessions (shouldn't exist after cascade, but be safe)
    await directPool.query("DELETE FROM sessions WHERE created_by=$1", [uid]);
    // Finally remove the user
    await directPool.query("DELETE FROM users WHERE id=$1", [uid]);
  }
}

// ── register / login ──────────────────────────────────────────────────────────
describe("auth", async () => {
  const email = `test.auth.${Date.now()}@example.com`;
  after(() => cleanup([email]));

  it("register creates a user and returns a token", async () => {
    const r = await api("POST", "/auth/register", { email, password: "Password1!", name: "Tester" });
    assert.equal(r.status, 201);
    assert.ok(r.body.token);
    assert.equal(r.body.user.email, email);
  });

  it("duplicate email returns 409", async () => {
    const r = await api("POST", "/auth/register", { email, password: "Password1!", name: "Tester" });
    assert.equal(r.status, 409);
  });

  it("login returns a token", async () => {
    const r = await api("POST", "/auth/login", { email, password: "Password1!" });
    assert.equal(r.status, 200);
    assert.ok(r.body.token);
  });

  it("wrong password returns 401", async () => {
    const r = await api("POST", "/auth/login", { email, password: "wrong" });
    assert.equal(r.status, 401);
  });

  it("unauthenticated request to protected route returns 401", async () => {
    const r = await api("GET", "/users/me/groups");
    assert.equal(r.status, 401);
  });
});

// ── groups ────────────────────────────────────────────────────────────────────
describe("groups", async () => {
  const ownerEmail = `test.owner.${Date.now()}@example.com`;
  const memberEmail = `test.member.${Date.now()}@example.com`;
  let ownerToken, memberToken, groupId, accessCode;

  before(async () => {
    const r1 = await api("POST", "/auth/register", { email: ownerEmail, password: "Password1!", name: "Owner" });
    ownerToken = r1.body.token;
    const r2 = await api("POST", "/auth/register", { email: memberEmail, password: "Password1!", name: "Member" });
    memberToken = r2.body.token;
  });
  after(() => cleanup([ownerEmail, memberEmail]));

  it("create group", async () => {
    const r = await api("POST", "/groups", { groupName: "Test Group", sportType: "badminton", maxMembers: 50, nickname: "OwnerNick" }, ownerToken);
    assert.equal(r.status, 200);
    groupId = r.body.groupId;
    accessCode = r.body.accessCode;
    assert.ok(groupId);
    assert.match(accessCode, /^\d{6}$/);
  });

  it("get group returns accessCode to owner only", async () => {
    const r = await api("GET", `/groups/${groupId}`, null, ownerToken);
    assert.equal(r.status, 200);
    assert.ok(r.body.accessCode);
  });

  it("non-member gets 403 on getGroup", async () => {
    const r = await api("GET", `/groups/${groupId}`, null, memberToken);
    assert.equal(r.status, 403);
  });

  it("join group", async () => {
    const r = await api("POST", "/groups/join", { accessCode, nickname: "MemberNick" }, memberToken);
    assert.equal(r.status, 200);
    assert.equal(r.body.role, "member");
  });

  it("non-owner cannot create session", async () => {
    const r = await api("POST", `/groups/${groupId}/sessions`,
      { date: "2026-01-01", time: "10:00", location: "Court 1", capacity: 10 }, memberToken);
    assert.equal(r.status, 403);
  });

  it("nickname conflict returns 409", async () => {
    const email3 = `test.nick.${Date.now()}@example.com`;
    const r1 = await api("POST", "/auth/register", { email: email3, password: "Password1!", name: "Nick" });
    const r = await api("POST", "/groups/join", { accessCode, nickname: "MemberNick" }, r1.body.token);
    assert.equal(r.status, 409);
    assert.match(r.body.error, /nickname/i);
    await cleanup([email3]);
  });
});

// ── sessions & signups ────────────────────────────────────────────────────────
describe("sessions and signups", async () => {
  const ownerEmail = `test.sess.owner.${Date.now()}@example.com`;
  const memberEmail = `test.sess.member.${Date.now()}@example.com`;
  const thirdEmail = `test.sess.third.${Date.now()}@example.com`;
  let ownerToken, memberToken, groupId, accessCode, sessionId;

  before(async () => {
    const r1 = await api("POST", "/auth/register", { email: ownerEmail, password: "Password1!", name: "Owner" });
    ownerToken = r1.body.token;
    const r2 = await api("POST", "/auth/register", { email: memberEmail, password: "Password1!", name: "Member" });
    memberToken = r2.body.token;
    const rg = await api("POST", "/groups", { groupName: "Session Group", sportType: "badminton", maxMembers: 50, nickname: "Owner" }, ownerToken);
    groupId = rg.body.groupId;
    accessCode = rg.body.accessCode;
    await api("POST", "/groups/join", { accessCode, nickname: "MemberNick" }, memberToken);
  });
  after(() => cleanup([ownerEmail, memberEmail, thirdEmail]));

  it("owner creates session", async () => {
    const r = await api("POST", `/groups/${groupId}/sessions`,
      { date: vanDate(1), time: "20:00", location: "Court 1", capacity: 2 }, ownerToken);
    assert.equal(r.status, 200);
    sessionId = r.body.sessionId;
    assert.ok(sessionId);
  });

  it("member can sign up", async () => {
    const r = await api("POST", `/groups/${groupId}/sessions/${sessionId}/signup`, {}, memberToken);
    assert.equal(r.status, 200);
  });

  it("duplicate signup returns 409", async () => {
    const r = await api("POST", `/groups/${groupId}/sessions/${sessionId}/signup`, {}, memberToken);
    assert.equal(r.status, 409);
  });

  it("concurrent signups: only one succeeds for the last spot (capacity=2, one already signed up)", async () => {
    // capacity is 2, memberToken already signed up → 1 spot left
    // Owner signs up for it
    const r = await api("POST", `/groups/${groupId}/sessions/${sessionId}/signup`, {}, ownerToken);
    assert.equal(r.status, 200);

    // Owner tries again: duplicate → 409
    const dup = await api("POST", `/groups/${groupId}/sessions/${sessionId}/signup`, {}, ownerToken);
    assert.equal(dup.status, 409);

    // Now full — a third member goes on the waitlist instead of being refused
    const r3 = await api("POST", "/auth/register", { email: thirdEmail, password: "Password1!", name: "Third" });
    await api("POST", "/groups/join", { accessCode, nickname: "ThirdNick" }, r3.body.token);
    const wl = await api("POST", `/groups/${groupId}/sessions/${sessionId}/signup`, {}, r3.body.token);
    assert.equal(wl.status, 200);
    assert.deepEqual(wl.body, { status: "waitlisted", position: 1 });
  });

  it("unregister works", async () => {
    const r = await api("DELETE", `/groups/${groupId}/sessions/${sessionId}/signup`, null, memberToken);
    assert.equal(r.status, 200);
  });

  it("unregister when not registered returns 409", async () => {
    const r = await api("DELETE", `/groups/${groupId}/sessions/${sessionId}/signup`, null, memberToken);
    assert.equal(r.status, 409);
  });

  it("list signups", async () => {
    const r = await api("GET", `/groups/${groupId}/sessions/${sessionId}/signups`, null, ownerToken);
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body.registered));
    assert.ok(Array.isArray(r.body.waitlist));
  });
});

// Shared fixture helpers for the waitlist suites
function userIdOf(token) {
  const claims = token.split(".")[1];
  return JSON.parse(atob(claims.replace(/-/g, "+").replace(/_/g, "/"))).sub;
}

// Creates an owner + N members in a fresh group. Returns { owner, members, groupId, emails }.
async function makeGroup(tag, memberCount) {
  const stamp = `${Date.now()}.${Math.random().toString(36).slice(2, 7)}`;
  const emails = [`test.${tag}.owner.${stamp}@example.com`];
  const ro = await api("POST", "/auth/register", { email: emails[0], password: "Password1!", name: "Owner" });
  const owner = { token: ro.body.token, id: userIdOf(ro.body.token), nickname: "Owner" };
  const rg = await api("POST", "/groups", { groupName: `${tag} group`, sportType: "badminton", maxMembers: 50, nickname: "Owner" }, owner.token);
  const groupId = rg.body.groupId;
  const members = [];
  for (let i = 0; i < memberCount; i++) {
    const email = `test.${tag}.m${i}.${stamp}@example.com`;
    emails.push(email);
    const r = await api("POST", "/auth/register", { email, password: "Password1!", name: `M${i}` });
    const nickname = `Nick${i}`;
    await api("POST", "/groups/join", { accessCode: rg.body.accessCode, nickname }, r.body.token);
    members.push({ token: r.body.token, id: userIdOf(r.body.token), nickname });
  }
  return { owner, members, groupId, emails };
}

async function makeSession(g, fields) {
  const r = await api("POST", `/groups/${g.groupId}/sessions`, { location: "Court 1", ...fields }, g.owner.token);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.sessionId;
}

const signupPath = (g, sid) => `/groups/${g.groupId}/sessions/${sid}/signup`;
const signupsPath = (g, sid) => `/groups/${g.groupId}/sessions/${sid}/signups`;

// ── waitlist, order and day-of lock ──────────────────────────────────────────
describe("waitlist and lock", async () => {
  let g, S, T, F, P;
  let A, B, C, D;

  before(async () => {
    g = await makeGroup("wl", 5);
    [A, B, C, D] = g.members;
    S = await makeSession(g, { date: vanDate(1), time: "20:00", capacity: 2 });
    T = await makeSession(g, { date: vanDate(0), time: "23:59", capacity: 1 });
    F = await makeSession(g, { date: vanDate(10), time: "20:00", capacity: 5 });
    P = await makeSession(g, { date: vanDate(-1), time: "10:00", capacity: 5 });
  });
  after(() => cleanup(g.emails));

  it("A, B register as #1, #2; C waitlisted #1; D waitlisted #2", async () => {
    assert.deepEqual((await api("POST", signupPath(g, S), {}, A.token)).body, { status: "registered", position: 1 });
    assert.deepEqual((await api("POST", signupPath(g, S), {}, B.token)).body, { status: "registered", position: 2 });
    assert.deepEqual((await api("POST", signupPath(g, S), {}, C.token)).body, { status: "waitlisted", position: 1 });
    assert.deepEqual((await api("POST", signupPath(g, S), {}, D.token)).body, { status: "waitlisted", position: 2 });
  });

  it("GET /signups shows numbered lists", async () => {
    const r = await api("GET", signupsPath(g, S), null, A.token);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.registered.map((x) => x.position), [1, 2]);
    assert.deepEqual(r.body.registered.map((x) => x.nickname), [A.nickname, B.nickname]);
    assert.equal(r.body.waitlist[0].nickname, C.nickname);
    assert.equal(r.body.waitlist[0].userId, undefined, "userId is owner-only");
    const asOwner = await api("GET", signupsPath(g, S), null, g.owner.token);
    assert.equal(asOwner.body.waitlist[0].userId, C.id);
  });

  it("A unregisters the day before → C promoted to #2, D becomes waitlist #1", async () => {
    const r = await api("DELETE", signupPath(g, S), null, A.token);
    assert.equal(r.status, 200);
    const list = (await api("GET", signupsPath(g, S), null, B.token)).body;
    assert.deepEqual(list.registered.map((x) => [x.nickname, x.position]), [[B.nickname, 1], [C.nickname, 2]]);
    assert.deepEqual(list.waitlist.map((x) => [x.nickname, x.position]), [[D.nickname, 1]]);
  });

  it("A re-registers → waitlisted behind D (no queue jumping)", async () => {
    const r = await api("POST", signupPath(g, S), {}, A.token);
    assert.deepEqual(r.body, { status: "waitlisted", position: 2 });
  });

  it("locked: registered member on today's session cannot unregister", async () => {
    assert.equal((await api("POST", signupPath(g, T), {}, A.token)).body.status, "registered");
    const r = await api("DELETE", signupPath(g, T), null, A.token);
    assert.equal(r.status, 403);
    assert.equal(r.body.error, "You can't unregister on the day of the session.");
  });

  it("waitlisted member on today's session can leave on the day", async () => {
    assert.equal((await api("POST", signupPath(g, T), {}, B.token)).body.status, "waitlisted");
    const r = await api("DELETE", signupPath(g, T), null, B.token);
    assert.equal(r.status, 200);
  });

  it("session more than 5 days out is not open yet", async () => {
    const r = await api("POST", signupPath(g, F), {}, A.token);
    assert.equal(r.status, 403);
    assert.equal(r.body.error, "Registration hasn't opened yet");
  });

  it("past session is closed", async () => {
    const r = await api("POST", signupPath(g, P), {}, A.token);
    assert.equal(r.status, 409);
    assert.equal(r.body.error, "This session is closed");
  });

  it("signed_up_count equals registered rows", async () => {
    for (const sid of [S, T]) {
      const c = await directPool.query(
        `SELECT s.signed_up_count AS n,
                (SELECT count(*)::int FROM signups WHERE session_id = s.id AND status = 'registered') AS r
         FROM sessions s WHERE id = $1`, [sid]);
      assert.equal(c.rows[0].n, c.rows[0].r);
    }
  });
});

// ── members: kick & leave cleanup ────────────────────────────────────────────
describe("kick and leave cleanup", async () => {
  const ownerEmail = `test.kick.owner.${Date.now()}@example.com`;
  const memberEmail = `test.kick.member.${Date.now()}@example.com`;
  let ownerToken, memberToken, groupId, accessCode, sessionId, memberId;

  before(async () => {
    const r1 = await api("POST", "/auth/register", { email: ownerEmail, password: "Password1!", name: "Owner" });
    ownerToken = r1.body.token;
    const r2 = await api("POST", "/auth/register", { email: memberEmail, password: "Password1!", name: "Member" });
    memberToken = r2.body.token;
    // Extract userId from JWT payload (base64url decode the claims section)
    const claims = r2.body.token?.split(".")[1];
    if (claims) {
      const payload = JSON.parse(atob(claims.replace(/-/g, "+").replace(/_/g, "/")));
      memberId = payload.sub;
    }

    const rg = await api("POST", "/groups", { groupName: "Kick Group", sportType: "badminton", maxMembers: 50, nickname: "Owner" }, ownerToken);
    groupId = rg.body.groupId;
    accessCode = rg.body.accessCode;
    await api("POST", "/groups/join", { accessCode, nickname: "MemberNick" }, memberToken);

    const rs = await api("POST", `/groups/${groupId}/sessions`,
      { date: vanDate(1), time: "20:00", location: "Court 1", capacity: 10 }, ownerToken);
    sessionId = rs.body.sessionId;
    // Member signs up
    await api("POST", `/groups/${groupId}/sessions/${sessionId}/signup`, {}, memberToken);
  });
  after(() => cleanup([ownerEmail, memberEmail]));

  it("non-owner gets 403 trying to kick", async () => {
    const r = await api("DELETE", `/groups/${groupId}/members/${memberId}`, null, memberToken);
    assert.equal(r.status, 403);
  });

  it("kick removes member and their signups", async () => {
    const r = await api("DELETE", `/groups/${groupId}/members/${memberId}`, null, ownerToken);
    assert.equal(r.status, 200);

    // Verify signup count decremented
    const sess = await directPool.query("SELECT signed_up_count FROM sessions WHERE id=$1", [sessionId]);
    assert.equal(sess.rows[0].signed_up_count, 0);
  });

  it("owner cannot leave", async () => {
    const r = await api("POST", `/groups/${groupId}/members/leave`, {}, ownerToken);
    assert.equal(r.status, 400);
  });
});
