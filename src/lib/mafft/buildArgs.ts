import {
  DEFAULT_GAP_OFFSET,
  DEFAULT_GAP_OPEN,
  ITERATIVE_STRATEGIES,
  type MafftSubmission,
  type Strategy,
} from "./schema";

export interface BuildArgsInput {
  options: MafftSubmission;
  /** Sequences to align (mode "align") or to add (mode "add"). */
  inputPath: string;
  /** The alignment being added to - required for mode "add". */
  existingAlignmentPath?: string;
  threads: number;
}

const STRATEGY_FLAGS: Record<Strategy, string[]> = {
  auto: ["--auto"],
  fftns1: ["--retree", "1", "--maxiterate", "0"],
  fftns2: ["--retree", "2", "--maxiterate", "0"],
  fftnsi: ["--retree", "2", "--maxiterate", "1000"],
  linsi: ["--localpair", "--maxiterate", "1000"],
  ginsi: ["--globalpair", "--maxiterate", "1000"],
  einsi: ["--genafpair", "--ep", "0", "--maxiterate", "1000"],
};

const MATRIX_FLAGS: Record<string, string[]> = {
  BLOSUM30: ["--bl", "30"],
  BLOSUM45: ["--bl", "45"],
  BLOSUM62: ["--bl", "62"],
  BLOSUM80: ["--bl", "80"],
  JTT100: ["--jtt", "100"],
  JTT200: ["--jtt", "200"],
  kimura1: ["--kimura", "1"],
  kimura200: ["--kimura", "200"],
};

/**
 * Pure function: submission options -> mafft argv. Returns a flat token array
 * for spawnSync(bin, args) - never a shell string - so no option value can be
 * reinterpreted as an extra flag. Default values are never emitted, which
 * keeps the command shown on the results page as short as what a person
 * would type.
 *
 * MAFFT writes the alignment to stdout; redirecting it is the caller's job.
 */
export function buildMafftArgs(input: BuildArgsInput): string[] {
  const { options, inputPath, existingAlignmentPath, threads } = input;
  const args: string[] = [];

  let strategyFlags = STRATEGY_FLAGS[options.strategy];
  if (ITERATIVE_STRATEGIES.includes(options.strategy) && options.maxIterate !== 1000) {
    strategyFlags = strategyFlags.map((token, i) =>
      strategyFlags[i - 1] === "--maxiterate" ? String(options.maxIterate) : token,
    );
  }
  args.push(...strategyFlags);

  if (options.sequenceType === "nucleotide") args.push("--nuc");
  if (options.sequenceType === "protein") args.push("--amino");

  const matrixFlags = MATRIX_FLAGS[options.scoring.matrix];
  if (matrixFlags) args.push(...matrixFlags);

  if (options.scoring.gapOpen !== DEFAULT_GAP_OPEN) {
    args.push("--op", String(options.scoring.gapOpen));
  }
  // E-INS-i fixes --ep 0 as part of its definition (already in STRATEGY_FLAGS).
  if (options.strategy !== "einsi" && options.scoring.gapOffset !== DEFAULT_GAP_OFFSET) {
    args.push("--ep", String(options.scoring.gapOffset));
  }

  if (options.adjustDirection === "fast") args.push("--adjustdirection");
  if (options.adjustDirection === "accurate") args.push("--adjustdirectionaccurately");

  if (options.outputOrder === "aligned") args.push("--reorder");

  // Without --preservecase MAFFT lowercases nucleotide output (verified v7.525).
  // --treeout writes the guide tree to `<input>.tree`.
  args.push("--preservecase", "--treeout", "--thread", String(threads));

  if (options.mode === "add") {
    if (!existingAlignmentPath) {
      throw new Error("buildMafftArgs: mode 'add' requires existingAlignmentPath");
    }
    args.push(options.addOptions.fragments ? "--addfragments" : "--add", inputPath);
    if (options.addOptions.keepLength) args.push("--keeplength");
    args.push(existingAlignmentPath);
  } else {
    args.push(inputPath);
  }

  return args;
}

/**
 * The guide tree path MAFFT writes for a given positional input. In add
 * mode that's the existing alignment's path, since it's the positional arg.
 */
export function guideTreePath(input: Pick<BuildArgsInput, "options" | "inputPath" | "existingAlignmentPath">): string {
  const positional = input.options.mode === "add" ? input.existingAlignmentPath : input.inputPath;
  return `${positional}.tree`;
}

/**
 * Display form of the command (results page, results zip): the same argv
 * the worker runs, with paths replaced by the filenames in the results zip.
 * Every token is a known-safe literal, so no shell escaping is needed.
 */
export function displayCommand(options: MafftSubmission, threads: number): string {
  const args = buildMafftArgs({
    options,
    inputPath: options.mode === "add" ? "new.fasta" : "input.fasta",
    existingAlignmentPath: "existing.fasta",
    threads,
  });
  return `mafft ${args.join(" ")} > alignment.fasta`;
}
