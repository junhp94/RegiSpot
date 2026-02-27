const { GetCommand } = require("@aws-sdk/lib-dynamodb");
const {
  ddb,
  ok,
  badRequest,
  unauthorized,
  notFound,
  forbidden,
  serverError,
  getAuthUser,
  isValidGroupId,
} = require("./lib/utils");

exports.handler = async (event) => {
  const TableName = process.env.TABLE_NAME;
  const groupId = event.pathParameters?.groupId;

  if (!isValidGroupId(groupId)) {
    return badRequest("Invalid groupId");
  }

  const authUser = getAuthUser(event);
  if (!authUser) return unauthorized("Authentication required");
  const { userId } = authUser;

  try {
    // Fetch group metadata and user's membership in parallel
    const [groupResult, memberResult] = await Promise.all([
      ddb.send(new GetCommand({ TableName, Key: { PK: `GROUP#${groupId}`, SK: "META" } })),
      ddb.send(new GetCommand({ TableName, Key: { PK: `GROUP#${groupId}`, SK: `MEMBER#${userId}` } })),
    ]);

    if (!groupResult.Item) {
      return notFound("Group not found");
    }

    if (!memberResult.Item) {
      return forbidden("You are not a member of this group");
    }

    const group = groupResult.Item;
    const membership = memberResult.Item;

    const response = {
      groupId: group.groupId,
      groupName: group.groupName,
      sportType: group.sportType,
      maxMembers: group.maxMembers,
      memberCount: group.memberCount || 0,
      createdAt: group.createdAt,
      membership: {
        nickname: membership.nickname,
        role: membership.role,
        joinedAt: membership.joinedAt,
      },
    };

    // Only show access code to owners
    if (membership.role === "owner") {
      response.accessCode = group.accessCode;
    }

    return ok(response);
  } catch (e) {
    console.error("getGroup error:", e);
    return serverError();
  }
};
