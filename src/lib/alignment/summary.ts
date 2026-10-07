import type { AlignmentStats } from "./stats";
import type { MafftRunInfo } from "../mafft/parseStderr";

/** Stored in MafftJob.summary - everything that needs the run itself or is expensive. */
export interface AlignmentSummary extends AlignmentStats, MafftRunInfo {
  /** IDs MAFFT reverse-complemented (prefixed `_R_`) under --adjustdirection. */
  reversedSequences: string[];
  /** The command as run, with paths replaced by the filenames in the results zip. */
  command: string;
}
