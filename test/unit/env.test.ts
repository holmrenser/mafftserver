import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

const base = { DATABASE_URL: "postgresql://u:p@localhost:5432/db" };

describe("parseEnv", () => {
  it("applies defaults", () => {
    const env = parseEnv(base);
    expect(env.MAFFT_JOB_TIMEOUT_MS).toBe(30 * 60_000);
    expect(env.JOB_EXPIRE_SECONDS).toBe(45 * 60);
    expect(env.SMTP_SECURE).toBe(false);
  });

  it("treats the string 'false' as false for SMTP_SECURE", () => {
    expect(parseEnv({ ...base, SMTP_SECURE: "false" }).SMTP_SECURE).toBe(false);
    expect(parseEnv({ ...base, SMTP_SECURE: "true" }).SMTP_SECURE).toBe(true);
  });

  it("requires the MAFFT timeout to be shorter than pg-boss expiry", () => {
    expect(() => parseEnv({ ...base, MAFFT_JOB_TIMEOUT_MS: "3600000", JOB_EXPIRE_SECONDS: "1800" })).toThrow(
      /MAFFT_JOB_TIMEOUT_MS/,
    );
  });

  it("rejects a missing DATABASE_URL", () => {
    expect(() => parseEnv({})).toThrow(/Invalid environment/);
  });
});
