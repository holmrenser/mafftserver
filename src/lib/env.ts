import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.url(),

  JOB_RETRY_LIMIT: z.coerce.number().int().min(0).default(2),
  JOB_EXPIRE_SECONDS: z.coerce.number().int().positive().default(45 * 60),
  PGBOSS_MAX_CONNECTIONS: z.coerce.number().int().positive().default(5),

  // MAFFT jobs are usually seconds, a large --auto job minutes - far below
  // IQ-TREE's hours, hence much smaller defaults than iqtreeserver's.
  MAFFT_JOB_TIMEOUT_MS: z.coerce.number().int().positive().default(30 * 60_000),
  MAFFT_WORKER_THREADS: z.coerce.number().int().positive().default(4),

  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(20 * 1024 * 1024),
  MAX_SEQUENCES: z.coerce.number().int().positive().default(20_000),
  MAX_RESULTS_ZIP_BYTES: z.coerce.number().int().positive().default(200 * 1024 * 1024),
  DATA_DIR: z.string().default("/data"),

  // --- Email notifications (all optional; unset SMTP_HOST disables sending
  // entirely - see src/lib/email.ts) ---
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  // z.coerce.boolean() would treat the *string* "false" as truthy (any
  // non-empty string coerces to true) - this needs an actual string match.
  SMTP_SECURE: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default("mafftserver <no-reply@mafftserver.local>"),
  APP_URL: z.string().default("http://localhost:3000"),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
  }
  if (parsed.data.MAFFT_JOB_TIMEOUT_MS >= parsed.data.JOB_EXPIRE_SECONDS * 1000) {
    throw new Error(
      "MAFFT_JOB_TIMEOUT_MS must be less than JOB_EXPIRE_SECONDS * 1000, otherwise pg-boss " +
        "may treat a still-running job as expired before the worker's own timeout fires.",
    );
  }
  return parsed.data;
}

// Lazy + memoized: validated only on first access, not at module import
// time. Next.js's `next build` imports every route module to statically
// collect its config (runtime, dynamic, etc) without invoking any handler -
// an eager parse here would fail that step in the builder stage, which has
// no real DATABASE_URL and shouldn't need one just to build.
let cached: Env | undefined;

export function getEnv(): Env {
  if (!cached) cached = parseEnv(process.env);
  return cached;
}
