# ── Mage wiki site (packages/wiki) – OCP runtime image ─────────────────────────
#
# WHY no `npm run build` here:
#   This image is built on an arm64 Mac targeting an amd64 base image. Podman
#   runs every RUN step under QEMU emulation — esbuild's bundler crashes under
#   emulation (fatal error: lfstack.push). The fix: run `astro build` natively
#   on the Mac first (arm64 esbuild works), then let this image only install
#   runtime deps and copy the prebuilt dist/.
#
# BEFORE running podman build, run from the repo root:
#   bun run --cwd packages/wiki build
#
# Build context: packages/wiki  (contextDir: packages/wiki in BuildConfig.yml)
# Runtime entry: dist/server/entry.mjs  (Astro standalone / @astrojs/node)
# Listens on:   HOST=0.0.0.0  PORT=8080  (matches Service.yml 8080-tcp)
# ──────────────────────────────────────────────────────────────────────────────

FROM registry.dti.co.id/public/nodejs:nodejs-ubi8-20-1-73.1742991506

USER root
WORKDIR /opt/app-root/src

# Propagate the corp CA bundle so Node + npm trust the artifactory TLS certificate.
ENV NODE_EXTRA_CA_CERTS=/opt/app-root/src/ca-bundle.crt

# Copy manifest + npmrc + CA bundle first so npm ci is a separate cacheable layer.
# .npmrc points the registry at the artifactory mirror — no public internet needed.
COPY package.json package-lock.json .npmrc ca-bundle.crt ./

# Install runtime deps only (omit @types/* / typescript / @astrojs/check).
# No bundling runs here — safe under QEMU emulation.
RUN npm ci --omit=dev --no-audit --no-fund --legacy-peer-deps

# Ship the site prebuilt natively on the host (pure JS → arch-independent).
COPY dist ./dist

# OpenShift runs containers as an arbitrary UID in group 0; g=u grants read access.
RUN chgrp -R 0 /opt/app-root/src \
 && chmod -R g=u /opt/app-root/src

ENV HOST=0.0.0.0 \
    PORT=8080 \
    NODE_ENV=production

EXPOSE 8080

CMD ["node", "dist/server/entry.mjs"]
