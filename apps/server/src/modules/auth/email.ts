// Owner: Ojas — transactional email through Resend's HTTP API (no SDK).
import { env } from "../../env";

export type EmailDeliveryFailure = "not_configured" | "provider_rejected" | "unavailable";

export class EmailDeliveryError extends Error {
  constructor(readonly reason: EmailDeliveryFailure) {
    super(`email delivery failed: ${reason}`);
    this.name = "EmailDeliveryError";
  }
}

export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  if (!env.EMAIL_API_KEY || !env.EMAIL_FROM) throw new EmailDeliveryError("not_configured");
  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.EMAIL_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM, to, subject, text }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new EmailDeliveryError("unavailable");
  }
  if (!res.ok) throw new EmailDeliveryError("provider_rejected");
}

export const sendCodeEmail = (to: string, code: string) =>
  sendEmail(to, `Your Web code: ${code}`, `Your code is ${code}. It expires in 10 minutes.\n\nIf you didn't ask for it, you can ignore this email.`);
