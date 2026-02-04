const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  GetCommand,
  TransactWriteCommand,
} = require("@aws-sdk/lib-dynamodb");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function cors() {
  return {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  };
}

function parseJson(body) {
  try {
    return JSON.parse(body || "{}");
  } catch {
    return {};
  }
}

exports.handler = async (event) => {
  const TableName = process.env.TABLE_NAME;

  const groupId = event.pathParameters?.groupId;
  const sessionId = event.pathParameters?.sessionId;

  const { name } = parseJson(event.body);
  const cleanName = (name || "").trim();
  const lower = cleanName.toLowerCase();

  if (!groupId) {
    return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "Missing groupId" }) };
  }
  if (!sessionId) {
    return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "Missing sessionId" }) };
  }
  if (!cleanName) {
    return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "Name is required" }) };
  }

  const pk = `GROUP#${groupId}`;
  const sessionKey = { PK: pk, SK: `SESSION#${sessionId}` };
  const signupKey = { PK: pk, SK: `SIGNUP#${sessionId}#${lower}` };

  // ensure session exists
  const session = await ddb.send(new GetCommand({ TableName, Key: sessionKey }));
  if (!session.Item) {
    return { statusCode: 404, headers: cors(), body: JSON.stringify({ error: "Session not found" }) };
  }

  const now = new Date().toISOString();

  try {
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName,
              Item: { ...signupKey, name: cleanName, createdAt: now },
              ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
            },
          },
          {
            Update: {
              TableName,
              Key: sessionKey,
              UpdateExpression: "SET #count = if_not_exists(#count, :z) + :one",
              ConditionExpression: "#count < #cap",
              ExpressionAttributeNames: {
                "#count": "signedUpCount",
                "#cap": "capacity",
              },
              ExpressionAttributeValues: {
                ":one": 1,
                ":z": 0,
              },
            },
          },
        ],
      })
    );
  } catch (e) {
    const n = e?.name || "";
    if (n.includes("TransactionCanceled") || n.includes("ConditionalCheckFailed")) {
      return { statusCode: 409, headers: cors(), body: JSON.stringify({ error: "Duplicate signup or session full" }) };
    }
    console.error(e);
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: "Server error" }) };
  }

  return { statusCode: 200, headers: cors(), body: JSON.stringify({ success: true }) };
};
