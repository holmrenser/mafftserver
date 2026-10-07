import { describe, expect, it } from "vitest";
import { computeAlignmentStats, pairIdentity } from "@/lib/alignment/stats";

describe("pairIdentity", () => {
  it("counts only columns where both sequences have a residue", () => {
    expect(pairIdentity("AC-T", "ACGA")).toBeCloseTo(2 / 3);
    expect(pairIdentity("--", "AC")).toBeNull();
  });
});

describe("computeAlignmentStats", () => {
  it("computes length, gap fraction and mean pairwise identity", () => {
    const stats = computeAlignmentStats([
      { id: "a", sequence: "ACGT" },
      { id: "b", sequence: "ACGA" },
      { id: "c", sequence: "AC--" },
    ]);
    expect(stats.sequenceCount).toBe(3);
    expect(stats.length).toBe(4);
    expect(stats.gapFraction).toBeCloseTo(2 / 12);
    // a-b 3/4, a-c 2/2, b-c 2/2
    expect(stats.meanPairwiseIdentity).toBeCloseTo((0.75 + 1 + 1) / 3);
    expect(stats.identitySampled).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(computeAlignmentStats([{ id: "a", sequence: "acgt" }, { id: "b", sequence: "ACGT" }]).meanPairwiseIdentity).toBe(1);
  });

  it("samples pairs deterministically for large alignments", () => {
    const records = Array.from({ length: 400 }, (_, i) => ({ id: `s${i}`, sequence: i % 2 ? "ACGT" : "ACGA" }));
    const first = computeAlignmentStats(records);
    expect(first.identitySampled).toBe(true);
    expect(computeAlignmentStats(records).meanPairwiseIdentity).toBe(first.meanPairwiseIdentity);
  });

  it("returns null identity for a single sequence", () => {
    expect(computeAlignmentStats([{ id: "a", sequence: "ACGT" }]).meanPairwiseIdentity).toBeNull();
  });
});
