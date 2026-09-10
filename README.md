> Windows Docker: follow **START-HERE-WINDOWS.md** first. This complete release includes every source file plus an extraction integrity check.

# RideSafe — School Bus Transport Management

Complete source rebuild: Next.js 16 / React 19 / TypeScript / Prisma **5.22.0** / PostgreSQL. English, Bahasa Malaysia and Simplified Chinese. Keep the supplied `package-lock.json`; do not upgrade Prisma independently to v7.

## Start on Windows — no Docker required

Install Node.js 20.9+ and use a PostgreSQL database. For an existing Neon database, keep your existing connection details. In Command Prompt, inside the extracted project:

```bat
npm ci
copy .env.example .env
```

Edit `.env`: set `DATABASE_URL`, `APP_URL=http://localhost:3000`, a random `JWT_SECRET` of at least 32 characters, and `REDIS_URL=""` if Redis is not installed for local development. Generate a random secret with:

```bat
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Then:

```bat
npm run db:generate
npm run db:migrate
npm run dev
```

Open http://localhost:3000. Existing accounts/passwords remain intact. Do not run a destructive seed or reset an existing database to install this update.

For a **new database only**, create the first Super Admin:

```bat
set "BOOTSTRAP_ADMIN_EMAIL=your-email@example.com"
set "BOOTSTRAP_ADMIN_NAME=Super Admin"
set "BOOTSTRAP_ADMIN_PASSWORD=YOUR_UNIQUE_PASSWORD_AT_LEAST_12_CHARACTERS"
node --env-file=.env scripts/bootstrap-admin.mjs
set "BOOTSTRAP_ADMIN_PASSWORD="
```

Bootstrap refuses to overwrite an existing Super Admin. Shell environment values override `.env` when using `--env-file`.

## Existing database / Vercel upgrade

1. Back up the database using your database provider. Retain the current `JWT_SECRET` and existing service credentials.
2. Replace the project source with this archive and run `npm ci`.
3. Apply the included **additive migrations** with the direct PostgreSQL connection string. For Neon, use the direct connection for migration and your intended application connection in deployment settings:

   ```bat
   set "DATABASE_URL=YOUR_NEON_DIRECT_CONNECTION_URL"
   npm run db:migrate
   set "DATABASE_URL="
   ```

4. In your existing Vercel project, set database/auth/service environment variables. Set `APP_URL` to the final HTTPS site URL. Set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` **before building**. Build command: `npm run build`; install command: `npm ci`.
5. Redeploy. Never run `npx prisma` from an empty directory: the supplied dependency is pinned to 5.22.0. `npm run db:migrate` uses that installed version.
6. In a local environment connected to your intended database, run `npm run transport:check`. This is read-only and lists student IDs with incomplete transport assignments. Correct those records through the School Admin portal before starting trips.

Production requires reachable PostgreSQL **and a valid REDIS_URL**. Set the hosted Redis connection in Vercel too; leaving it blank is supported only for local development. The portals also poll scoped tracking endpoints. Serverless multi-instance deployments should use a shared edge/hosting rate limit in addition to the app's per-process limiter.

## Permissions

| Account | Allowed access |
| --- | --- |
| Super Admin | All schools, school/user creation, platform control, all transport operations, calendar Excel/CSV import, audit |
| School Admin | Full management of its assigned school's users, buses, routes, stops, students, calendar, reports, notifications and issues |
| Admin / Transport Coordinator | Assigned school only: overview, attendance monitoring, live tracking, trip history, announcements, messages and issues |
| Driver / Maintainer | Assigned bus roster, dated boarding/drop-off/absence, trip start/finish, GPS **publishing**, broadcast and emergency SOS; no live tracking map |
| Parent | Own children, assigned bus tracking, valid route stops, own alerts/messages/attendance/invoices and issue reporting |

There are exactly five roles. A maintainer uses role `DRIVER` with `personnelType=MAINTAINER`; the bus has separate driver and maintainer assignments. A Super Admin must choose a school when creating a normal Admin, School Admin, driver or parent.

## Configure one school, step by step

1. Super Admin creates the school and its School Admin. Create a normal Admin only with the correct school selected.
2. School Admin creates driver and maintainer accounts, selecting the correct personnel type.
3. Add a route and its stops **in travel order**, with accurate latitude and longitude. Include both pickup and destination stops.
4. Add a bus, assign its route, driver and optional maintainer.
5. Create/link the parent's account and the student in the same school. Assign the student to the exact bus and route.
6. Set the student's pickup and drop-off stops on that route. Parents can select from their child's assigned route only. The application does not infer a home address or invent coordinates.
7. A trip follows the configured route and pickup → drop-off assignments. Configure the appropriate directional route/assignments for the run; closed-trip history is retained. Do not change a route or student assignment during a live trip.
8. The driver/maintainer starts the assigned trip. The roster appears automatically. The GPS permission prompt starts mobile tracking; dedicated GPS can be configured instead.
9. At the student's pickup stop, confirm boarding. At the destination stop, confirm drop-off. Each action records date/time and staff ID and creates the linked parent's notification. Repeated taps do not duplicate attendance/alerts.
10. The crew explicitly confirms the assigned stop. When fresh device GPS is supplied, the server rejects locations more than 300 metres away. Without GPS, this is staff confirmation, not independent proof of physical presence.
11. Every student must be absent or boarded **and** dropped off before the trip can finish. Dated events are retained; the management attendance screen monitors and exports them.

## Parent horn and background notifications

Run once:

```bat
npm run push:keys
```

Copy the generated public/private keys into the corresponding environment variables and set `VAPID_SUBJECT` to your contact `mailto:` address. Keep the private key server-side. Use the same keys across deployments. Rebuild after changing the public key.

Parent flow:

- Open the Parent workspace and select **Enable arrival horn**. The test plays three horn sounds and unlocks audio for the current page.
- Select **Enable background alerts** and allow browser notifications. HTTPS and browser/device support are required.
- Fresh moving GPS estimates arrival through the pending route stops. When the estimate first reaches five minutes or less, RideSafe creates one alert per trip/student/boarding-or-drop-off stage. The open page plays three horn sounds. No extra 2-minute/1-minute horn stages remain.
- A stopped bus or GPS older than 90 seconds shows an unavailable ETA; it does not invent an arrival time. The displayed ETA is based on distance and speed, not traffic-aware road routing, and is approximate.

**Important device limitation:** a website cannot guarantee custom horn audio when the browser is closed, suspended, muted or the phone is locked. Background Web Push uses the device's notification sound/vibration and permission settings. Some phones require installing the website to the Home Screen. For guaranteed background custom audio, a separately built native mobile app and platform-specific testing are necessary. Physical GPS/device delivery was not available to test in this workspace.

For hardware GPS alerts even when no portal is open, run an **independent, continuously running worker** with `APP_URL` and a random 32+ character `TRACKING_WORKER_SECRET` shared with the web server:

```bat
npm run tracking:worker
```

It calls the bearer-protected hardware tracking endpoint every 15 seconds. Deploy this process on a worker-capable host. Do not put an infinite worker loop inside a Vercel request handler. Mobile GPS updates themselves also evaluate arrival alerts while the crew shares its location.

## Academic calendar: Excel and CSV

Only **Super Admin and School Admin** can create, edit, delete or import calendar events. School Admin imports are forced to its own school. Super Admin can choose a school or global calendar; School Admin cannot modify global events.

Working examples are in `samples/academic-calendar.xlsx` and `samples/academic-calendar.csv`. These contain clearly labelled example dates, not an official school calendar.

Columns:

```csv
title,startDate,endDate,type,description,isPublic,color
```

Required: `title,startDate,type`. Dates use `YYYY-MM-DD`; real Excel date cells are supported. Valid types: `HOLIDAY`, `WORKING_DAY`, `SPECIAL_HOLIDAY`, `EXAM`, `EVENT`, `TERM_START`, `TERM_END`, `ASSEMBLY`. Optional `isPublic` is `true`/`false`; color is `#RRGGBB`.

Maximum 2 MB, 2000 events, 20 columns; first worksheet only. Quoted CSV commas/newlines and UTF-8 are supported. Formulas and invalid rows reject the entire import. Legacy binary `.xls` files must be saved as `.xlsx` first. Imports append events; do not import the same file twice unless duplicate events are intended.

## Notifications, deletion and retained records

System notifications are necessary for boarding/drop-off, arrival, school broadcasts and emergencies. School notification settings affect background push; dated in-app records remain. Emergency push is not suppressed by the normal push preference.

Messages can be deleted from the current user's view without deleting the other participant's copy. Announcements can be removed by the school manager or Super Admin; a coordinator can remove its own announcement. An already delivered notification cannot be recalled from a phone.

Removed: Schedule navigation/functionality, fake Green Leaderboard/gamification screens, unused assets/components, unused `node-ssh`, ineffective school-geofence ETA controls and inactive notification/email/escalation controls. Existing historical database tables remain to avoid destructive data loss. `/api/shifts` returns 410; old attendance overwrite/delete endpoints return 405.

Kept because they relate to school transport: actual route departure times, maintenance, lost-and-found, invoicing, emergency SOS, issue reporting and audit history.

## Verification and production build

```bat
npm run typecheck
npm run lint
npm test
npm run build
npm start
```

The build explicitly uses webpack to avoid a Turbopack persistent-cache failure encountered during verification. Full results and remaining deployment/device checks are in `FIXES_AND_VERIFICATION.md`.

## Optional Docker

Copy `.env.production.example` to `.env.production`, set real secrets and matching database credentials. Pass the environment file explicitly so the public push key is available to the build:

```bash
docker compose --env-file .env.production up --build -d
```

Local Docker defaults to port 3500. Set the corresponding `APP_URL`. Bootstrap inside the app container with explicitly supplied bootstrap variables. Never remove database volumes during an upgrade. Docker is optional; the Windows Node/Vercel workflow above is supported.
