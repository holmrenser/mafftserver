import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Placeholder keeps `prisma generate` (which never connects) working in
    // Docker build stages and CI steps that have no DATABASE_URL.
    url: process.env["DATABASE_URL"] ?? "postgresql://placeholder@localhost:5432/placeholder",
  },
});
