import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Reports how the job queue is doing. Counts are derived directly from the
 * `mafftjob` table (the source of truth the results page already polls),
 * using the submitted/started/finished/err columns - mirrors blastserver's
 * /api/queue, adapted to this app's single job model:
 *   waiting   = submitted, not yet picked up
 *   active    = picked up, not finished
 *   completed = finished without error
 *   failed    = errored
 */
export async function GET() {
  const [waiting, active, completed, failed] = await Promise.all([
    prisma.mafftJob.count({ where: { started: null, finished: null, err: null } }),
    prisma.mafftJob.count({ where: { started: { not: null }, finished: null, err: null } }),
    prisma.mafftJob.count({ where: { finished: { not: null }, err: null } }),
    prisma.mafftJob.count({ where: { err: { not: null } } }),
  ]);

  return NextResponse.json({ waiting, active, completed, failed });
}
