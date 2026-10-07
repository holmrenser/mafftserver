import { describe, expect, it } from "vitest";
import { isDownloadFormat, renderAlignment, toClustal, toRelaxedPhylip } from "@/lib/alignment/formats";
import { parseFasta } from "@/lib/sequences/fasta";

const rows = [
  { id: "human", sequence: "MGD-VEK" },
  { id: "yeast_iso1", sequence: "MGDAVEK" },
];

describe("toRelaxedPhylip", () => {
  it("writes the sequence count and length, then one padded row per sequence", () => {
    expect(toRelaxedPhylip(rows)).toBe(" 2 7\nhuman       MGD-VEK\nyeast_iso1  MGDAVEK\n");
  });
});

describe("toClustal", () => {
  it("marks columns identical in every sequence with '*', never gap columns", () => {
    const lines = toClustal(rows).split("\n");
    expect(lines[0]).toMatch(/^CLUSTAL/);
    expect(lines[3]).toBe("human           MGD-VEK");
    expect(lines[5]).toBe("                *** ***");
  });

  it("splits long alignments into 60-column blocks", () => {
    const long = [
      { id: "a", sequence: "A".repeat(130) },
      { id: "b", sequence: "A".repeat(130) },
    ];
    const blocks = toClustal(long).split("\n").filter((l) => l.startsWith("a "));
    expect(blocks.map((l) => l.trim().split(/\s+/)[1].length)).toEqual([60, 60, 10]);
  });
});

describe("renderAlignment", () => {
  it("round-trips: every format carries the same rows as the FASTA", () => {
    const fasta = ">human\nMGD-VEK\n>yeast_iso1\nMGDAVEK\n";
    expect(renderAlignment(fasta, "fasta")).toBe(fasta);
    const phylipRows = renderAlignment(fasta, "phylip").trim().split("\n").slice(1).map((l) => l.split(/\s+/));
    expect(phylipRows).toEqual(parseFasta(fasta).records.map((r) => [r.id, r.sequence]));
  });
});

describe("isDownloadFormat", () => {
  it("accepts only known formats", () => {
    expect(isDownloadFormat("clustal")).toBe(true);
    expect(isDownloadFormat("toString")).toBe(false);
    expect(isDownloadFormat(null)).toBe(false);
  });
});
