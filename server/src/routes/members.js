/**
 * Member routes — mounted at /groups/:groupId/members
 *   GET    /           → list members
 *   POST   /leave      → leave group (registered BEFORE /:userId to avoid conflict)
 *   DELETE /:userId    → kick member
 *
 * Kick and leave delete the user's signups in this group (removeUserSignupsInGroup):
 * only registered rows decrement signed_up_count, freed spots are promoted, all in one
 * transaction.
 */
import { Router } from "express";
import pool from "../lib/db.js";
import { removeUserSignupsInGroup } from "../lib/signupQueue.js";

export const membersRouter = Router({ mergeParams: true });

// GET /groups/:groupId/members
membersRouter.get("/", async (req, res) => {
  const { groupId } = req.params;
  const { userId } = req.user;

  const memberRes = await pool.query(
    "SELECT 1 FROM members WHERE group_id = $1 AND user_id = $2",
    [groupId, userId]
  );
  if (!memberRes.rows[0]) return res.status(403).json({ error: "You are not a member of this group" });

  try {
    const result = await pool.query(
      `SELECT user_id AS "userId", nickname, role, joined_at AS "joinedAt"
       FROM members WHERE group_id = $1 ORDER BY joined_at ASC`,
      [groupId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("getMembers error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /groups/:groupId/members/leave  (registered before /:userId to avoid "leave" matching as a userId)
membersRouter.post("/leave", async (req, res) => {
  const { groupId } = req.params;
  const { userId } = req.user;

  const memberRes = await pool.query(
    "SELECT role FROM members WHERE group_id = $1 AND user_id = $2",
    [groupId, userId]
  );
  if (!memberRes.rows[0]) return res.status(403).json({ error: "You are not a member of this group" });
  if (memberRes.rows[0].role === "owner") {
    return res.status(400).json({ error: "Owner cannot leave the group. Transfer ownership or delete the group." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Remove their signups; only registered rows free a spot, which is then promoted
    await removeUserSignupsInGroup(client, groupId, userId);

    // Remove membership and decrement group count
    await client.query(
      "DELETE FROM members WHERE group_id = $1 AND user_id = $2",
      [groupId, userId]
    );
    await client.query(
      "UPDATE groups SET member_count = GREATEST(member_count - 1, 0) WHERE id = $1",
      [groupId]
    );

    await client.query("COMMIT");
    res.json({ left: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("leaveGroup error:", err);
    res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
});

// DELETE /groups/:groupId/members/:userId  (kick)
membersRouter.delete("/:targetUserId", async (req, res) => {
  const { groupId, targetUserId } = req.params;
  const { userId } = req.user;

  const callerRes = await pool.query(
    "SELECT role FROM members WHERE group_id = $1 AND user_id = $2",
    [groupId, userId]
  );
  if (!callerRes.rows[0]) return res.status(403).json({ error: "You are not a member of this group" });
  if (callerRes.rows[0].role !== "owner") return res.status(403).json({ error: "Only the group owner can kick members" });
  if (targetUserId === userId) return res.status(400).json({ error: "Owner cannot kick themselves. Transfer ownership first." });

  const targetRes = await pool.query(
    "SELECT 1 FROM members WHERE group_id = $1 AND user_id = $2",
    [groupId, targetUserId]
  );
  if (!targetRes.rows[0]) return res.status(404).json({ error: "Member not found" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Remove their signups; only registered rows free a spot, which is then promoted
    await removeUserSignupsInGroup(client, groupId, targetUserId);

    await client.query(
      "DELETE FROM members WHERE group_id = $1 AND user_id = $2",
      [groupId, targetUserId]
    );
    await client.query(
      "UPDATE groups SET member_count = GREATEST(member_count - 1, 0) WHERE id = $1",
      [groupId]
    );

    await client.query("COMMIT");
    res.json({ kicked: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("kickMember error:", err);
    res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
});
