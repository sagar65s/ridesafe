# RideSafe deployment patch — 2026-09-10

This is a patch for the previously supplied RideSafe-Rebuilt-Complete-2026-09-10 project. It is not a standalone project. No database schema or dependency changes are included.

## Apply

Extract into the existing project folder containing package.json. Merge folders and replace the matching files; do not replace/delete the entire src directory. The ZIP has no extra RideSafe parent folder. Add newly created files to your Git commit, not just modified files.

Included files:
- src/lib/csv.ts: restores the exact missing CSV export helper.
- src/components/transport/shared.tsx: restores shared portal components/types used by LiveTripsTab, Parent, and Driver.
- src/lib/prisma.ts: permits Next.js build-time route inspection without DATABASE_URL; missing database configuration still fails at runtime.
- tsconfig.json: restores @/* -> ./src/* alias mapping.
- next.config.ts: restores standalone output required by the Docker image.
- Dockerfile: generates Prisma through the build script; runs the production image as the node user; retains migration CLI.
- docker-compose.yml: adds an optional hardware tracking worker using the application image and internal service address.
- .dockerignore: keeps local dependencies, build output and real environment files out of the image context.

The two missing modules already existed in the complete ZIP. The reported errors are consistent with an incomplete source upload, incorrect casing, or a different deployed checkout. Your actual Git repository and Vercel settings were not available to inspect. Keep directory/file casing exactly as shown.

## Vercel

1. Commit/push ALL eight patch files, including both restored source files. In your repository verify src/lib/csv.ts and src/components/transport/shared.tsx are visible.
2. Root Directory must be the folder containing package.json and src. Framework: Next.js. Install command: npm ci. Build command: npm run build. Keep the framework default Output Directory (do not set it to out).
3. The existing build script must be prisma generate && next build --webpack. This patch uses the dependencies/package-lock.json from the complete rebuilt project; retain both together.
4. Configure DATABASE_URL (real PostgreSQL connection), JWT_SECRET (random 32+ characters), REDIS_URL (reachable Redis TCP/TLS URL), APP_URL (your HTTPS site URL). The Docker hostnames postgres and redis do not work on Vercel. A Redis REST URL is not interchangeable with REDIS_URL.
5. Configure optional GPS/payment/email/push provider keys only for services you use. NEXT_PUBLIC_VAPID_PUBLIC_KEY must be set before building for browser push.
6. Apply existing migrations once against your production database from a trusted terminal: npm run db:migrate. This command needs that database's DATABASE_URL set in the terminal. Do not put database credentials in Git.
7. Redeploy the latest commit with existing Build Cache disabled once. For a local build, remove only the generated .next directory before npm run build if old cache causes warnings.

Vercel does not run Docker Compose or the persistent tracking-worker process. Hardware polling needs an independently hosted worker using scripts/tracking-worker.mjs, APP_URL, and TRACKING_WORKER_SECRET. Mobile GPS updates use the app endpoints.

## Docker (Docker Desktop/Engine with Compose v2)

Use the existing .env.production.example from the full project. Copy it to .env.production if you do not already have one; preserve an existing configured file. Set POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB and the matching DATABASE_URL with host postgres. URL-encode special characters in the database URL password. Set REDIS_URL=redis://redis:6379, a random JWT_SECRET, and APP_URL=http://localhost:3500 for this computer. Use HTTPS APP_URL for a hosted deployment/phone access. Browser GPS/push need a secure context; a plain LAN IP URL is insufficient.

Run from the project root:

```sh
docker compose --env-file .env.production config --quiet
docker compose --env-file .env.production up --build -d
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs --tail=100 ridesafe
```

Open http://localhost:3500. The app applies existing Prisma migrations before starting, after PostgreSQL and Redis pass readiness checks. Existing database volumes are preserved; changing POSTGRES_PASSWORD in an env file does not change the password of an already initialized database.

For automatic hardware polling, first set TRACKING_WORKER_SECRET to a random 32+ character value in .env.production, then:

```sh
docker compose --env-file .env.production --profile tracking up --build -d
```

The worker calls http://ridesafe:3000 internally; the browser-facing APP_URL stays configured on the app. Provider credentials and actual bus GPS data are still necessary. Check worker logs with docker compose --env-file .env.production logs --tail=100 tracking-worker.

## Verification and scope

See PATCH-VERIFICATION.txt for results. No actual Vercel deployment, Docker container execution, or live database/provider test was performed in this environment. The patch addresses the reported module-resolution errors and the additional build-time database configuration error found locally. Other errors caused by a different source checkout, credentials, database state, or hosting settings cannot be ruled out without that deployment's logs.

Official reference: https://nextjs.org/docs/messages/module-not-found
Docker/standalone reference: https://nextjs.org/docs/app/guides/self-hosting
