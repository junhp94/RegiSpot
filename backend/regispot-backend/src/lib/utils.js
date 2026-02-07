const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
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
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
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
  // Remove control characters (0x00-0x1F and 0x7F-0x9F)
  const cleaned = input.replace(/[\x00-\x1F\x7F-\x9F]/g, "");
  return cleaned.trim().slice(0, maxLength);
}

// Validate name: letters, spaces, hyphens, apostrophes (2-50 chars)
function isValidName(name) {
  if (typeof name !== "string") return false;
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 50) return false;
  // Allow letters (including unicode), spaces, hyphens, apostrophes
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
  getAuthUser,
  isValidGroupPassword,
  hashPassword,
  verifyPassword,
};
