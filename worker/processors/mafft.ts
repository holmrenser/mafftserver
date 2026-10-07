import { spawnSync } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { ZipArchive } from "archiver";
import type { PrismaClient } from "../../src/generated/prisma/client";
import { getEnv } from "../../src/lib/env";
import { buildMafftArgs, displayCommand, guideTreePath } from "../../src/lib/mafft/buildArgs";
import { unmangleGuideTree } from "../../src/lib/mafft/guideTree";
import { explainFailure, parseStderr } from "../../src/lib/mafft/parseStderr";
import { mafftSubmissionSchema, type MafftSubmission, type StoredJobParameters } from "../../src/lib/mafft/schema";
import { parseFasta } from "../../src/lib/sequences/fasta";
import { computeAlignmentStats } from "../../src/lib/alignment/stats";
import type { AlignmentSummary } from "../../src/lib/alignment/summary";
import { putResults, type JobResults } from "../../src/lib/storage";
import { sendJobNotification } from "../../src/lib/email";

const MAFFT_BIN = process.env.MAFFT_BIN ?? "mafft";

/** MAFFT's prefix for sequences it reverse-complemented under --adjustdirection. */
const REVERSED_PREFIX = "_R_";

export class MafftRunError extends Error {}

export interface ExecuteInput {
  options: MafftSubmission;
  inputFasta: string;
  existingAlignmentFasta?: string;
  /** Scratch directory owned by this run - created and must be empty. */
  workDir: string;
  threads: number;
  timeoutMs: number;
}

/**
 * Everything between "here is the input" and "here are the results",
 * with no database involved - so the smoke test can drive exactly the code
 * path production uses.
 */
export async function executeMafft(input: ExecuteInput): Promise<Omit<JobResults, "resultsZip"> & { files: string[] }> {
  const { options, workDir } = input;

  const inputPath = path.join(workDir, options.mode === "add" ? "new.fasta" : "input.fasta");
  await writeFile(inputPath, input.inputFasta);
  let existingAlignmentPath: string | undefined;
  if (options.mode === "add") {
    if (!input.existingAlignmentFasta) throw new MafftRunError("Add mode needs an existing alignment.");
    existingAlignmentPath = path.join(workDir, "existing.fasta");
    await writeFile(existingAlignmentPath, input.existingAlignmentFasta);
  }

  const args = buildMafftArgs({ options, inputPath, existingAlignmentPath, threads: input.threads });
  const alignmentPath = path.join(workDir, "alignment.fasta");
  const logPath = path.join(workDir, "mafft.log");

  // Both output streams go straight to files rather than through pipes:
  // - stdout is the alignment itself, so it can be any size without hitting
  //   a buffer cap;
  // - stderr *must* be a regular file: `mafft` is a shell script that writes
  //   progress to `/dev/stderr`, and Node connects piped stdio through a
  //   socketpair, which `/dev/stderr` can't be opened on (ENXIO) - MAFFT then
  //   fails with "No such device or address" before aligning anything.
  const outFd = openSync(alignmentPath, "w");
  const errFd = openSync(logPath, "w");
  let result;
  try {
    result = spawnSync(MAFFT_BIN, args, {
      stdio: ["ignore", outFd, errFd],
      timeout: input.timeoutMs,
      // MAFFT makes its scratch dir with `mktemp` under $TMPDIR, which falls
      // back to the *current directory* when unset - and failed runs don't
      // clean it up. Pointing it at the job's own workDir means it is
      // isolated per job and removed with it.
      env: { ...process.env, TMPDIR: workDir, MAFFT_TMPDIR: workDir },
    });
  } finally {
    closeSync(outFd);
    closeSync(errFd);
  }
  const stderr = await readFile(logPath, "utf8");

  if (result.error || result.status !== 0 || result.signal) {
    const reason = result.signal
      ? `MAFFT was stopped by signal ${result.signal} (most likely the ${Math.round(input.timeoutMs / 60_000)}-minute time limit).`
      : result.error
        ? `MAFFT failed to start: ${result.error.message}`
        : (explainFailure(stderr) ?? `MAFFT exited with status ${result.status}.`);
    throw new MafftRunError([reason, stderr.trim() ? `--- MAFFT log (tail) ---\n${tail(stderr, 4000)}` : null].filter(Boolean).join("\n\n"));
  }

  const alignmentFasta = await readFile(alignmentPath, "utf8");
  const aligned = parseFasta(alignmentFasta).records;
  if (aligned.length === 0) {
    throw new MafftRunError("MAFFT finished but produced an empty alignment.");
  }

  // Guide-tree leaves are numbered in MAFFT's input order (existing
  // alignment first in add mode - verified v7.525) and are named after the
  // input, never with the _R_ prefix. Map them onto the *output* IDs so tree
  // leaves and alignment rows match one-to-one in the viewer.
  const inputIds = [
    ...(input.existingAlignmentFasta ? parseFasta(input.existingAlignmentFasta).records.map((r) => r.id) : []),
    ...parseFasta(input.inputFasta).records.map((r) => r.id),
  ];
  const reversed = new Set(
    aligned.filter((r) => r.id.startsWith(REVERSED_PREFIX)).map((r) => r.id.slice(REVERSED_PREFIX.length)),
  );
  const outputIds = inputIds.map((id) => (reversed.has(id) ? REVERSED_PREFIX + id : id));

  const rawTree = await readIfExists(guideTreePath({ options, inputPath, existingAlignmentPath }));
  let guideTreeNewick: string | null = null;
  if (rawTree?.trim()) {
    guideTreeNewick = unmangleGuideTree(rawTree, outputIds);
    await writeFile(path.join(workDir, "guide_tree.nwk"), guideTreeNewick + "\n");
  }

  const command = displayCommand(options, input.threads);
  const summary: AlignmentSummary = {
    ...parseStderr(stderr),
    ...computeAlignmentStats(aligned.map((r) => ({ id: r.id, sequence: r.sequence }))),
    reversedSequences: [...reversed],
    command,
  };

  await writeFile(path.join(workDir, "command.txt"), command + "\n");

  return {
    stderr,
    summary,
    alignmentFasta,
    guideTreeNewick,
    files: ["alignment.fasta", ...(guideTreeNewick ? ["guide_tree.nwk"] : []), "mafft.log", "command.txt"],
  };
}

export async function runMafftJob(prisma: PrismaClient, jobId: string): Promise<void> {
  const env = getEnv();
  const row = await prisma.mafftJob.findUniqueOrThrow({ where: { id: jobId } });

  await prisma.mafftJob.update({ where: { id: jobId }, data: { started: new Date() } });

  const workDir = path.join(env.DATA_DIR, "jobs", jobId);
  try {
    // Always start clean: partial output from a prior failed attempt must
    // never leak into a retry.
    await rm(workDir, { recursive: true, force: true });
    await mkdir(workDir, { recursive: true });

    const stored = row.parameters as unknown as StoredJobParameters;
    const options = mafftSubmissionSchema.parse(stored.options);

    const { files, ...results } = await executeMafft({
      options,
      inputFasta: Buffer.from(row.inputData).toString("utf8"),
      existingAlignmentFasta: row.existingAlnData ? Buffer.from(row.existingAlnData).toString("utf8") : undefined,
      workDir,
      threads: env.MAFFT_WORKER_THREADS,
      timeoutMs: env.MAFFT_JOB_TIMEOUT_MS,
    });

    const resultsZip = await zipFiles(workDir, files);
    if (resultsZip.byteLength > env.MAX_RESULTS_ZIP_BYTES) {
      throw new MafftRunError(
        `The results archive (${resultsZip.byteLength} bytes) is larger than this server allows (${env.MAX_RESULTS_ZIP_BYTES} bytes).`,
      );
    }

    await putResults(prisma, jobId, { ...results, resultsZip });

    if (row.notifyEmail) {
      await sendJobNotification({
        to: row.notifyEmail,
        jobId,
        inputFilename: row.inputFilename,
        outcome: "completed",
      });
    }
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function readIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

function tail(text: string, maxChars: number): string {
  return text.length > maxChars ? text.slice(-maxChars) : text;
}

async function zipFiles(dir: string, names: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = new ZipArchive({ zlib: { level: 9 } });
    const chunks: Buffer[] = [];

    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("error", reject);
    archive.on("end", () => resolve(Buffer.concat(chunks)));

    for (const name of names) {
      archive.file(path.join(dir, name), { name });
    }

    void archive.finalize();
  });
}
