# RideSafe correction and verification report

Date: 2026-09-09
Input: RideSafe-Transport-Management-Complete-2026-09-07(2).zip

## Scope

Corrections were made only to the supplied local source copy. No production
server, credentials, database, Docker volume or customer data was accessed.
Exactly five roles remain: SUPER_ADMIN, SCHOOL_ADMIN, ADMIN, DRIVER and PARENT.
Maintainer remains a personnel type under DRIVER. AI Optimization remains absent.
The existing Next.js / PostgreSQL / Redis architecture and user interfaces are retained.

## Confirmed issues corrected

### Installation and startup

- Removed an unused Prisma configuration importing `prisma/config`, which does
  not match the installed Prisma 5 client/CLI. Schema configuration remains in
  `prisma/schema.prisma`; the old config had been excluded from TypeScript.
- Build and typecheck explicitly generate Prisma Client before consuming its
  model types, including fresh installs and cached deployment installs.
- Added an explicit, non-destructive `admin:create` command for a fresh database.
  It creates only the first Super Admin and refuses to overwrite existing users.
- Included the missing School Admin in the optional development-account helper.
- Docker explicitly binds to `0.0.0.0`, so its localhost health probe and published
  port can reach the standalone server; startup uses `exec` for shutdown signals.
  Dependency fetching retries transient failures. It cannot bypass network outages.
- Removed an obsolete integration plan describing Flutter/FastAPI/WebSocket
  architecture that is not this application.

### Authorization and data consistency

- The legacy `/api/admin/students` POST now uses the maintained student creation
  handler. It validates school, parent, route, bus and stop ownership instead of
  accepting unrelated schools' IDs or creating unscoped Super Admin students.
- Session verification validates JWT algorithm, user ID and the five accepted roles.
- API paths containing periods and public-prefix lookalikes no longer skip proxy
  authentication. Authenticated rate-limit buckets are per account, avoiding
  shared-school-IP polling failures; login attempts retain a separate IP bucket.
- Account updates cannot deactivate/change the acting user's own role, or move
  users between schools/roles while buses, students or active trips remain linked.
- Drivers cannot be offboarded and buses cannot be deactivated/reassigned while
  they have active trips. Complete or cancel those trips first.
- Billing status-summary counts are scoped to the requesting school's parents.

### Trips, attendance and tracking

- Trip creation serializes requests per driver and bus using PostgreSQL
  transaction locks, preventing duplicate starts through this API.
- Closed trips cannot be reopened through a status patch. Self-pickup students
  do not block bus-trip completion.
- Drivers cannot append attendance to closed trips, board self-pickup students,
  mark an already boarded child absent, or restart a completed drop-off sequence.
- Driver stop attendance is restricted to the current trip, so another active
  trip's attendance does not appear in the roster.
- Parent tracking polls every 15 seconds, including hardware GPS and disconnected
  stream recovery. SSE updates trigger a scoped location refresh instead of
  overwriting child-stop ETA with school-geofence ETA.
- Parent ETA chooses a child assigned to each tracked route/bus rather than
  applying one unrelated child's stop to every driver.
- School geofencing reads school-specific settings with global defaults.
- ETA notifications are scoped to active students on the trip's bus and deduplicated
  using a unique trip/student/threshold key. Existing notification rows are preserved.
- Night alerts use Malaysian time and are suppressed when the same driver warning
  was already sent within the preceding hour.
- SSE emits byte chunks, handles subscription failures, releases listeners and
  connections on abort/cancel, and reconnects every minute to recheck authorization
  and trip assignments. Parent SSE carries refresh signals rather than coordinates.
- Development Redis clients share cached values, honor refreshed TTLs and channel
  subscriptions, and detach listeners on disconnect.
- Unsupported browser Notification APIs no longer cause that background branch
  to throw; notification icons reference an existing asset.
- Cancelled trips are excluded from the overview's active-trip count.
- Invalid trip-history page values return a validation response.

### Registration and billing

- Billplz webhook handling now accepts its documented flat POST fields, rather
  than incorrectly expecting bracketed browser-redirect fields. Signature input
  sorts complete key/value strings; paid callbacks also validate collection/amount.
- Registration fulfillment locks the pending row and parent email transactionally,
  protecting against repeated callbacks and concurrent registrations for one parent.
- Public registration validates types, lengths, actual calendar dates and phone
  numbers before database/payment work. Ineligible existing accounts are rejected
  before a payment bill is created. Invalid fee configuration is rejected.
- Malformed registration tokens are rejected before constant-time comparison.
- Missing Bukku configuration produces a local queued invoice rather than a
  fabricated external invoice URL, including in development.

Billplz format reference checked during this review:
https://support.billplz.com/api (X Signature Callback URL / X Signature verification).

## Verification performed on this revision

| Check | Result |
|---|---|
| Prisma schema validation and client generation | Passed, Prisma 5.22.0 |
| TypeScript strict typecheck | Passed |
| ESLint | Passed, no errors |
| Jest | 8 suites, 45 tests passed |
| Next.js production build | Passed, Next.js 16.3.4 |
| Standalone production Node process | Started successfully |
| `/`, `/admin`, `/driver`, `/parent`, `/student-form`, logo | HTTP 200 |
| Unauthenticated session, students and location stream APIs | HTTP 401 |
| Invalid public registration submission | HTTP 400 |
| Invalid registration access token | HTTP 403 |

New regression tests exercise legacy endpoint school isolation, closed-trip
protections, signed callback parsing/tampering, Redis cache/subscription behavior,
SSE byte output/filtering/cleanup, shared-IP rate limiting and proxy bypass paths.
Database-dependent route tests use mocked Prisma calls. HTTP page 200 checks
verify page delivery, not authenticated dashboard workflows or visual correctness.

## Remaining verification boundaries

- No disposable PostgreSQL server or Redis server was available in this workspace.
  Migrations, transaction-lock concurrency and authenticated five-role CRUD/trip/
  attendance workflows were not exercised against a live database. Run the local
  acceptance steps below before using customer data. The new migration is additive.
- Docker Engine was unavailable, so Docker build/Compose startup were not run.
  Standalone Node was tested instead; target-machine Docker verification is required.
- Wialon/Katsana devices, Billplz payments, Bukku and Resend were not contacted with
  real credentials. Validate these with test accounts/devices before production use.
- The existing Bukku status sync remains explicitly `NOT_IMPLEMENTED`; its summary
  is now school-scoped, but queued invoices are not automatically reconciled with
  Bukku. A verified provider contract is required to implement that operation.
- ETA remains a distance/speed estimate, not traffic-aware road routing. For multiple
  children on the same bus, the existing response shows one matching child's target.
  Server-generated ETA notifications are triggered by phone-location POSTs; hardware
  GPS proximity alerts depend on the parent page being active and polling.
- Browser/PWA alerts require permissions/user interaction; background/closed-app
  delivery is not guaranteed. Continuous Web Push delivery is not implemented here.
- Existing language switching/responsive styles were preserved; exhaustive translation,
  accessibility and physical-device visual testing were not performed in this pass.
- No new npm vulnerability-audit result is claimed. Earlier report claims are not
  substitutes for testing this exact revision.

## Local acceptance steps

1. Extract the full project, configure a disposable local PostgreSQL database and
   the example environment file. Never copy production credentials into local tests.
2. Install with `npm ci`; run `npm run db:generate` and `npm run db:migrate`.
3. Create the initial Super Admin with `npm run admin:create` as documented in README.
4. Run `npm run dev`. If testing production startup, configure real local Redis,
   run `npm run build`, then `npm start`, or use the documented Docker workflow.
5. Create two schools, School Admins, a coordinator, driver/maintainer and parent;
   confirm school A cannot read/change school B's users, routes or students.
6. Create a bus, route/stops and linked students. Start a trip, mark pickup/drop/absence,
   complete it, and verify history and the parent's tracking/notification pages.
7. Test registration using only the explicitly enabled local mock, then perform
   provider sandbox testing separately. Never interpret a local mock as real payment.
8. Run `npm run check` on your machine. For Docker, also run `docker compose config
   --quiet`, `docker compose up --build -d`, and inspect health/logs.

For an existing database, back up first and apply only pending migrations. Do not
run reset, force-reset, destructive seed or delete Docker volumes. Read README's
baselining instructions if the old database was created without migration history.
