const { PutCommand } = require("@aws-sdk/lib-dynamodb");
const crypto = require("crypto");
const {
  ddb,
  ok,
  badRequest,
  serverError,
  parseBody,
  sanitizeString,
  getAuthUser,
  isValidGroupPassword,
  hashPassword,
} = require("./lib/utils");

function randomId(len = 8) {
  return crypto.randomBytes(12).toString("base64url").slice(0, len);
}

exports.handler = async (event) => {
  const TableName = process.env.TABLE_NAME;
  const { groupName, groupPassword } = parseBody(event.body);

  // Sanitize and validate group name
  const cleanName = sanitizeString(groupName, 100);
  if (!cleanName) {
    return badRequest("groupName is required");
  }
  if (cleanName.length < 2) {
    return badRequest("groupName must be at least 2 characters");
  }

  // Validate and hash group password
  if (!isValidGroupPassword(groupPassword)) {
    return badRequest("groupPassword is required (6-72 characters)");
  }
  const groupPasswordHash = await hashPassword(groupPassword.trim());

  // Get authenticated user info from Cognito
  const authUser = getAuthUser(event);
  const ownerId = authUser?.userId || null;
  const ownerEmail = authUser?.email || null;

  const groupId = randomId(8);
  const now = new Date().toISOString();

  const pk = `GROUP#${groupId}`;
  const item = {
    PK: pk,
    SK: "META",
    groupId,
    groupName: cleanName,
    groupPasswordHash,
    createdAt: now,
    ownerId,
    ownerEmail,
  };

  try {
    await ddb.send(
      new PutCommand({
        TableName,
        Item: item,
        ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
      })
    );
  } catch (e) {
    console.error("createGroup error:", e);
    return serverError();
  }

  return ok({ groupId, groupName: cleanName });
};
