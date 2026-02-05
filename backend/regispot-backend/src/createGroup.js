const { PutCommand } = require("@aws-sdk/lib-dynamodb");
const crypto = require("crypto");
const { ddb, ok, badRequest, serverError, parseBody } = require("./lib/utils");

function randomId(len = 8) {
  return crypto.randomBytes(12).toString("base64url").slice(0, len);
}

exports.handler = async (event) => {
  const TableName = process.env.TABLE_NAME;
  const { groupName } = parseBody(event.body);

  const cleanName = (groupName || "").trim();
  if (!cleanName) {
    return badRequest("groupName is required");
  }

  const groupId = randomId(8);
  const joinCode = randomId(6).toUpperCase();
  const now = new Date().toISOString();

  const pk = `GROUP#${groupId}`;
  const item = {
    PK: pk,
    SK: "META",
    groupId,
    groupName: cleanName,
    joinCode,
    createdAt: now,
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

  return ok({ groupId, joinCode, groupName: cleanName });
};
