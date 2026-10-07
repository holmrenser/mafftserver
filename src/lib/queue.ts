import { getEnv } from "./env";

/**
 * Single queue for the whole app (as in iqtreeserver): format conversion
 * and zipping happen inside the same job or at download time, so there is
 * no second async operation that would need its own queue.
 *
 * pg-boss is transport + retry/expiry only. The `mafftjob` Postgres table
 * (via Prisma) is the single source of truth for job status.
 */
export const MAFFT_QUEUE = "mafft-jobs";

export function getJobRetryLimit(): number {
  return getEnv().JOB_RETRY_LIMIT;
}

/**
 * How long pg-boss waits before considering an in-flight job lost. Asserted
 * (src/lib/env.ts) to exceed MAFFT_JOB_TIMEOUT_MS, so the worker's own
 * process-level timeout fires first and produces a clean error row instead
 * of a silent pg-boss-side retry race.
 */
export function getJobExpireSeconds(): number {
  return getEnv().JOB_EXPIRE_SECONDS;
}

export function getPgBossMaxConnections(): number {
  return getEnv().PGBOSS_MAX_CONNECTIONS;
}

/** Keep pg-boss payloads small - the worker re-fetches the full row by id. */
export interface MafftJobPayload {
  jobId: string;
}
