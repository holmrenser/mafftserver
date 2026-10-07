import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Lightweight status JSON for the client-side results poller (see
 * app/jobs/[id]/results-poller.tsx). Deliberately excludes every heavy
 * column (inputData, existingAlnData, resultsZip, alignmentFasta, stderr) - the
 * results page itself reads those directly via Prisma as a Server Component
 * once the job is done, this route only needs to answer "is it done yet".
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;

  const job = await prisma.mafftJob.findUnique({
    where: { id },
    select: { id: true, submitted: true, started: true, finished: true, err: true },
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: job.id,
    submitted: job.submitted,
    started: job.started,
    finished: job.finished,
    err: job.err,
    done: job.finished !== null || job.err !== null,
  });
}
