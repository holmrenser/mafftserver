export interface AlignedRecord {
  id: string;
  sequence: string;
}

export interface AlignmentStats {
  sequenceCount: number;
  length: number;
  /** Fraction of all cells that are gaps. */
  gapFraction: number;
  /** Mean identity over sequence pairs, counting only columns where both have a residue. Null if < 2 seqs. */
  meanPairwiseIdentity: number | null;
  /** Whether meanPairwiseIdentity was estimated from a sample of pairs (large alignments). */
  identitySampled: boolean;
}

/**
 * Pairwise identity is O(N^2 * L). Above this many pairs we sample instead,
 * deterministically (a fixed-stride walk over the pair index space), so the
 * same job always reports the same number.
 */
const MAX_PAIRS = 50_000;

const isGap = (code: number) => code === 45 /* - */ || code === 46; /* . */

export function computeAlignmentStats(records: AlignedRecord[]): AlignmentStats {
  const n = records.length;
  const length = n ? records[0].sequence.length : 0;

  let gaps = 0;
  for (const r of records) {
    for (let c = 0; c < r.sequence.length; c++) if (isGap(r.sequence.charCodeAt(c))) gaps++;
  }

  const totalPairs = (n * (n - 1)) / 2;
  const stride = totalPairs > MAX_PAIRS ? Math.ceil(totalPairs / MAX_PAIRS) : 1;
  const upper = records.map((r) => r.sequence.toUpperCase());

  let identitySum = 0;
  let counted = 0;
  let pairIndex = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++, pairIndex++) {
      if (pairIndex % stride !== 0) continue;
      const identity = pairIdentity(upper[i], upper[j]);
      if (identity !== null) {
        identitySum += identity;
        counted++;
      }
    }
  }

  return {
    sequenceCount: n,
    length,
    gapFraction: n && length ? gaps / (n * length) : 0,
    meanPairwiseIdentity: counted ? identitySum / counted : null,
    identitySampled: stride > 1,
  };
}

/** Identity over columns where both sequences have a residue; null when they never overlap. */
export function pairIdentity(a: string, b: string): number | null {
  let same = 0;
  let both = 0;
  for (let c = 0; c < a.length; c++) {
    const x = a.charCodeAt(c);
    const y = b.charCodeAt(c);
    if (isGap(x) || isGap(y)) continue;
    both++;
    if (x === y) same++;
  }
  return both ? same / both : null;
}
