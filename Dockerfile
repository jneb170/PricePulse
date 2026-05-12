# syntax=docker/dockerfile:1.6

# ----- Stage 1: builder ------------------------------------------------------
# better-sqlite3 ships C++ sources that need to be compiled against the
# runtime libc. python3/make/g++ are required for node-gyp to run. The
# bundled SQLite source is inside the package — no system libsqlite3-dev.
FROM node:22-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy manifests first so this layer caches when source-only changes happen.
COPY package.json package-lock.json ./
RUN npm ci

# Now bring in the rest of the source and build both server + client.
COPY tsconfig.json tsconfig.server.json vite.config.ts postcss.config.js tailwind.config.js ./
COPY src ./src
COPY drizzle ./drizzle

RUN npm run build

# Drop dev dependencies; the compiled better_sqlite3.node binding stays.
RUN npm prune --omit=dev


# ----- Stage 2: runtime ------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Only the production artifacts and pruned deps travel into the runtime image.
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle

EXPOSE 8080

CMD ["npm", "start"]
