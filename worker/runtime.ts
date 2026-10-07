import { PgBoss } from "pg-boss";
import type { JobWithMetadata } from "pg-boss";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getEnv } from "../src/lib/env";
import { getPgBossMaxConnections } from "../src/lib/queue";

export interface WorkerRuntimeConfig<T extends { jobId: string }> {
  queue: string;
  name: string;
  /** Do the actual job work. Throw to trigger a pg-boss retry/failure. */
  process: (prisma: PrismaClient, jobData: T) => Promise<void>;
  /**
   * Called once retries are exhausted (job.retryCount >= job.retryLimit).
   * Should persist a terminal error state on the job's row - this is what
   * makes Postgres (not pg-boss) the source of truth the app polls.
   */
  recordFailure: (prisma: PrismaClient, jobId: string, message: string) => Promise<void>;
}

/**
 * Generic pg-boss worker runtime. `run()` starts its own pg-boss instance
 * (supervise defaults to true here - workers own maintenance/expiry, unlike
 * the app-side client in src/app/api/queue.ts which explicitly opts out),
 * subscribes to `config.queue`, and wraps every job so a failure is only
 * written back to Postgres once retries are exhausted - a job still being
 * retried should not prematurely show as "failed" in the UI.
 */
export class WorkerRuntime<T extends { jobId: string }> {
  private readonly prisma: PrismaClient;
  private boss: PgBoss | undefined;

  constructor(private readonly config: WorkerRuntimeConfig<T>) {
    const adapter = new PrismaPg({ connectionString: getEnv().DATABASE_URL });
    this.prisma = new PrismaClient({ adapter });
  }

  async run(): Promise<void> {
    const boss = new PgBoss({
      connectionString: getEnv().DATABASE_URL,
      max: getPgBossMaxConnections(),
    });
    this.boss = boss;
    boss.on("error", (err) => console.error(`[${this.config.name}] pg-boss error:`, err));

    await boss.start();
    await boss.createQueue(this.config.queue);

    await boss.work<T>(this.config.queue, { includeMetadata: true }, async (jobs) => {
      for (const job of jobs as JobWithMetadata<T>[]) {
        await this.handleJob(job);
      }
    });

    console.log(`[${this.config.name}] listening on queue "${this.config.queue}"`);

    this.installShutdownHandlers();
  }

  private async handleJob(job: JobWithMetadata<T>): Promise<void> {
    try {
      await this.config.process(this.prisma, job.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (job.retryCount >= job.retryLimit) {
        try {
          await this.config.recordFailure(this.prisma, job.data.jobId, message);
        } catch (recordErr) {
          console.error(`[${this.config.name}] failed to record failure for job ${job.data.jobId}:`, recordErr);
        }
      }
      // Rethrow so pg-boss records the failed attempt and drives its own retry logic.
      throw err;
    }
  }

  private installShutdownHandlers(): void {
    const shutdown = async (signal: string) => {
      console.log(`[${this.config.name}] received ${signal}, draining...`);
      try {
        await this.boss?.stop({ graceful: true });
      } finally {
        await this.prisma.$disconnect();
        process.exit(0);
      }
    };
    process.once("SIGTERM", () => void shutdown("SIGTERM"));
    process.once("SIGINT", () => void shutdown("SIGINT"));
  }
}
