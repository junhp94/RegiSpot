const { QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, ok, badRequest, serverError, isValidGroupId } = require("./lib/utils");

exports.handler = async (event) => {
  const TableName = process.env.TABLE_NAME;
  const groupId = event.pathParameters?.groupId;

  if (!groupId) {
    return badRequest("Missing groupId");
  }

  if (!isValidGroupId(groupId)) {
    return badRequest("Invalid groupId format");
  }

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

    const sessions = (res.Items || []).map((x) => ({
      id: x.sessionId || (x.SK || "").replace("SESSION#", ""),
      date: x.date,
      time: x.time,
      location: x.location,
      capacity: x.capacity,
      signedUpCount: x.signedUpCount ?? 0,
    }));

    return ok(sessions);
  } catch (e) {
    console.error("getSessions error:", e);
    return serverError();
  }
};
