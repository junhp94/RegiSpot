const { TransactWriteCommand } = require("@aws-sdk/lib-dynamodb");
const crypto = require("crypto");
const {
  ddb,
  ok,
  badRequest,
  unauthorized,
  serverError,
  parseBody,
  sanitizeString,
  getAuthUser,
  isValidNickname,
  isValidSportType,
  generateAccessCode,
} = require("./lib/utils");

function randomId(len = 8) {
  return crypto.randomBytes(12).toString("base64url").slice(0, len);
}

exports.handler = async (event) => {
  const TableName = process.env.TABLE_NAME;
  const { groupName, sportType, maxMembers, nickname } = parseBody(event.body);

  const authUser = getAuthUser(event);
  if (!authUser) return unauthorized("Authentication required");
  const { userId, email, name: userName } = authUser;

  // Validate group name
  const cleanName = sanitizeString(groupName, 100);
  if (!cleanName || cleanName.length < 2) {
    return badRequest("groupName must be at least 2 characters");
  }

  // Validate sport type
  if (!isValidSportType(sportType)) {
    return badRequest("Invalid sportType");
  }

  // Validate max members
  const validMaxMembers = [50, 100, 200, 500];
  const maxMem = Number(maxMembers) || 50;
  if (!validMaxMembers.includes(maxMem)) {
    return badRequest("maxMembers must be 50, 100, 200, or 500");
  }

  // Validate nickname
  const cleanNickname = sanitizeString(nickname, 30);
  if (!cleanNickname || !isValidNickname(cleanNickname)) {
    return badRequest("A valid nickname is required (1-30 characters)");
  }
  const nicknameLower = cleanNickname.toLowerCase();

  const groupId = randomId(8);
  const now = new Date().toISOString();
  const pk = `GROUP#${groupId}`;

  // Retry up to 3 times on access code collision
  for (let attempt = 0; attempt < 3; attempt++) {
    const accessCode = generateAccessCode();
    try {
      await ddb.send(
        new TransactWriteCommand({
          TransactItems: [
            // Create group metadata
            {
              Put: {
                TableName,
                Item: {
                  PK: pk,
                  SK: "META",
                  groupId,
                  groupName: cleanName,
                  sportType: sportType.toLowerCase(),
                  maxMembers: maxMem,
                  memberCount: 1,
                  accessCode,
                  ownerId: userId,
                  createdAt: now,
                },
                ConditionExpression: "attribute_not_exists(PK)",
              },
            },
            // Reserve the access code
            {
              Put: {
                TableName,
                Item: {
                  PK: `ACCESSCODE#${accessCode}`,
                  SK: "META",
                  groupId,
                },
                ConditionExpression: "attribute_not_exists(PK)",
              },
            },
            // Create owner membership
            {
              Put: {
                TableName,
                Item: {
                  PK: pk,
                  SK: `MEMBER#${userId}`,
                  nickname: cleanNickname,
                  nicknameLower,
                  role: "owner",
                  userId,
                  email,
                  joinedAt: now,
                },
              },
            },
            // Reserve nickname uniqueness
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
            // Create user-group index entry
            {
              Put: {
                TableName,
                Item: {
                  PK: `USER#${userId}`,
                  SK: `GROUP#${groupId}`,
                  groupId,
                  groupName: cleanName,
                  sportType: sportType.toLowerCase(),
                  nickname: cleanNickname,
                  role: "owner",
                },
              },
            },
          ],
        })
      );

      return ok({ groupId, groupName: cleanName, accessCode });
    } catch (e) {
      // If access code collision, retry
      if (e.name === "TransactionCanceledException") {
        const reasons = e.CancellationReasons || [];
        // Index 1 is the ACCESSCODE put — if that's the one that failed, retry
        if (reasons[1]?.Code === "ConditionalCheckFailed") {
          continue;
        }
      }
      console.error("createGroup error:", e);
      return serverError();
    }
  }

  return serverError("Failed to generate unique access code. Please try again.");
};
