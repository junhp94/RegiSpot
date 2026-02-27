const { PutCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");
const crypto = require("crypto");
const {
  ddb,
  ok,
  badRequest,
  unauthorized,
  forbidden,
  serverError,
  parseBody,
  sanitizeString,
  getAuthUser,
  isValidGroupId,
  getMembership,
  isValidMatchFormat,
  isValidSkillLevel,
  RACKET_SPORTS,
} = require("./lib/utils");

exports.handler = async (event) => {
  const TableName = process.env.TABLE_NAME;
  const groupId = event.pathParameters?.groupId;

  if (!isValidGroupId(groupId)) return badRequest("Invalid groupId");

  const authUser = getAuthUser(event);
  if (!authUser) return unauthorized("Authentication required");
  const { userId } = authUser;

  // Check membership and owner role
  const membership = await getMembership(groupId, userId);
  if (!membership) return forbidden("You are not a member of this group");
  if (membership.role !== "owner") return forbidden("Only the group owner can create sessions");

  const { date, time, location, capacity, matchFormat, skillLevel, courtCount } = parseBody(event.body);

  // Validate core fields
  const cleanDate = sanitizeString(date, 20);
  const cleanTime = sanitizeString(time, 20);
  const cleanLocation = sanitizeString(location, 100);
  const cap = Number(capacity);

  if (!cleanDate) return badRequest("date is required");
  if (!cleanTime) return badRequest("time is required");
  if (!cleanLocation) return badRequest("location is required");
  if (!cap || cap < 1 || cap > 500) return badRequest("capacity must be between 1 and 500");

  // Fetch group metadata to check sport type
  let sportFields = {};
  try {
    const groupRes = await ddb.send(
      new GetCommand({
        TableName,
        Key: { PK: `GROUP#${groupId}`, SK: "META" },
      })
    );
    const sportType = groupRes.Item?.sportType;

    if (sportType && RACKET_SPORTS.includes(sportType)) {
      if (matchFormat) {
        if (!isValidMatchFormat(matchFormat)) return badRequest("Invalid matchFormat");
        sportFields.matchFormat = matchFormat;
      }
      if (skillLevel) {
        if (!isValidSkillLevel(skillLevel)) return badRequest("Invalid skillLevel");
        sportFields.skillLevel = skillLevel;
      }
      if (courtCount !== undefined && courtCount !== null && courtCount !== "") {
        const cc = Number(courtCount);
        if (!Number.isInteger(cc) || cc < 1 || cc > 20) return badRequest("courtCount must be between 1 and 20");
        sportFields.courtCount = cc;
      }
    }
  } catch (e) {
    console.error("Failed to fetch group metadata:", e);
  }

  const sessionId = crypto.randomBytes(6).toString("base64url");
  const now = new Date().toISOString();

  try {
    await ddb.send(
      new PutCommand({
        TableName,
        Item: {
          PK: `GROUP#${groupId}`,
          SK: `SESSION#${sessionId}`,
          sessionId,
          date: cleanDate,
          time: cleanTime,
          location: cleanLocation,
          capacity: cap,
          signedUpCount: 0,
          createdBy: userId,
          createdAt: now,
          ...sportFields,
        },
        ConditionExpression: "attribute_not_exists(PK)",
      })
    );
  } catch (e) {
    console.error("createSession error:", e);
    return serverError();
  }

  return ok({ sessionId, date: cleanDate, time: cleanTime, location: cleanLocation, capacity: cap, ...sportFields });0};
