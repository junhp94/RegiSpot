const { QueryCommand } = require("@aws-sdk/lib-dynamodb");
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

  try {
    const result = await ddb.send(
      new QueryCommand({
        TableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
        ExpressionAttributeValues: {
          ":pk": `GROUP#${groupId}`,
          ":prefix": "MEMBER#",
        },
      })
    );

    const members = (result.Items || []).map((item) => ({
      userId: item.userId,
      nickname: item.nickname,
      role: item.role,
      joinedAt: item.joinedAt,
    }));

    return ok(members);
  } catch (e) {
    console.error("getMembers error:", e);
    return serverError();
  }
};
