/**
 * FASTA parsing and validation shared by the submission form (instant
 * feedback) and /api/submit (the authoritative check) - the same function
 * runs on both sides so they can never disagree. Pure: no DOM, no Node APIs.
 */

export interface FastaRecord {
  /** First whitespace-delimited token of the header - must be unique. */
  id: string;
  /** Full header line without the leading '>'. Preserved in MAFFT's output. */
  header: string;
  sequence: string;
}

export type SequenceType = "DNA" | "RNA" | "Protein";

export interface FastaIssue {
  /** Stable machine-readable kind, for tests and for the form to key off. */
  kind:
    | "empty"
    | "text-before-header"
    | "missing-id"
    | "empty-sequence"
    | "duplicate-id"
    | "illegal-character"
    | "too-few-sequences"
    | "unequal-lengths"
    | "contains-gaps";
  message: string;
}

export interface FastaReport {
  records: FastaRecord[];
  errors: FastaIssue[];
  warnings: FastaIssue[];
  detectedType: SequenceType | null;
  /** Ungapped lengths. */
  minLength: number;
  maxLength: number;
  totalResidues: number;
}

// IUPAC nucleotide + amino-acid codes (incl. B Z X U O), stop '*', gaps '-' '.'.
// This is the *only* residue check: with --preservecase (always on, see
// buildArgs.ts) MAFFT v7.525 silently accepts any symbol, '!' included.
// 'J' is deliberately absent: MAFFT rejects it in its default mode.
const ALLOWED_CHARS = /^[ACDEFGHIKLMNPQRSTVWYBZXUO*.-]$/i;
const NUCLEOTIDE_CHARS = /[ACGTUN]/i;
const GAP_CHARS = /[-.]/g;
const MAX_REPORTED_ERRORS = 20;

export function parseFasta(text: string): { records: FastaRecord[]; textBeforeHeader: boolean } {
  const records: FastaRecord[] = [];
  let current: FastaRecord | null = null;
  let textBeforeHeader = false;

  for (const rawLine of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (rawLine.startsWith(">")) {
      const header = rawLine.slice(1).trim();
      current = { id: header.split(/\s+/)[0] ?? "", header, sequence: "" };
      records.push(current);
    } else if (rawLine.trim()) {
      if (!current) {
        textBeforeHeader = true;
        continue;
      }
      current.sequence += rawLine.replace(/\s+/g, "");
    }
  }
  return { records, textBeforeHeader };
}

export function detectType(sequences: string[]): SequenceType | null {
  let total = 0;
  let nucleotide = 0;
  let hasU = false;
  for (const seq of sequences) {
    for (const ch of seq) {
      if (ch === "-" || ch === "." || ch === "*") continue;
      total++;
      if (NUCLEOTIDE_CHARS.test(ch)) nucleotide++;
      if (ch === "U" || ch === "u") hasU = true;
    }
  }
  if (total === 0) return null;
  if (nucleotide / total > 0.9) return hasU ? "RNA" : "DNA";
  return "Protein";
}

interface ValidateOptions {
  /** "sequences": unaligned input. "alignment": must be equal-length (add mode's existing alignment). */
  kind?: "sequences" | "alignment";
  /** Minimum record count; defaults to 2 for sequences, 1 for an alignment. */
  minRecords?: number;
}

export function validateFasta(text: string, opts: ValidateOptions = {}): FastaReport {
  const kind = opts.kind ?? "sequences";
  const minRecords = opts.minRecords ?? (kind === "sequences" ? 2 : 1);
  const { records, textBeforeHeader } = parseFasta(text);
  const errors: FastaIssue[] = [];
  const warnings: FastaIssue[] = [];
  const push = (issue: FastaIssue) => {
    if (errors.length < MAX_REPORTED_ERRORS) errors.push(issue);
  };

  if (records.length === 0 && !textBeforeHeader) {
    push({ kind: "empty", message: "No sequences found." });
  }
  if (textBeforeHeader) {
    push({
      kind: "text-before-header",
      message: "There is text before the first '>' header. Every sequence needs a '>name' line.",
    });
  }

  const seen = new Set<string>();
  records.forEach((record, index) => {
    const label = record.id || `sequence #${index + 1}`;
    if (!record.id) {
      push({ kind: "missing-id", message: `Sequence #${index + 1} has a '>' line with no name.` });
    }
    if (!record.sequence.replace(GAP_CHARS, "")) {
      push({ kind: "empty-sequence", message: `${label} has no residues.` });
    }
    if (record.id && seen.has(record.id)) {
      push({
        kind: "duplicate-id",
        message: `The name '${record.id}' is used more than once. Names must be unique so the guide tree and downstream tools can tell sequences apart.`,
      });
    }
    seen.add(record.id);
    for (let pos = 0; pos < record.sequence.length; pos++) {
      const ch = record.sequence[pos];
      if (!ALLOWED_CHARS.test(ch)) {
        push({
          kind: "illegal-character",
          message: `${label}, position ${pos + 1}: '${ch}' is not a valid residue code.`,
        });
        break;
      }
    }
  });

  if (records.length > 0 && records.length < minRecords) {
    push({
      kind: "too-few-sequences",
      message:
        kind === "sequences"
          ? "Only one sequence. An alignment needs at least two."
          : `At least ${minRecords} sequences are needed.`,
    });
  }

  if (kind === "alignment" && records.length > 1) {
    const lengths = new Set(records.map((r) => r.sequence.length));
    if (lengths.size > 1) {
      push({
        kind: "unequal-lengths",
        message: "The existing alignment's sequences have different lengths, so it isn't aligned yet.",
      });
    }
  }

  if (kind === "sequences" && records.some((r) => /[-.]/.test(r.sequence))) {
    warnings.push({
      kind: "contains-gaps",
      message:
        "Some sequences contain gaps. If this is already an alignment, did you mean 'Add to alignment'? Gaps are removed before aligning.",
    });
  }

  const ungapped = records.map((r) => r.sequence.replace(GAP_CHARS, ""));
  const lengths = ungapped.map((s) => s.length).filter((n) => n > 0);

  return {
    records,
    errors,
    warnings,
    detectedType: detectType(ungapped),
    minLength: lengths.length ? Math.min(...lengths) : 0,
    maxLength: lengths.length ? Math.max(...lengths) : 0,
    totalResidues: lengths.reduce((a, b) => a + b, 0),
  };
}

/**
 * Canonical FASTA: one header line, sequence wrapped at 60. This is what
 * gets stored, hashed and handed to MAFFT, so whitespace/line-ending
 * differences between otherwise identical submissions still dedupe.
 * `stripGaps` is for unaligned input (MAFFT would otherwise keep them).
 */
export function toCanonicalFasta(records: FastaRecord[], { stripGaps }: { stripGaps: boolean }): string {
  return records
    .map((r) => {
      const seq = stripGaps ? r.sequence.replace(GAP_CHARS, "") : r.sequence;
      return `>${r.header}\n${wrap(seq, 60)}`;
    })
    .join("\n")
    .concat("\n");
}

export function wrap(seq: string, width: number): string {
  const lines: string[] = [];
  for (let i = 0; i < seq.length; i += width) lines.push(seq.slice(i, i + width));
  return lines.join("\n");
}
