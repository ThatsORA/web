import { z } from "zod";

const Env = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().default("mongodb://localhost:27017/web"),
  JWT_SECRET: z.string().default("dev-only-secret"),
  INTERNAL_SECRET: z.string().default("dev-only-internal"),
  GOOGLE_OAUTH_CLIENT_ID: z.string().default(""),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().default(""),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().default("http://localhost:3000/calendar/google/callback"),
  GOOGLE_TOKEN_ENC_KEY: z.string().default("00000000000000000000000000000000"), // 32 bytes
  GOOGLE_MAPS_API_KEY: z.string().default(""),
  GEMINI_API_KEY: z.string().default(""),
  JEV_API_KEY: z.string().default(""), // Jev, the fallback decision model
  LAYA_URL: z.string().default(""), // self-hosted laya-serve; empty = Jev only
  LAYA_API_KEY: z.string().default(""),
  VOTE_TIMEOUT_SEC: z.coerce.number().default(43200),
  COOLDOWN_HOURS: z.coerce.number().default(48),
  MATCH_HORIZON_DAYS: z.coerce.number().default(7),
  MIN_LEAD_HOURS: z.coerce.number().default(2),
  BUSY_PADDING_MIN: z.coerce.number().default(15),
  GEMINI_TIMEOUT_MS: z.coerce.number().default(8000),
  DECISION_TIMEOUT_MS: z.coerce.number().default(8000),
  REPORT_CLOSED_WINDOW_HOURS: z.coerce.number().default(24),
  EMAIL_API_KEY: z.string().default(""), // Resend; required when email verification is enabled
  EMAIL_FROM: z.string().default(""), // Must use a sender allowed by the configured Resend account
  EMAIL_VERIFICATION_REQUIRED: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
  DEMO_MODE: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
});

export const env = Env.parse(process.env);
export type Env = typeof env;
