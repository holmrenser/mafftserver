export interface MafftRunInfo {
  /** e.g. "7.525" */
  version: string | null;
  /** e.g. "L-INS-i" - only present when MAFFT ran with --auto. */
  strategyUsed: string | null;
}

/**
 * Null-safe regex extractors over MAFFT's stderr. Like iqtreeserver's
 * parseReport, every extractor returns null on no-match rather than
 * throwing: a cosmetic change in MAFFT's progress output must never fail an
 * otherwise-successful job.
 *
 * Verified against MAFFT v7.525 (see test/fixtures/stderr/).
 */
export function parseStderr(stderr: string): MafftRunInfo {
  return {
    version: extractVersion(stderr),
    strategyUsed: extractStrategy(stderr),
  };
}

function extractVersion(text: string): string | null {
  // "tbfast (aa) Version 7.525" / "MAFFT v7.525 (2024/Mar/13)"
  const m = text.match(/Version (\d+\.\d+)/) ?? text.match(/MAFFT v(\d+\.\d+)/);
  return m ? m[1] : null;
}

function extractStrategy(text: string): string | null {
  // "Strategy:\n L-INS-i (Probably most accurate, very slow)"
  const m = text.match(/^Strategy:\s*\n\s*(\S+)/m);
  return m ? m[1] : null;
}

/**
 * Turns a failed run's stderr into one sentence a user can act on, falling
 * back to null when the failure isn't one we recognise (the caller then
 * shows the raw stderr tail).
 */
export function explainFailure(stderr: string): string | null {
  const illegal = stderr.match(/Illegal character (\S)/);
  if (illegal) {
    return `MAFFT rejected the character '${illegal[1]}'. Remove it, or check that the sequence type is right.`;
  }
  // Two wordings, depending on the code path MAFFT takes (both v7.525).
  if (/alignmentlength = \d+, but strlen|The original\s+\d+ sequences must be aligned/.test(stderr)) {
    return "The existing alignment isn't aligned: its sequences have different lengths.";
  }
  if (/cannot allocate|Cannot allocate|out of memory|std::bad_alloc/i.test(stderr)) {
    return "MAFFT ran out of memory. Try a faster strategy (Auto or FFT-NS-2) or fewer sequences.";
  }
  return null;
}
