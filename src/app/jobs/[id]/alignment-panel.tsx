"use client";

import { useMemo, useState } from "react";
import { MultipleSequenceAlignment, type MSAHover, type StoreController } from "react-bio-viz";
import { useElementWidth } from "@/hooks/use-element-width";

export interface AlignmentRow {
  id: string;
  sequence: string;
}

interface AlignmentPanelProps {
  rows: AlignmentRow[];
  rowOrderStore: StoreController<string[]>;
}

// react-bio-viz's `height` is the whole component (toolbar, minimap, ruler,
// consensus row, one track). Size it to the rows so a small alignment has no
// empty band below it, capped so a large one scrolls inside the viewer.
const CHROME_HEIGHT = 230;
const ROW_HEIGHT = 16;
const MAX_HEIGHT = 640;

export function AlignmentPanel({ rows, rowOrderStore }: AlignmentPanelProps) {
  const [ref, width] = useElementWidth();
  const [hover, setHover] = useState<MSAHover | null>(null);

  const msa = useMemo(() => rows.map((r) => ({ id: r.id, header: r.id, sequence: r.sequence })), [rows]);
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r.sequence])), [rows]);
  const height = Math.min(MAX_HEIGHT, CHROME_HEIGHT + rows.length * ROW_HEIGHT);

  return (
    <div className="flex flex-col gap-2">
      <div ref={ref} className="w-full" style={{ minHeight: height }}>
        {width > 0 && (
          <MultipleSequenceAlignment
            msa={msa}
            width={width}
            height={height}
            options={{ tracks: ["conservation"], showConsensus: true, showMinimap: true }}
            rowOrderStore={rowOrderStore}
            onHoverChange={setHover}
          />
        )}
      </div>
      <p className="min-h-5 font-mono text-xs text-muted-foreground" aria-live="off">
        {hover ? describeHover(hover, byId) : "Hover over the alignment for residue positions."}
      </p>
    </div>
  );
}

/**
 * Column numbers are alignment coordinates; people comparing against
 * UniProt/GenBank need the position in the *ungapped* sequence too.
 */
function describeHover(hover: MSAHover, byId: Map<string, string>): string {
  const column = hover.col + 1;
  if (hover.rowId === null) return `Consensus · column ${column} · ${hover.residue}`;
  const seq = byId.get(hover.rowId);
  if (!seq) return `${hover.label} · column ${column}`;
  const residue = seq[hover.col];
  if (residue === undefined) return `${hover.label} · column ${column}`;
  if (residue === "-" || residue === ".") return `${hover.label} · column ${column} · gap`;
  let position = 0;
  for (let c = 0; c <= hover.col; c++) if (seq[c] !== "-" && seq[c] !== ".") position++;
  return `${hover.label} · column ${column} · ${residue}${position}`;
}
