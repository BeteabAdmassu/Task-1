# Playwright E2E runner image.
#
# Uses Microsoft's pre-built Playwright image which ships Node + Chromium + all
# OS libraries the browser needs. Tests run against the `web` and `api`
# containers on the shared Docker Compose network (DNS names: web, api).
#
# Service-worker registration normally requires a secure origin (HTTPS or
# localhost). We don't ship any extra OS packages — no `apt-get` at build
# time (keeps the image small AND avoids CI environments that block
# `archive.ubuntu.com`). Instead, `playwright.config.docker.ts` launches
# Chromium with `--unsafely-treat-insecure-origin-as-secure=http://web:3000,
# http://api:3001`, which tells the browser to treat these Compose-network
# origins as secure — enabling service workers without any forwarding.
FROM mcr.microsoft.com/playwright:v1.44.0-jammy

WORKDIR /repo

COPY package.json package-lock.json* ./
RUN npm install

COPY playwright.config.docker.ts ./playwright.config.ts
COPY tests/e2e/ ./tests/e2e/

ENV CI=true
CMD ["npx", "playwright", "test"]
