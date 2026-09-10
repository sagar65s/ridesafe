# RideSafe complete project — Windows Docker setup

This ZIP is the complete source, not a patch. Start with a fresh extracted folder to avoid mixed versions. Docker Desktop must be running in Linux containers mode. Host Node/npm installation is optional: the commands below use Docker.

## 1. Preserve your existing configuration and database

Your old project is D:\ridesafe. From Windows CMD:

```bat
cd /d D:\ridesafe
docker compose --env-file .env.production down
```

Do not add `-v`; keep existing database volumes. Do not delete the old folder yet.

Extract the new ZIP to D:\RideSafe-Full. The project root should be D:\RideSafe-Full\RideSafe (it contains package.json, Dockerfile and src).

```bat
cd /d D:\RideSafe-Full\RideSafe
copy D:\ridesafe\.env.production .env.production
```

Copying your existing configuration keeps the password required by the existing PostgreSQL volume. The commands below use `-p ridesafe` to keep the Compose project/volume names from your original D:\ridesafe installation. If you originally used a different Compose project name, use that name instead. Do not generate replacement database passwords for an existing database.

## 2. First install ONLY: generate configuration if no existing configuration/database

Skip this section if you copied your working .env.production above.

```bat
docker run --rm -v "%cd%:/app" -w /app node:20-slim node scripts/setup-docker.mjs
```

This writes .env.production with random database/JWT/tracking secrets, local service URLs and a Web Push key pair. It never overwrites an existing file and never prints secrets. APP_URL is http://localhost:3500 for this computer. Configure a real sender contact in VAPID_SUBJECT before enabling production push.

## 3. Verify the complete extraction

```bat
docker run --rm -v "%cd%:/app" -w /app node:20-slim node scripts/verify-source.mjs --strict
```

This must pass. It checks every delivered file and its hash, including the missing modules from your log. For your own later source edits use the default check without --strict; the normal build checks required file presence/casing rather than rejecting intentional edits.

## 4. Build and start

```bat
docker compose -p ridesafe --env-file .env.production config --quiet
docker compose -p ridesafe --env-file .env.production up --build -d
docker compose -p ridesafe --env-file .env.production ps
```

The first build may take several minutes while packages download and Next.js compiles. Deprecation warnings do not themselves mean the build failed. `npm ci` uses the supplied package-lock.json; do not replace it with a lockfile from an older project.

PostgreSQL and Redis start first. The app then applies included migrations and starts. Wait for ridesafe-app to become healthy.

If a service fails:

```bat
docker compose -p ridesafe --env-file .env.production logs --tail=100 ridesafe postgres redis
```

Open **http://localhost:3500**. The container uses port 3000 internally; the browser uses 3500.

## 5. First Super Admin (new database only)

Existing database: sign in with your existing account. There is no hardcoded default login.

For a new database, create a temporary file named .env.bootstrap in the project root using Notepad:

```dotenv
BOOTSTRAP_ADMIN_EMAIL="your-real-email@example.com"
BOOTSTRAP_ADMIN_PASSWORD="choose-your-own-unique-password-at-least-12-characters"
BOOTSTRAP_ADMIN_NAME="Super Admin"
```

Replace these example values, save, then run:

```bat
docker run --rm --network ridesafe_default --env-file .env.production --env-file .env.bootstrap ridesafe-local:latest node scripts/bootstrap-admin.mjs
```

After success delete the temporary credential file:

```bat
del .env.bootstrap
```

The bootstrap refuses to overwrite an existing Super Admin. It does not clear any database tables. Sign in and create the school, School Admin, driver/maintainer, bus, route/stops, parents and students in that order.

## 6. Live tracking, notifications and hardware worker

Mobile GPS requires permission and an active driver trip. For automatic hardware polling, configure the GPS provider credentials and TRACKING_WORKER_SECRET in .env.production, then:

```bat
docker compose -p ridesafe --env-file .env.production --profile tracking up --build -d
```

The optional worker calls the app through its internal Docker address. APP_URL must stay the browser-visible address.

Localhost is suitable for testing on this computer. To use GPS/push on other phones, serve the site over HTTPS and set APP_URL accordingly; a plain http://LAN-IP URL is insufficient for those browser features. Push keys must be present before building. Real provider/GPS/device testing is still required. The three-horn alert works on an active page after the parent enables audio; locked/background phones cannot be guaranteed custom horn playback.

## 7. Normal restarts

```bat
docker compose -p ridesafe --env-file .env.production stop
docker compose -p ridesafe --env-file .env.production start
```

Use `up --build -d` again after source/build-time setting changes. Avoid `down -v` because it deletes database volumes.

## Vercel

Use this complete folder as the repository/project root. Framework Next.js, install `npm ci`, build `npm run build`, default output directory. Upload every source file, including SOURCE-MANIFEST.json and scripts/verify-source.mjs. Keep package.json and package-lock.json together.

Set DATABASE_URL to your hosted PostgreSQL connection, REDIS_URL to a reachable Redis TCP/TLS connection, JWT_SECRET to a random 32+ character secret, APP_URL to your HTTPS site URL. Docker-only hosts postgres/redis are not reachable from Vercel. Configure optional provider keys and the public VAPID key before building. Run `npm run db:migrate` once with the production database connection from a trusted terminal. Redeploy without old build cache once after replacing an incomplete checkout.

Vercel does not execute this Docker Compose stack or a persistent background worker. Host the tracking worker separately if using automatic hardware polling.
