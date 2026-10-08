ALTER TABLE "snapshots" ALTER COLUMN "status" SET DEFAULT 'new';

-- Snapshots without a baseline were never a visual change: mark them as new.
UPDATE "snapshots" SET "status" = 'new' WHERE "status" = 'pending' AND "baseline_id" IS NULL;
