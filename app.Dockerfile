# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM deps AS builder
WORKDIR /app
# Inlined into the client bundle at build time - see next.config.ts and
# src/lib/basePath.ts. Set to e.g. "/mafft" to serve behind a reverse proxy
# at a subpath; leave unset to serve from the root.
ARG NEXT_PUBLIC_BASE_PATH=""
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH
ENV NEXT_TELEMETRY_DISABLED=1
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY scripts ./scripts
RUN npx prisma generate && node scripts/mark-prisma-esm.mjs
COPY . .
RUN npx next build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY package.json next.config.ts prisma.config.ts ./

EXPOSE 3000
CMD ["npx", "next", "start"]
