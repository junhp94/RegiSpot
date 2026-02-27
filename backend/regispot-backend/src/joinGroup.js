const { GetCommand, TransactWriteCommand } = require("@aws-sdk/lib-dynamodb");
const {
  ddb,
  ok,
  badRequest,
  unauthorized,
  notFound,
  conflict,
  serverError,
  parseBody,
  sanitizeString,
  getAuthUser,
  isValidAccessCode,
  isValidNickname,
} = require("./lib/utils");

exports.handler = async (event) => {
  const TableName = process.env.TABLE_NAME;
  const { accessCode, nickname } = parseBody(event.body);

  const authUser = getAuthUser(event);
  if (!authUser) return unauthorized("Authentication required");
  const { userId, email } = authUser;

  // Validate access code
  const cleanCode = (accessCode || "").trim();
  if (!isValidAccessCode(cleanCode)) {
    return badRequest("A valid 6-digit access code is required");
  }

  // Validate nickname
  const cleanNickname = sanitizeString(nickname, 30);
  if (!cleanNickname || !isValidNickname(cleanNickname)) {
    return badRequest("A valid nickname is required (1-30 characters)");
  }
  const nicknameLower = cleanNickname.toLowerCase();

  // Look up the access code
  const codeResult = await ddb.send(
    new GetCommand({
      TableName,
      Key: { PK: `ACCESSCODE#${cleanCode}`, SK: "META" },
    })
  );
  if (!codeResult.Item) {
    return notFound("Invalid access code");
  }
  const { groupId } = codeResult.Item;
  const pk = `GROUP#${groupId}`;

  // Load group metadata
  const groupResult = await ddb.send(
    new GetCommand({ TableName, Key: { PK: pk, SK: "META" } })
  );
  if (!groupResult.Item) {
    return notFound("Group not found");
  }
  const group = groupResult.Item;

  // Check if user is already a member
  const memberResult = await ddb.send(
    new GetCommand({ TableName, Key: { PK: pk, SK: `MEMBER#${userId}` } })
  );
  if (memberResult.Item) {
    return conflict("You are already a member of this group");
  }

  const now = new Date().toISOString();

  try {
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          // Increment memberCount and check capacity
          {
            Update: {
              TableName,
              Key: { PK: pk, SK: "META" },
              UpdateExpression: "SET memberCount = if_not_exists(memberCount, :z) + :one",
              ConditionExpression: "memberCount < maxMembers",
              ExpressionAttributeValues: { ":one": 1, ":z": 0 },
            },
          },
          // Create membership record
          {
            Put: {
              TableName,
              Item: {
                PK: pk,
                SK: `MEMBER#${userId}`,
                nickname: cleanNickname,
                nicknameLower,
                role: "member",
                userId,
                email,
                joinedAt: now,
              },
              ConditionExpression: "attribute_not_exists(PK)",
            },
          },
          // Reserve nickname
          {
            Put: {
              TableName,
              Item: {
                PK: pk,
                SK: `NICKNAME#${nicknameLower}`,
                userId,
              },
              ConditionExpression: "attribute_not_exists(PK)",
            },
          },
          // Create user-group index
          {
            Put: {
              TableName,
              Item: {
                PK: `USER#${userId}`,
                SK: `GROUP#${groupId}`,
                groupId,
                groupName: group.groupName,
                sportType: group.sportType,
                nickname: cleanNickname,
                role: "member",
              },
            },
          },
        ],
      })
    );
  } catch (e) {
    if (e.name === "TransactionCanceledException") {
      const reasons = e.CancellationReasons || [];
      // Check which condition failed
      if (reasons[0]?.Code === "ConditionalCheckFailed") {
        return conflict("Group is full");
      }
      if (reasons[2]?.Code === "ConditionalCheckFailed") {
        return conflict("Nickname is already taken in this group");
      }
    }
    console.error("joinGroup error:", e);
    return serverError();
  }

  return ok({
    groupId,
    groupName: group.groupName,
    sportType: group.sportType,
    nickname: cleanNickname,
    role: "member",
  });
};
