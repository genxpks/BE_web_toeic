-- AlterTable: add lastSavedAt to Attempt for snapshot-based recovery
ALTER TABLE "Attempt" ADD COLUMN "lastSavedAt" DATETIME;
