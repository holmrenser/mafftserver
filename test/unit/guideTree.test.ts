import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseNewick, type Tree } from "react-bio-viz";
import { unmangleGuideTree } from "@/lib/mafft/guideTree";
import { parseFasta } from "@/lib/sequences/fasta";

const fixtures = path.join(__dirname, "../fixtures/sequences");

function leaves(tree: Tree): string[] {
  return tree.children.length ? tree.children.flatMap(leaves) : [tree.name];
}

describe("unmangleGuideTree", () => {
  it("restores the input ids in a real multi-line --treeout file, parseable by react-bio-viz", () => {
    const raw = readFileSync(path.join(fixtures, "cytochrome_c.fasta.tree"), "utf8");
    const ids = parseFasta(readFileSync(path.join(fixtures, "cytochrome_c.fasta"), "utf8")).records.map((r) => r.id);

    const newick = unmangleGuideTree(raw, ids);
    expect(newick).not.toMatch(/\s/);
    expect(leaves(parseNewick(newick)).sort()).toEqual([...ids].sort());
  });

  it("maps by index, not by the mangled name (descriptions are folded into MAFFT's label)", () => {
    expect(unmangleGuideTree("(\n1_seqA_some_description\n:0.38,\n2_seqB\n:0.25);", ["seqA", "seqB"])).toBe(
      "(seqA:0.38,seqB:0.25);",
    );
  });

  it("quotes ids that contain Newick structural characters", () => {
    expect(unmangleGuideTree("(1_a:1,2_b:1);", ["x:y", "it's"])).toBe("('x:y':1,'it''s':1);");
  });

  it("fails loudly when the tree references a sequence that doesn't exist", () => {
    expect(() => unmangleGuideTree("(1_a:1,3_c:1);", ["a", "b"])).toThrow(/#3/);
  });
});
