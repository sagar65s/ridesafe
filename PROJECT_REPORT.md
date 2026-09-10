# RideSafe rebuild — project report

RideSafe manages school-specific bus transport using five roles: Super Admin, School Admin, Admin, Driver (including maintainer personnel), and Parent.

The rebuild replaces the parent and crew interfaces, moves translation into React rendering, adds XLSX calendar import, tightens school and assignment authorization, and connects stop-confirmed attendance to parent notifications. Management uses Live Tracking; the crew records boarding/drop-off and publishes GPS. The next-stop arrival estimate creates a deduplicated five-minute alert and the active parent page plays three horn sounds.

Unrelated gamification and Schedule UI were removed. Transport maintenance, lost-and-found, billing, school calendars, emergency SOS and issue reporting remain relevant and were retained. Message deletion is per-user; historical attendance is kept. Additive migrations preserve existing data.

Use README.md for Windows, existing Neon/Vercel, optional Docker, Web Push and hardware-worker setup. Use FIXES_AND_VERIFICATION.md for test evidence and the live database/device checks still required after deployment. Calendar examples are under samples/. Read-only assignment validation is available through `npm run transport:check`.
