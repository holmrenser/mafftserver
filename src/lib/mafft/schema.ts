import { z } from "zod";

/**
 * MAFFT's named strategies. Each maps to a fixed flag set in buildArgs.ts -
 * see the table in DESIGN.md. "auto" defers the choice to MAFFT (`--auto`),
 * and the strategy it actually picked is parsed back out of stderr.
 */
export const STRATEGIES = ["auto", "fftns1", "fftns2", "fftnsi", "linsi", "ginsi", "einsi"] as const;
export type Strategy = (typeof STRATEGIES)[number];

/** Strategies that do iterative refinement, i.e. where `--maxiterate` means something. */
export const ITERATIVE_STRATEGIES: readonly Strategy[] = ["fftnsi", "linsi", "ginsi", "einsi"];

/** The *-INS-i strategies: quadratic-or-worse, size-limited (see MAX_SEQS_ACCURATE). */
export const ACCURATE_STRATEGIES: readonly Strategy[] = ["linsi", "ginsi", "einsi"];

export const PROTEIN_MATRICES = ["BLOSUM30", "BLOSUM45", "BLOSUM62", "BLOSUM80", "JTT100", "JTT200"] as const;
export const NUCLEOTIDE_MATRICES = ["kimura1", "kimura200"] as const;

export const DEFAULT_GAP_OPEN = 1.53;
export const DEFAULT_GAP_OFFSET = 0;
export const DEFAULT_MAX_ITERATE = 1000;

/**
 * Above this many sequences, L/G/E-INS-i are refused (form and API alike).
 * MAFFT itself recommends them for <~200 sequences; 2000 leaves headroom for
 * short sequences while still keeping a worker from being taken down. Kept
 * as a constant rather than env so the client bundle and the server agree
 * without plumbing runtime config into the form.
 */
export const MAX_SEQS_ACCURATE = 2000;

export const mafftSubmissionSchema = z
  .object({
    mode: z.enum(["align", "add"]).default("align"),
    sequenceType: z.enum(["auto", "nucleotide", "protein"]).default("auto"),
    strategy: z.enum(STRATEGIES).default("auto"),
    maxIterate: z.coerce.number().int().min(0).max(1000).default(DEFAULT_MAX_ITERATE),
    scoring: z
      .object({
        matrix: z.enum(["default", ...PROTEIN_MATRICES, ...NUCLEOTIDE_MATRICES]).default("default"),
        gapOpen: z.coerce.number().min(0).max(10).default(DEFAULT_GAP_OPEN),
        gapOffset: z.coerce.number().min(0).max(10).default(DEFAULT_GAP_OFFSET),
      })
      .default({ matrix: "default", gapOpen: DEFAULT_GAP_OPEN, gapOffset: DEFAULT_GAP_OFFSET }),
    adjustDirection: z.enum(["none", "fast", "accurate"]).default("none"),
    outputOrder: z.enum(["input", "aligned"]).default("input"),
    addOptions: z
      .object({
        fragments: z.boolean().default(false),
        keepLength: z.boolean().default(false),
      })
      .default({ fragments: false, keepLength: false }),
  })
  .superRefine((val, ctx) => {
    const matrix = val.scoring.matrix;
    if (val.sequenceType === "nucleotide" && (PROTEIN_MATRICES as readonly string[]).includes(matrix)) {
      ctx.addIssue({
        code: "custom",
        message: `${matrix} is a protein matrix and can't score nucleotide sequences.`,
        path: ["scoring", "matrix"],
      });
    }
    if (val.sequenceType === "protein" && (NUCLEOTIDE_MATRICES as readonly string[]).includes(matrix)) {
      ctx.addIssue({
        code: "custom",
        message: `${matrix} is a nucleotide model and can't score protein sequences.`,
        path: ["scoring", "matrix"],
      });
    }
    if (val.adjustDirection !== "none" && val.sequenceType === "protein") {
      ctx.addIssue({
        code: "custom",
        message: "Direction adjustment only applies to nucleotide sequences.",
        path: ["adjustDirection"],
      });
    }
  });

export type MafftSubmission = z.infer<typeof mafftSubmissionSchema>;
export type MafftSubmissionInput = z.input<typeof mafftSubmissionSchema>;

export const DEFAULT_SUBMISSION: MafftSubmission = mafftSubmissionSchema.parse({});

/**
 * What gets stored in MafftJob.parameters: the validated options plus
 * provenance for the input(s). MAFFT is deterministic, so unlike
 * iqtreeserver there is no seed.
 */
export interface StoredJobParameters {
  options: MafftSubmission;
  inputSha256: string;
  existingAlignmentSha256: string | null;
  input: {
    sequenceCount: number;
    minLength: number;
    maxLength: number;
    detectedType: "DNA" | "RNA" | "Protein" | null;
  };
}
