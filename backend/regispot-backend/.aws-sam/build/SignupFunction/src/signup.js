const { GetCommand, TransactWriteCommand } = require("@aws-sdk/lib-dynamodb");
const {
  ddb,
  ok,
  badRequest,
  notFound,
  conflict,
  serverError,
  parseBody,
  isValidGroupId,
  isValidSessionId,
  isValidName,
  getAuthUser,
} = require("./lib/utils");

exports.handler = async (event) => {
  const TableName = process.env.TABLE_NAME;
  const groupId = event.pathParameters?.groupId;
  const sessionId = event.pathParameters?.sessionId;

  // Validate path parameters
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

  // Parse and validate body
  const { name } = parseBody(event.body);
  const cleanName = (name || "").trim();

  if (!cleanName) {
    return badRequest("Name is required");
  }
  if (!isValidName(cleanName)) {
    return badRequest("Invalid name format");
  }

  const lower = cleanName.toLowerCase();

  // Get authenticated user info from Cognito
  const authUser = getAuthUser(event);
  const userId = authUser?.userId || null;
  const userEmail = authUser?.email || null;

  const pk = `GROUP#${groupId}`;
  const sessionKey = { PK: pk, SK: `SESSION#${sessionId}` };
  const signupKey = { PK: pk, SK: `SIGNUP#${sessionId}#${lower}` };

  // Ensure session exists
  const session = await ddb.send(new GetCommand({ TableName, Key: sessionKey }));
  if (!session.Item) {
    return notFound("Session not found");
  }

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
                name: cleanName,
                createdAt: now,
                userId,
                userEmail,
              },
              ConditionExpression:
                "attribute_not_exists(PK) AND attribute_not_exists(SK)",
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
    if (
      n.includes("TransactionCanceled") ||
      n.includes("ConditionalCheckFailed")
    ) {
      return conflict("Duplicate signup or session full");
    }
    console.error("signup error:", e);
    return serverError();
  }

  return ok({ success: true });
};
