const { TransactWriteCommand } = require("@aws-sdk/lib-dynamodb");
const {
  ddb,
  ok,
  badRequest,
  unauthorized,
  forbidden,
  serverError,
  getAuthUser,
  isValidGroupId,
  getMembership,
} = require("./lib/utils");

exports.handler = async (event) => {
  const TableName = process.env.TABLE_NAME;
  const groupId = event.pathParameters?.groupId;

  if (!isValidGroupId(groupId)) return badRequest("Invalid groupId");

  const authUser = getAuthUser(event);
  if (!authUser) return unauthorized("Authentication required");
  const { userId } = authUser;

  const membership = await getMembership(groupId, userId);
  if (!membership) return forbidden("You are not a member of this group");
  if (membership.role === "owner") return badRequest("Owner cannot leave the group. Transfer ownership or delete the group.");

  const pk = `GROUP#${groupId}`;
  const nicknameLower = membership.nicknameLower || membership.nickname.toLowerCase();

  try {
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          { Delete: { TableName, Key: { PK: pk, SK: `MEMBER#${userId}` } } },
          { Delete: { TableName, Key: { PK: pk, SK: `NICKNAME#${nicknameLower}` } } },
          { Delete: { TableName, Key: { PK: `USER#${userId}`, SK: `GROUP#${groupId}` } } },
          {
            Update: {
              TableName,
              Key: { PK: pk, SK: "META" },
              UpdateExpression: "SET memberCount = memberCount - :one",
              ExpressionAttributeValues: { ":one": 1 },
            },
          },
        ],
      })
    );
  } catch (e) {
    console.error("leaveGroup error:", e);
    return serverError();
  }

  return ok({ left: true });
};
