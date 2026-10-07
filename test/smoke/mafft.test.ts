import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseNewick, type Tree } from "react-bio-viz";
import { executeMafft, MafftRunError } from "../../worker/processors/mafft";
import { mafftSubmissionSchema, type MafftSubmissionInput } from "@/lib/mafft/schema";
import { parseFasta } from "@/lib/sequences/fasta";

const MAFFT_BIN = process.env.MAFFT_BIN ?? "mafft";
const available = !spawnSync(MAFFT_BIN, ["--version"]).error;
const describeIfAvailable = available ? describe : describe.skip;

const fixture = (name: string) => readFileSync(path.join(__dirname, "../fixtures/sequences", name), "utf8");
const leaves = (t: Tree): string[] => (t.children.length ? t.children.flatMap(leaves) : [t.name]);

// Real end-to-end runs through the worker's own executeMafft (everything
// except the database). Skipped automatically when no mafft binary is on
// MAFFT_BIN/PATH, rather than failing the suite.
describeIfAvailable("executeMafft against a real mafft binary (smoke)", () => {
  let workDir: string;
  beforeEach(() => {
    workDir = mkdtempSync(path.join(tmpdir(), "mafftserver-smoke-"));
  });
  afterEach(() => rmSync(workDir, { recursive: true, force: true }));

  const run = (options: MafftSubmissionInput, inputFasta: string, existingAlignmentFasta?: string) =>
    executeMafft({
      options: mafftSubmissionSchema.parse(options),
      inputFasta,
      existingAlignmentFasta,
      workDir,
      threads: 1,
      timeoutMs: 120_000,
    });

  it("aligns the example set with --auto: equal-length rows, parsed summary, guide tree matching the rows", async () => {
    const input = fixture("cytochrome_c.fasta");
    const result = await run({}, input);

    const rows = parseFasta(result.alignmentFasta).records;
    const inputIds = parseFasta(input).records.map((r) => r.id);
    expect(rows.map((r) => r.id)).toEqual(inputIds);
    expect(new Set(rows.map((r) => r.sequence.length)).size).toBe(1);
    // --preservecase: protein stays uppercase (and nucleotide would too).
    expect(rows[0].sequence).toMatch(/^[A-Z-]+$/);

    expect(result.summary.version).toMatch(/^\d+\.\d+$/);
    expect(result.summary.strategyUsed).toBe("L-INS-i");
    expect(result.summary.sequenceCount).toBe(11);
    expect(result.summary.meanPairwiseIdentity).toBeGreaterThan(0.4);
    expect(result.summary.command).toBe("mafft --auto --preservecase --treeout --thread 1 input.fasta > alignment.fasta");

    expect(result.guideTreeNewick).not.toBeNull();
    expect(leaves(parseNewick(result.guideTreeNewick!)).sort()).toEqual([...inputIds].sort());
    expect(result.files).toEqual(["alignment.fasta", "guide_tree.nwk", "mafft.log", "command.txt"]);
  });

  it("keeps nucleotide case and reports reverse-complemented sequences, matching them in the tree", async () => {
    const result = await run({ strategy: "fftns2", adjustDirection: "accurate" }, fixture("mixed-strand.fasta"));
    const ids = parseFasta(result.alignmentFasta).records.map((r) => r.id);
    expect(ids).toEqual(["fw", "_R_rc", "fw2"]);
    expect(parseFasta(result.alignmentFasta).records.every((r) => /^[ACGT-]+$/.test(r.sequence))).toBe(true);
    expect(result.summary.reversedSequences).toEqual(["rc"]);
    expect(leaves(parseNewick(result.guideTreeNewick!)).sort()).toEqual(["_R_rc", "fw", "fw2"]);
  });

  it("adds a sequence to an existing alignment, keeping its length with --keeplength", async () => {
    const existing = fixture("cytochrome_c.aligned.fasta");
    const existingLength = parseFasta(existing).records[0].sequence.length;
    const result = await run(
      { mode: "add", addOptions: { keepLength: true } },
      ">CYC_NEW fragment\nGDVEKGKKIFVQKCAQCHTVEKGGKHKTGPNLHGLFGRKTGQA\n",
      existing,
    );
    const rows = parseFasta(result.alignmentFasta).records;
    expect(rows).toHaveLength(12);
    expect(rows.at(-1)!.id).toBe("CYC_NEW");
    expect(rows.every((r) => r.sequence.length === existingLength)).toBe(true);
    expect(leaves(parseNewick(result.guideTreeNewick!))).toContain("CYC_NEW");
  });

  it("keeps MAFFT's scratch files inside the job directory, even when MAFFT fails", async () => {
    const strays = () => readdirSync(process.cwd()).filter((name) => name.startsWith("mafft."));
    const before = strays();
    await run({}, fixture("cytochrome_c.fasta"));
    await expect(run({ mode: "add" }, ">n\nACGT\n", ">a\nAC-GT\n>b\nACGT\n")).rejects.toThrow(MafftRunError);
    expect(strays()).toEqual(before);
  });

  it("turns a MAFFT failure into a readable MafftRunError", async () => {
    // Bypasses validateFasta on purpose (it would reject this unaligned
    // "alignment" first): this checks the worker's own error path.
    const attempt = run({ mode: "add" }, ">n\nACGT\n", ">a\nAC-GT\n>b\nACGT\n");
    await expect(attempt).rejects.toThrow(MafftRunError);
    await expect(run({ mode: "add" }, ">n\nACGT\n", ">a\nAC-GT\n>b\nACGT\n")).rejects.toThrow(/isn't aligned/);
  });
});
