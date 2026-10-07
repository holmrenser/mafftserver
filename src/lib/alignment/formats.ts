import { parseFasta, wrap } from "../sequences/fasta";

/**
 * Alternative download formats, rendered on demand from the stored aligned
 * FASTA - MAFFT runs once, and only FASTA is persisted (see DESIGN.md).
 */

export const DOWNLOAD_FORMATS = {
  fasta: { extension: "fasta", contentType: "text/x-fasta" },
  clustal: { extension: "aln", contentType: "text/plain" },
  phylip: { extension: "phy", contentType: "text/plain" },
} as const;

export type DownloadFormat = keyof typeof DOWNLOAD_FORMATS;

export function isDownloadFormat(value: string | null): value is DownloadFormat {
  return value !== null && Object.hasOwn(DOWNLOAD_FORMATS, value);
}

interface Row {
  id: string;
  sequence: string;
}

function rows(alignedFasta: string): Row[] {
  return parseFasta(alignedFasta).records.map((r) => ({ id: r.id, sequence: r.sequence }));
}

export function renderAlignment(alignedFasta: string, format: DownloadFormat, title?: string): string {
  switch (format) {
    case "fasta":
      return alignedFasta;
    case "clustal":
      return toClustal(rows(alignedFasta), title);
    case "phylip":
      return toRelaxedPhylip(rows(alignedFasta));
  }
}

/**
 * Clustal: 60-column blocks, names padded to a common width, and a
 * conservation line where '*' marks columns identical in every sequence
 * (the strong/weak-group ':' '.' marks are left out - they depend on
 * residue-group tables that downstream tools don't read).
 */
export function toClustal(records: Row[], title = "CLUSTAL multiple sequence alignment by MAFFT"): string {
  if (records.length === 0) return `${title}\n`;
  const nameWidth = Math.max(...records.map((r) => r.id.length)) + 6;
  const length = records[0].sequence.length;
  const lines = [title, "", ""];

  for (let start = 0; start < length; start += 60) {
    const end = Math.min(length, start + 60);
    for (const r of records) lines.push(r.id.padEnd(nameWidth) + r.sequence.slice(start, end));
    let conservation = "";
    for (let c = start; c < end; c++) {
      const first = records[0].sequence[c].toUpperCase();
      const conserved = first !== "-" && records.every((r) => r.sequence[c].toUpperCase() === first);
      conservation += conserved ? "*" : " ";
    }
    lines.push(" ".repeat(nameWidth) + conservation, "");
  }
  return lines.join("\n");
}

/**
 * Relaxed (sequential) PHYLIP, as read by IQ-TREE and RAxML: names may be
 * longer than 10 characters and are separated from the sequence by
 * whitespace. Names are our unique FASTA IDs, which never contain whitespace.
 */
export function toRelaxedPhylip(records: Row[]): string {
  if (records.length === 0) return " 0 0\n";
  const nameWidth = Math.max(...records.map((r) => r.id.length)) + 2;
  const header = ` ${records.length} ${records[0].sequence.length}`;
  return [header, ...records.map((r) => r.id.padEnd(nameWidth) + r.sequence)].join("\n") + "\n";
}

export function toFasta(records: Row[]): string {
  return records.map((r) => `>${r.id}\n${wrap(r.sequence, 60)}`).join("\n") + "\n";
}
