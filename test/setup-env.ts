import { existsSync } from "node:fs";

// Integration/smoke tests hit a real Postgres, so they need a real
// DATABASE_URL (and friends) - load it from .env the same way `next dev`
// and `tsx --env-file` do, rather than requiring every dev/CI invocation to
// export it by hand.
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}
