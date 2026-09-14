# RideSafe original-theme update

## 14 September 2026 — Shared school chat and secure bulk operations

- Parent/driver conversations are school-scoped shared threads: the same school's Admin and School Admin can jointly reply, with sender name and role visible.
- Driver Messages and Notifications sections were added. All management roles also have Notifications with unread sidebar indicators.
- Message deletion and trip-history removal are per-user and preserve operational/audit records.
- Calendar accepts event-list and daily bus-operation files, merges repeated nearby closures, exports data, and includes richer CSV/XLSX templates.
- Attendance and student imports are restricted to Super Admin and School Admin. Super Admin must select a school; duplicates are skipped and existing records remain.
- Student and attendance exports include richer transport and parent-confirmation fields.
- Driver maintenance panels use the RideSafe dark theme, and new controls include Bahasa Melayu and Chinese translations.

This full source release uses the attached original project's charcoal/yellow palette. It retains the rebuilt school isolation, attendance and tracking workflows.

## 13 September 2026 live operations and communication completion

- Live tracking now refreshes immediately through the organization-scoped stream as well as polling. The map and detail cards expose the exact latest coordinate, speed, bus, driver/maintainer and school information only to authorized users.
- Parent boarding/home confirmations are now part of management attendance and trip history. When a trip closes, every missing parent action is durably stored as `NOT_SUBMITTED`; existing submitted/confirmed/rejected records are preserved.
- All user-facing RideSafe date/date-time labels now use `DD/MM/YYYY` and `DD/MM/YYYY, HH:mm` in Malaysia time. Native browser date inputs still use the browser's standard picker internally.
- Parent notifications and messages support mark-read and personal deletion. Parent can choose either same-school Admin or School Admin; management messaging is now a contact list plus WhatsApp-style conversation thread with role-labelled replies.
- Lost & Found was removed from management navigation and its unused public API/UI. Existing database data is not destructively dropped.
- Maintenance checks are now created and completed by the assigned Driver/Maintainer for their own bus. Management receives school-scoped read-only logs with a delete action; every delete is authorization checked.
- Attendance supports recent, oldest, student-name and status sorting. Super Admin trip history can be filtered by school.
- Expanded BM and Chinese coverage for Driver, Parent, tracking, attendance, payment/refund, chat and maintenance labels.

## 12 September 2026 driver and parent operations completion

- The parent arrival horn is now armed silently on the first normal tap/click/key press in the Parent portal. Fresh live GPS triggers one student-and-stop-scoped alert only when ETA crosses into 1–5 minutes; the open page plays the horn three times automatically.
- Completed/passed stops, stale GPS, stationary buses and ETAs above five minutes cannot trigger the horn. Push delivery expires at the estimated arrival time and uses a high-priority notification with three-pulse vibration for background-capable phones.

- Replaced the Driver anchor page with a clean sidebar: Dashboard, Trip, Student Attendance, Live Location, Broadcast, Trip History and Emergency. Academic Calendar was removed from Driver access.
- Added persisted, sequential route-stop progress. Crew completes each stop in order with animated progress; the trip cannot finish before all route stops and student attendance are complete.
- Phone GPS starts automatically after trip start and stops after completion. Driver Live Location is restricted to the assigned crew bus and shows live map, speed, driver, bus and update time.
- A GPS position over 300 metres from the assigned stop now opens an explicit visually-verified override instead of leaving attendance unusable. Overrides store distance/evidence and a security audit record; normal stop validation remains server-side.
- Parent has a dashboard-style sidebar with Dashboard, Children, Live Tracking, Attendance, Academic Calendar, Messages, Payments, Alerts and History. Parent can separately confirm boarding and arrival home for every assigned child; assigned crew and that school's Admin/School Admin receive the confirmation.
- Added the requested Refund Policy to Payments. Invoice checkout remains restricted to safe provider URLs and does not mark unpaid invoices as paid locally.
- Academic event days now use a strong background, larger colored markers and color border with the full function/event title available on hover and to screen readers. Twelve square month cards remain aligned.
- Super Admin global quick search now includes schools as well as pages, users, students, buses and routes; school results open the filtered Organizations page.
- Added the additive trip-progress/GPS-evidence migration. Existing Docker installations apply it automatically at startup; Vercel deployments must run `npm run db:migrate` before redeploying.

## 11 September 2026 driver reliability and school calendar correction

- A bus assigned only to a Maintainer can now start an operational trip; the previous hard requirement for a separate `driverId` no longer blocks the assigned crew account.
- Boarding, absence and drop-off now update immediately without a page refresh. A parent push-provider failure can no longer turn an already-saved attendance record into an apparent 500 error.
- Attendance confirmation is one clear modal action. Assigned-stop and fresh-GPS checks remain server-side, and any rejection is displayed inside the modal.
- Trip completion refreshes the authoritative roster and explains exactly how many students still need Absence or Boarding + Drop-off before the trip can close.
- Phone GPS starts automatically when the active trip appears and stops automatically after trip completion; the manual share/off controls were removed.
- Parent boarding reports are available only during an active pickup stage, remain pending for crew verification, and stay confirmed for that active trip after Maintainer confirmation.
- Academic Calendar uses twelve equal square month cards with fixed six-week grids. Super Admin must choose one school; School Admin uses its own school; Parent sees only its own school's events. Driver calendar access was removed. Global/all-school publishing was removed.
- Super Admin Attendance now requires a school selection and supports school → route → date filtering instead of mixing all organizations.

## 11 September 2026 trip and calendar completion

- Fixed the Start Trip 500 path: removed the brittle nested assignment filter, replaced advisory hashes with concrete driver/bus row locks, aligned UI/API active statuses, and stopped legacy `TRIP_CREATED` rows from blocking a real trip.
- Trips now persist Morning, PM or After School Activity service. Student rosters, attendance, completion, live tracking, ETA alerts and broadcasts apply all four student transport choices correctly.
- Parents can report that a child boarded. The report is pending only; assigned maintainer/driver must verify the child at the assigned stop and confirm official attendance. Crew may reject a false report.
- Driver/Maintainer retains the responsive sidebar, now shows parent-confirmation badges and the selected service roster.
- Added the shared 12-month charcoal calendar to Parent, Driver/Maintainer and management screens. Publishing, importing or editing events alerts parents in the correct school; reminders remain deduplicated.
- Added the additive trip-service/attendance-request migration. Existing installations must apply migrations before opening the new driver screen; Docker applies them automatically.

## 10 September 2026 completion pass

- Fixed assigned-user editing: non-driver forms no longer send driver personnel fields that falsely trigger linked-bus/child reassignment conflicts. Name, email, phone, password, active status and unchanged assignment details can be saved while records are linked.
- Admin/Transport Coordinator now has school-scoped Students navigation and can add, edit and deactivate students in only its assigned school.
- Trip start is committed independently from optional push/audit delivery. Missing database migrations return an actionable message instead of an unexplained server error.
- Driver/Maintainer now has a responsive sidebar, exact setup-readiness warnings, roster-first loading, GPS permission/timeout errors, sent broadcast history and dated attendance history.
- Mobile GPS remains recorded even if ETA/push processing temporarily fails. Phone GPS requires HTTPS (or localhost), an active trip and browser location permission.
- Parent now has a responsive sidebar and separate Payments page. Safe provider checkout URLs open from **Pay invoice**; invoices without a configured Malaysian payment provider display **Payment setup pending** and are never marked paid locally.
- Added additive `Payment.checkoutUrl` migration and regression tests for assigned-user editing and Admin student creation.

- Password creation/change minimum: 8 characters. Existing passwords are not reset. Bcrypt still uses cost 12 (this is hashing strength, not password length).
- Super Admin can reach all management modules, all users and schools. School Settings menu/component removed. School records remain necessary for isolation.
- Admin/Transport Coordinator can manage fleet, routes and stops in its assigned school; other schools are rejected server-side. School Admin retains full school management.
- New UI-created users require a school. Additional Super Admins have a home school but retain global access. Initial bootstrap and an existing unassigned platform Super Admin are supported without forcing a data migration.
- Driver/Maintainer dashboard always displays the route/attendance/broadcast sections. Without an assigned bus it explains setup and disables recording. Assign an ACTIVE bus with a route and students; choose DRIVER or MAINTAINER personnel type. Start a trip, then confirm each student's boarding/drop-off at their assigned stop. Dated history and parent inbox notifications are preserved.
- Parent messaging and management inboxes refresh every five seconds. Message and recipient notification are saved in one database transaction; browser push depends on configured keys/permission.
- Parent Academic Calendar tab displays public events from the assigned school plus global events, with a month filter. It refreshes while open.

## Excel and CSV import

Only Super Admin and School Admin can upload. Use the template download links in Academic Calendar. Both templates also exist under public/templates and samples.

Accepted files: .xlsx and .csv, up to 2 MB, 2000 event rows and 20 columns. Save legacy .xls files as .xlsx using Excel first. Headers may use title/startDate or Event Name/Date; spaces, hyphens and underscores are accepted. Optional fields: endDate, type, description, isPublic, color. Dates may be Excel date cells, YYYY-MM-DD or DD/MM/YYYY. DD/MM is interpreted day-first. FESTIVAL is supported; missing type defaults to EVENT. Invalid dates/formulas are rejected with an error. Import chooses the first worksheet with recognised headings. Previously imported matching title/date/type events in that school are skipped. Import does not edit existing events; use Edit for changes.

Keep Visible to Parents enabled to publish events. An import with new events queues a calendar-updated notification for active parents in scope. Upcoming public holidays/festivals/events produce reminders on the day before and each active event day, using Malaysia calendar dates. Duplicate polling does not send duplicate reminders.

## Enable reminders when parents are offline

Set TRACKING_WORKER_SECRET in .env.production to a random secret of at least 32 characters. The setup-docker script already generates this for new installations; it intentionally does not overwrite an existing env file. JWT/worker secrets still require 32+ characters and are separate from the new 8-character user-password policy.

From your existing project directory (use your existing Compose project name if different):

```bat
docker compose -p ridesafe --env-file .env.production --profile reminders up --build -d
```

The calendar worker polls every minute. With an open parent page, reminder checks also run during notification polling. Vercel requires an external scheduler/worker calling GET /api/internal/calendar with Authorization: Bearer TRACKING_WORKER_SECRET; Docker Compose workers do not run on Vercel.

Background browser push requires VAPID keys, permission, HTTPS and device support. Notification records are visible in the parent inbox regardless of browser push. The custom three-horn sound is auto-armed after the first Parent-page interaction and remains limited to an active page; locked-phone custom audio cannot be guaranteed, so background push uses the device notification sound and three-pulse vibration.

## Install this update

Extract the full ZIP into a fresh folder; preserve the real .env.production and existing database volumes. Do not mix old source files or copy only selected folders. Run the source verifier, rebuild using the existing Compose project name, and open the exact APP_URL. For local Docker use http://localhost:3500. Included migrations run at Docker startup; no destructive seed is required. See START-HERE-WINDOWS.md for detailed commands and initial login setup.

No live database, actual Docker engine, Vercel deployment or physical phone/provider test was available in this environment. See RELEASE_VERIFICATION.json for completed local checks.
