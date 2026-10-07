import { WorkerRuntime } from "./runtime";
import { runMafftJob } from "./processors/mafft";
import { MAFFT_QUEUE, type MafftJobPayload } from "../src/lib/queue";
import { sendJobNotification } from "../src/lib/email";

const runtime = new WorkerRuntime<MafftJobPayload>({
  queue: MAFFT_QUEUE,
  name: "mafftworker",
  process: (prisma, jobData) => runMafftJob(prisma, jobData.jobId),
  recordFailure: async (prisma, jobId, message) => {
    const row = await prisma.mafftJob.update({
      where: { id: jobId },
      data: { err: message, finished: new Date() },
    });

    if (row.notifyEmail) {
      await sendJobNotification({
        to: row.notifyEmail,
        jobId,
        inputFilename: row.inputFilename,
        outcome: "failed",
        errorMessage: message,
      });
    }
  },
});

runtime.run().catch((err) => {
  console.error("[mafftworker] fatal error during startup:", err);
  process.exit(1);
});
