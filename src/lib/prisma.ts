import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getEnv } from "./env";

// Reuse a single client across hot-reloads in dev (Next.js) and across the
// worker's long-lived process; @prisma/adapter-pg pools connections itself.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: getEnv().DATABASE_URL });
  return new PrismaClient({ adapter });
}

function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

// Lazy Proxy: the real PrismaClient (and the env validation/connection setup
// it triggers) is only constructed on first property access - i.e. inside an
// actual request handler or worker call, never during Next's build-time
// static import graph walk (see src/lib/env.ts for why that matters).
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getPrismaClient() as object, prop, receiver);
  },
});
