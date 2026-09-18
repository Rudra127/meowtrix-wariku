// @file backend/lib/crypto.js
// Encrypts third-party access tokens before they touch the database.
//
// Why: a Zerodha access token is a bearer credential for someone's brokerage account. A leaked
// database dump must not be enough to read anyone's portfolio, so tokens are encrypted at rest with
// a key that lives only in the environment (ENCRYPTION_KEY), never in Mongo.
//
// AES-256-GCM: authenticated, so a tampered ciphertext fails loudly instead of decrypting to junk.
import { createCipheriv, createDecipheriv, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { config } from "../config/index.js";
import { ServiceUnavailableError } from "../utils/index.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit nonce, the GCM standard
const VERSION = "v1"; // lets us rotate the scheme later without guessing at old rows

let cachedKey = null;
let cachedSource = null;

/**
 * 32-byte key from ENCRYPTION_KEY. A 64-char hex string is used directly; anything else is
 * stretched with scrypt so a short/human-typed value still yields a full-strength key.
 */
const encryptionKey = () => {
  const secret = config.encryptionKey;
  if (!secret) {
    throw new ServiceUnavailableError("Secure storage is not configured (ENCRYPTION_KEY missing)");
  }
  if (cachedKey && cachedSource === secret) return cachedKey;

  cachedKey = /^[0-9a-fA-F]{64}$/.test(secret)
    ? Buffer.from(secret, "hex")
    : scryptSync(secret, "wariku:token-encryption", 32);
  cachedSource = secret;
  return cachedKey;
};

/** True when encryption is usable — callers can degrade gracefully instead of throwing. */
export const canEncrypt = () => Boolean(config.encryptionKey);

/**
 * @param {string} plaintext
 * @returns {string} "v1.<iv>.<authTag>.<ciphertext>", all base64url
 */
export const encryptSecret = (plaintext) => {
  if (typeof plaintext !== "string" || !plaintext) throw new TypeError("encryptSecret expects a non-empty string");
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(
    "."
  );
};

/**
 * Reverses `encryptSecret`. Returns null instead of throwing when the payload can't be read —
 * which is exactly what happens after ENCRYPTION_KEY is rotated. Callers treat null as
 * "connection lost, ask the user to reconnect".
 *
 * @param {string} payload
 * @returns {string | null}
 */
export const decryptSecret = (payload) => {
  if (typeof payload !== "string" || !payload) return null;
  const [version, iv, authTag, ciphertext] = payload.split(".");
  if (version !== VERSION || !iv || !authTag || !ciphertext) return null;
  try {
    const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(authTag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null; // wrong key, or the row was tampered with
  }
};

// ---- Signed state tokens -------------------------------------------------------------------
//
// OAuth-style callbacks arrive from a browser with no Clerk session attached, so the redirect has to
// carry "who started this". A signed, short-lived token does that without a server-side store and
// without trusting a user id in the query string.

const stateKey = () => createHmac("sha256", encryptionKey()).update("oauth-state").digest();

/**
 * @param {object} payload  Small and non-secret — it is visible in the URL.
 * @param {number} ttlSeconds
 */
export const signState = (payload, ttlSeconds = 600) => {
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds })
  ).toString("base64url");
  const signature = createHmac("sha256", stateKey()).update(body).digest("base64url");
  return `${body}.${signature}`;
};

/**
 * Verifies signature and expiry.
 * @returns {object | null} the payload, or null if forged/expired/malformed
 */
export const verifyState = (token) => {
  if (typeof token !== "string") return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  // No key configured → nothing could have been signed, so nothing verifies. Returning null keeps
  // callers on their "that link is no longer valid" path instead of 503-ing inside a browser tab.
  if (!canEncrypt()) return null;

  const expected = createHmac("sha256", stateKey()).update(body).digest("base64url");
  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  // Constant-time compare; length check first because timingSafeEqual throws on a mismatch.
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
};
