# mafftserver

A webapp for running [MAFFT](https://mafft.cbrc.jp/alignment/software/)
multiple sequence alignments: paste or upload sequences (or add sequences to
an existing alignment), pick a strategy, watch the job run, browse the
alignment and MAFFT's guide tree in the browser, and download the result as
FASTA, Clustal, PHYLIP or a zip.

A sibling of [iqtreeserver](https://github.com/holmrenser/iqtreeserver) and
[blastserver](https://github.com/holmrenser/blastserver), with the same
architecture. The alignment and tree views are
[react-bio-viz](https://github.com/holmrenser/react-bio-viz). See
[DESIGN.md](DESIGN.md) for the feature list, decisions, and rationale.

```
Browser -> Next.js app (submit form, results page, API routes)
             |
             +-> pg-boss (Postgres-backed queue) -> mafftworker -> spawnSync("mafft", ...)
             |
             +-> Postgres (Prisma): mafftjob table is the source of truth
                 for job status - pg-boss is transport/retry only.
```

## Prerequisites

- Node.js 22+
- Docker (for Postgres locally, and for the full containerized stack)
- MAFFT on your `PATH` (or `MAFFT_BIN` pointing at the `mafft` script) to run
  the worker or the smoke tests outside Docker - e.g. `apt install mafft` or
  `brew install mafft`.

## Local development

```bash
npm install
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres
npx prisma migrate deploy
npm run prisma:generate
npm run dev                        # Next.js app on :3000
npm run worker:dev                 # worker, in a second terminal (tsx watch, reads .env)
```

## Running the full stack in Docker

```bash
docker compose up --build
```

This starts `postgres`, a one-shot `migrate` service (`prisma migrate
deploy`), the `app` on [http://localhost:3000](http://localhost:3000), and two
`mafftworker` replicas. The worker image builds MAFFT from a pinned,
sha256-checked source tarball (see `worker.Dockerfile`).

## Deploying under a subpath

The production target is `bioinformatics.nl/mafft`:

- `NEXT_PUBLIC_BASE_PATH=/mafft` is a **build-time** arg (inlined into the
  client bundle) and also needed at runtime - `docker-compose.yml` passes both.
  CI's image build sets it.
- `APP_URL=https://bioinformatics.nl/mafft` builds the links in notification
  emails.

The reverse proxy must forward `/mafft/*` unmodified (no path stripping).

## Tests

```bash
npm run test:unit          # pure functions - no DB, no binary
npm run test:integration   # API routes against a real Postgres (DATABASE_URL from .env)
npm run test:smoke         # real mafft runs through the worker's executeMafft; skipped without a binary
```

## Project layout

- `src/lib/mafft/` - MAFFT domain logic shared by app and worker: the zod
  submission schema, the argv builder (`buildArgs.ts`), stderr parsing
  (version, the strategy `--auto` picked, readable failure messages), and
  guide-tree label restoration.
- `src/lib/sequences/fasta.ts` - FASTA parsing/validation that runs in the
  form (instant feedback) *and* in `/api/submit` (authoritative). It is the
  only residue check: with `--preservecase` MAFFT accepts any symbol.
- `src/lib/alignment/` - stats (gap fraction, mean pairwise identity) and the
  Clustal/PHYLIP renderers used by the download route. Only aligned FASTA is
  stored.
- `worker/processors/mafft.ts` - `executeMafft` (everything but the DB; the
  smoke tests drive it directly) and `runMafftJob`. MAFFT's stdout *and*
  stderr go to files, not pipes: `mafft` is a shell script that writes to
  `/dev/stderr`, which can't be opened on Node's socketpair-backed pipes.
- `src/app/jobs/[id]/` - results page (Server Component) plus client islands
  wrapping react-bio-viz's `MultipleSequenceAlignment` and `PhyloTree`.
  react-bio-viz can't be imported into Server Components (its bundle calls
  `React.createContext` at load), so anything using it - including the pure
  `analyseColumns` - lives in a `"use client"` component.
- `src/lib/email.ts` - optional notifications, disabled until `SMTP_HOST` is
  set; see [docs/email-notifications.md](docs/email-notifications.md).

## Changing the Prisma schema

Regenerate with `npm run prisma:generate` (not a bare `npx prisma generate`):
it also re-creates `src/generated/prisma/package.json`, which the worker's
`tsx` runtime needs (see `scripts/mark-prisma-esm.mjs`).

## Environment variables

See `.env.example`. `JOB_EXPIRE_SECONDS` (pg-boss's lost-job timeout) must
stay above `MAFFT_JOB_TIMEOUT_MS` (the worker's own cap on a single run);
`src/lib/env.ts` asserts this at startup.
