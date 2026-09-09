# RideSafe School Bus Transport Management

RideSafe is a responsive, multi-school transport platform built with Next.js, React, TypeScript, Prisma, PostgreSQL and Redis. It supports live bus tracking, trip operations, student boarding/drop-off, parent alerts, invoicing, emergency monitoring and academic calendars.

## Exact account roles

| Role | Scope |
|---|---|
| `SUPER_ADMIN` | Every school, platform settings, global users, calendar imports, audit/SOS/statistics |
| `SCHOOL_ADMIN` | Full transport and user administration for one assigned school |
| `ADMIN` | Daily transport coordination for one assigned school |
| `DRIVER` | Driver or maintainer mobile workspace; `personnelType` distinguishes the two without adding a sixth role |
| `PARENT` | Only linked children, assigned trips, notifications, invoices and issues |

Unknown roles cannot log in. API checks enforce school, bus, route, trip and parent/child ownership; hiding a menu item is not used as the security boundary.

## Main workflows

- School, school-admin and global user management with activate/deactivate controls.
- Students with ID, class/section, parent, contact, pickup/drop, bus, route, stops and active status.
- Buses, GPS status, routes, stops, driver/maintainer assignment and maintenance.
- Driver/maintainer onboarding, offboarding and assignment history. Records are preserved when offboarded.
- Trip start, GPS updates, attendance, delay reason, relevant-user broadcast, SOS and completion validation.
- Parent live tracking, 2-minute/1-minute horn notifications, own-child history, invoice inbox and issue reporting.
- Super Admin academic-calendar CSV import, event management, global KPIs, audit logs and notification/SOS settings.
- English, Bahasa Malaysia and Simplified Chinese selection on login and dashboards.
- Invoice persistence and in-app delivery even when optional Bukku/Resend providers are unavailable.

The removed “AI Optimization” feature is not part of this build.

## Local Docker run (recommended)

Requirements: Docker Desktop on Windows/macOS, or Docker Engine + Compose on Linux.

1. Start Docker Desktop and wait until it says the engine is running.
2. Open a terminal in this project directory.
3. Create local configuration:

   Windows Command Prompt:

   ```bat
   copy .env.production.example .env.production
   ```

   PowerShell/Linux/macOS:

   ```bash
   cp .env.production.example .env.production
   ```

4. Edit `.env.production`. Replace `POSTGRES_PASSWORD`, use the same password inside `DATABASE_URL`, generate a unique 32+ character `JWT_SECRET`, and set `APP_URL=http://localhost:3500` for local use. To test registration without real Billplz credentials, set `BILLPLZ_MOCK_ENABLED=true` and `ALLOW_LOCAL_PAYMENT_MOCK=true`; the mock is accepted only with a loopback `APP_URL`. Never copy production secrets into a local test file.
5. Validate and start:

   ```bash
   docker compose config --quiet
   docker compose up --build -d
   docker compose ps
   docker compose logs --tail=100 ridesafe
   ```

6. On a fresh database, create the initial Super Admin using the first-account instructions below. Then open <http://localhost:3500>. Health check: <http://localhost:3500/api/health>.

Do not run the seed against important data. On a brand-new disposable database only, the seed requires both `ALLOW_DESTRUCTIVE_SEED=true` and a 12+ character `TEST_USER_PASSWORD`.

Useful Docker commands:

```bash
docker compose logs -f ridesafe
docker compose restart ridesafe
docker compose down
```

`docker compose down` keeps named database/Redis volumes. Never use `docker compose down -v` when data must be retained.

## Node development run

Requirements: Node.js 20+, PostgreSQL and optionally Redis.

```bash
npm ci
cp .env.example .env
npm run db:generate
npm run db:migrate
npm run dev
```

Edit `.env` with your local PostgreSQL URL and a random JWT secret before migrations. If Redis is not installed, set `REDIS_URL=""` for development; production requires reachable Redis. Without `REDIS_URL`, development uses an in-process Redis-compatible fallback. Open <http://localhost:3000>.

## Existing database upgrade (data-preserving)

The new migrations are additive: they add columns/tables/indexes and do not truncate, reset or seed data. Always back up first:

```bash
docker compose exec -T postgres pg_dump -U ridesafe -d ridesafe_db > ridesafe-before-upgrade.sql
```

Confirm the file is non-empty. Then run `npm run db:migrate` or start the application container, whose startup command runs `prisma migrate deploy`.

If the existing database was originally created with `prisma db push` and has no `_prisma_migrations` table, do not blindly start the upgraded container: first have the initial migration baselined by the deployment owner, then deploy the additive migrations. Do not use `prisma migrate reset`, `prisma db push --force-reset`, the seed command, or `docker compose down -v` on an important database.

## Quality checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

External GPS, invoice, email and payment delivery require their provider credentials. Core local data entry, RBAC, trip management, notifications and local invoice records do not require those providers.

## Project structure

```text
src/app/                 Pages and API route handlers
src/components/admin/    Admin modules
src/lib/                 Auth, authorization, adapters and services
src/i18n/                EN/MS/ZH translations
prisma/schema.prisma     Data model
prisma/migrations/       Data-preserving migration history
public/                  Logo, PWA and alert audio assets
```

License: proprietary; all rights reserved.

## First Super Admin (fresh installation)

A new empty database has no login accounts. `admin:create` adds only the first
Super Admin. It does not seed, reset data, or replace an existing account.
Run migrations first. In Windows PowerShell, enter your chosen credentials:

```powershell
$env:BOOTSTRAP_ADMIN_EMAIL = "your-email@example.com"
$env:BOOTSTRAP_ADMIN_PASSWORD = [System.Net.NetworkCredential]::new("", (Read-Host "Admin password (12+ characters)" -AsSecureString)).Password
```

For Node development (with your local `DATABASE_URL` configured in `.env`):

```powershell
npm run admin:create
```

For the local Docker installation, run this instead:

```powershell
docker compose exec -e BOOTSTRAP_ADMIN_EMAIL -e BOOTSTRAP_ADMIN_PASSWORD ridesafe node scripts/bootstrap-admin.mjs
```

Then clear the temporary values from that terminal:

```powershell
Remove-Item Env:BOOTSTRAP_ADMIN_EMAIL, Env:BOOTSTRAP_ADMIN_PASSWORD
```

Linux/macOS users can export the same two variables, run the corresponding
command, then unset them. Sign in, create the school, create its School Admin,
and assign routes/buses/drivers/students. Do not use the destructive seed for
first-install setup with data you want to retain.

## September 9 corrections and upgrade

Read `FIXES_AND_VERIFICATION.md` for this delivery's actual checks and limits.
The new notification migration adds a nullable unique deduplication key and
preserves existing notifications. Apply all pending migrations before running
the updated app. Docker startup applies them automatically; Node uses
`npm run db:migrate`. Back up an existing database first as described above.

This source keeps a persistent Node/Docker deployment model with PostgreSQL,
Redis and SSE. It has not been converted into a Vercel/serverless deployment.
Keep deployment-specific changes separate from installing these fixes.
