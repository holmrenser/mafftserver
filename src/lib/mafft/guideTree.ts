/**
 * MAFFT's `--treeout` writes the guide tree with every leaf renamed to
 * `<1-based input index>_<header with non-word chars replaced by _>`, and
 * the Newick split across many lines:
 *
 *   (
 *   1_seqA_some_description
 *   :0.38473,(
 *   2_seqB
 *   ...
 *
 * This restores the original IDs by index, so tree leaves match the
 * alignment rows exactly. Parsing the result is react-bio-viz's
 * `parseNewick` - this only rewrites the text.
 *
 * `ids` must be in MAFFT's input order (i.e. the order of the FASTA that
 * was passed as the positional argument).
 */
export function unmangleGuideTree(raw: string, ids: string[]): string {
  const compact = raw.replace(/\s+/g, "");
  return compact.replace(/(^|[(,])(\d+)_[^:,();]*/g, (match, prefix: string, index: string) => {
    const id = ids[Number(index) - 1];
    if (id === undefined) {
      throw new Error(`Guide tree references sequence #${index}, but the input only has ${ids.length} sequences`);
    }
    return prefix + quoteNewickLabel(id);
  });
}

/** Newick labels containing structural characters or whitespace must be single-quoted. */
function quoteNewickLabel(label: string): string {
  return /[\s(),:;'[\]]/.test(label) ? `'${label.replace(/'/g, "''")}'` : label;
}
