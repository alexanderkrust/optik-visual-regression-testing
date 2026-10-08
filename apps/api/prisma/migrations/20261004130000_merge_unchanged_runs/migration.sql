-- Consecutive runs without visual changes are merged into one run
ALTER TABLE "runs" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "runs" ADD COLUMN "run_count" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "runs" ADD COLUMN "last_commit_sha" TEXT;

UPDATE "runs" SET "updated_at" = "created_at";

CREATE INDEX "runs_project_id_branch_created_at_idx" ON "runs"("project_id", "branch", "created_at");
