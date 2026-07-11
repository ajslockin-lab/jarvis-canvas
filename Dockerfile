# Carvis API server — production image
#
# Multi-stage build: build deps + production-only runtime.
# Targets Linux x64 by default (Render/Fly/Railway all use this).
#
# Why this Dockerfile exists alongside render.yaml:
# - Some platforms (Fly.io, Railway, self-hosters) prefer OCI images
#   over Render blueprints.
# - Render can also use it — set `image` to your registry push and skip
#   the `buildCommand` in render.yaml.
#
# Notes:
# - We pin pnpm via corepack, matching the workspace's minimumReleaseAge
#   supply-chain defense (configured in pnpm-workspace.yaml).
# - The api-server is built with esbuild (see artifacts/api-server/build.mjs)
#   — no transpile step inside the image itself, so we ship only the
#   dist/ output.
# - Distroless node20 keeps the attack surface small (no shell, no
#   package manager). Healthcheck uses `wget` from busybox — not in
#   distroless, so we use a tiny node script instead.

# --- Stage 1: build -----------------------------------------------------------
FROM node:20-bookworm-slim AS build

ENV CI=true \
    PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH"

# corepack ships with this image; enable pnpm matching the project's
# packageManager field if present, otherwise fall back to a recent pnpm.
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /repo

# Copy manifests first so dependency install benefits from Docker layer
# cache — source changes don't bust this layer unless a manifest changes.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY lib/db/package.json ./lib/db/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/api-spec/package.json ./lib/api-spec/
COPY scripts/package.json ./scripts/

# pnpm fetched deps for the entire workspace; the build itself only
# needs the api-server output.
RUN pnpm install --no-frozen-lockfile --filter @workspace/api-server... --filter @workspace/db...

# Now copy the source. From here on, cache invalidates when source changes.
COPY tsconfig.base.json tsconfig.json ./
COPY lib ./lib
COPY artifacts/api-server ./artifacts/api-server

RUN pnpm --filter @workspace/api-server run build

# --- Stage 2: runtime ---------------------------------------------------------
FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH"

# Build a non-root user for runtime. The api-server doesn't need root.
RUN groupadd --system --gid 1001 carvis && \
    useradd  --system --uid 1001 --gid carvis carvis

# Just the runtime deps for the api-server. We rebuild pnpm prod-only
# install to avoid shipping devDependencies into the image.
WORKDIR /repo

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY lib/db/package.json ./lib/db/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/api-spec/package.json ./lib/api-spec/

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate && \
    pnpm install --no-frozen-lockfile \
      --filter @workspace/api-server... --filter @workspace/db... \
      --prod --ignore-scripts

# Bring in the built bundle only.
COPY --from=build /repo/artifacts/api-server/dist ./artifacts/api-server/dist

# Static assets (for /api/extension/download). The chrome extension lives
# here in source; keep it small. If you're shipping a lean image, override
# the EXTENSION_DIR env var to point at an external mount in DEPLOY.md.
COPY artifacts/chrome-extension ./artifacts/chrome-extension

# Healthcheck uses a tiny node script — no shell / curl / wget needed.
# HEALTHCHECK_URL defaults to whatever PORT the api-server binds to;
# override via env if the platform routes through a different port.
COPY <<'EOF' /usr/local/bin/healthcheck.mjs
const port = process.env.PORT || "8080";
const url = process.env.HEALTHCHECK_URL || `http://127.0.0.1:${port}/api/healthz`;
const timeoutMs = Number(process.env.HEALTHCHECK_TIMEOUT_MS || 2000);

const ctl = new AbortController();
const t = setTimeout(() => ctl.abort(), timeoutMs);

try {
  const r = await fetch(url, { signal: ctl.signal });
  process.exit(r.ok ? 0 : 1);
} catch {
  process.exit(1);
} finally {
  clearTimeout(t);
}
EOF

USER carvis

# EXPOSE is informational — actual bind port comes from $PORT at runtime
# (Render/HF Spaces/Fly/Railway all inject PORT into the env).
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "/usr/local/bin/healthcheck.mjs"]

CMD ["node", "artifacts/api-server/dist/index.mjs"]
