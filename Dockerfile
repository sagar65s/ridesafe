# Build Stage
FROM node:20-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --no-audit --no-fund --fetch-retries=5
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build \
    JWT_SECRET=build-only-secret-with-at-least-32-characters
# Ensure prisma is generated
RUN npx prisma generate
RUN npm run build
# Keep the Prisma migration CLI but remove build/test-only packages from the
# final image. Prisma is a runtime dependency because migrations run on start.
RUN npm prune --omit=dev

# Production Stage
FROM node:20-slim AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
# Uncomment if you need a specific port
# ENV PORT=3000

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/node_modules ./node_modules
# Prisma schema and migrations are required by the startup migration command.
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts/bootstrap-admin.mjs ./scripts/bootstrap-admin.mjs

EXPOSE 3000
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && exec node server.js"]
