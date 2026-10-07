import { createHash } from "node:crypto";
import objectHash from "object-hash";
import type { MafftSubmission } from "./mafft/schema";

export function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

export interface JobIdInput {
  options: MafftSubmission;
  /** Canonical FASTA (see toCanonicalFasta) - so formatting-only differences dedupe. */
  inputFasta: string;
  existingAlignmentFasta?: string;
}

/**
 * Deterministic job id, as in iqtreeserver: identical (input, options) map
 * to the same id and therefore the same results URL. Inputs are sha256'd
 * first and only the digests go into object-hash. MAFFT is deterministic,
 * so - unlike iqtreeserver - there is no per-submission seed to exclude.
 */
export function computeJobId(input: JobIdInput): string {
  const digest = objectHash(
    {
      options: input.options,
      inputSha256: sha256Hex(input.inputFasta),
      existingAlignmentSha256: input.existingAlignmentFasta ? sha256Hex(input.existingAlignmentFasta) : null,
    },
    { algorithm: "sha256", unorderedArrays: false },
  );
  return digest.slice(0, 24);
}
