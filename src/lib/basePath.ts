// Mirrors the `basePath` in next.config.ts. Client-side `fetch`/`useSWR` calls
// and plain `<a href>` tags are not auto-prefixed by Next.js the way
// `next/link` and `next/navigation`'s router are, so any hardcoded root-
// absolute path (e.g. "/api/...") needs this prefix to work when the app is
// served under a subpath (e.g. bioinformatics.nl/iqtree).
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
