-- Additive only: existing shifts and all production data are preserved.
ALTER TABLE "DriverShift" ADD COLUMN "lateReason" TEXT;
ALTER TABLE "DriverShift" ADD COLUMN "checkedInAt" TIMESTAMP(3);
ALTER TABLE "PendingRegistration" ADD COLUMN "organizationId" TEXT;
