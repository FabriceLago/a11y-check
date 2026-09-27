# syntax=docker/dockerfile:1
# One image: Fastify API + built Angular front + Chromium (scans, PDF).

# ─── 1. Front: Angular production build ───────────────────────
FROM node:24-bookworm-slim AS web
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npx ng build

# ─── 2. Server: runtime dependencies + Chromium ───────────────
FROM node:24-bookworm-slim AS app
ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
# Headless shell only (what Playwright uses headless) + its system libraries, then clean up.
RUN npm ci --omit=dev --no-audit --no-fund \
 && npx playwright install --with-deps --only-shell chromium \
 && rm -rf /var/lib/apt/lists/* /root/.npm /tmp/*
COPY server/ ./
COPY --from=web /app/web/dist/web/browser /app/web

# Non-root user (needed for Chromium's sandbox too). All state lives in /app/server/data (a volume).
RUN mkdir -p /app/server/data && chown -R node:node /app/server/data
USER node

ENV HOST=0.0.0.0 \
    PORT=3000 \
    WEB_DIR=/app/web \
    DB_FILE=/app/server/data/a11y.db \
    PDF_DIR=/app/server/data/pdf \
    MAIL_DIR=/app/server/data/mails \
    BACKUP_DIR=/app/server/data/sauvegardes \
    TRUST_PROXY=1 \
    CHROMIUM_SANDBOX=1
EXPOSE 3000
VOLUME /app/server/data

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/sante').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

# Exec form: node receives SIGTERM directly (graceful shutdown). compose.yaml adds `init: true`
# so exited Chromium processes are reaped.
CMD ["node", "--import", "tsx", "src/server.ts"]
