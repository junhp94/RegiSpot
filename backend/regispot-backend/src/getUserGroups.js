const { QueryCommand } = require("@aws-sdk/lib-dynamodb");
const {
  ddb,
  ok,
  unauthorized,
  serverError,
  getAuthUser,
} = require("./lib/utils");

exports.handler = async (event) => {
  const TableName = process.env.TABLE_NAME;

  const authUser = getAuthUser(event);
  if (!authUser) return unauthorized("Authentication required");
  const { userId } = authUser;

  try {
    const result = await ddb.send(
      new QueryCommand({
        TableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `USER#${userId}`,
          ":sk": "GROUP#",
        },
      })
    );

    const groups = (result.Items || []).map((item) => ({
      groupId: item.groupId,
      groupName: item.groupName,
      sportType: item.sportType,
      nickname: item.nickname,
      role: item.role,
    }));

    return ok(groups);
  } catch (e) {
    console.error("getUserGroups error:", e);
    return serverError();
  }
};
