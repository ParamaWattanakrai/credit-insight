# ---------- build stage: compile the SvelteKit app ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# ---------- runtime stage: just Node + the built server ----------
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_FILE=/app/data/credit_card_customers.xlsx \
    SEED_FILE=/app/seed/credit_card_customers_seed.xlsx

COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
# Seed lives outside /app/data so a fresh (empty) data volume is auto-seeded on first start.
COPY data/seed/credit_card_customers_seed.xlsx ./seed/

# a+rX: seed readable by the non-root user regardless of the file's mode on the build machine
RUN chmod -R a+rX /app/seed && mkdir -p /app/data && chown -R node:node /app/data
USER node
EXPOSE 3000
VOLUME ["/app/data"]

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/status >/dev/null || exit 1

CMD ["node", "build"]
