// Owner: Ojas — transactional email through Resend's HTTP API (no SDK).
import { env } from "../../env";

export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  if (!env.EMAIL_API_KEY) {
    // ponytail: no provider configured (local dev, demo) — log instead. Set EMAIL_API_KEY before requiring verification.
    console.log(`[email to ${to}] ${subject}\n${text}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.EMAIL_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, to, subject, text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`email send failed: ${res.status} ${await res.text()}`);
}

export const sendCodeEmail = (to: string, code: string) =>
  sendEmail(to, `Your Web code: ${code}`, `Your code is ${code}. It expires in 10 minutes.\n\nIf you didn't ask for it, you can ignore this email.`);
