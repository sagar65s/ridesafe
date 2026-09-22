CREATE TABLE "AttendanceImportRecord" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "session" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "studentName" TEXT NOT NULL,
  "studentCode" TEXT,
  "matchedStudentId" TEXT,
  "routeName" TEXT,
  "busLabel" TEXT,
  "time" TEXT,
  "sourceFile" TEXT NOT NULL,
  "importedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AttendanceImportRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AttendanceImportRecord_organizationId_sourceKey_key" ON "AttendanceImportRecord"("organizationId", "sourceKey");
CREATE INDEX "AttendanceImportRecord_organizationId_date_idx" ON "AttendanceImportRecord"("organizationId", "date");
