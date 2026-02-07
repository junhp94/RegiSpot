const { GetCommand } = require("@aws-sdk/lib-dynamodb");
const {
  ddb,
  ok,
  badRequest,
  unauthorized,
  notFound,
  serverError,
  parseBody,
  isValidGroupId,
  isValidGroupPassword,
  verifyPassword,
} = require("./lib/utils");

exports.handler = async (event) => {
  const TableName = process.env.TABLE_NAME;
  const groupId = event.pathParameters?.groupId;

  if (!isValidGroupId(groupId)) {
    return badRequest("Invalid groupId");
  }

  const { groupPassword } = parseBody(event.body);

  if (!isValidGroupPassword(groupPassword)) {
    return badRequest("groupPassword is required (6-72 characters)");
  }

  try {
    const result = await ddb.send(
      new GetCommand({
        TableName,
        Key: { PK: `GROUP#${groupId}`, SK: "META" },
      })
    );

    if (!result.Item) {
      return notFound("Group not found");
    }

    const { groupPasswordHash, groupName } = result.Item;

    if (!groupPasswordHash) {
      return badRequest("This group does not have a password set");
    }

    const valid = await verifyPassword(groupPassword.trim(), groupPasswordHash);

    if (!valid) {
      return unauthorized("Invalid group password");
    }

    return ok({ verified: true, groupName, role: "admin" });
  } catch (e) {
    console.error("verifyGroupAdmin error:", e);
    return serverError();
  }
};
