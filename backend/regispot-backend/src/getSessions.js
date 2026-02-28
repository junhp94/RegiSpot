const { QueryCommand, BatchGetCommand } = require("@aws-sdk/lib-dynamodb");
const {
  ddb,
  ok,
  badRequest,
  unauthorized,
  forbidden,
  serverError,
  isValidGroupId,
  getAuthUser,
  getMembership,
} = require("./lib/utils");

exports.handler = async (event) => {
  const TableName = process.env.TABLE_NAME;
  const groupId = event.pathParameters?.groupId;

  if (!isValidGroupId(groupId)) return badRequest("Invalid groupId");

  const authUser = getAuthUser(event);
  if (!authUser) return unauthorized("Authentication required");

  const membership = await getMembership(groupId, authUser.userId);
  if (!membership) return forbidden("You are not a member of this group");

  try {
    const pk = `GROUP#${groupId}`;

    const res = await ddb.send(
      new QueryCommand({
        TableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :s)",
        ExpressionAttributeValues: {
          ":pk": pk,
          ":s": "SESSION#",
        },
      })
    );

    const sessions = (res.Items || []).map((x) => {
      const session = {
        id: x.sessionId || (x.SK || "").replace("SESSION#", ""),
        date: x.date,
        time: x.time,
        location: x.location,
        capacity: x.capacity,
        signedUpCount: x.signedUpCount ?? 0,
      };
      if (x.matchFormat) session.matchFormat = x.matchFormat;
      if (x.skillLevel) session.skillLevel = x.skillLevel;
      if (x.courtCount) session.courtCount = x.courtCount;
      return session;
    });

    if (sessions.length > 0) {
      const nicknameLower = membership.nicknameLower || membership.nickname.toLowerCase();
      const keys = sessions.map((s) => ({
        PK: pk,
        SK: `SIGNUP#${s.id}#${nicknameLower}`,
      }));
      const batchRes = await ddb.send(
        new BatchGetCommand({ RequestItems: { [TableName]: { Keys: keys } } })
      );
      const registeredSet = new Set(
        (batchRes.Responses?.[TableName] || []).map((item) => item.SK.split("#")[1])
      );
      sessions.forEach((s) => { s.isRegistered = registeredSet.has(s.id); });
    }

    return ok(sessions);
  } catch (e) {
    console.error("getSessions error:", e);
    return serverError();
  }
};
