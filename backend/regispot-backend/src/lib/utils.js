const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");
const bcrypt = require("bcryptjs");

// DynamoDB client singleton
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// Get allowed origin from environment
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

// CORS headers with specific origin
function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Api-Key",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Credentials": "true",
  };
}

// Response helpers
function ok(data) {
  return {
    statusCode: 200,
    headers: corsHeaders(),
    body: JSON.stringify(data),
  };
}

function badRequest(error) {
  return {
    statusCode: 400,
    headers: corsHeaders(),
    body: JSON.stringify({ error }),
  };
}

function unauthorized(error = "Unauthorized") {
  return {
    statusCode: 401,
    headers: corsHeaders(),
    body: JSON.stringify({ error }),
  };
}

function forbidden(error = "Forbidden") {
  return {
    statusCode: 403,
    headers: corsHeaders(),
    body: JSON.stringify({ error }),
  };
}

function notFound(error) {
  return {
    statusCode: 404,
    headers: corsHeaders(),
    body: JSON.stringify({ error }),
  };
}

function conflict(error) {
  return {
    statusCode: 409,
    headers: corsHeaders(),
    body: JSON.stringify({ error }),
  };
}

function serverError(error = "Server error") {
  return {
    statusCode: 500,
    headers: corsHeaders(),
    body: JSON.stringify({ error }),
  };
}

// Parse JSON body safely
function parseBody(body) {
  try {
    return JSON.parse(body || "{}");
  } catch {
    return {};
  }
}

// ============================================
// Input Validation Helpers
// ============================================

// Remove control characters, trim, and limit length
function sanitizeString(input, maxLength = 100) {
  if (typeof input !== "string") return "";
  const cleaned = input.replace(/[\x00-\x1F\x7F-\x9F]/g, "");
  return cleaned.trim().slice(0, maxLength);
}

// Validate name: letters, spaces, hyphens, apostrophes (1-50 chars)
function isValidName(name) {
  if (typeof name !== "string") return false;
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 50) return false;
  return /^[\p{L}\s'-]+$/u.test(trimmed);
}

// Validate groupId: alphanumeric, hyphens, underscores (1-32 chars)
function isValidGroupId(groupId) {
  if (typeof groupId !== "string") return false;
  if (groupId.length < 1 || groupId.length > 32) return false;
  return /^[a-zA-Z0-9_-]+$/.test(groupId);
}

// Validate sessionId: alphanumeric, hyphens, underscores (1-32 chars)
function isValidSessionId(sessionId) {
  if (typeof sessionId !== "string") return false;
  if (sessionId.length < 1 || sessionId.length > 32) return false;
  return /^[a-zA-Z0-9_-]+$/.test(sessionId);
}

// Validate 6-digit access code
function isValidAccessCode(code) {
  if (typeof code !== "string") return false;
  return /^\d{6}$/.test(code.trim());
}

// Validate nickname: letters, numbers, spaces, hyphens (1-30 chars)
function isValidNickname(nickname) {
  if (typeof nickname !== "string") return false;
  const trimmed = nickname.trim();
  if (trimmed.length < 1 || trimmed.length > 30) return false;
  return /^[\p{L}\d\s'-]+$/u.test(trimmed);
}

// Validate sport type
const VALID_SPORT_TYPES = ["badminton", "tennis", "basketball", "volleyball", "soccer", "other"];
function isValidSportType(sportType) {
  return typeof sportType === "string" && VALID_SPORT_TYPES.includes(sportType.toLowerCase());
}

// Sport-specific validation helpers
const VALID_MATCH_FORMATS = ["singles", "doubles", "mixed_doubles", "any"];
function isValidMatchFormat(format) {
  return typeof format === "string" && VALID_MATCH_FORMATS.includes(format);
}

const VALID_SKILL_LEVELS = ["beginner", "intermediate", "advanced", "all"];
function isValidSkillLevel(level) {
  return typeof level === "string" && VALID_SKILL_LEVELS.includes(level);
}

const RACKET_SPORTS = ["badminton", "tennis"];

// Generate a random 6-digit access code
function generateAccessCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ============================================
// Auth Helpers
// ============================================

// Extract Cognito user claims from API Gateway authorizer context
function getAuthUser(event) {
  const claims = event.requestContext?.authorizer?.claims;
  if (!claims) return null;

  return {
    userId: claims.sub,
    email: claims.email,
    name: claims.name || claims.email?.split("@")[0],
  };
}

// ============================================
// Membership Helpers
// ============================================

// Look up a user's membership in a group
async function getMembership(groupId, userId) {
  const TableName = process.env.TABLE_NAME;
  const result = await ddb.send(
    new GetCommand({
      TableName,
      Key: { PK: `GROUP#${groupId}`, SK: `MEMBER#${userId}` },
    })
  );
  return result.Item || null;
}

// ============================================
// Password Helpers
// ============================================

function isValidGroupPassword(password) {
  if (typeof password !== "string") return false;
  const len = password.trim().length;
  return len >= 6 && len <= 72;
}

async function hashPassword(plaintext) {
  return bcrypt.hash(plaintext, 10);
}

async function verifyPassword(plaintext, hash) {
  return bcrypt.compare(plaintext, hash);
}

module.exports = {
  ddb,
  corsHeaders,
  ok,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  serverError,
  parseBody,
  sanitizeString,
  isValidName,
  isValidGroupId,
  isValidSessionId,
  isValidAccessCode,
  isValidNickname,
  isValidSportType,
  VALID_SPORT_TYPES,
  generateAccessCode,
  getAuthUser,
  getMembership,
  isValidGroupPassword,
  hashPassword,
  verifyPassword,
  VALID_MATCH_FORMATS,
  isValidMatchFormat,
  VALID_SKILL_LEVELS,
  isValidSkillLevel,
  RACKET_SPORTS,
};
