const { QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, ok, badRequest, serverError, isValidGroupId, isValidSessionId } = require("./lib/utils");

exports.handler = async (event) => {
  const TableName = process.env.TABLE_NAME;
  const groupId = event.pathParameters?.groupId;
  const sessionId = event.pathParameters?.sessionId;

  if (!groupId) {
    return badRequest("Missing groupId");
  }
  if (!isValidGroupId(groupId)) {
    return badRequest("Invalid groupId format");
  }
  if (!sessionId) {
    return badRequest("Missing sessionId");
  }
  if (!isValidSessionId(sessionId)) {
    return badRequest("Invalid sessionId format");
  }

  try {
    const pk = `GROUP#${groupId}`;
    const prefix = `SIGNUP#${sessionId}#`;

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

    const signups = (res.Items || []).map((x) => ({
      name: x.name,
      createdAt: x.createdAt,
    }));

    return ok(signups);
  } catch (e) {
    console.error("getSignups error:", e);
    return serverError();
  }
};
