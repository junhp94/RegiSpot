const { QueryCommand, BatchWriteCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");
const {
  ddb,
  ok,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  serverError,
  getAuthUser,
  isValidGroupId,
  isValidSessionId,
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

  const membership = await getMembership(groupId, userId);
  if (!membership) return forbidden("You are not a member of this group");
  if (membership.role !== "owner") return forbidden("Only the group owner can delete sessions");

  const pk = `GROUP#${groupId}`;

  // Delete all signups for this session
  try {
    const signupsResult = await ddb.send(
      new QueryCommand({
        TableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
        ExpressionAttributeValues: {
          ":pk": pk,
          ":prefix": `SIGNUP#${sessionId}#`,
        },
        ProjectionExpression: "PK, SK",
      })
    );

    const signupItems = signupsResult.Items || [];

    // Batch delete signups (25 at a time)
    for (let i = 0; i < signupItems.length; i += 25) {
      const batch = signupItems.slice(i, i + 25);
      await ddb.send(
        new BatchWriteCommand({
          RequestItems: {
            [TableName]: batch.map((item) => ({
              DeleteRequest: { Key: { PK: item.PK, SK: item.SK } },
            })),
          },
        })
      );
    }

    // Delete the session itself
    await ddb.send(
      new DeleteCommand({
        TableName,
        Key: { PK: pk, SK: `SESSION#${sessionId}` },
        ConditionExpression: "attribute_exists(PK)",
      })
    );
  } catch (e) {
    if (e.name === "ConditionalCheckFailedException") {
      return notFound("Session not found");
    }
    console.error("deleteSession error:", e);
    return serverError();
  }

  return ok({ deleted: true });
};
