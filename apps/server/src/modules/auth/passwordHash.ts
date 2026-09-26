import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";

const PREFIX = "sha256:";
const digest = (password: string) => createHash("sha256").update(password, "utf8").digest("hex");

// bcrypt consumes at most 72 bytes. A fixed 64-byte digest preserves the entire
// allowed Unicode password; the marker keeps existing raw bcrypt hashes usable.
export const hashPassword = async (password: string): Promise<string> =>
  PREFIX + await bcrypt.hash(digest(password), 10);

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await (hash.startsWith(PREFIX)
      ? bcrypt.compare(digest(password), hash.slice(PREFIX.length))
      : bcrypt.compare(password, hash));
  } catch {
    return false;
  }
}
