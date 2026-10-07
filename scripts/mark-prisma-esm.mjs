// `prisma generate` fully regenerates src/generated/prisma/ on every run,
// wiping any file placed inside it by hand. The generated client.ts uses
// `import.meta.url` and extensionless relative imports (assumes a
// bundler-style consumer, which Next.js's Turbopack provides natively) - the
// worker has no bundler and runs via `tsx` instead, whose esbuild-based
// loader also handles this correctly, but only once Node's own module
// resolution is told this subtree is ESM. A nested package.json does that,
// so this script re-creates it after every `prisma generate` - run it from
// both `npm run prisma:generate` and worker.Dockerfile's `prisma-gen` stage.
import { writeFileSync } from "node:fs";

writeFileSync("src/generated/prisma/package.json", JSON.stringify({ type: "module" }, null, 2) + "\n");
