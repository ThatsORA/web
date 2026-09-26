import { z } from "zod";

const Env = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().default("postgresql://postgres:postgres@localhost:5432/web"),
  JWT_SECRET: z.string().default("dev-only-secret"),
  INTERNAL_SECRET: z.string().default("dev-only-internal"),
  GOOGLE_MAPS_API_KEY: z.string().default(""),
  GEMINI_API_KEY: z.string().default(""),
  VOTE_TIMEOUT_SEC: z.coerce.number().default(43200),
  COOLDOWN_HOURS: z.coerce.number().default(48),
  MATCH_HORIZON_DAYS: z.coerce.number().default(7),
  MIN_LEAD_HOURS: z.coerce.number().default(2),
  BUSY_PADDING_MIN: z.coerce.number().default(15),
  GEMINI_TIMEOUT_MS: z.coerce.number().default(8000),
  REPORT_CLOSED_WINDOW_HOURS: z.coerce.number().default(24),
  DEMO_MODE: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
});

export const env = Env.parse(process.env);
export type Env = typeof env;
