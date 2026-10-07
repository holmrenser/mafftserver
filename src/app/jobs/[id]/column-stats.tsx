"use client";

import { useMemo } from "react";
import { analyseColumns } from "react-bio-viz";
import type { AlignmentRow } from "./alignment-panel";
import { Stat } from "./stat";

/**
 * Conserved / parsimony-informative column counts via react-bio-viz's pure
 * analyseColumns. A client component only because react-bio-viz can't be
 * imported into a Server Component (its bundle calls React.createContext at
 * module load, which the react-server build lacks) - it still renders on
 * the server as part of the SSR pass.
 */
export function ColumnStats({ rows }: { rows: AlignmentRow[] }) {
  const columns = useMemo(
    () => (rows.length ? analyseColumns(rows.map((r) => ({ header: r.id, sequence: r.sequence }))) : null),
    [rows],
  );
  if (!columns) return null;
  return (
    <>
      <Stat label="Conserved columns" value={columns.conservedSites.length.toLocaleString()} />
      <Stat label="Parsimony-informative columns" value={columns.parsimonyInformativeSites.length.toLocaleString()} />
    </>
  );
}
