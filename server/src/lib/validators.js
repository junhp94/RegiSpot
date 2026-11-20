/**
 * Input validators — ported from backend/regispot-backend/src/lib/utils.js.
 * generateAccessCode now uses crypto.randomInt (cryptographically random)
 * instead of Math.random (not cryptographically random).
 */
import { randomInt } from "crypto";

export function sanitizeString(input, maxLength = 100) {
  if (typeof input !== "string") return "";
  return input.replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim().slice(0, maxLength);
}

export function isValidName(name) {
  if (typeof name !== "string") return false;
  const t = name.trim();
  return t.length >= 1 && t.length <= 50 && /^[\p{L}\s'-]+$/u.test(t);
}

export function isValidGroupId(id) {
  if (typeof id !== "string") return false;
  return id.length >= 1 && id.length <= 32 && /^[a-zA-Z0-9_-]+$/.test(id);
}

export function isValidSessionId(id) {
  if (typeof id !== "string") return false;
  return id.length >= 1 && id.length <= 32 && /^[a-zA-Z0-9_-]+$/.test(id);
}

export function isValidAccessCode(code) {
  if (typeof code !== "string") return false;
  return /^\d{6}$/.test(code.trim());
}

export function isValidNickname(nickname) {
  if (typeof nickname !== "string") return false;
  const t = nickname.trim();
  return t.length >= 1 && t.length <= 30 && /^[\p{L}\d\s'-]+$/u.test(t);
}

export const VALID_SPORT_TYPES = ["badminton", "tennis", "basketball", "volleyball", "soccer", "other"];
export function isValidSportType(sportType) {
  return typeof sportType === "string" && VALID_SPORT_TYPES.includes(sportType.toLowerCase());
}

export const VALID_MATCH_FORMATS = ["singles", "doubles", "mixed_doubles", "any"];
export function isValidMatchFormat(format) {
  return typeof format === "string" && VALID_MATCH_FORMATS.includes(format);
}

export const VALID_SKILL_LEVELS = ["beginner", "intermediate", "advanced", "all"];
export function isValidSkillLevel(level) {
  return typeof level === "string" && VALID_SKILL_LEVELS.includes(level);
}

export const RACKET_SPORTS = ["badminton", "tennis"];

// Generate a 6-digit access code using crypto.randomInt (uniform distribution,
// cryptographically random) instead of Math.random.
export function generateAccessCode() {
  return String(randomInt(100000, 1000000));
}
