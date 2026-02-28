const { GetCommand, TransactWriteCommand } = require("@aws-sdk/lib-dynamodb");
const {
  ddb,
  ok,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  serverError,
  isValidGroupId,
  isValidSessionId,
  getAuthUser,
  getMembership,
} = require("./lib/utils");

exports.handler = async (event) => {
  const TableName = process.env.TABLE_NAME;
  const groupId = event.pathParameters?.groupId;
  const sessionId = event.pathParameters?.sessionId;

  if (!isValidGroupId(groupId)) return badRequest("Invalid groupId");
  if (!isValidSessionId(sessionId)) return badRequest("Invalid sessionId");

  const authUser = getAuthUser(event);
  if (!authUser) return unauthorized("Authentication required");

  const membership = await getMembership(groupId, authUser.userId);
  if (!membership) return forbidden("You are not a member of this group");

  const nicknameLower = membership.nicknameLower || membership.nickname.toLowerCase();
  const pk = `GROUP#${groupId}`;
  const sessionKey = { PK: pk, SK: `SESSION#${sessionId}` };
  const signupKey = { PK: pk, SK: `SIGNUP#${sessionId}#${nicknameLower}` };

  const session = await ddb.send(new GetCommand({ TableName, Key: sessionKey }));
  if (!session.Item) return notFound("Session not found");

  try {
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Delete: {
              TableName,
              Key: signupKey,
              ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK)",
            },
          },
          {
            Update: {
              TableName,
              Key: sessionKey,
              UpdateExpression: "SET #count = #count - :one",
              ConditionExpression: "#count > :z",
              ExpressionAttributeNames: { "#count": "signedUpCount" },
              ExpressionAttributeValues: { ":one": 1, ":z": 0 },
            },
          },
        ],
      })
    );
  } catch (e) {
    const n = e?.name || "";
    if (n.includes("TransactionCanceled") || n.includes("ConditionalCheckFailed")) {
      return conflict("Not registered or already unregistered");
    }
    console.error("unregister error:", e);
    return serverError();
  }

  return ok({ success: true });
};
