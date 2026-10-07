import type { PrismaClient } from "../generated/prisma/client";
import type { AlignmentSummary } from "./alignment/summary";

/**
 * Thin abstraction over where finished-job outputs live. Backed by Postgres
 * text/bytea columns (as in iqtreeserver) - if sizes ever outgrow that, only
 * this file changes, not its call sites in the worker or the routes.
 */

export interface JobResults {
  stderr: string;
  summary: AlignmentSummary;
  alignmentFasta: string;
  guideTreeNewick: string | null;
  resultsZip: Buffer;
}

export async function putResults(prisma: PrismaClient, jobId: string, results: JobResults): Promise<void> {
  await prisma.mafftJob.update({
    where: { id: jobId },
    data: {
      stderr: results.stderr,
      summary: results.summary as object,
      alignmentFasta: results.alignmentFasta,
      guideTreeNewick: results.guideTreeNewick,
      resultsZip: Uint8Array.from(results.resultsZip),
      resultsZipBytes: results.resultsZip.byteLength,
      finished: new Date(),
    },
  });
}

export interface StoredZip {
  resultsZip: Buffer;
  resultsZipBytes: number;
}

export async function getResultsZip(prisma: PrismaClient, jobId: string): Promise<StoredZip | null> {
  const row = await prisma.mafftJob.findUnique({
    where: { id: jobId },
    select: { resultsZip: true, resultsZipBytes: true },
  });
  if (!row?.resultsZip) return null;
  return { resultsZip: Buffer.from(row.resultsZip), resultsZipBytes: row.resultsZipBytes ?? row.resultsZip.byteLength };
}

export async function getAlignmentFasta(prisma: PrismaClient, jobId: string): Promise<string | null> {
  const row = await prisma.mafftJob.findUnique({ where: { id: jobId }, select: { alignmentFasta: true } });
  return row?.alignmentFasta ?? null;
}
