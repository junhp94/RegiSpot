/**
 * Group routes — POST /groups, POST /groups/join, GET /groups/:groupId,
 * GET /users/me/groups
 *
 * Concurrency notes vs. the old DynamoDB version:
 * - createGroup: retries up to 3 times on access_code UNIQUE collision (same as before).
 * - joinGroup: a single SQL transaction does memberCount < maxMembers atomically,
 *   and a UNIQUE(group_id, nickname_lower) constraint catches nickname conflicts —
 *   equivalent to DynamoDB's conditional writes + ConditionExpression.
 */
import { Router } from "express";
import { randomBytes } from "crypto";
import pool from "../lib/db.js";
import { canCreateGroups } from "../lib/permissions.js";
import {
  sanitizeString,
  isValidNickname,
  isValidSportType,
  isValidAccessCode,
  generateAccessCode,
} from "../lib/validators.js";

export const groupsRouter = Router();

function randomId(len = 8) {
  return randomBytes(12).toString("base64url").slice(0, len);
}

// POST /groups
groupsRouter.post("/", async (req, res) => {
  const { groupName, sportType, maxMembers, nickname } = req.body || {};
  const { userId, email } = req.user;

  if (!canCreateGroups(email)) {
    return res.status(403).json({ error: "Group creation is currently disabled" });
  }

  const cleanName = sanitizeString(groupName, 100);
  if (!cleanName || cleanName.length < 2) {
    return res.status(400).json({ error: "groupName must be at least 2 characters" });
  }
  if (!isValidSportType(sportType)) {
    return res.status(400).json({ error: "Invalid sportType" });
  }
  const validMaxMembers = [50, 100, 200, 500];
  const maxMem = Number(maxMembers) || 50;
  if (!validMaxMembers.includes(maxMem)) {
    return res.status(400).json({ error: "maxMembers must be 50, 100, 200, or 500" });
  }
  const cleanNickname = sanitizeString(nickname, 30);
  if (!cleanNickname || !isValidNickname(cleanNickname)) {
    return res.status(400).json({ error: "A valid nickname is required (1-30 characters)" });
  }
  const nicknameLower = cleanNickname.toLowerCase();
  const groupId = randomId(8);
  const now = new Date().toISOString();

  // Retry up to 3 times if the access_code UNIQUE constraint fires
  for (let attempt = 0; attempt < 3; attempt++) {
    const accessCode = generateAccessCode();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO groups (id, name, sport_type, max_members, member_count, access_code, owner_id, created_at)
         VALUES ($1,$2,$3,$4,1,$5,$6,$7)`,
        [groupId, cleanName, sportType.toLowerCase(), maxMem, accessCode, userId, now]
      );
      await client.query(
        `INSERT INTO members (group_id, user_id, nickname, nickname_lower, role, joined_at)
         VALUES ($1,$2,$3,$4,'owner',$5)`,
        [groupId, userId, cleanNickname, nicknameLower, now]
      );
      await client.query("COMMIT");
      return res.status(200).json({ groupId, groupName: cleanName, accessCode });
    } catch (err) {
      await client.query("ROLLBACK");
      // 23505 = unique_violation; if it's the access_code column, retry
      if (err.code === "23505" && err.constraint?.includes("access_code")) {
        continue;
      }
      console.error("createGroup error:", err);
      return res.status(500).json({ error: "Server error" });
    } finally {
      client.release();
    }
  }

  res.status(500).json({ error: "Failed to generate unique access code. Please try again." });
});

// POST /groups/join
groupsRouter.post("/join", async (req, res) => {
  const { accessCode, nickname } = req.body || {};
  const { userId } = req.user;

  const cleanCode = (accessCode || "").trim();
  if (!isValidAccessCode(cleanCode)) {
    return res.status(400).json({ error: "A valid 6-digit access code is required" });
  }
  const cleanNickname = sanitizeString(nickname, 30);
  if (!cleanNickname || !isValidNickname(cleanNickname)) {
    return res.status(400).json({ error: "A valid nickname is required (1-30 characters)" });
  }
  const nicknameLower = cleanNickname.toLowerCase();

  const groupRes = await pool.query(
    "SELECT id, name, sport_type, max_members, member_count FROM groups WHERE access_code = $1",
    [cleanCode]
  );
  if (!groupRes.rows[0]) {
    return res.status(404).json({ error: "Invalid access code" });
  }
  const group = groupRes.rows[0];

  // Check if already a member
  const existing = await pool.query(
    "SELECT 1 FROM members WHERE group_id = $1 AND user_id = $2",
    [group.id, userId]
  );
  if (existing.rows[0]) {
    return res.status(409).json({ error: "You are already a member of this group" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Atomically increment member_count only if below max
    const upd = await client.query(
      `UPDATE groups SET member_count = member_count + 1
       WHERE id = $1 AND member_count < max_members
       RETURNING id`,
      [group.id]
    );
    if (upd.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Group is full" });
    }
    await client.query(
      `INSERT INTO members (group_id, user_id, nickname, nickname_lower, role)
       VALUES ($1,$2,$3,$4,'member')`,
      [group.id, userId, cleanNickname, nicknameLower]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23505") {
      return res.status(409).json({ error: "Nickname is already taken in this group" });
    }
    console.error("joinGroup error:", err);
    return res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }

  res.json({ groupId: group.id, groupName: group.name, sportType: group.sport_type, nickname: cleanNickname, role: "member" });
});

// GET /users/me/groups
groupsRouter.get("/me/groups", async (req, res) => {
  const { userId } = req.user;
  try {
    const result = await pool.query(
      `SELECT g.id AS "groupId", g.name AS "groupName", g.sport_type AS "sportType",
              m.nickname, m.role
       FROM members m JOIN groups g ON g.id = m.group_id
       WHERE m.user_id = $1
       ORDER BY m.joined_at DESC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("getUserGroups error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /groups/:groupId
groupsRouter.get("/:groupId", async (req, res) => {
  const { groupId } = req.params;
  const { userId } = req.user;

  try {
    const [groupRes, memberRes] = await Promise.all([
      pool.query("SELECT * FROM groups WHERE id = $1", [groupId]),
      pool.query("SELECT * FROM members WHERE group_id = $1 AND user_id = $2", [groupId, userId]),
    ]);

    if (!groupRes.rows[0]) return res.status(404).json({ error: "Group not found" });
    if (!memberRes.rows[0]) return res.status(403).json({ error: "You are not a member of this group" });

    const g = groupRes.rows[0];
    const m = memberRes.rows[0];

    const response = {
      groupId: g.id,
      groupName: g.name,
      sportType: g.sport_type,
      maxMembers: g.max_members,
      memberCount: g.member_count,
      createdAt: g.created_at,
      membership: { nickname: m.nickname, role: m.role, joinedAt: m.joined_at },
    };

    // Only owners see the access code
    if (m.role === "owner") response.accessCode = g.access_code;

    res.json(response);
  } catch (err) {
    console.error("getGroup error:", err);
    res.status(500).json({ error: "Server error" });
  }
});
