import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { AlignmentSummary } from "@/lib/alignment/summary";
import type { StoredJobParameters } from "@/lib/mafft/schema";
import { strategyName } from "@/lib/mafft/strategies";
import { parseFasta } from "@/lib/sequences/fasta";
import { BASE_PATH } from "@/lib/basePath";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResultsPoller } from "./results-poller";
import { ResultsViews } from "./results-views";
import { ColumnStats } from "./column-stats";
import { Stat } from "./stat";

interface PageProps {
  params: Promise<{ id: string }>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const percent = (fraction: number | null) => (fraction === null ? null : `${(fraction * 100).toFixed(1)}%`);

export default async function JobPage({ params }: PageProps) {
  const { id } = await params;

  const job = await prisma.mafftJob.findUnique({
    where: { id },
    select: {
      id: true,
      inputFilename: true,
      parameters: true,
      submitted: true,
      started: true,
      finished: true,
      err: true,
      stderr: true,
      summary: true,
      alignmentFasta: true,
      guideTreeNewick: true,
      resultsZipBytes: true,
    },
  });

  if (!job) notFound();

  const isDone = job.finished !== null || job.err !== null;
  const parameters = job.parameters as unknown as StoredJobParameters;
  const summary = job.summary as unknown as AlignmentSummary | null;
  const rows = job.alignmentFasta
    ? parseFasta(job.alignmentFasta).records.map((r) => ({ id: r.id, sequence: r.sequence }))
    : [];

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-12">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">{job.inputFilename}</h1>
        <p className="font-mono text-xs text-muted-foreground">{job.id}</p>
      </div>

      {!isDone && (
        <>
          <ResultsPoller jobId={job.id} />
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {job.started
              ? `Running MAFFT (${strategyName(parameters.options.strategy)})...`
              : "Queued..."}{" "}
            This page updates automatically.
          </div>
        </>
      )}

      {job.err && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="mb-1 text-sm font-medium text-destructive">Job failed</p>
          <pre className="max-h-96 overflow-auto text-xs whitespace-pre-wrap text-destructive/90">{job.err}</pre>
        </div>
      )}

      {job.finished && !job.err && summary && (
        <>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Command</span>
            <pre className="overflow-x-auto rounded-lg bg-muted px-3 py-2.5 font-mono text-xs">
              <span className="text-muted-foreground select-none">$ </span>
              {summary.command}
            </pre>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="MAFFT version" value={summary.version ? `v${summary.version}` : null} />
                <Stat
                  label="Strategy"
                  value={
                    summary.strategyUsed
                      ? `${summary.strategyUsed} (picked by --auto)`
                      : strategyName(parameters.options.strategy)
                  }
                />
                <Stat label="Sequences" value={summary.sequenceCount.toLocaleString()} />
                <Stat label="Alignment length" value={`${summary.length.toLocaleString()} columns`} />
                <Stat label="Gaps" value={percent(summary.gapFraction)} />
                <Stat
                  label={summary.identitySampled ? "Mean pairwise identity (sampled)" : "Mean pairwise identity"}
                  value={percent(summary.meanPairwiseIdentity)}
                />
                <ColumnStats rows={rows} />
              </dl>
              {summary.reversedSequences.length > 0 && (
                <p className="mt-4 text-sm text-muted-foreground">
                  MAFFT reverse-complemented {summary.reversedSequences.length} sequence
                  {summary.reversedSequences.length === 1 ? "" : "s"} (shown with an <code>_R_</code> prefix):{" "}
                  {summary.reversedSequences.join(", ")}.
                </p>
              )}
            </CardContent>
          </Card>

          <ResultsViews rows={rows} guideTreeNewick={job.guideTreeNewick} stderr={job.stderr} />

          <Card>
            <CardHeader>
              <CardTitle>Download</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {(
                [
                  ["fasta", "FASTA"],
                  ["clustal", "Clustal"],
                  ["phylip", "PHYLIP (relaxed)"],
                  ...(job.guideTreeNewick ? [["newick", "Guide tree (Newick)"]] : []),
                ] as const
              ).map(([format, label]) => (
                <a
                  key={format}
                  href={`${BASE_PATH}/api/jobs/${job.id}/download?format=${format}`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  {label}
                </a>
              ))}
              {job.resultsZipBytes !== null && (
                <a
                  href={`${BASE_PATH}/api/jobs/${job.id}/download?format=zip`}
                  className={buttonVariants({ size: "sm" })}
                >
                  All results (.zip, {formatBytes(job.resultsZipBytes)})
                </a>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}

