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

process.env.NODE_ENV = "test"; // disables the auth rate limiter for this suite

// Dynamic import AFTER dotenv so db.js sees DATABASE_URL
const { default: app } = await import("../app.js");
const { vancouverToday, addDays, weekdayOf } = await import("../lib/vancouverTime.js");

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

    // Remove guests they added, then signups the user made in any session
    await directPool.query("DELETE FROM signups WHERE added_by=$1", [uid]);
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

// ── change password ───────────────────────────────────────────────────────────
describe("change password", async () => {
  const ts = Date.now();
  const email = `cp-${ts}@test.com`;
  const goneEmail = `cp-gone-${ts}@test.com`;
  let token;
  before(async () => {
    const r = await api("POST", "/auth/register", { email, password: "oldpass123", name: "CP" });
    token = r.body.token;
  });
  after(() => cleanup([email, goneEmail]));

  it("wrong current password → 401", async () => {
    const r = await api("POST", "/auth/change-password",
      { currentPassword: "nope-nope", newPassword: "newpass456" }, token);
    assert.equal(r.status, 401);
    assert.equal(r.body.error, "Current password is incorrect");
  });

  it("short new password → 400", async () => {
    const r = await api("POST", "/auth/change-password",
      { currentPassword: "oldpass123", newPassword: "short" }, token);
    assert.equal(r.status, 400);
  });

  it("missing currentPassword → 400", async () => {
    const r = await api("POST", "/auth/change-password", { newPassword: "whatever99" }, token);
    assert.equal(r.status, 400);
  });

  it("no token → 401", async () => {
    const r = await api("POST", "/auth/change-password",
      { currentPassword: "oldpass123", newPassword: "newpass456" });
    assert.equal(r.status, 401);
  });

  it("changes password; new works, old fails", async () => {
    const r = await api("POST", "/auth/change-password",
      { currentPassword: "oldpass123", newPassword: "newpass456" }, token);
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal((await api("POST", "/auth/login", { email, password: "newpass456" })).status, 200);
    assert.equal((await api("POST", "/auth/login", { email, password: "oldpass123" })).status, 401);
  });

  it("admin account → 403 (password is managed by ADMIN_PASSWORD on Render)", async () => {
    const adminName = `cpadmin${ts}`;
    const hash = (await directPool.query("SELECT password_hash FROM users WHERE lower(email)=lower($1)", [email])).rows[0].password_hash;
    await directPool.query("INSERT INTO users (email, name, password_hash) VALUES ($1, 'Admin', $2)", [adminName, hash]);
    const prev = process.env.ADMIN_USERNAME;
    process.env.ADMIN_USERNAME = adminName;
    try {
      const login = await api("POST", "/auth/login", { email: adminName, password: "newpass456" });
      const r = await api("POST", "/auth/change-password",
        { currentPassword: "newpass456", newPassword: "another789" }, login.body.token);
      assert.equal(r.status, 403);
    } finally {
      if (prev === undefined) delete process.env.ADMIN_USERNAME; else process.env.ADMIN_USERNAME = prev;
      await cleanup([adminName]);
    }
  });

  it("deleted user → 404", async () => {
    const reg = await api("POST", "/auth/register", { email: goneEmail, password: "oldpass123", name: "Gone" });
    await directPool.query("DELETE FROM users WHERE lower(email)=lower($1)", [goneEmail]);
    const r = await api("POST", "/auth/change-password",
      { currentPassword: "oldpass123", newPassword: "newpass456" }, reg.body.token);
    assert.equal(r.status, 404);
  });
});

// ── admin reset-password script ───────────────────────────────────────────────
describe("reset password script", async () => {
  const ts = Date.now();
  const email = `rp-${ts}@test.com`;
  const adminId = `rpadmin${ts}`;
  let resetPassword;
  before(async () => {
    ({ resetPassword } = await import("../lib/resetPassword.js"));
    await api("POST", "/auth/register", { email, password: "oldpass123", name: "RP" });
    await directPool.query(
      "INSERT INTO users (email, name, password_hash) VALUES ($1, 'Admin', 'x')", [adminId]);
  });
  after(() => cleanup([email, adminId]));

  it("short password rejected, hash unchanged", async () => {
    await assert.rejects(resetPassword(directPool, email, "short"), /at least 8/);
    assert.equal((await api("POST", "/auth/login", { email, password: "oldpass123" })).status, 200);
  });

  it("unknown email rejected", async () => {
    await assert.rejects(resetPassword(directPool, `nobody-${ts}@test.com`, "temp12345"), /No user/);
  });

  it("resets password, case-insensitive email", async () => {
    const r = await resetPassword(directPool, email.toUpperCase(), "temp12345");
    assert.equal(r.email, email);
    assert.equal((await api("POST", "/auth/login", { email, password: "temp12345" })).status, 200);
  });

  it("refuses the admin username (no @) — its password is reseeded from Render on boot", async () => {
    await assert.rejects(resetPassword(directPool, adminId, "adminpass99"), /ADMIN_PASSWORD/);
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

// ── owner controls: remove from session, add court ───────────────────────────
describe("owner controls", async () => {
  let g, today, wide;

  before(async () => {
    g = await makeGroup("own", 6);
    today = await makeSession(g, { date: vanDate(0), time: "23:59", capacity: 1 });
    wide = await makeSession(g, { date: vanDate(1), time: "20:00", capacity: 2, courtCount: 1 });
  });
  after(() => cleanup(g.emails));

  it("owner removes a registered member on the session day → waitlist #1 promoted", async () => {
    const [m0, m1] = g.members;
    await api("POST", signupPath(g, today), {}, m0.token);
    await api("POST", signupPath(g, today), {}, m1.token);
    const r = await api("DELETE", `/groups/${g.groupId}/sessions/${today}/signups/${m0.id}`, null, g.owner.token);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { removed: true, promoted: 1 });
    const list = (await api("GET", signupsPath(g, today), null, g.owner.token)).body;
    assert.deepEqual(list.registered.map((x) => x.nickname), [m1.nickname]);
    assert.equal(list.waitlist.length, 0);
  });

  it("non-owner cannot remove → 403", async () => {
    const [, m1, m2] = g.members;
    const r = await api("DELETE", `/groups/${g.groupId}/sessions/${today}/signups/${m1.id}`, null, m2.token);
    assert.equal(r.status, 403);
  });

  it("removing someone not signed up → 404", async () => {
    const r = await api("DELETE", `/groups/${g.groupId}/sessions/${today}/signups/${g.members[5].id}`, null, g.owner.token);
    assert.equal(r.status, 404);
  });

  it("add court: capacity 2 with 3 waitlisted → capacity 8, courtCount 2, 3 promoted", async () => {
    for (const m of g.members.slice(0, 5)) await api("POST", signupPath(g, wide), {}, m.token);
    const r = await api("POST", `/groups/${g.groupId}/sessions/${wide}/add-court`, {}, g.owner.token);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { courtCount: 2, capacity: 8, promoted: 3 });
    const list = (await api("GET", signupsPath(g, wide), null, g.owner.token)).body;
    assert.equal(list.registered.length, 5);
    assert.equal(list.waitlist.length, 0);
  });

  it("non-owner add-court → 403", async () => {
    const r = await api("POST", `/groups/${g.groupId}/sessions/${wide}/add-court`, {}, g.members[0].token);
    assert.equal(r.status, 403);
  });
});

// ── kick / leave with a waitlist ─────────────────────────────────────────────
describe("kick and leave respect the waitlist", async () => {
  let g, sid, X, Y, Z;

  before(async () => {
    g = await makeGroup("kwl", 3);
    [X, Y, Z] = g.members;
    sid = await makeSession(g, { date: vanDate(1), time: "20:00", capacity: 1 });
    await api("POST", signupPath(g, sid), {}, X.token); // registered
    await api("POST", signupPath(g, sid), {}, Y.token); // waitlisted
  });
  after(() => cleanup(g.emails));

  const count = async () =>
    (await directPool.query("SELECT signed_up_count FROM sessions WHERE id=$1", [sid])).rows[0].signed_up_count;

  it("kick waitlisted Y → count stays 1, X still registered", async () => {
    const r = await api("DELETE", `/groups/${g.groupId}/members/${Y.id}`, null, g.owner.token);
    assert.equal(r.status, 200);
    assert.equal(await count(), 1);
    const list = (await api("GET", signupsPath(g, sid), null, g.owner.token)).body;
    assert.deepEqual(list.registered.map((x) => x.nickname), [X.nickname]);
    assert.equal(list.waitlist.length, 0);
  });

  it("Z leaves the group while waitlisted → count stays 1", async () => {
    await api("POST", signupPath(g, sid), {}, Z.token);
    const r = await api("POST", `/groups/${g.groupId}/members/leave`, {}, Z.token);
    assert.equal(r.status, 200);
    assert.equal(await count(), 1);
  });

  it("kick registered X → next waitlisted promoted, count 1", async () => {
    // Re-add a waitlister: the owner signs up behind X
    assert.equal((await api("POST", signupPath(g, sid), {}, g.owner.token)).body.status, "waitlisted");
    const r = await api("DELETE", `/groups/${g.groupId}/members/${X.id}`, null, g.owner.token);
    assert.equal(r.status, 200);
    assert.equal(await count(), 1);
    const list = (await api("GET", signupsPath(g, sid), null, g.owner.token)).body;
    assert.deepEqual(list.registered.map((x) => x.nickname), ["Owner"]);
  });
});

// ── weekly schedules & generation ────────────────────────────────────────────
describe("schedules", async () => {
  let g, scheduleId;
  const w = weekdayOf(vanDate(2));
  const base = (g) => `/groups/${g.groupId}/schedules`;
  const rows = async () =>
    (await directPool.query(
      "SELECT id, date, location FROM sessions WHERE schedule_id=$1 ORDER BY date", [scheduleId])).rows;

  before(async () => { g = await makeGroup("sch", 1); });
  after(() => cleanup(g.emails));

  it("member cannot create a schedule → 403", async () => {
    const r = await api("POST", base(g), { weekday: w, startTime: "20:00", endTime: "22:00", location: "Gym", courtCount: 2, capacity: 13 }, g.members[0].token);
    assert.equal(r.status, 403);
  });

  it("invalid weekday 7 → 400", async () => {
    const r = await api("POST", base(g), { weekday: 7, startTime: "20:00", endTime: "22:00", location: "Gym", courtCount: 2, capacity: 13 }, g.owner.token);
    assert.equal(r.status, 400);
  });

  it("owner creates a schedule; GET sessions generates the next 4 weeks", async () => {
    const r = await api("POST", base(g), { weekday: w, startTime: "20:00", endTime: "22:00", location: "Gym", courtCount: 2, capacity: 13 }, g.owner.token);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    scheduleId = r.body.id;
    assert.equal(r.body.openDaysBefore, 5);
    assert.equal(r.body.active, true);
    await api("GET", `/groups/${g.groupId}/sessions`, null, g.owner.token);
    const list = await rows();
    assert.deepEqual(list.map((x) => x.date), [vanDate(2), vanDate(9), vanDate(16), vanDate(23)]);
    const first = (await directPool.query("SELECT * FROM sessions WHERE id=$1", [list[0].id])).rows[0];
    assert.equal(first.time, "20:00");
    assert.equal(first.end_time, "22:00");
    assert.equal(first.capacity, 13);
    assert.equal(first.court_count, 2);
  });

  it("generation is idempotent", async () => {
    await api("GET", `/groups/${g.groupId}/sessions`, null, g.members[0].token);
    assert.equal((await rows()).length, 4);
  });

  it("GET schedules lists it", async () => {
    const r = await api("GET", base(g), null, g.members[0].token);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.map((x) => [x.weekday, x.startTime, x.capacity]), [[w, "20:00", 13]]);
  });

  it("PATCH location updates future sessions without signups, not one with a signup", async () => {
    const first = (await rows())[0];
    assert.equal((await api("POST", signupPath(g, first.id), {}, g.members[0].token)).status, 200);
    const r = await api("PATCH", `${base(g)}/${scheduleId}`, { location: "New Gym" }, g.owner.token);
    assert.equal(r.status, 200);
    assert.deepEqual((await rows()).map((x) => x.location), ["Gym", "New Gym", "New Gym", "New Gym"]);
  });

  it("changing weekday moves future empty sessions to the new day", async () => {
    const w2 = weekdayOf(vanDate(3));
    const r = await api("PATCH", `${base(g)}/${scheduleId}`, { weekday: w2 }, g.owner.token);
    assert.equal(r.status, 200);
    await api("GET", `/groups/${g.groupId}/sessions`, null, g.owner.token);
    // the signed-up vanDate(2) session stays; the rest move to the new weekday
    assert.deepEqual((await rows()).map((x) => x.date), [vanDate(2), vanDate(3), vanDate(10), vanDate(17), vanDate(24)]);
    await api("PATCH", `${base(g)}/${scheduleId}`, { weekday: w }, g.owner.token);
  });

  it("pausing deletes future empty sessions, keeps one with a signup, and stops generation", async () => {
    const r = await api("PATCH", `${base(g)}/${scheduleId}`, { active: false }, g.owner.token);
    assert.equal(r.status, 200);
    assert.equal(r.body.active, false);
    assert.deepEqual((await rows()).map((x) => x.date), [vanDate(2)]);
    await api("GET", `/groups/${g.groupId}/sessions`, null, g.owner.token);
    assert.equal((await rows()).length, 1);
  });
});

// ── session views, fields, edit and cancel ──────────────────────────────────
describe("session views", async () => {
  let g, open1, far, past, today, gen2, scheduleId;
  const list = (g, token, view) =>
    api("GET", `/groups/${g.groupId}/sessions${view ? `?view=${view}` : ""}`, null, token);

  before(async () => {
    g = await makeGroup("view", 2);
    open1 = await makeSession(g, { date: vanDate(1), time: "20:00", endTime: "22:00", capacity: 1 });
    far = await makeSession(g, { date: vanDate(10), time: "20:00", capacity: 5 });
    past = await makeSession(g, { date: vanDate(-1), time: "10:00", capacity: 5 });
    today = await makeSession(g, { date: vanDate(0), time: "23:59", capacity: 5 });
    const sc = await api("POST", `/groups/${g.groupId}/schedules`,
      { weekday: weekdayOf(vanDate(2)), startTime: "18:00", endTime: "20:00", location: "Gym", courtCount: 3, capacity: 18 }, g.owner.token);
    scheduleId = sc.body.id;
    await list(g, g.owner.token);
    gen2 = (await directPool.query("SELECT id FROM sessions WHERE schedule_id=$1 AND date=$2", [scheduleId, vanDate(2)])).rows[0].id;
  });
  after(() => cleanup(g.emails));

  it("member sees only visible, not-ended, not-cancelled sessions", async () => {
    const r = await list(g, g.members[0].token, "past"); // view is ignored for members
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.map((x) => x.id).sort(), [open1, today, gen2].sort());
  });

  it("owner views split upcoming / scheduled / past", async () => {
    const up = (await list(g, g.owner.token)).body.map((x) => x.id);
    assert.deepEqual(up, [today, open1, gen2]);
    const sch = (await list(g, g.owner.token, "scheduled")).body.map((x) => x.id);
    assert.ok(sch.includes(far));
    assert.equal(sch.length, 4, "far + 3 later generated weeks");
    const pst = (await list(g, g.owner.token, "past")).body.map((x) => x.id);
    assert.deepEqual(pst, [past]);
  });

  it("item fields: endTime, waitlist counts, my position, lock", async () => {
    const [m0, m1] = g.members;
    await api("POST", signupPath(g, open1), {}, m0.token);
    await api("POST", signupPath(g, open1), {}, m1.token);
    const items = (await list(g, m1.token)).body;
    const s = items.find((x) => x.id === open1);
    assert.equal(s.endTime, "22:00");
    assert.equal(s.signedUpCount, 1);
    assert.equal(s.waitlistCount, 1);
    assert.equal(s.myStatus, "waitlisted");
    assert.equal(s.myPosition, 1);
    assert.equal(s.locked, false);
    assert.equal(s.visible, true);
    assert.equal(s.ended, false);
    assert.equal(s.cancelled, false);
    assert.equal(typeof s.opensAt, "string");
    assert.equal(items.find((x) => x.id === today).locked, true);
    assert.equal(items.find((x) => x.id === gen2).scheduleId, scheduleId);
    const mine = (await list(g, m0.token)).body.find((x) => x.id === open1);
    assert.deepEqual([mine.myStatus, mine.myPosition], ["registered", 1]);
  });

  it("cancel a generated session → hidden from members, marked for owner, not regenerated", async () => {
    const r = await api("PATCH", `/groups/${g.groupId}/sessions/${gen2}`, { cancelled: true }, g.owner.token);
    assert.equal(r.status, 200);
    assert.equal(r.body.cancelled, true);
    assert.ok(!(await list(g, g.members[0].token)).body.some((x) => x.id === gen2));
    const own = (await list(g, g.owner.token)).body.find((x) => x.id === gen2);
    assert.equal(own.cancelled, true);
    const n = await directPool.query("SELECT count(*)::int AS n FROM sessions WHERE schedule_id=$1 AND date=$2", [scheduleId, vanDate(2)]);
    assert.equal(n.rows[0].n, 1);
  });

  it("cancelled session refuses signups", async () => {
    const r = await api("POST", signupPath(g, gen2), {}, g.members[0].token);
    assert.equal(r.status, 409);
  });

  it("PATCH edits location and time", async () => {
    const r = await api("PATCH", `/groups/${g.groupId}/sessions/${far}`, { location: "Hall B", time: "19:30", endTime: "21:30" }, g.owner.token);
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.location, r.body.time, r.body.endTime], ["Hall B", "19:30", "21:30"]);
  });

  it("non-owner PATCH → 403; PATCH past session → 409", async () => {
    assert.equal((await api("PATCH", `/groups/${g.groupId}/sessions/${far}`, { location: "X" }, g.members[0].token)).status, 403);
    assert.equal((await api("PATCH", `/groups/${g.groupId}/sessions/${past}`, { location: "X" }, g.owner.token)).status, 409);
  });

  it("DELETE a generated session → 409", async () => {
    const r = await api("DELETE", `/groups/${g.groupId}/sessions/${gen2}`, null, g.owner.token);
    assert.equal(r.status, 409);
    assert.equal(r.body.error, "Cancel generated sessions instead of deleting them");
  });
});

// ── final-review fixes ───────────────────────────────────────────────────────
describe("review fixes", async () => {
  let g, today, past;

  before(async () => {
    g = await makeGroup("fix", 6);
    today = await makeSession(g, { date: vanDate(0), time: "23:59", capacity: 1 });
    past = await makeSession(g, { date: vanDate(-1), time: "10:00", capacity: 5 });
  });
  after(() => cleanup(g.emails));

  it("leaving the group on the session day while registered is refused", async () => {
    const m = g.members[0];
    assert.equal((await api("POST", signupPath(g, today), {}, m.token)).body.status, "registered");
    const r = await api("POST", `/groups/${g.groupId}/members/leave`, {}, m.token);
    assert.equal(r.status, 403);
    assert.equal(r.body.error, "You can't leave the group on the day of a session where you or your guest are registered.");
  });

  it("leaving keeps past-session history", async () => {
    const m = g.members[1];
    await directPool.query(
      "INSERT INTO signups (session_id, user_id, nickname, status, registered_at) VALUES ($1,$2,$3,'registered',now())",
      [past, m.id, m.nickname]);
    await directPool.query("UPDATE sessions SET signed_up_count = signed_up_count + 1 WHERE id=$1", [past]);
    const r = await api("POST", `/groups/${g.groupId}/members/leave`, {}, m.token);
    assert.equal(r.status, 200);
    const left = await directPool.query("SELECT 1 FROM signups WHERE session_id=$1 AND user_id=$2", [past, m.id]);
    assert.equal(left.rowCount, 1);
  });

  it("POST session with a non-HH:MM time or bad date → 400", async () => {
    const r1 = await api("POST", `/groups/${g.groupId}/sessions`, { date: vanDate(1), time: "7:00 PM", location: "X", capacity: 5 }, g.owner.token);
    assert.equal(r1.status, 400);
    const r2 = await api("POST", `/groups/${g.groupId}/sessions`, { date: "next tuesday", time: "19:00", location: "X", capacity: 5 }, g.owner.token);
    assert.equal(r2.status, 400);
  });

  it("a malformed legacy row doesn't break GET /sessions", async () => {
    await directPool.query(
      `INSERT INTO sessions (id, group_id, date, time, location, capacity, created_by)
       VALUES ($1, $2, $3, '7:00 PM', 'Legacy', 5, $4)`,
      [`lg${Math.random().toString(36).slice(2, 12)}`, g.groupId, vanDate(1), g.owner.id]);
    for (const view of ["upcoming", "scheduled", "past"]) {
      const r = await api("GET", `/groups/${g.groupId}/sessions?view=${view}`, null, g.owner.token);
      assert.equal(r.status, 200, `${view}: ${JSON.stringify(r.body)}`);
    }
    assert.equal((await api("GET", `/groups/${g.groupId}/sessions`, null, g.members[2].token)).status, 200);
  });

  it("players promoted together keep their waitlist order", async () => {
    const sid = await makeSession(g, { date: vanDate(1), time: "20:00", capacity: 1, courtCount: 1 });
    const ms = g.members.slice(2, 6);
    for (const m of ms) await api("POST", signupPath(g, sid), {}, m.token);
    await api("POST", `/groups/${g.groupId}/sessions/${sid}/add-court`, {}, g.owner.token);
    const list = (await api("GET", signupsPath(g, sid), null, g.owner.token)).body;
    assert.deepEqual(list.registered.map((x) => x.nickname), ms.map((m) => m.nickname));
    for (const [i, m] of ms.entries()) {
      const item = (await api("GET", `/groups/${g.groupId}/sessions`, null, m.token)).body.find((x) => x.id === sid);
      assert.equal(item.myPosition, i + 1, m.nickname);
    }
  });
});

// ── signups schema: surrogate id + guest rows ────────────────────────────────
describe("signups schema", async () => {
  let g, sid;

  before(async () => {
    g = await makeGroup("schema", 1);
    sid = await makeSession(g, { date: vanDate(1), time: "20:00", capacity: 5 });
  });
  after(() => cleanup(g.emails));

  it("schema.sql applies twice without error", async () => {
    await directPool.query(schema);
    await directPool.query(schema);
  });

  it("existing-style member insert without id gets an id", async () => {
    const r = await directPool.query(
      "INSERT INTO signups (session_id, user_id, nickname) VALUES ($1,$2,$3) RETURNING id",
      [sid, g.members[0].id, g.members[0].nickname]);
    assert.ok(r.rows[0].id);
  });

  it("duplicate member signup for the same session raises 23505", async () => {
    await assert.rejects(
      directPool.query("INSERT INTO signups (session_id, user_id, nickname) VALUES ($1,$2,$3)",
        [sid, g.members[0].id, g.members[0].nickname]),
      (err) => err.code === "23505");
  });

  it("guest row with user_id NULL, guest_name and added_by is accepted", async () => {
    const r = await directPool.query(
      "INSERT INTO signups (session_id, user_id, nickname, guest_name, added_by) VALUES ($1,NULL,'Min','Min',$2) RETURNING id",
      [sid, g.members[0].id]);
    assert.ok(r.rows[0].id);
  });

  it("row with both user_id and guest_name is rejected by the CHECK", async () => {
    await assert.rejects(
      directPool.query(
        "INSERT INTO signups (session_id, user_id, nickname, guest_name, added_by) VALUES ($1,$2,'X','X',$2)",
        [sid, g.owner.id]),
      (err) => err.code === "23514");
  });
});

// ── guests ───────────────────────────────────────────────────────────────────
describe("guests", async () => {
  let g, H, O; // host, other member
  const guestPath = (sid, gid) => `/groups/${g.groupId}/sessions/${sid}/guests/${gid}`;
  const addGuest = (sid, token, guestName) => api("POST", signupPath(g, sid), { guestName }, token);

  before(async () => {
    g = await makeGroup("guest", 3);
    [H, O] = g.members;
  });
  after(() => cleanup(g.emails));

  it("member registers a guest → registered #2, list shows guest of host", async () => {
    const sid = await makeSession(g, { date: vanDate(1), time: "20:00", capacity: 3 });
    await api("POST", signupPath(g, sid), {}, H.token);
    const r = await addGuest(sid, H.token, "Minji");
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.status, "registered");
    assert.equal(r.body.position, 2);
    assert.ok(r.body.guestId);
    const list = (await api("GET", signupsPath(g, sid), null, O.token)).body;
    const row = list.registered[1];
    assert.deepEqual([row.nickname, row.isGuest, row.guestOf], ["Minji", true, H.nickname]);
    assert.equal(row.guestId, undefined, "guestId hidden from other members");
    assert.equal(list.registered[0].isGuest, false);
    const hostView = (await api("GET", signupsPath(g, sid), null, H.token)).body;
    assert.equal(hostView.registered[1].guestId, r.body.guestId);
  });

  it("guest goes to the waitlist when full and is promoted after add-court", async () => {
    const sid = await makeSession(g, { date: vanDate(1), time: "20:00", capacity: 1, courtCount: 1 });
    await api("POST", signupPath(g, sid), {}, O.token);
    const r = await addGuest(sid, H.token, "Jisoo");
    assert.deepEqual([r.body.status, r.body.position], ["waitlisted", 1]);
    const ac = await api("POST", `/groups/${g.groupId}/sessions/${sid}/add-court`, {}, g.owner.token);
    assert.equal(ac.body.promoted, 1);
    const list = (await api("GET", signupsPath(g, sid), null, H.token)).body;
    assert.deepEqual(list.registered.map((x) => x.nickname), [O.nickname, "Jisoo"]);
  });

  it("same host, two guests named Min → removing one by guestId leaves the other", async () => {
    const sid = await makeSession(g, { date: vanDate(1), time: "20:00", capacity: 5 });
    const a = (await addGuest(sid, H.token, "Min")).body;
    const b = (await addGuest(sid, H.token, "Min")).body;
    assert.notEqual(a.guestId, b.guestId);
    const r = await api("DELETE", guestPath(sid, a.guestId), null, H.token);
    assert.equal(r.status, 200);
    const list = (await api("GET", signupsPath(g, sid), null, H.token)).body;
    assert.deepEqual(list.registered.map((x) => x.guestId), [b.guestId]);
  });

  it("host unregistering themselves leaves their guest registered", async () => {
    const sid = await makeSession(g, { date: vanDate(1), time: "20:00", capacity: 5 });
    await api("POST", signupPath(g, sid), {}, H.token);
    await addGuest(sid, H.token, "Yuna");
    assert.equal((await api("DELETE", signupPath(g, sid), null, H.token)).status, 200);
    const list = (await api("GET", signupsPath(g, sid), null, H.token)).body;
    assert.deepEqual(list.registered.map((x) => x.nickname), ["Yuna"]);
  });

  it("on the session day: host can't remove a registered guest, can remove a waitlisted one; owner can remove any", async () => {
    const sid = await makeSession(g, { date: vanDate(0), time: "23:59", capacity: 1 });
    const reg = (await addGuest(sid, H.token, "Ara")).body;
    const wl = (await addGuest(sid, H.token, "Bora")).body;
    assert.equal(wl.status, "waitlisted");
    const locked = await api("DELETE", guestPath(sid, reg.guestId), null, H.token);
    assert.equal(locked.status, 403);
    assert.equal(locked.body.error, "You can't unregister on the day of the session.");
    assert.equal((await api("DELETE", guestPath(sid, wl.guestId), null, H.token)).status, 200);
    const c = (await addGuest(sid, O.token, "Chae")).body; // waitlisted behind Ara
    assert.equal(c.status, "waitlisted");
    const own = await api("DELETE", guestPath(sid, reg.guestId), null, g.owner.token);
    assert.deepEqual(own.body, { removed: true, promoted: 1 });
  });

  it("another member cannot remove someone else's guest → 403", async () => {
    const sid = await makeSession(g, { date: vanDate(1), time: "20:00", capacity: 5 });
    const a = (await addGuest(sid, H.token, "Dahye")).body;
    assert.equal((await api("DELETE", guestPath(sid, a.guestId), null, O.token)).status, 403);
  });

  it("unknown guest id → 404", async () => {
    const sid = await makeSession(g, { date: vanDate(1), time: "20:00", capacity: 5 });
    assert.equal((await api("DELETE", guestPath(sid, "999999999"), null, g.owner.token)).status, 404);
    assert.equal((await api("DELETE", guestPath(sid, "abc"), null, g.owner.token)).status, 404);
  });

  it("guest name empty or over 40 characters → 400", async () => {
    const sid = await makeSession(g, { date: vanDate(1), time: "20:00", capacity: 5 });
    for (const name of ["", "   ", "x".repeat(41)]) {
      const r = await addGuest(sid, H.token, name);
      assert.equal(r.status, 400, JSON.stringify(name));
      assert.equal(r.body.error, "Guest name must be 1–40 characters");
    }
  });

  it("signed_up_count equals registered rows including guests", async () => {
    const c = await directPool.query(
      `SELECT s.id, s.signed_up_count AS n,
              (SELECT count(*)::int FROM signups WHERE session_id = s.id AND status = 'registered') AS r
       FROM sessions s WHERE group_id = $1`, [g.groupId]);
    for (const row of c.rows) assert.equal(row.n, row.r, row.id);
  });
});

// ── guests follow their host; myGuests ───────────────────────────────────────
describe("guests and host membership", async () => {
  let g;
  const addGuest = (sid, token, guestName) => api("POST", signupPath(g, sid), { guestName }, token);

  before(async () => { g = await makeGroup("ghost", 4); });
  after(() => cleanup(g.emails));

  it("kick host → their future guest removed, waitlist promoted, past guest row kept", async () => {
    const [H, W] = g.members;
    const fut = await makeSession(g, { date: vanDate(1), time: "20:00", capacity: 1 });
    const past = await makeSession(g, { date: vanDate(-1), time: "10:00", capacity: 5 });
    await addGuest(fut, H.token, "Sena");                  // registered
    await api("POST", signupPath(g, fut), {}, W.token);    // waitlisted
    await directPool.query(
      "INSERT INTO signups (session_id, user_id, nickname, guest_name, added_by, status) VALUES ($1,NULL,'Old','Old',$2,'registered')",
      [past, H.id]);
    const r = await api("DELETE", `/groups/${g.groupId}/members/${H.id}`, null, g.owner.token);
    assert.equal(r.status, 200);
    const list = (await api("GET", signupsPath(g, fut), null, g.owner.token)).body;
    assert.deepEqual(list.registered.map((x) => x.nickname), [W.nickname]);
    const kept = await directPool.query("SELECT 1 FROM signups WHERE session_id=$1 AND added_by=$2", [past, H.id]);
    assert.equal(kept.rowCount, 1);
  });

  it("host with a registered guest in today's session cannot leave", async () => {
    const H = g.members[2];
    const today = await makeSession(g, { date: vanDate(0), time: "23:59", capacity: 5 });
    assert.equal((await addGuest(today, H.token, "Hana")).body.status, "registered");
    const r = await api("POST", `/groups/${g.groupId}/members/leave`, {}, H.token);
    assert.equal(r.status, 403);
    assert.equal(r.body.error, "You can't leave the group on the day of a session where you or your guest are registered.");
  });

  it("session item myGuests lists the caller's guests with status and position", async () => {
    const H = g.members[3];
    const sid = await makeSession(g, { date: vanDate(1), time: "20:00", capacity: 1 });
    await api("POST", signupPath(g, sid), {}, H.token);    // H takes the only spot
    const a = (await addGuest(sid, H.token, "Ira")).body;  // waitlist #1
    const items = (await api("GET", `/groups/${g.groupId}/sessions`, null, H.token)).body;
    const item = items.find((x) => x.id === sid);
    assert.deepEqual(item.myGuests, [{ guestId: a.guestId, name: "Ira", status: "waitlisted", position: 1 }]);
    assert.equal(item.waitlistCount, 1);
    const other = (await api("GET", `/groups/${g.groupId}/sessions`, null, g.owner.token)).body.find((x) => x.id === sid);
    assert.deepEqual(other.myGuests, []);
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

// ── edit nickname ────────────────────────────────────────────────────────────
describe("edit nickname", async () => {
  let g;
  const rename = (uid, nickname, token) =>
    api("PATCH", `/groups/${g.groupId}/members/${uid}`, { nickname }, token);
  const nickOf = async (uid) =>
    (await api("GET", `/groups/${g.groupId}/members`, null, g.owner.token)).body.find((m) => m.userId === uid).nickname;

  before(async () => { g = await makeGroup("nick", 4); });
  after(() => cleanup(g.emails));

  it("member renames self → 200, members list shows new name", async () => {
    const [A] = g.members;
    const r = await rename(A.id, "김민수", A.token);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body, { userId: A.id, nickname: "김민수" });
    assert.equal(await nickOf(A.id), "김민수");
  });

  it("owner renames a member → 200", async () => {
    const B = g.members[1];
    const r = await rename(B.id, "이서연", g.owner.token);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(await nickOf(B.id), "이서연");
  });

  it("owner renames self → 200", async () => {
    const r = await rename(g.owner.id, "박지훈", g.owner.token);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(await nickOf(g.owner.id), "박지훈");
  });

  it("member renames someone else → 403", async () => {
    const r = await rename(g.members[2].id, "남의이름", g.members[1].token);
    assert.equal(r.status, 403);
    assert.equal(await nickOf(g.members[2].id), "Nick2");
  });

  it("unknown target → 404", async () => {
    const r = await rename("00000000-0000-0000-0000-000000000000", "누구", g.owner.token);
    assert.equal(r.status, 404);
  });

  it("non-member caller → 403", async () => {
    const email = `test.nick.outsider.${Date.now()}@example.com`;
    g.emails.push(email);
    const reg = await api("POST", "/auth/register", { email, password: "Password1!", name: "Outsider" });
    const r = await rename(g.members[2].id, "외부인", reg.body.token);
    assert.equal(r.status, 403);
  });

  it("invalid nickname → 400", async () => {
    const C = g.members[2];
    for (const bad of ["", "   ", "bad<name>"]) {
      const r = await rename(C.id, bad, C.token);
      assert.equal(r.status, 400, `expected 400 for ${JSON.stringify(bad)}`);
    }
    assert.equal(await nickOf(C.id), "Nick2");
  });

  it("over 30 characters is trimmed to 30, same as join", async () => {
    const C = g.members[2];
    const r = await rename(C.id, "a".repeat(31), C.token);
    assert.equal(r.status, 200);
    assert.equal(r.body.nickname, "a".repeat(30));
  });

  it("name taken by another member (any case) → 409", async () => {
    const C = g.members[2];
    await rename(C.id, "Nick2", C.token);
    const r = await rename(C.id, "NICK3", C.token); // members[3] is "Nick3"
    assert.equal(r.status, 409);
    assert.match(r.body.error, /taken/i);
    assert.equal(await nickOf(C.id), "Nick2");
  });

  it("case-only change of own name → 200", async () => {
    const C = g.members[2];
    const r = await rename(C.id, "NICK2", C.token);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(await nickOf(C.id), "NICK2");
  });

  it("today's and upcoming signups show new name, past keeps old", async () => {
    const D = g.members[3];
    const today = await makeSession(g, { date: vanDate(0), time: "23:59", capacity: 5 });
    const fut = await makeSession(g, { date: vanDate(1), time: "20:00", capacity: 5 });
    const past = await makeSession(g, { date: vanDate(-1), time: "10:00", capacity: 5 });
    assert.equal((await api("POST", signupPath(g, fut), {}, D.token)).status, 200);
    for (const sid of [today, past]) {
      await directPool.query(
        "INSERT INTO signups (session_id, user_id, nickname, status) VALUES ($1,$2,'Nick3','registered')",
        [sid, D.id]);
    }
    assert.equal((await rename(D.id, "최유나", D.token)).status, 200);
    for (const sid of [today, fut]) {
      const list = (await api("GET", signupsPath(g, sid), null, g.owner.token)).body;
      assert.deepEqual(list.registered.map((x) => x.nickname), ["최유나"]);
    }
    const old = await directPool.query("SELECT nickname FROM signups WHERE session_id=$1 AND user_id=$2", [past, D.id]);
    assert.equal(old.rows[0].nickname, "Nick3");
  });

  it("guest's guestOf shows host's new name", async () => {
    const H = g.members[0];
    const fut = await makeSession(g, { date: vanDate(2), time: "20:00", capacity: 5 });
    assert.equal((await api("POST", signupPath(g, fut), { guestName: "Sena" }, H.token)).status, 200);
    assert.equal((await rename(H.id, "정하늘", H.token)).status, 200);
    const list = (await api("GET", signupsPath(g, fut), null, g.owner.token)).body;
    const guest = list.registered.find((x) => x.isGuest);
    assert.equal(guest.guestOf, "정하늘");
  });
});
