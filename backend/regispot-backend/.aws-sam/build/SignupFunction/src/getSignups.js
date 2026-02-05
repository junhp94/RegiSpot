const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, QueryCommand } = require("@aws-sdk/lib-dynamodb");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function cors() {
  return {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  };
}

exports.handler = async (event) => {
  const TableName = process.env.TABLE_NAME;

  const groupId = event.pathParameters?.groupId;
  const sessionId = event.pathParameters?.sessionId;

  if (!groupId) {
    return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "Missing groupId" }) };
  }
  if (!sessionId) {
    return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "Missing sessionId" }) };
  }

  const pk = `GROUP#${groupId}`;
  const prefix = `SIGNUP#${sessionId}#`;

  try {
    const res = await ddb.send(
      new QueryCommand({
        TableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :p)",
        ExpressionAttributeValues: {
          ":pk": pk,
          ":p": prefix,
        },
      })
    );

    const out = (res.Items || []).map((x) => ({ name: x.name, createdAt: x.createdAt }));
    return { statusCode: 200, headers: cors(), body: JSON.stringify(out) };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: "Server error" }) };
  }
};
