# mafftserver - design

A web app for running [MAFFT](https://mafft.cbrc.jp/alignment/software/)
multiple sequence alignments: paste or upload sequences, pick a strategy, watch
the job run, browse the alignment in the browser, and download it in the format
the next tool needs.

This is deliberately a sibling of
[iqtreeserver](https://github.com/holmrenser/iqtreeserver) and
[blastserver](https://github.com/holmrenser/blastserver): same stack, same
architecture, same conventions. Where this doc doesn't say otherwise, "do what
iqtreeserver does" is the rule. iqtreeserver is the closer template, because
like MAFFT it is one input file, one binary, and one result set with no
reference databases.

All biological visualization comes from
[react-bio-viz](https://github.com/holmrenser/react-bio-viz)
(`MultipleSequenceAlignment`, `PhyloTree`, and optionally `DistanceMatrix`).
mafftserver writes no viewer of its own. Where react-bio-viz is missing
something we need, we add it to react-bio-viz, not here.

# Features

## Must

- [ ] Align nucleotide or protein sequences with MAFFT from a pasted textarea **or** an uploaded FASTA file
- [ ] Strategy picker covering MAFFT's named methods (Auto, FFT-NS-1/2/i, L/G/E-INS-i), with the speed/accuracy trade-off explained inline
- [ ] Client-side input check before submit: sequence count, length range, detected type (DNA/RNA/protein), duplicate names, illegal characters
- [ ] Interactive alignment viewer on the results page: react-bio-viz `MultipleSequenceAlignment` (windowed canvas, minimap, colour schemes, conservation track)
- [ ] Download aligned FASTA, Clustal, PHYLIP, and a full-results zip
- [ ] Distributed pg-boss workers; Postgres is the single source of truth
- [ ] Hash-based job dedup (identical sequences + options give the same job URL)
- [ ] "Add sequences" mode: align new sequences or fragments to an existing alignment (`--add` / `--addfragments`, optional `--keeplength`)

## Should

- [ ] Show the strategy MAFFT actually used (relevant for `--auto`), its version, and alignment stats (length, gap %, mean pairwise identity, conserved / variable / parsimony-informative columns)
- [ ] Guide tree view (MAFFT `--treeout`) with react-bio-viz `PhyloTree`, labelled clearly as a *guide tree, not a phylogeny*, with an option to order the alignment rows by it
- [ ] Advanced scoring options: scoring matrix, gap opening/offset penalties, `--adjustdirection`, output order
- [ ] Optional email notification (identical to iqtreeserver: disabled until `SMTP_HOST` is set)

## Could

- [ ] **"Build a tree with IQ-TREE"** handoff: one click sends the finished alignment to an iqtreeserver instance (see [Integration](#integration-with-the-sibling-apps))
- [ ] **"Align selected hits"** from blastserver: blastserver hands its downloaded hit sequences to mafftserver
- [ ] Percent-identity matrix tab (react-bio-viz `DistanceMatrix`, sharing row order with the alignment and the guide tree)
- [ ] Trimming / masking of gappy columns before download. react-bio-viz already reports column selections and `onRemoveColumns`, so this could be "select columns in the viewer, download without them".
- [ ] Merge mode (`--merge`, combining pre-aligned sub-MSAs)
- [ ] Recent-jobs list per browser (localStorage, no accounts)

## Will not

- User accounts or private job lists. A job URL is the capability, as in the sibling apps.
- Structural alignment (DASH), or other aligners (MUSCLE, Clustal Omega). This is a MAFFT server.
- Phylogenetic inference. That's iqtreeserver's job; we hand off to it instead.

# Architecture

Same shape as iqtreeserver:

```
Browser -> Next.js app (submit form, results page, API routes)
             |
             +-> pg-boss (Postgres-backed queue) -> mafftworker -> spawnSync("mafft", ...)
             |
             +-> Postgres (Prisma): mafftjob table is the source of truth
                 for job status - pg-boss is transport/retry only.
```

## Stack (copied verbatim from iqtreeserver)

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router), React 19.2, TypeScript |
| UI | Tailwind v4 + shadcn/ui (`base-nova`, Base UI primitives), lucide icons, Geist fonts |
| Bio viz | **react-bio-viz 0.1.x**: `MultipleSequenceAlignment`, `PhyloTree`, `parseNewick`, `analyseColumns` (new compared with iqtreeserver) |
| Forms | react-hook-form + one shared zod schema (client validation **and** API validation) |
| Polling | SWR (queue badge, self-cancelling results poller + `router.refresh()`) |
| DB | Postgres 15 via Prisma 7 (`prisma-client` generator + `@prisma/adapter-pg`) |
| Queue | pg-boss 12 on the same Postgres, no Redis |
| Worker | plain TS run by `tsx`, plus the `mark-prisma-esm.mjs` trick for the generated client |
| Results storage | Postgres `bytea` behind a `src/lib/storage.ts` seam |
| Tests | Vitest, split into `unit` / `integration` (real Postgres) / `smoke` (real binary, skipped if absent) |
| Deploy | Docker Compose: `postgres` -> one-shot `migrate` -> `app` + N `mafftworker` replicas; `NEXT_PUBLIC_BASE_PATH` subpath support |
| CI | blastserver's GitHub Actions workflow (lint, typecheck worker, build, unit + integration against a Postgres service, push SHA-tagged images to GHCR on `main`) |

Also adopt from blastserver: `.env.example` with every key documented and
`CONTRIBUTING.md`. blastserver's `src/proxy.ts` CORS allowlist only matters for
the cross-app handoffs, so it waits for the monorepo discussion (Decision 3).

## Project layout

```
src/lib/mafft/schema.ts        zod submission schema (shared by form, API, worker)
src/lib/mafft/buildArgs.ts     options -> mafft argv (pure, exhaustively unit-tested)
src/lib/mafft/parseStderr.ts   version + strategy-used extraction (null-safe regexes)
src/lib/sequences/fasta.ts     FASTA parse/validate/type-detect (runs in browser AND server)
src/lib/alignment/stats.ts     gap fraction, mean pairwise identity (worker-side, stored)
src/lib/alignment/formats.ts   aligned FASTA -> Clustal / PHYLIP (strict + relaxed)
src/lib/mafft/guideTree.ts     --treeout label un-mangling (string -> string; parsing is react-bio-viz's)
src/lib/{env,hash,queue,storage,prisma,email,basePath,fetcher}.ts   same as iqtreeserver
worker/runtime.ts              copied as-is (generic retry-aware pg-boss runtime)
worker/mafftworker.ts          wiring + recordFailure
worker/processors/mafft.ts     materialize input -> spawn -> parse -> persist -> clean up
src/app/page.tsx               submission form
src/app/jobs/[id]/             results page (Server Component) + client islands:
  results-poller.tsx             same as iqtreeserver
  results-views.tsx              tabs + the row-order store shared by alignment and tree
  alignment-panel.tsx            "use client" wrapper around react-bio-viz MultipleSequenceAlignment
  guide-tree-panel.tsx           "use client" wrapper around react-bio-viz PhyloTree
  column-stats.tsx               analyseColumns counts (client component, see Integration notes)
src/hooks/use-element-width.ts ResizeObserver hook (react-bio-viz takes pixel width/height)
src/app/api/{submit,jobs/[id],jobs/[id]/download,queue,health,ready}/route.ts
```

# Data model

```prisma
model MafftJob {
  id String @id @unique // sha256(sequences [+ existing alignment]) + validated options, sliced to 24

  // input
  parameters      Json    // StoredJobParameters: validated options + input sha256s + input stats
  inputFilename   String  // uploaded name, or "pasted.fasta"
  inputData       Bytes   // normalized FASTA (see "Input handling")
  existingAlnData Bytes?  // only for mode = "add": the alignment being added to
  notifyEmail     String?

  submitted DateTime  @default(now())
  started   DateTime?
  finished  DateTime?
  err       String?

  // outputs
  stderr          String? // MAFFT's progress log
  summary         Json?   // AlignmentSummary: version, strategyUsed, nSeqs, length, gapFraction, meanIdentity
  alignmentFasta  String? // canonical output; all other formats derived from it on download
  guideTreeNewick String? // --treeout, labels already un-mangled
  resultsZip      Bytes?
  resultsZipBytes Int?

  @@map("mafftjob")
}
```

`summary` holds only what has to come from the run itself (from stderr) or is
expensive: mean pairwise identity is O(N²·L), so the worker computes it once,
sampling pairs above a size cap. Column classes (conserved / variable /
parsimony-informative) come from react-bio-viz's pure `analyseColumns` at render
time. It is O(N·L), so nothing else needs storing. It has to run in a client
component (still server-rendered), not the Server Component itself: see
[Integration notes](#integration-notes).

Only aligned FASTA is stored. Clustal and PHYLIP are rendered from it in
`src/lib/alignment/formats.ts` at download time. They are cheap pure functions,
so MAFFT never has to run twice or store three copies. MAFFT is deterministic
(no seed), so dedup needs none of iqtreeserver's seed handling.

# MAFFT options -> schema -> argv

The schema mirrors the MAFFT online service's grouping, so people who know that
site feel at home (the same "mimic the canonical UI" principle blastserver
applies to NCBI).

```ts
mafftSubmissionSchema = z.object({
  mode: z.enum(["align", "add"]).default("align"),
  sequenceType: z.enum(["auto", "nucleotide", "protein"]).default("auto"),
  strategy: z.enum(["auto", "fftns1", "fftns2", "fftnsi", "linsi", "ginsi", "einsi"]).default("auto"),
  maxIterate: z.coerce.number().int().min(0).max(1000).optional(), // only for iterative strategies; default per strategy
  scoring: z.object({
    matrix: z.enum(["default", "BLOSUM30", "BLOSUM45", "BLOSUM62", "BLOSUM80", "JTT100", "JTT200", "kimura1", "kimura200"]),
    gapOpen: z.coerce.number().min(0).max(10).default(1.53),   // --op
    gapOffset: z.coerce.number().min(0).max(10).default(0.0),  // --ep (E-INS-i forces 0)
  }),
  adjustDirection: z.enum(["none", "fast", "accurate"]).default("none"),
  outputOrder: z.enum(["input", "aligned"]).default("input"),
  addOptions: z.object({ fragments: z.boolean(), keepLength: z.boolean() }).optional(), // mode = "add" only
});
```

| Option | argv | Notes |
| --- | --- | --- |
| strategy `auto` | `--auto` | Strategy used is parsed from stderr (`Strategy:\n <name> (...)`) and shown on the results page |
| `fftns1` | `--retree 1 --maxiterate 0` | |
| `fftns2` | `--retree 2 --maxiterate 0` | MAFFT's own default |
| `fftnsi` | `--retree 2 --maxiterate 1000` | |
| `linsi` | `--localpair --maxiterate 1000` | MAFFT recommends <~200 seqs x <~2000 residues |
| `ginsi` | `--globalpair --maxiterate 1000` | same size guidance |
| `einsi` | `--genafpair --ep 0 --maxiterate 1000` | same size guidance |
| sequenceType | `--nuc` / `--amino` | omitted for auto |
| matrix | `--bl N` / `--jtt N` / `--kimura N` | protein matrices rejected for nucleotide input, and the reverse |
| gapOpen / gapOffset | `--op` / `--ep` | only emitted when not the default |
| adjustDirection | `--adjustdirection` / `--adjustdirectionaccurately` | MAFFT prefixes reversed sequences with `_R_`; the summary lists which sequences were reversed |
| outputOrder `aligned` | `--reorder` | |
| mode `add` | `--add new.fa` / `--addfragments new.fa`, optional `--keeplength` | existing alignment is the positional input |
| *(always)* | `--preservecase --treeout --thread $MAFFT_WORKER_THREADS` | without `--preservecase`, MAFFT lowercases nucleotide output (verified with v7.525) |

`buildMafftArgs` returns a flat token array for `spawnSync(bin, args)`, as in
iqtreeserver. It never builds a shell string.

## Size guard-rails

The *-INS-i strategies are quadratic or worse. They're useful on the sizes
MAFFT recommends and will take a worker down on anything much bigger. Enforce
limits in the zod schema's `superRefine`, so the form and the API reject
identically:

- `MAX_SEQS` / `MAX_TOTAL_RESIDUES`, overall upload limits (env-configurable).
- `MAX_SEQS_ACCURATE` (default 2000): above this, `linsi`/`ginsi`/`einsi` are
  disabled in the form with a tooltip explaining why and suggesting `auto`.

# Input handling

Paste-or-upload, like blastserver's query box rather than iqtreeserver's
file-only input. Users often have a handful of sequences in a clipboard.

`src/lib/sequences/fasta.ts` runs on **both sides**. Each check runs in the
browser for instant feedback and again in `/api/submit`, because the client
can't be trusted:

1. Parse FASTA; normalize line endings; strip whitespace inside sequences.
2. **Reject**: fewer than 2 sequences (MAFFT accepts 1, but it isn't an
   alignment), empty sequences, duplicate IDs. MAFFT itself accepts duplicate
   IDs, but they break the guide-tree label mapping, react-bio-viz's row
   identity (rows are keyed by `header` unless given an `id`), and any
   downstream IQ-TREE run.
3. **Reject** characters outside the IUPAC alphabet (plus `-`, `*`, `.`), and
   report which sequence and position. This check is the *only* guard: with
   `--preservecase` (always on), MAFFT v7.525 silently aligns any symbol,
   `!` included. Without it, MAFFT fails with only `Illegal character j`.
4. **Detect** nucleotide vs protein (>90% ACGTUN -> nucleotide). This preselects
   `sequenceType` and filters the matrix dropdown.
5. **Warn, don't block**: input already contains gaps ("this looks aligned; did
   you mean *Add sequences*?"), or very uneven lengths with a `linsi`/`ginsi`
   choice.

The normalized FASTA is what gets stored and hashed, so whitespace-only
differences still dedupe.

# Worker

`worker/processors/mafft.ts` follows iqtreeserver's processor step for step.
The differences:

- **Stdout and stderr both go straight to files** (`stdio: ["ignore", outFd,
  errFd]`). Stdout is the alignment, so it can be any size. Stderr *must* be a
  regular file: `mafft` is a shell script that writes progress to
  `/dev/stderr`, and Node's piped stdio is a socketpair, which `/dev/stderr`
  can't be opened on (ENXIO). MAFFT then fails before aligning anything. The
  smoke tests caught this. As a result there's no `MAX_BUFFER_BYTES`.
- **MAFFT's scratch dir lives in the job dir.** MAFFT `mktemp`s under
  `$TMPDIR`, which falls back to the *current directory* when unset, and
  failed runs don't clean up. So the worker runs MAFFT with
  `TMPDIR=MAFFT_TMPDIR=<workDir>`, and the leftovers go when the workDir is
  removed. (Found when the failing smoke runs left `mafft.XXXXXXXXXX` dirs in
  the repo root.)
- **Guide tree un-mangling.** `--treeout` writes `<input>.tree` with labels like
  `1_seqA_some_description`, split across lines. Strip newlines, then map the
  numeric prefix back to the original ID by input index before storing.

Failure path: on non-zero exit, look for MAFFT's known error lines (`Illegal
character`, an unaligned existing alignment in add mode (two wordings),
out-of-memory) and turn them into one human-readable sentence
followed by the stderr tail, the same as iqtreeserver's `IqtreeRunError`.

Timeouts: most MAFFT jobs finish in seconds and a big `auto` job in minutes, so
defaults are much smaller than IQ-TREE's: `MAFFT_JOB_TIMEOUT_MS = 30 min`,
`JOB_EXPIRE_SECONDS = 45 min`. Keep iqtreeserver's startup assertion that the
former is smaller than the latter.

Binary: build MAFFT from a pinned, sha256-verified source tarball in
`worker.Dockerfile` (`make -C core && make -C core install`). It is plain C, so
amd64 and arm64 builds come free. This avoids being pinned to Debian's apt
version, and the pattern matches iqtreeserver's checksum-verified download.

# UI

Same visual language as iqtreeserver: a sticky nav with the app name and the
live queue badge, a centered `max-w-2xl` form, and cards per section. The
results page widens to `max-w-6xl` because alignments need the room.

## Submit page (`/`)

1. **Sequences** card: a mode toggle (`Align` / `Add to alignment`), a monospace
   textarea with a drop zone and an "Upload FASTA" button, and a "Load example"
   link. Under it, a live **input summary strip**: `12 sequences · 248-1,031 bp ·
   Nucleotide` as badges, plus any errors or warnings from the input checks. In
   Add mode, a second input for the existing alignment appears.
2. **Strategy** card: radio cards rather than a select, each showing name,
   one-line description, and speed/accuracy pips. Auto is first and default.
   Options over the size limits are disabled with an explanation.
3. **Advanced** accordion: sequence type override, scoring matrix (filtered by
   type), gap open/offset, direction adjustment, output order, max iterations.
4. Email field (iqtreeserver behaviour), then **Run MAFFT**.

## Results page (`/jobs/[id]`)

- Header: input filename and job id, same as iqtreeserver. A copyable,
  read-only **command line** (`mafft --localpair --maxiterate 1000 ...`) so the
  run is reproducible locally. That's a nice teaching touch, in blastserver's
  educational spirit.
- While queued or running: the same dashed status box and `ResultsPoller`.
- **Summary** card: MAFFT version, strategy used, sequences, alignment length,
  gap %, mean pairwise identity, and conserved / variable / parsimony-informative
  columns. The parsimony-informative count tells you up front whether the
  alignment is worth sending to IQ-TREE.
- **Tabs**: Alignment | Guide tree | MAFFT log (later also Identity matrix).
- **Download** menu: FASTA, Clustal, PHYLIP (relaxed), full zip. Plus "Build tree
  with IQ-TREE" when `IQTREE_URL` is configured.

# Visualization: react-bio-viz

iqtreeserver hand-rolled its tree viewer because an imperative library (d3 or
phylotree.js) fought React's reconciliation. react-bio-viz is a pure React
component library with controllable state, so that concern doesn't apply, and
mafftserver uses it for all visualization.

## Alignment tab: `MultipleSequenceAlignment`

```tsx
// src/app/jobs/[id]/alignment-panel.tsx
"use client";
<MultipleSequenceAlignment
  msa={records.map((r, i) => ({ id: String(i), header: r.id, sequence: r.seq }))}
  width={width}            // from useElementWidth(); the component takes pixels
  height={480}
  options={{ tracks: ["conservation"], showConsensus: true, showMinimap: true }}
  rowOrderStore={rowOrder} // shared with the guide tree, see below
/>
```

What we get without writing it: windowed canvas rendering with no size limit,
pan/zoom, ruler, minimap, consensus row, the standard colour schemes
(`DNA`/`DNA ClustalX`, `AA ClustalX`/`Zappo`/`Taylor`, auto-picked from the
alphabet), conservation and logo tracks, "only differences" mode, motif search
(`highlightPattern`, e.g. the N-glycosylation motif `N[^P][ST]` in a teaching
setting), and row/column selection. That covers everything the earlier
hand-rolled viewer spec listed, plus more.

We add a small status bar of our own, driven by `onHoverChange`, showing the
**ungapped residue position** of the hovered cell (e.g. `CYC_HUMAN · column 42 ·
K38`). Users comparing against UniProt numbering need it. If it turns out to be
generally useful, it moves into react-bio-viz's built-in cursor badge.

Editing callbacks (`onRenameRow`, `onRemoveRows`, `onRemoveColumns`) stay off
in v1. Results are immutable job outputs. They're the natural hook for the
"trim columns, then download" Could item.

## Guide tree tab: `PhyloTree`

```tsx
const tree = useMemo(() => parseNewick(guideTreeNewick), [guideTreeNewick]);
<PhyloTree tree={tree} width={width} height={480} layout="rectangular"
           showSupportValues={false} onLeafOrderChange={(names) => rowOrder.setValue(names)} />
```

- `parseNewick` from react-bio-viz replaces iqtreeserver's `src/lib/tree/`.
  Our own `guideTree.ts` only un-mangles MAFFT's `N_name` labels.
- An **"Order alignment by guide tree"** toggle shares one
  `createControllableStore<string[]>()` between the tree's leaf order and the
  alignment's `rowOrderStore`. This is react-bio-viz's linked-views pattern, and
  it also covers ordering rows the way MAFFT's `--reorder` would.
- Guide-tree branch lengths aren't evolutionary distances, so default to
  `layout="cladogram"`, with a toggle to show the lengths.
- Export the tree as SVG/PNG with react-bio-viz's `serializeSvg` / `svgToPng`,
  next to the Newick download.

## Identity matrix tab (Could): `DistanceMatrix`

Pairwise p-distances (computed in `stats.ts`, already needed for mean identity)
shown with `DistanceMatrix`, on the same shared row-order store, so all three
views stay in step. react-bio-viz's docs build `pDistances` and
`neighborJoining` helpers in `apps/docs/src/lib/phylo.ts` but don't export them.
If we need them, promote them into the library instead of copying them.

## Integration notes

- **Client components only.** The panels are `"use client"` islands, and the
  results page stays a Server Component passing data down, as in iqtreeserver.
  react-bio-viz server-*renders* fine inside client components, but it
  **can't be imported into a Server Component**. Its bundle calls
  `React.createContext` at load, and the react-server build of React doesn't
  have it. That includes the pure helpers like `analyseColumns`. (`next build`
  fails with `createContext is not a function`.) Possible upstream fix: a
  `"use client"` banner on the bundle, plus a separate DOM-free entry point for
  the pure helpers (e.g. `react-bio-viz/analysis`).
- **Styles.** Import `react-bio-viz/style.css` once in `layout.tsx` so the
  toolbars are styled before hydration. Otherwise they flash, because the
  injected `<style>` only arrives with the JS.
- **Theming comes for free.** react-bio-viz reads the shadcn tokens
  (`--background`, `--foreground`, `--border`, …) that iqtreeserver's
  `globals.css` already defines, and follows the `.dark` class on `<html>`, the
  same convention as our `@custom-variant dark`. `--rbv-accent` is the one extra
  token to set.
- **Sizing.** Components take pixel `width`/`height`, so one shared
  `useElementWidth` (ResizeObserver) hook drives both panels, following the
  pattern in react-bio-viz's Getting Started guide.
- **Large alignments (not built yet).** Passing the alignment as a prop
  serializes it into the RSC payload. That's fine up to a few MB. Above a
  threshold (`INLINE_ALIGNMENT_MAX_BYTES`), the panel should fetch it from
  `GET /api/jobs/[id]/download?format=fasta` with SWR instead. The scaffold
  always passes it inline.

## Dependency status

`react-bio-viz@^0.1.0` from npm (peer dependency `react ^18.3.1 || ^19.0.0`).
Version 0.0.17 and older predate the API described above, so don't pin them.

# Integration with the sibling apps

All three apps are separate deployments, so integration happens over URLs
and APIs. No shared code at runtime.

- **mafftserver -> iqtreeserver** (Could): a new `GET /api/jobs/[id]/alignment?format=fasta`
  on mafftserver, and a small iqtreeserver addition that accepts
  `/?alignmentUrl=...` and prefills its form from it. The iqtreeserver origin
  goes in mafftserver's `CORS_ALLOW_ORIGIN`. The button only appears when
  `IQTREE_URL` is set.
- **blastserver -> mafftserver** (Could): the mirror image. mafftserver's
  submit page accepts `?sequencesUrl=...` from blastserver's hit download.

# Testing

Same three tiers as iqtreeserver:

- **unit**: `buildArgs` (every strategy and option combination, plus "never
  emits a default flag"), `fasta` validation, `parseStderr` against captured real
  stderr fixtures (an `--auto` run, an illegal-character failure), `stats`,
  `formats` (Clustal/PHYLIP round-trips), guide-tree un-mangling (including
  "the result parses with react-bio-viz's `parseNewick` and has exactly the
  input IDs as leaves"), `hash`, `env`. The viewers themselves are react-bio-viz's
  to test. We don't re-test them here.
- **integration**: `/api/submit` (validation rejections, dedup, email guard),
  `/api/jobs/[id]`, download content types, against a real Postgres.
- **smoke**: a real `mafft` run on a fixture through `buildArgs`, the processor,
  and the parsers. Skipped if the binary is missing.

# Decisions

1. **Hosting:** same reverse-proxy setup as iqtreeserver, served at
   `bioinformatics.nl/mafft` (`NEXT_PUBLIC_BASE_PATH=/mafft`,
   `APP_URL=https://bioinformatics.nl/mafft`).
2. **Add sequences** is a Must (moved up from Should).
3. **Cross-app integration** (the IQ-TREE handoff, the blastserver handoff) is
   wanted, but it is deferred to a separate design discussion about combining
   mafftserver, iqtreeserver and blastserver into one monorepo with links
   between them. Until then, don't build the handoff routes. The
   [Integration](#integration-with-the-sibling-apps) section is a sketch that
   the monorepo design may replace.
4. **react-bio-viz 0.1.0** is published on npm (React 18 + 19 peer). Scaffolding
   uses it directly.
