# Playwright E2E runner image.
#
# Uses Microsoft's pre-built Playwright image which ships Node + Chromium + all
# OS libraries the browser needs. Tests run against the `web` and `api`
# containers on the shared Docker Compose network (DNS names: web, api).
#
# socat port forwarders expose `web` and `api` on the container's own loopback
# as localhost:3000 and localhost:3001. The browser treats localhost as a
# secure origin, enabling service workers — required by the SW lifecycle
# tests. Without this forwarder, SW tests cannot run in Docker since
# `http://web:3000` is not considered secure by Chromium.
FROM mcr.microsoft.com/playwright:v1.44.0-jammy

RUN apt-get update && apt-get install -y --no-install-recommends socat \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /repo

COPY package.json package-lock.json* ./
RUN npm install

COPY playwright.config.docker.ts ./playwright.config.ts
COPY tests/e2e/ ./tests/e2e/
COPY e2e-entrypoint.sh /usr/local/bin/e2e-entrypoint.sh
RUN chmod +x /usr/local/bin/e2e-entrypoint.sh

ENV CI=true
ENTRYPOINT ["/usr/local/bin/e2e-entrypoint.sh"]
CMD ["npx", "playwright", "test"]
