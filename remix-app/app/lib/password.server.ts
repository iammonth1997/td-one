/**
 * Password validation service — NIST SP 800-63B
 *
 * Rules:
 *  - Length 12–128 characters
 *  - All Unicode characters allowed (including Thai, spaces, special chars)
 *  - No mandatory complexity composition rules
 *  - Check against common weak patterns
 *  - Check against employee_id match
 *
 * Hashing: bcrypt cost factor 12 (bcryptjs, pure JS — compatible with Cloudflare Workers)
 * Note: Argon2id would be preferred per NIST but requires native/WASM not yet verified in
 * Cloudflare Workers edge environment.  bcrypt cost 12 is the documented fallback.
 */

import bcrypt from "bcryptjs";

const MIN_LENGTH = 12;
const MAX_LENGTH = 128;
const BCRYPT_COST = 12;

export interface PasswordValidationResult {
  valid: boolean;
  error?: string;
}

// Common/sequential patterns to block
const BLOCKED_PATTERNS = [
  /^(.)\1{11,}$/u,                    // All same character (aaaaaaaaaaaaa)
  /^(01234567|12345678|23456789|0123456789)/, // Ascending sequences
  /^(98765432|87654321|76543210)/,    // Descending sequences
  /^(qwertyuiop|asdfghjkl|zxcvbnm)/i,// Keyboard walks
];

/**
 * Validate a password against NIST SP 800-63B rules.
 * Returns { valid: true } or { valid: false, error: "ERROR_CODE" }
 */
export function validatePasswordPolicy(
  password: string,
  empId?: string
): PasswordValidationResult {
  if (!password || typeof password !== "string") {
    return { valid: false, error: "INVALID_INPUT" };
  }

  // Length check (count Unicode code points, not UTF-16 units)
  const codePoints = [...password].length;

  if (codePoints < MIN_LENGTH) {
    return { valid: false, error: "PASSWORD_TOO_SHORT" };
  }

  if (codePoints > MAX_LENGTH) {
    return { valid: false, error: "PASSWORD_TOO_LONG" };
  }

  // Must not match employee ID (case-insensitive)
  if (empId && password.toLowerCase().includes(empId.toLowerCase())) {
    return { valid: false, error: "PASSWORD_CONTAINS_EMP_ID" };
  }

  // Block trivially weak patterns
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(password)) {
      return { valid: false, error: "PASSWORD_TOO_SIMPLE" };
    }
  }

  return { valid: true };
}

/**
 * Hash a password with bcrypt cost 12.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

/**
 * Verify a password against a stored bcrypt hash.
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Check if a new password was recently used (password history, last 3).
 * Returns true if the password was found in history (must reject).
 */
export async function isPasswordReused(
  newPassword: string,
  passwordHistory: string[]
): Promise<boolean> {
  for (const oldHash of passwordHistory.slice(0, 3)) {
    if (await bcrypt.compare(newPassword, oldHash)) {
      return true;
    }
  }
  return false;
}

/**
 * Build the updated history array: prepend new hash, keep last 3.
 */
export function buildPasswordHistory(
  currentHash: string,
  existingHistory: string[]
): string[] {
  return [currentHash, ...existingHistory].slice(0, 3);
}
