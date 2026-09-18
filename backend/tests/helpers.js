// Shared test setup. Env must be set BEFORE importing app modules (config reads it at import time).
process.env.NODE_ENV = "test";
// Structurally valid (but fake) Clerk keys: pk_test_ + base64("<frontend-api-host>$").
process.env.CLERK_PUBLISHABLE_KEY = `pk_test_${Buffer.from("example.clerk.accounts.dev$").toString("base64")}`;
process.env.CLERK_SECRET_KEY = "sk_test_fake_secret_for_tests";
process.env.CLERK_WEBHOOK_SIGNING_SECRET = `whsec_${Buffer.from("test-secret").toString("base64")}`;
delete process.env.DEEPSEEK_API_KEY;

// Networkless token verification: Clerk verifies against this PEM instead of fetching JWKS.
// `testSigningKey` signs tokens the backend accepts; anything else must be rejected.
import { generateKeyPairSync, createSign } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
process.env.CLERK_JWT_KEY = publicKey.export({ type: "spki", format: "pem" });
export const { privateKey: otherPrivateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
export const testSigningKey = privateKey;

/** Builds an RS256 Clerk-style session JWT signed with `key`. */
export const signSessionToken = (key, claims = {}) => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const header = b64({ alg: "RS256", typ: "JWT", kid: "ins_test" });
  const payload = b64({
    sub: "user_test_123",
    sid: "sess_test_123",
    iss: "https://example.clerk.accounts.dev",
    iat: now - 5,
    nbf: now - 5,
    exp: now + 60,
    v: 2,
    ...claims,
  });
  const signature = createSign("RSA-SHA256").update(`${header}.${payload}`).sign(key).toString("base64url");
  return `${header}.${payload}.${signature}`;
};

export const buildApp = async () => {
  const { default: express } = await import("express");
  const { default: expressApp } = await import("../express-app.js");
  const app = express();
  await expressApp(app);
  return app;
};
