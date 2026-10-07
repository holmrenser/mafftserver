"use client";

import { useState } from "react";
import { PhyloTree, type LayoutMode, type Tree } from "react-bio-viz";
import { useElementWidth } from "@/hooks/use-element-width";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const LEAF_SPACING = 20;

export function GuideTreePanel({ tree, leafCount }: { tree: Tree; leafCount: number }) {
  const [ref, width] = useElementWidth();
  // Guide-tree branch lengths aren't evolutionary distances, so default to
  // a cladogram (topology only) and let people opt in to the lengths.
  const [showLengths, setShowLengths] = useState(false);
  const layout: LayoutMode = showLengths ? "rectangular" : "cladogram";

  return (
    <div className="flex flex-col gap-3">
      <p className="border-l-2 pl-3 text-sm text-muted-foreground">
        This is MAFFT&apos;s <strong className="text-foreground">guide tree</strong>: the tree that set the order of
        the progressive alignment. It is not a phylogeny. To infer one, run the alignment through a phylogenetics
        tool such as IQ-TREE.
      </p>
      <div className="flex items-center gap-2">
        <Checkbox id="treeLengths" checked={showLengths} onCheckedChange={(v) => setShowLengths(v === true)} />
        <Label htmlFor="treeLengths" className="font-normal">
          Draw branch lengths
        </Label>
      </div>
      <div ref={ref} className="w-full">
        {width > 0 && (
          <PhyloTree
            tree={tree}
            layout={layout}
            width={width}
            height={Math.max(240, leafCount * LEAF_SPACING + 80)}
            leafSpacing={LEAF_SPACING}
            showSupportValues={false}
            interactive
          />
        )}
      </div>
    </div>
  );
}
