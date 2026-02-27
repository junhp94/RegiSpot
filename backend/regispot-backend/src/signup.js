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
  const { userId } = authUser;

  // Check membership and get nickname
  const membership = await getMembership(groupId, userId);
  if (!membership) return forbidden("You are not a member of this group");

  const nickname = membership.nickname;
  const nicknameLower = membership.nicknameLower || nickname.toLowerCase();

  const pk = `GROUP#${groupId}`;
  const sessionKey = { PK: pk, SK: `SESSION#${sessionId}` };
  const signupKey = { PK: pk, SK: `SIGNUP#${sessionId}#${nicknameLower}` };

  // Ensure session exists
  const session = await ddb.send(new GetCommand({ TableName, Key: sessionKey }));
  if (!session.Item) return notFound("Session not found");

  const now = new Date().toISOString();

  try {
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName,
              Item: {
                ...signupKey,
                nickname,
                userId,
                signedUpAt: now,
              },
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
      return conflict("Duplicate signup or session full");
    }
    console.error("signup error:", e);
    return serverError();
  }

  return ok({ success: true });
};
