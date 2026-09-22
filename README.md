# RideSafe School Bus Transport Management

RideSafe is a multi-school transport platform built with Next.js 16, React 19, TypeScript, Prisma 5.22, PostgreSQL and Redis. The portals support English, Bahasa Malaysia and Simplified Chinese.

This is the single project guide. Keep the supplied `package-lock.json`; do not upgrade Prisma independently.

## Current access model

| Account | Scope |
| --- | --- |
| Sandbox | Global operational access. Selects one school before viewing/importing/resetting school attendance or academic calendars. Cannot create Super Admin or Sandbox accounts and has no Settings page. |
| Super Admin | Platform overview, organizations, all users, audit, announcements, shared messages, notifications and account/global notification settings. Can create every account type. |
| School Admin | Full transport management for one assigned school. |
| Admin | Assigned-school transport coordination with limited management access. |
| Driver / Maintainer | Assigned bus, trips, student attendance, automatic mobile GPS sharing, broadcast, messages, maintenance and emergency reporting. A maintainer is a `DRIVER` account with `personnelType=MAINTAINER`. |
| Parent | Own children, school calendar, attendance confirmations, live bus tracking, alerts, messages, payments, history and editable Profile/photo. |

Tenant rules are enforced by the API and database queries, not only by hidden UI controls. A Sandbox attendance/calendar import always requires a selected active school and is stored with that school ID. Reset deletes only the selected school's attendance or calendar records and requires typing the exact school name.

## Windows Docker: first start

Requirements: Docker Desktop with Linux containers.

```bat
npm run setup:docker
node scripts/verify-source.mjs --strict
docker compose --env-file .env.production up --build -d
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs --tail=100 ridesafe
```

Open `http://localhost:3500`. For local HTTP, these values must match exactly:

```env
APP_URL="http://localhost:3500"
NEXTAUTH_URL="http://localhost:3500"
NEXT_PUBLIC_APP_URL="http://localhost:3500"
```

Do not use `https://localhost:3500`; it causes cross-origin write rejection. If another extracted copy already owns `ridesafe-db` or `ridesafe-cache`, stop it from that old directory first:

```bat
docker compose --env-file .env.production down --remove-orphans
```

Never add `-v` during an upgrade; that deletes the PostgreSQL/Redis volumes.

### First Super Admin on a new database

Use a unique 8–72 byte password:

```bat
docker exec -e BOOTSTRAP_ADMIN_EMAIL=superadmin@ridesafe.com -e BOOTSTRAP_ADMIN_PASSWORD=CHANGE_THIS_PASSWORD -e BOOTSTRAP_ADMIN_NAME="Super Admin" ridesafe-app node scripts/bootstrap-admin.mjs
```

The bootstrap refuses to overwrite an existing Super Admin. To create a Sandbox account, configure `BOOTSTRAP_SANDBOX_EMAIL`, `BOOTSTRAP_SANDBOX_PASSWORD` and `BOOTSTRAP_SANDBOX_NAME`, then run:

```bat
docker exec ridesafe-app node scripts/bootstrap-sandbox.mjs
```

## Node.js development without Docker

Use Node.js 20.9+ and PostgreSQL:

```bat
npm ci
copy .env.example .env
npm run db:generate
npm run db:migrate
npm run dev
```

Open `http://localhost:3000`. Set `REDIS_URL=""` only for local development without Redis. Production needs reachable PostgreSQL and Redis.

## Existing database upgrade

1. Back up the database and preserve the current `JWT_SECRET`, database URL, VAPID keys and integration credentials.
2. Replace only the source; keep the existing `.env.production`.
3. Run `npm ci`.
4. Apply all committed migrations before starting the new app.
5. Deploy and verify `/api/health`.

For local Docker, migrations run automatically on container start. For Neon, migration commands require the direct/unpooled URL for the same database branch:

```powershell
Set-Location 'D:\ridesafe'
$env:DIRECT_URL='YOUR_NEON_DIRECT_UNPOOLED_URL'
npm run db:migrate
npm run db:status
Remove-Item Env:DIRECT_URL -ErrorAction SilentlyContinue
```

Do not use a hostname containing `-pooler` as `DIRECT_URL`. The normal deployed application may continue using the appropriate pooled `DATABASE_URL`.

## Vercel

- Import the repository root containing `package.json` and `prisma/schema.prisma`.
- Framework: Next.js; Install command: `npm ci`; Build command: `npm run build`; Output directory: leave blank.
- Do not enter `next npm run build`.
- Set `NODE_ENV=production` or remove the custom value.
- Add `DATABASE_URL`, `JWT_SECRET`, `APP_URL`, `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`, Redis, VAPID and optional service credentials.
- All three URL variables must equal the final HTTPS Vercel/custom-domain origin.
- Apply Prisma migrations using the direct database URL before redeploying.

## AWS Ubuntu Docker deployment

Upload/extract the release to a new folder, preserve the existing environment file and database volumes, then:

```bash
cd /home/ubuntu/ridesafe
node scripts/verify-source.mjs --strict
docker compose --env-file .env.production config --quiet
docker compose --env-file .env.production up --build -d
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs --tail=150 ridesafe
curl -fsS http://127.0.0.1:3500/api/health
```

Set the three application URL variables to `https://ridesafe.com` (or the real domain), place Nginx/Caddy in front of `127.0.0.1:3500`, and issue TLS certificates. Security groups should expose only SSH, HTTP and HTTPS—not PostgreSQL, Redis or port 3500.

Before replacing an existing release:

```bash
docker compose --env-file .env.production ps
docker compose --env-file .env.production down
cp -a ridesafe "backups/ridesafe-$(date +%Y%m%d-%H%M%S)"
```

Do not run `docker compose down -v`. Rollback by stopping the new source, restoring the prior folder and starting it with the preserved environment/volumes.

## Katsana live tracking

Katsana is the only hardware GPS provider. Wialon code, forms, routes and environment settings have been removed. Configure:

```env
KATSANA_API_URL="https://api.katsana.com"
KATSANA_CLIENT_ID="..."
KATSANA_CLIENT_SECRET="..."
TRACKING_WORKER_SECRET="A_RANDOM_SECRET_AT_LEAST_32_CHARACTERS"
```

Assign the Katsana vehicle ID to each bus in Fleet & Routes. RideSafe first uses fresh Katsana data and falls back to the active driver's browser GPS. A location older than 90 seconds is stale. Driver browser sharing requires HTTPS (except localhost), location permission and an active trip; it starts with the trip and stops when the trip completes.

For continuous hardware polling:

```bash
docker compose --env-file .env.production --profile tracking up -d tracking-worker
```

The parent's five-minute horn is calculated from fresh moving GPS and the child's assigned next stop. After the parent's first interaction arms browser audio, the open page plays three sounds once per trip/student/stage. Background push uses device notification sound/vibration; websites cannot guarantee custom sound while a browser is closed, suspended or the phone is locked.

## School setup order

1. Create an organization and School Admin.
2. Create Admin, Driver/Maintainer and Parent accounts in that organization.
3. Add routes and ordered stops with accurate latitude/longitude.
4. Add a bus, its Katsana ID, route, driver and optional maintainer.
5. Add/import students and assign each to the same school's parent, route, bus, pickup stop and drop-off stop.
6. Start a Morning, PM or After School trip. Crew records official boarding/drop-off/absence; parent confirmations remain separate until crew verifies them.
7. Complete every required student state before finishing the trip.

## Spreadsheet imports

Attendance, student and academic-calendar import accepts `.xlsx` and `.csv`; legacy `.xls` must be saved as `.xlsx`. Download the templates from each screen or use `public/templates`/`samples`.

- Sandbox/Super Admin must select a school first.
- School Admin is forced to its own school.
- Imported data, history, exports and resets remain organization-scoped.
- Imports update matching records and retain data after refresh/logout because writes are committed to PostgreSQL.
- Calendar publishing creates notifications for the selected school's users/parents.
- The author of an announcement does not receive their own announcement notification.

Calendar maximum: 2 MB, 2,000 events, 20 columns, first worksheet. Required logical fields are title, date/start date and type. Supported dates include real Excel dates, `YYYY-MM-DD` and `DD/MM/YYYY`; formulas and invalid rows reject the import.

## Notifications and push

Generate VAPID keys once:

```bat
npm run push:keys
```

Set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` before the production build, keep `VAPID_PRIVATE_KEY` server-side, and configure `VAPID_SUBJECT`. Announcements create notifications only for the scoped audience and exclude the sender. Boarding/drop-off, calendar, emergency and arrival notifications use school/parent scoping and dedupe keys.

## Safe operations and troubleshooting

Verify source integrity:

```bash
node scripts/verify-source.mjs --strict
```

Inspect services:

```bash
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs --tail=200 ridesafe
docker system df
```

Safe cache cleanup (does not delete active containers/volumes):

```bash
docker builder prune
npm cache clean --force
```

Avoid `docker system prune -a --volumes` and `docker compose down -v` unless permanent data deletion is explicitly intended.

If a database table is missing, deploy the committed migrations; do not hide the error with client-only changes. If login shows cross-origin rejection, fix the three URL variables, recreate the app container and access the exact configured origin.

## Verification

Run before deployment:

```bash
npm run typecheck
npm run lint
npm test
npm run build
node scripts/verify-source.mjs --strict
```

The production build uses webpack. External Katsana hardware, push delivery, email and payment gateways still require their real credentials and device/provider acceptance testing.
