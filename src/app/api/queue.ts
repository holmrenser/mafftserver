import { PgBoss } from "pg-boss";
import { getEnv } from "@/lib/env";
import { MAFFT_QUEUE, getPgBossMaxConnections } from "@/lib/queue";

// App-side lazy singleton. `supervise: false, schedule: false` because
// maintenance/expiry only needs to run once, in the worker processes - not in
// every Next.js instance/replica. This file only ever sends jobs, never
// works them.
let bossPromise: Promise<PgBoss> | undefined;

export function getBoss(): Promise<PgBoss> {
  if (!bossPromise) {
    bossPromise = (async () => {
      const boss = new PgBoss({
        connectionString: getEnv().DATABASE_URL,
        max: getPgBossMaxConnections(),
        supervise: false,
        schedule: false,
      });
      boss.on("error", (err) => console.error("pg-boss error:", err));
      await boss.start();
      await boss.createQueue(MAFFT_QUEUE);
      return boss;
    })();
  }
  return bossPromise;
}
