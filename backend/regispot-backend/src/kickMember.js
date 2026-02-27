const { GetCommand, TransactWriteCommand } = require("@aws-sdk/lib-dynamodb");
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
  getMembership,
} = require("./lib/utils");

exports.handler = async (event) => {
  const TableName = process.env.TABLE_NAME;
  const groupId = event.pathParameters?.groupId;
  const targetUserId = event.pathParameters?.userId;

  if (!isValidGroupId(groupId)) return badRequest("Invalid groupId");
  if (!targetUserId) return badRequest("Missing userId");

  const authUser = getAuthUser(event);
  if (!authUser) return unauthorized("Authentication required");
  const { userId } = authUser;

  // Check caller is owner
  const callerMembership = await getMembership(groupId, userId);
  if (!callerMembership) return forbidden("You are not a member of this group");
  if (callerMembership.role !== "owner") return forbidden("Only the group owner can kick members");

  // Cannot kick self (owner)
  if (targetUserId === userId) return badRequest("Owner cannot kick themselves. Transfer ownership first.");

  // Get target member
  const targetMembership = await getMembership(groupId, targetUserId);
  if (!targetMembership) return notFound("Member not found");

  const pk = `GROUP#${groupId}`;
  const nicknameLower = targetMembership.nicknameLower || targetMembership.nickname.toLowerCase();

  try {
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          // Delete MEMBER record
          { Delete: { TableName, Key: { PK: pk, SK: `MEMBER#${targetUserId}` } } },
          // Delete NICKNAME reservation
          { Delete: { TableName, Key: { PK: pk, SK: `NICKNAME#${nicknameLower}` } } },
          // Delete USER-GROUP index
          { Delete: { TableName, Key: { PK: `USER#${targetUserId}`, SK: `GROUP#${groupId}` } } },
          // Decrement memberCount
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
    console.error("kickMember error:", e);
    return serverError();
  }

  return ok({ kicked: true });
};
