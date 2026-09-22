ALTER TABLE "User"
  ADD COLUMN "accessProfile" TEXT,
  ADD COLUMN "address" TEXT,
  ADD COLUMN "emergencyContactName" TEXT,
  ADD COLUMN "emergencyContactPhone" TEXT,
  ADD COLUMN "relationship" TEXT,
  ADD COLUMN "profileCompleted" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "User_accessProfile_idx" ON "User"("accessProfile");
