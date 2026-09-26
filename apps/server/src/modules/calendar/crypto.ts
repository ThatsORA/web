import crypto from "crypto";
import { env } from "../../env";

export function signState(userId: string, redirectUri?: string): string {
  const payload = JSON.stringify({
    userId,
    redirectUri,
    exp: Date.now() + 10 * 60 * 1000,
  });
  const encodedPayload = Buffer.from(payload).toString("base64url");
  const signature = crypto
    .createHmac("sha256", env.JWT_SECRET)
    .update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
}

export function verifyState(state: string): { userId: string; redirectUri?: string } {
  const parts = state.split(".");
  if (parts.length !== 2) {
    throw new Error("Invalid state parameter format");
  }

  const encodedPayload = parts[0] as string;
  const signature = parts[1] as string;

  const expectedSignature = crypto
    .createHmac("sha256", env.JWT_SECRET)
    .update(encodedPayload)
    .digest("base64url");

  // Prevent timing attacks
  const expectedBuffer = Buffer.from(expectedSignature);
  const signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length || !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) {
    throw new Error("Invalid state signature");
  }

  const decodedPayload = Buffer.from(encodedPayload, "base64url").toString("utf8");
  let payload: { userId: string; redirectUri?: string; exp: number };
  try {
    payload = JSON.parse(decodedPayload);
  } catch (e) {
    throw new Error("Invalid state payload");
  }

  if (Date.now() > payload.exp) {
    throw new Error("State parameter expired");
  }

  return { userId: payload.userId, redirectUri: payload.redirectUri };
}

export function encryptToken(token: string): string {
  if (env.GOOGLE_TOKEN_ENC_KEY.length !== 32) {
    throw new Error("GOOGLE_TOKEN_ENC_KEY must be exactly 32 bytes");
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(env.GOOGLE_TOKEN_ENC_KEY, "utf8"), iv);
  
  let encrypted = cipher.update(token, "utf8", "base64");
  encrypted += cipher.final("base64");
  
  const authTag = cipher.getAuthTag().toString("base64");
  const ivBase64 = iv.toString("base64");
  
  return `${ivBase64}:${authTag}:${encrypted}`;
}

export function decryptToken(encryptedTokenStr: string): string {
  if (env.GOOGLE_TOKEN_ENC_KEY.length !== 32) {
    throw new Error("GOOGLE_TOKEN_ENC_KEY must be exactly 32 bytes");
  }

  const parts = encryptedTokenStr.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted token format");
  }

  const ivBase64 = parts[0] as string;
  const authTagBase64 = parts[1] as string;
  const encryptedBase64 = parts[2] as string;

  const iv = Buffer.from(ivBase64, "base64");
  const authTag = Buffer.from(authTagBase64, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(env.GOOGLE_TOKEN_ENC_KEY, "utf8"), iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedBase64, "base64", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
