# Rebuild verification — 10 September 2026

## Implemented

- New responsive parent and driver/maintainer workspaces, motion with reduced-motion support, readable forms, bus details, stop-based roster and dated recent attendance.
- Context-driven React translations in legacy screens and dialogs. Removed the DOM-mutation translation observer; account preference is persisted. EN/BM/ZH text and input labels switch without changing stored names or authored messages.
- Calendar CSV and XLSX parsing, correct Excel dates, multiline quoted CSV, atomic imports, file/row/ZIP expansion limits, formula rejection. Super Admin and School Admin only; school scope is checked server-side.
- Separate bus/trip maintainer assignment while retaining exactly five roles. Driver/maintainer sees only assigned students; only management and parents can read live location.
- Boarding-before-drop-off state machine, trip-row transaction lock, dated staff attribution, parent alerts and unique idempotency keys. Trip closing uses the same row lock and validates all students.
- Parent stop edits restricted to their child's route. Active-trip assignment freezes. Stops used by students/history cannot be deleted and silently break the records.
- Stop-based estimated five-minute arrival alert, three foreground horn plays, freshness checks, no fabricated stationary ETA, parent-specific alert deduplication, Web Push subscriptions and service worker. Independent bearer-authenticated hardware worker.
- School isolation, limited coordinator menus and management write restrictions; school required for new administrators. Message view deletion, announcement removal, and preserved historical records.
- Browser cross-origin write rejection, no password hashes in crew payloads, user deactivation checks, stronger new-account password length, and spreadsheet formula-injection protection on exported CSV.
- Schedule feature, gamification/Green Leaderboard, unused assets/dependency and ineffective geofence/notification controls removed. Historical database tables intentionally retained.

## Checks performed

- Prisma 5.22 client generation and schema validation.
- TypeScript no-emit checking.
- ESLint.
- Jest regression/security/parser tests: **91 tests passed across 12 suites**.
- Production webpack build including static page generation and route bundling.
- Standalone Node HTTP smoke checks: **15 checks passed**, covering login/admin/parent/driver/student form, horn/service worker assets, private API rejection, tracking worker authentication and cross-origin writes.

The initial Turbopack build encountered a persistent-cache panic. The project build script now explicitly uses webpack. A smoke check also exposed premature GPS/Redis initialization in the worker endpoint; authentication now precedes that import, and configuration failures return a safe 503.

## Tests cover

School/role guards; wrong-school attendance; unauthorized driver; crew boarding and offboarding; stop confirmation/GPS distance; duplicates; closed trips; CSV/XLSX date, formula and malformed-row handling; message ownership/deletion; language round trips; five-minute ETA, stale/stationary GPS and parent/bus filtering; worker bearer authentication; CSRF rejection; CSV export safety; and earlier registration, payment-signature, Redis and streaming regressions.

## Not verified against live services

This workspace had no provisioned PostgreSQL/Redis server or production credentials. Automated API tests use controlled mocks. The additive migration has been checked against the Prisma schema, but it was **not applied to a real copy of your database here**. Production sign-in and the complete multi-account workflow must be checked after configuring the database and applying migrations.

No real bus/GPS hardware, parent's phone, Web Push account configuration, Billplz, Bukku or email provider was available. Their external delivery and physical-device behavior have not been certified. The source contains their integrations and setup steps; it does not contain live credentials.

Custom background horn audio is limited by mobile browsers. Only the active, audio-enabled parent page schedules the three custom horn sounds. Push notifications use the device's normal notification behavior. ETAs are estimates, not an exact five-minute guarantee or proof that the driver physically stopped.

## Deployment acceptance sequence

1. Apply migrations to a backed-up staging copy, then run `npm run transport:check`.
2. Create two schools and confirm that each school's Admin/School Admin cannot read or alter the other school's objects.
3. Assign driver, maintainer, bus, route, stops, parent and student. Start the trip and share GPS over HTTPS.
4. Confirm boarding at the correct stop; verify exactly one event and one parent notification after repeated taps. Confirm drop-off and verify the second dated event.
5. Enable the parent's horn. Drive or safely simulate fresh GPS toward the configured stop; verify one three-sound sequence and the matching ETA notification.
6. Test background push on each supported target phone, including installed web-app mode, permission denied, muted/locked device and network loss.
7. Import both supplied sample formats in a staging school, verify dates and permissions, then remove the example events.
8. Test message/announcement deletion, old attendance history, trip completion, and school-specific management.

These explicit limits are part of the release; successful unit/build tests are not a claim that every production/device scenario is error-free.

## Dependency audit

The production dependency audit initially found two moderate entries caused by ExcelJS's old transitive `uuid`. ExcelJS uses the compatible `v4` API; its nested dependency is now pinned through an override to **uuid 11.1.1**, which includes the [maintainer's security backport](https://github.com/uuidjs/uuid/releases/tag/v11.1.1). XLSX and CSV parser tests were rerun after that update. The final `npm audit --omit=dev` result is recorded in RELEASE_VERIFICATION.json. An npm advisory scan is not a penetration test.
