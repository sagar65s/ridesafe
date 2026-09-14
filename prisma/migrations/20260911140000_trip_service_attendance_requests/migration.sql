ALTER TABLE "Trip" ADD COLUMN "serviceType" TEXT NOT NULL DEFAULT 'MORNING';

CREATE TABLE "AttendanceRequest" (
  "id" TEXT NOT NULL,
  "tripId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "parentId" TEXT NOT NULL,
  "action" TEXT NOT NULL DEFAULT 'PICKED_UP',
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmedAt" TIMESTAMP(3),
  "confirmedById" TEXT,
  CONSTRAINT "AttendanceRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AttendanceRequest_tripId_studentId_action_key" ON "AttendanceRequest"("tripId", "studentId", "action");
CREATE INDEX "AttendanceRequest_parentId_status_idx" ON "AttendanceRequest"("parentId", "status");
CREATE INDEX "AttendanceRequest_tripId_status_idx" ON "AttendanceRequest"("tripId", "status");
ALTER TABLE "AttendanceRequest" ADD CONSTRAINT "AttendanceRequest_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceRequest" ADD CONSTRAINT "AttendanceRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceRequest" ADD CONSTRAINT "AttendanceRequest_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceRequest" ADD CONSTRAINT "AttendanceRequest_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
