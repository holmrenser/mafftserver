# syntax=docker/dockerfile:1

# MAFFT is plain C, so building from source gives amd64 and arm64 alike and
# isn't tied to Debian's packaged version. MAFFT doesn't publish checksums:
# this sha256 was computed from two independent downloads of the release
# tarball (identical) when the version was pinned. Re-verify the same way
# before bumping MAFFT_VERSION.
FROM debian:bookworm-slim AS mafft-build
ARG MAFFT_VERSION=7.525
ARG MAFFT_SHA256=edb34ae9b26d6b55328c18fa060ed741bca8cd599c2f4f8fad0e0871c8082265
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl build-essential \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /tmp/mafft
RUN set -eux; \
    curl -fsSL -o mafft.tgz "https://mafft.cbrc.jp/alignment/software/mafft-${MAFFT_VERSION}-without-extensions-src.tgz"; \
    echo "${MAFFT_SHA256}  mafft.tgz" | sha256sum -c -; \
    tar xzf mafft.tgz --strip-components=1; \
    make -C core -j"$(nproc)" PREFIX=/opt/mafft; \
    make -C core install PREFIX=/opt/mafft

FROM node:22-bookworm-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# The generated Prisma client is TypeScript written for a bundler-style
# consumer; the worker runs it through tsx instead (see the comment in
# scripts/mark-prisma-esm.mjs). `prisma generate` needs the full install.
FROM node:22-bookworm-slim AS prisma-gen
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY scripts ./scripts
RUN npx prisma generate && node scripts/mark-prisma-esm.mjs

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
# The `mafft` entry point is a bash script that also needs awk.
RUN apt-get update && apt-get install -y --no-install-recommends openssl gawk && rm -rf /var/lib/apt/lists/*
COPY --from=mafft-build /opt/mafft /opt/mafft
ENV PATH="/opt/mafft/bin:${PATH}"
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prisma-gen /app/src/generated ./src/generated
COPY package.json tsconfig.worker.json ./
COPY worker ./worker
COPY src/lib ./src/lib

CMD ["node_modules/.bin/tsx", "worker/mafftworker.ts"]
