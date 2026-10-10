-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "retention_days" INTEGER;

-- AlterTable
ALTER TABLE "snapshots" ADD COLUMN     "diff_bytes" INTEGER,
ADD COLUMN     "image_bytes" INTEGER;


-- Speeds up retention: old runs per project
CREATE INDEX "runs_project_id_updated_at_idx" ON "runs"("project_id", "updated_at");
