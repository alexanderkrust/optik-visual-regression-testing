-- Runs belong to a test suite; existing runs become the "default" suite,
-- which other suites fall back to for baselines.
ALTER TABLE "runs" ADD COLUMN "suite" TEXT NOT NULL DEFAULT 'default';

DROP INDEX "runs_project_id_branch_created_at_idx";
CREATE INDEX "runs_project_id_suite_branch_created_at_idx" ON "runs"("project_id", "suite", "branch", "created_at");
