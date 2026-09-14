ALTER TABLE "Message" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Message" ADD COLUMN "threadUserId" TEXT;

-- Convert existing parent/driver ↔ school staff conversations into the same
-- school-scoped shared threads without losing message history.
UPDATE "Message" AS m
SET "organizationId" = participant."organizationId", "threadUserId" = participant."id"
FROM "User" AS sender, "User" AS recipient, "User" AS participant
WHERE sender."id" = m."senderId" AND recipient."id" = m."recipientId"
  AND participant."id" = CASE WHEN sender."role" IN ('PARENT','DRIVER') THEN sender."id" ELSE recipient."id" END
  AND ((sender."role" IN ('PARENT','DRIVER') AND recipient."role" IN ('ADMIN','SCHOOL_ADMIN'))
    OR (recipient."role" IN ('PARENT','DRIVER') AND sender."role" IN ('ADMIN','SCHOOL_ADMIN')))
  AND sender."organizationId" = recipient."organizationId";

ALTER TABLE "Message" ADD CONSTRAINT "Message_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_threadUserId_fkey"
  FOREIGN KEY ("threadUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Message_organizationId_threadUserId_createdAt_idx"
  ON "Message"("organizationId", "threadUserId", "createdAt");

CREATE TABLE "TripHistoryDeletion" (
  "id" TEXT NOT NULL,
  "tripId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TripHistoryDeletion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TripHistoryDeletion_tripId_userId_key" ON "TripHistoryDeletion"("tripId", "userId");
CREATE INDEX "TripHistoryDeletion_userId_createdAt_idx" ON "TripHistoryDeletion"("userId", "createdAt");
ALTER TABLE "TripHistoryDeletion" ADD CONSTRAINT "TripHistoryDeletion_tripId_fkey"
  FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TripHistoryDeletion" ADD CONSTRAINT "TripHistoryDeletion_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MessageDeletion" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageDeletion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MessageDeletion_messageId_userId_key" ON "MessageDeletion"("messageId", "userId");
CREATE INDEX "MessageDeletion_userId_createdAt_idx" ON "MessageDeletion"("userId", "createdAt");
ALTER TABLE "MessageDeletion" ADD CONSTRAINT "MessageDeletion_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageDeletion" ADD CONSTRAINT "MessageDeletion_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "MessageDeletion" ("id", "messageId", "userId", "createdAt")
SELECT 'legacy_sender_' || md5(m."id" || m."senderId"), m."id", m."senderId", m."senderDeletedAt"
FROM "Message" m WHERE m."senderDeletedAt" IS NOT NULL
ON CONFLICT ("messageId", "userId") DO NOTHING;
INSERT INTO "MessageDeletion" ("id", "messageId", "userId", "createdAt")
SELECT 'legacy_recipient_' || md5(m."id" || m."recipientId"), m."id", m."recipientId", m."recipientDeletedAt"
FROM "Message" m WHERE m."recipientDeletedAt" IS NOT NULL
ON CONFLICT ("messageId", "userId") DO NOTHING;
