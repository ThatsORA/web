import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../env";
import { EmailDeliveryError, sendCodeEmail, sendEmail } from "./email";

const original = { EMAIL_API_KEY: env.EMAIL_API_KEY, EMAIL_FROM: env.EMAIL_FROM };

beforeEach(() => {
  env.EMAIL_API_KEY = "resend-test-key";
  env.EMAIL_FROM = "Web <verify@example.com>";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  env.EMAIL_API_KEY = original.EMAIL_API_KEY;
  env.EMAIL_FROM = original.EMAIL_FROM;
});

describe("transactional email", () => {
  it("sends a verification code through Resend", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "email-1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendCodeEmail("person@example.com", "123456");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers).toEqual({ authorization: "Bearer resend-test-key", "content-type": "application/json" });
    expect(JSON.parse(String(init.body))).toEqual({
      from: "Web <verify@example.com>",
      to: "person@example.com",
      subject: "Your Web code: 123456",
      text: "Your code is 123456. It expires in 10 minutes.\n\nIf you didn't ask for it, you can ignore this email.",
    });
  });

  it("fails without configuration and never logs the code", async () => {
    env.EMAIL_API_KEY = "";
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendCodeEmail("person@example.com", "654321"))
      .rejects.toMatchObject<Partial<EmailDeliveryError>>({ reason: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it("returns safe failures for provider rejection and network errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("provider details", { status: 403 })));
    await expect(sendEmail("person@example.com", "Subject", "Body"))
      .rejects.toMatchObject<Partial<EmailDeliveryError>>({ reason: "provider_rejected", message: "email delivery failed: provider_rejected" });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("socket details")));
    await expect(sendEmail("person@example.com", "Subject", "Body"))
      .rejects.toMatchObject<Partial<EmailDeliveryError>>({ reason: "unavailable", message: "email delivery failed: unavailable" });
  });
});
