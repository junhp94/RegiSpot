const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");

// DynamoDB client singleton
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// CORS headers
function corsHeaders() {
  return {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
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

module.exports = {
  ddb,
  corsHeaders,
  ok,
  badRequest,
  notFound,
  conflict,
  serverError,
  parseBody,
};
