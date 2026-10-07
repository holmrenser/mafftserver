import type { Strategy } from "./schema";

export interface StrategyInfo {
  id: Strategy;
  name: string;
  description: string;
  /** 1-5, for the form's speed/accuracy pips. Null for "auto" (decided at run time). */
  speed: number | null;
  accuracy: number | null;
}

/** User-facing descriptions, following MAFFT's own documentation. */
export const STRATEGY_INFO: StrategyInfo[] = [
  { id: "auto", name: "Auto", description: "MAFFT picks a method from the input size. A good default.", speed: null, accuracy: null },
  { id: "fftns1", name: "FFT-NS-1", description: "One progressive pass. Fastest and roughest.", speed: 5, accuracy: 1 },
  { id: "fftns2", name: "FFT-NS-2", description: "Two progressive passes. MAFFT's own default.", speed: 4, accuracy: 2 },
  { id: "fftnsi", name: "FFT-NS-i", description: "FFT-NS-2 plus iterative refinement.", speed: 3, accuracy: 3 },
  {
    id: "linsi",
    name: "L-INS-i",
    description: "Local pairwise alignment. Best for one alignable domain in unalignable flanks.",
    speed: 1,
    accuracy: 5,
  },
  {
    id: "ginsi",
    name: "G-INS-i",
    description: "Global pairwise alignment. Best for sequences similar over their full length.",
    speed: 1,
    accuracy: 5,
  },
  {
    id: "einsi",
    name: "E-INS-i",
    description: "Generalized affine gaps. Best for conserved motifs among long unalignable regions.",
    speed: 1,
    accuracy: 5,
  },
];

export function strategyName(id: Strategy): string {
  return STRATEGY_INFO.find((s) => s.id === id)?.name ?? id;
}
