const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const crypto = require("crypto");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function cors() {
  return {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
  };
}

function parseJson(body) {
  try { return JSON.parse(body || "{}"); } catch { return {}; }
}

function randomId(len = 8) {
  // url-safe, short
  return crypto.randomBytes(12).toString("base64url").slice(0, len);
}

exports.handler = async (event) => {
  const TableName = process.env.TABLE_NAME;
  const { groupName } = parseJson(event.body);

  const cleanName = (groupName || "").trim();
  if (!cleanName) {
    return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "groupName is required" }) };
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
    await ddb.send(new PutCommand({
      TableName,
      Item: item,
      ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
    }));
  } catch (e) {
    console.error(e);
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: "Server error" }) };
  }

  return {
    statusCode: 200,
    headers: cors(),
    body: JSON.stringify({ groupId, joinCode, groupName: cleanName }),
  };
};
