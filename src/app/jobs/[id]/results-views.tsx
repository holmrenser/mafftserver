"use client";

import { useMemo, useState } from "react";
import { createControllableStore, leafOrder, parseNewick } from "react-bio-viz";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { AlignmentPanel, type AlignmentRow } from "./alignment-panel";
import { GuideTreePanel } from "./guide-tree-panel";

interface ResultsViewsProps {
  rows: AlignmentRow[];
  guideTreeNewick: string | null;
  stderr: string | null;
}

/**
 * Client island owning the state shared between views: one row-order store,
 * bound to the alignment, so "order by guide tree" is a single setValue
 * (react-bio-viz's linked-views pattern).
 */
export function ResultsViews({ rows, guideTreeNewick, stderr }: ResultsViewsProps) {
  const inputOrder = useMemo(() => rows.map((r) => r.id), [rows]);
  const [rowOrderStore] = useState(() => createControllableStore<string[]>(inputOrder));
  const [orderByTree, setOrderByTree] = useState(false);

  const tree = useMemo(() => {
    if (!guideTreeNewick) return null;
    try {
      return parseNewick(guideTreeNewick);
    } catch {
      return null;
    }
  }, [guideTreeNewick]);

  function toggleOrderByTree(enabled: boolean) {
    setOrderByTree(enabled);
    rowOrderStore.setValue(enabled && tree ? leafOrder(tree, { collapsed: [] }) : inputOrder);
  }

  return (
    <Tabs defaultValue="alignment">
      <TabsList variant="line">
        <TabsTrigger value="alignment">Alignment</TabsTrigger>
        {tree && <TabsTrigger value="tree">Guide tree</TabsTrigger>}
        {stderr && <TabsTrigger value="log">MAFFT log</TabsTrigger>}
      </TabsList>

      <TabsContent value="alignment" className="flex flex-col gap-3 pt-2">
        {tree && (
          <div className="flex items-center gap-2">
            <Checkbox id="orderByTree" checked={orderByTree} onCheckedChange={(v) => toggleOrderByTree(v === true)} />
            <Label htmlFor="orderByTree" className="font-normal">
              Order rows by guide tree
            </Label>
          </div>
        )}
        <AlignmentPanel rows={rows} rowOrderStore={rowOrderStore} />
      </TabsContent>

      {tree && (
        <TabsContent value="tree" className="pt-2">
          <GuideTreePanel tree={tree} leafCount={rows.length} />
        </TabsContent>
      )}

      {stderr && (
        <TabsContent value="log" className="pt-2">
          <pre className="max-h-[32rem] overflow-auto rounded-lg bg-muted p-3 font-mono text-xs">{stderr}</pre>
        </TabsContent>
      )}
    </Tabs>
  );
}
