const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, QueryCommand } = require("@aws-sdk/lib-dynamodb");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function cors() {
  return {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
  };
}

exports.handler = async (event) => {
  const TableName = process.env.TABLE_NAME;

  try {
    const groupId = event.pathParameters?.groupId;

    // keep old behavior if no groupId route is used
    if (!groupId) {
      const sessions = [
        {
          id: "session-1",
          date: "Jan 30, 2026",
          time: "8:00 PM - 10:00 PM",
          location: "Belvedere Club",
          capacity: 20,
          signedUpCount: 0,
        },
      ];
      return { statusCode: 200, headers: cors(), body: JSON.stringify(sessions) };
    }

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

    const sessions = (res.Items || []).map((x) => ({
      id: x.sessionId || (x.SK || "").replace("SESSION#", ""),
      date: x.date,
      time: x.time,
      location: x.location,
      capacity: x.capacity,
      signedUpCount: x.signedUpCount ?? 0,
    }));

    return { statusCode: 200, headers: cors(), body: JSON.stringify(sessions) };
  } catch (e) {
    console.error("getSessions error:", e);
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: "Server error" }) };
  }
};
