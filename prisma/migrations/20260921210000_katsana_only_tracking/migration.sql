-- RideSafe now uses Katsana as its sole hardware GPS provider.
ALTER TABLE "Bus" DROP COLUMN IF EXISTS "wialonUnitId";
