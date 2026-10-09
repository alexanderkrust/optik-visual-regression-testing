-- Baselines per branch: runs remember their git ancestry, projects their
-- default branch, snapshots a pixel hash for recognising approved images.
ALTER TABLE "projects" ADD COLUMN "default_branch" TEXT NOT NULL DEFAULT 'main';

ALTER TABLE "runs" ADD COLUMN "ancestors" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "snapshots" ADD COLUMN "image_hash" TEXT;
ALTER TABLE "snapshots" ADD COLUMN "auto_approved_from_id" TEXT;
CREATE INDEX "snapshots_name_image_hash_idx" ON "snapshots"("name", "image_hash");
