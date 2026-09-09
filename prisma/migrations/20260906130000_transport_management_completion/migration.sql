-- Additive production-safe completion of the transport domain.
-- This migration does not delete, truncate, rename, or rewrite existing records.

ALTER TABLE "User"
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "personnelType" TEXT,
  ADD COLUMN "licenseNumber" TEXT,
  ADD COLUMN "licenseExpiry" TIMESTAMP(3),
  ADD COLUMN "onboardingDate" TIMESTAMP(3),
  ADD COLUMN "offboardingDate" TIMESTAMP(3),
  ADD COLUMN "offboardingReason" TEXT,
  ADD COLUMN "employmentStatus" TEXT DEFAULT 'ACTIVE';

ALTER TABLE "Student"
  ADD COLUMN "studentCode" TEXT,
  ADD COLUMN "className" TEXT,
  ADD COLUMN "section" TEXT,
  ADD COLUMN "pickupAddress" TEXT,
  ADD COLUMN "dropoffAddress" TEXT,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "busId" TEXT;

ALTER TABLE "Bus"
  ADD COLUMN "busNumber" TEXT,
  ADD COLUMN "registrationNumber" TEXT,
  ADD COLUMN "gpsStatus" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED';

ALTER TABLE "Route" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Trip"
  ADD COLUMN "delayMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "delayReason" TEXT;

ALTER TABLE "Announcement"
  ADD COLUMN "organizationId" TEXT,
  ADD COLUMN "tripId" TEXT,
  ADD COLUMN "busId" TEXT,
  ADD COLUMN "routeId" TEXT;

DROP INDEX IF EXISTS "Route_name_key";
CREATE UNIQUE INDEX "Route_organizationId_name_key" ON "Route"("organizationId", "name");

CREATE UNIQUE INDEX "Student_organizationId_studentCode_key" ON "Student"("organizationId", "studentCode");
ALTER TABLE "Student" ADD CONSTRAINT "Student_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "AcademicCalendarImport" (
  "id" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "academicYear" TEXT NOT NULL,
  "eventCount" INTEGER NOT NULL DEFAULT 0,
  "organizationId" TEXT,
  "importedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AcademicCalendarImport_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "AcademicCalendarImport" ADD CONSTRAINT "AcademicCalendarImport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AcademicCalendarImport" ADD CONSTRAINT "AcademicCalendarImport_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "DriverAssignmentHistory" (
  "id" TEXT NOT NULL,
  "driverId" TEXT NOT NULL,
  "busId" TEXT,
  "routeId" TEXT,
  "action" TEXT NOT NULL,
  "reason" TEXT,
  "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DriverAssignmentHistory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DriverAssignmentHistory_driverId_effectiveAt_idx" ON "DriverAssignmentHistory"("driverId", "effectiveAt");
ALTER TABLE "DriverAssignmentHistory" ADD CONSTRAINT "DriverAssignmentHistory_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DriverAssignmentHistory" ADD CONSTRAINT "DriverAssignmentHistory_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DriverAssignmentHistory" ADD CONSTRAINT "DriverAssignmentHistory_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "TransportIssue" (
  "id" TEXT NOT NULL,
  "reporterId" TEXT NOT NULL,
  "studentId" TEXT,
  "organizationId" TEXT,
  "category" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "resolution" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TransportIssue_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TransportIssue_organizationId_status_idx" ON "TransportIssue"("organizationId", "status");
CREATE INDEX "TransportIssue_reporterId_createdAt_idx" ON "TransportIssue"("reporterId", "createdAt");
ALTER TABLE "TransportIssue" ADD CONSTRAINT "TransportIssue_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransportIssue" ADD CONSTRAINT "TransportIssue_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TransportIssue" ADD CONSTRAINT "TransportIssue_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "actorId" TEXT,
  "organizationId" TEXT,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "details" TEXT,
  "ipAddress" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
