import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { explainFailure, parseStderr } from "@/lib/mafft/parseStderr";

const fixture = (name: string) => readFileSync(path.join(__dirname, "../fixtures/stderr", name), "utf8");

describe("parseStderr", () => {
  it("extracts version and the strategy --auto chose from a real v7.525 run", () => {
    expect(parseStderr(fixture("auto-linsi.txt"))).toEqual({ version: "7.525", strategyUsed: "L-INS-i" });
  });

  it("returns nulls rather than throwing on unrecognised output", () => {
    expect(parseStderr("something else entirely")).toEqual({ version: null, strategyUsed: null });
  });
});

describe("explainFailure", () => {
  it("turns MAFFT's illegal-character failure into an actionable sentence", () => {
    expect(explainFailure(fixture("illegal-character.txt"))).toMatch(/rejected the character 'j'/);
  });

  it("explains an unaligned 'existing alignment' in add mode", () => {
    expect(explainFailure("# alignmentlength = 5, but strlen(seq[1])=4")).toMatch(/isn't aligned/);
    expect(explainFailure(fixture("add-unaligned-existing.txt"))).toMatch(/isn't aligned/);
  });

  it("recognises memory exhaustion", () => {
    expect(explainFailure("tbfast: cannot allocate memory")).toMatch(/ran out of memory/);
  });

  it("returns null for failures it doesn't recognise", () => {
    expect(explainFailure("segmentation fault")).toBeNull();
  });
});
