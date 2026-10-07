import { describe, expect, it } from "vitest";
import { detectType, parseFasta, toCanonicalFasta, validateFasta } from "@/lib/sequences/fasta";

const kinds = (text: string, opts?: Parameters<typeof validateFasta>[1]) =>
  validateFasta(text, opts).errors.map((e) => e.kind);

describe("parseFasta", () => {
  it("joins wrapped lines, keeps full headers, takes the first token as id", () => {
    const { records } = parseFasta(">a desc here\nACG\nT  A\r\n>b\nCC\n");
    expect(records).toEqual([
      { id: "a", header: "a desc here", sequence: "ACGTA" },
      { id: "b", header: "b", sequence: "CC" },
    ]);
  });
});

describe("validateFasta", () => {
  it("accepts a clean protein set and reports stats", () => {
    const report = validateFasta(">x\nMKTAYIAKQR\n>y\nMKTAYIAKQ\n");
    expect(report.errors).toEqual([]);
    expect(report.detectedType).toBe("Protein");
    expect([report.minLength, report.maxLength, report.totalResidues]).toEqual([9, 10, 19]);
  });

  it("rejects empty input, text before the first header, and a single sequence", () => {
    expect(kinds("")).toEqual(["empty"]);
    expect(kinds("ACGT\n>a\nACGT\n>b\nACGT")).toContain("text-before-header");
    expect(kinds(">a\nACGT")).toEqual(["too-few-sequences"]);
  });

  it("allows a single sequence when minRecords is 1 (add mode)", () => {
    expect(kinds(">a\nACGT", { minRecords: 1 })).toEqual([]);
  });

  it("rejects duplicate names, nameless headers and empty sequences", () => {
    expect(kinds(">a\nACGT\n>a\nACGA")).toContain("duplicate-id");
    expect(kinds(">\nACGT\n>b\nACGA")).toContain("missing-id");
    expect(kinds(">a\n\n>b\nACGA")).toContain("empty-sequence");
  });

  it("names the sequence and position of an illegal character, including J", () => {
    const report = validateFasta(">a\nACGT\n>b\nACJT");
    expect(report.errors).toEqual([
      { kind: "illegal-character", message: "b, position 3: 'J' is not a valid residue code." },
    ]);
  });

  it("warns, but doesn't block, when unaligned input contains gaps", () => {
    const report = validateFasta(">a\nAC-GT\n>b\nACGT");
    expect(report.errors).toEqual([]);
    expect(report.warnings.map((w) => w.kind)).toEqual(["contains-gaps"]);
    expect(report.maxLength).toBe(4);
  });

  it("requires equal lengths for an existing alignment", () => {
    expect(kinds(">a\nAC-GT\n>b\nACGT", { kind: "alignment" })).toContain("unequal-lengths");
    expect(kinds(">a\nAC-GT\n>b\nACGTT", { kind: "alignment" })).toEqual([]);
  });
});

describe("detectType", () => {
  it("distinguishes DNA, RNA and protein", () => {
    expect(detectType(["ACGTACGTNN"])).toBe("DNA");
    expect(detectType(["ACGUACGU"])).toBe("RNA");
    expect(detectType(["MKTAYIAKQR"])).toBe("Protein");
    expect(detectType(["---"])).toBeNull();
  });
});

describe("toCanonicalFasta", () => {
  it("normalizes wrapping so formatting-only differences produce identical text", () => {
    const a = toCanonicalFasta(parseFasta(">a x\nAC\nGT\n").records, { stripGaps: true });
    const b = toCanonicalFasta(parseFasta(">a x\r\nA C G T\r\n").records, { stripGaps: true });
    expect(a).toBe(">a x\nACGT\n");
    expect(b).toBe(a);
  });

  it("strips gaps only when asked", () => {
    const records = parseFasta(">a\nAC-GT").records;
    expect(toCanonicalFasta(records, { stripGaps: true })).toBe(">a\nACGT\n");
    expect(toCanonicalFasta(records, { stripGaps: false })).toBe(">a\nAC-GT\n");
  });
});
