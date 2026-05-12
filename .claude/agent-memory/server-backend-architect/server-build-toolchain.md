---
name: server-build-toolchain
description: PricePulse server is built with tsc (NodeNext), not a bundler; relative imports inside src/server use explicit .js extensions.
metadata:
  type: project
---

The server build uses `tsc -p tsconfig.server.json` (NodeNext module + moduleResolution). esbuild was removed from devDependencies in the Docker migration.

Every relative import inside `src/server/` carries an explicit `.js` extension (e.g. `import { db } from './db/index.js'`). Directory imports must be fully qualified to a file — `./db` is not valid under NodeNext; use `./db/index.js`.

**Why:** NodeNext ESM resolution requires explicit file extensions and disallows implicit directory index resolution. tsc emits the import paths verbatim, so the source files must match what Node will execute. tsx (used in dev) tolerates the `.js` specifier and resolves it to the `.ts` source, so both dev and prod use the same import strings.

**How to apply:** When adding a new file under `src/server/` or a new import, always write `from './foo.js'` (or `./foo/index.js` for directories). Tests under `__tests__/` are excluded from the server build and rely on the root tsconfig's `moduleResolution: Bundler` — extensions still work there but aren't strictly required.

Related: [[deployment-docker-fly]] — the Dockerfile depends on this build path.
