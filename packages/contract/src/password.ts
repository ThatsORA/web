import { commonPasswords } from "./passwords/common-passwords";

const blocked = new Set(commonPasswords.map((password) => password.toLowerCase()));
export const passwordReasons = {
  length: "Use 6–30 characters.",
  common: "This password is too common. Choose a different one.",
  username: "Your password must not contain your username.",
  email: "Your password must not contain the part of your email before @.",
  repeated: "Avoid a password made of one repeated character.",
  sequence: "Avoid simple sequences like 1234567890 or abcdefghij.",
} as const;

export type PasswordCheck = { ok: true } | { ok: false; reason: string };

/** Shared signup/password-change policy. Never apply it during login. */
export function checkPassword(password: string, { username, email }: { username: string; email: string }): PasswordCheck {
  const characters = Array.from(password);
  if (characters.length < 6 || characters.length > 30) return { ok: false, reason: passwordReasons.length };
  const lower = password.toLowerCase();
  // Prefer the more specific explanation when a pattern also occurs in the blocklist.
  if (characters.every((character) => character === characters[0])) return { ok: false, reason: passwordReasons.repeated };
  const sequences = ["0123456789", "abcdefghijklmnopqrstuvwxyz", "qwertyuiop", "asdfghjkl", "zxcvbnm"];
  if (sequences.some((sequence) => {
    const repeated = sequence.repeat(Math.ceil(lower.length / sequence.length) + 1);
    return repeated.includes(lower) || Array.from(repeated).reverse().join("").includes(lower);
  })) return { ok: false, reason: passwordReasons.sequence };
  if (blocked.has(lower)) return { ok: false, reason: passwordReasons.common };
  const normalizedUsername = username.trim().toLowerCase();
  if (normalizedUsername && lower.includes(normalizedUsername)) return { ok: false, reason: passwordReasons.username };
  const localPart = email.trim().split("@")[0]!.toLowerCase();
  // Skip 1–2 character local parts ("a@x.com"): they'd block almost every password. 3 matches the username minimum.
  if (localPart.length >= 3 && lower.includes(localPart)) return { ok: false, reason: passwordReasons.email };
  return { ok: true };
}
