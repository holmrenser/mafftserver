import { describe, expect, it } from "vitest";
import { buildMafftArgs, displayCommand, guideTreePath } from "@/lib/mafft/buildArgs";
import { mafftSubmissionSchema, type MafftSubmissionInput } from "@/lib/mafft/schema";

const options = (overrides: MafftSubmissionInput = {}) => mafftSubmissionSchema.parse(overrides);

function args(overrides: MafftSubmissionInput = {}, extra: { existingAlignmentPath?: string } = {}) {
  return buildMafftArgs({ options: options(overrides), inputPath: "/j/input.fasta", threads: 4, ...extra });
}

describe("buildMafftArgs", () => {
  it("defaults to --auto with the always-on flags, input last", () => {
    expect(args()).toEqual(["--auto", "--preservecase", "--treeout", "--thread", "4", "/j/input.fasta"]);
  });

  it.each([
    ["fftns1", ["--retree", "1", "--maxiterate", "0"]],
    ["fftns2", ["--retree", "2", "--maxiterate", "0"]],
    ["fftnsi", ["--retree", "2", "--maxiterate", "1000"]],
    ["linsi", ["--localpair", "--maxiterate", "1000"]],
    ["ginsi", ["--globalpair", "--maxiterate", "1000"]],
    ["einsi", ["--genafpair", "--ep", "0", "--maxiterate", "1000"]],
  ] as const)("maps strategy %s to its MAFFT flags", (strategy, flags) => {
    expect(args({ strategy }).slice(0, flags.length)).toEqual(flags);
  });

  it("overrides --maxiterate only for iterative strategies", () => {
    expect(args({ strategy: "linsi", maxIterate: 16 })).toEqual(expect.arrayContaining(["--maxiterate", "16"]));
    expect(args({ strategy: "fftns2", maxIterate: 16 })).toEqual(expect.arrayContaining(["--maxiterate", "0"]));
  });

  it("never emits flags for default option values", () => {
    const a = args({ strategy: "fftns2" });
    for (const flag of ["--op", "--ep", "--bl", "--jtt", "--kimura", "--nuc", "--amino", "--reorder", "--adjustdirection"]) {
      expect(a).not.toContain(flag);
    }
  });

  it("emits sequence type, matrix and gap penalties when set", () => {
    const a = args({ sequenceType: "protein", scoring: { matrix: "BLOSUM45", gapOpen: 2, gapOffset: 0.1 } });
    expect(a).toEqual(expect.arrayContaining(["--amino", "--bl", "45", "--op", "2", "--ep", "0.1"]));
    expect(args({ sequenceType: "nucleotide", scoring: { matrix: "kimura1" } })).toEqual(
      expect.arrayContaining(["--nuc", "--kimura", "1"]),
    );
  });

  it("doesn't add a second --ep for E-INS-i, which fixes it at 0", () => {
    const a = args({ strategy: "einsi", scoring: { gapOffset: 0.5 } });
    expect(a.filter((t) => t === "--ep")).toHaveLength(1);
    expect(a).not.toContain("0.5");
  });

  it("maps direction adjustment and output order", () => {
    expect(args({ adjustDirection: "fast" })).toContain("--adjustdirection");
    expect(args({ adjustDirection: "accurate" })).toContain("--adjustdirectionaccurately");
    expect(args({ outputOrder: "aligned" })).toContain("--reorder");
  });

  it("puts the new sequences behind --add and the existing alignment last in add mode", () => {
    const a = args({ mode: "add", addOptions: { keepLength: true } }, { existingAlignmentPath: "/j/existing.fasta" });
    expect(a.slice(-4)).toEqual(["--add", "/j/input.fasta", "--keeplength", "/j/existing.fasta"]);
    const frag = args({ mode: "add", addOptions: { fragments: true } }, { existingAlignmentPath: "/j/existing.fasta" });
    expect(frag).toEqual(expect.arrayContaining(["--addfragments", "/j/input.fasta"]));
  });

  it("refuses add mode without an existing alignment", () => {
    expect(() => args({ mode: "add" })).toThrow(/existingAlignmentPath/);
  });

  it("never concatenates a flag and its value into one token", () => {
    const a = args({ strategy: "linsi", scoring: { matrix: "JTT200", gapOpen: 3 } });
    expect(a.every((t) => !t.includes(" "))).toBe(true);
  });
});

describe("guideTreePath", () => {
  it("is next to the positional input: the sequences, or the existing alignment in add mode", () => {
    expect(guideTreePath({ options: options(), inputPath: "/j/input.fasta" })).toBe("/j/input.fasta.tree");
    expect(
      guideTreePath({ options: options({ mode: "add" }), inputPath: "/j/new.fasta", existingAlignmentPath: "/j/existing.fasta" }),
    ).toBe("/j/existing.fasta.tree");
  });
});

describe("displayCommand", () => {
  it("uses the results-zip filenames and redirects to alignment.fasta", () => {
    expect(displayCommand(options({ strategy: "linsi" }), 8)).toBe(
      "mafft --localpair --maxiterate 1000 --preservecase --treeout --thread 8 input.fasta > alignment.fasta",
    );
  });
});
