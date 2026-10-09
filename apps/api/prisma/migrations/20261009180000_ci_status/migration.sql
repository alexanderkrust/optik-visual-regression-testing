-- Commit statuses: GitHub settings per project, optik URL per run
ALTER TABLE "projects" ADD COLUMN "fail_tests_on_changes" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "projects" ADD COLUMN "github_repo" TEXT;
ALTER TABLE "projects" ADD COLUMN "github_api_url" TEXT;
ALTER TABLE "projects" ADD COLUMN "github_token_encrypted" TEXT;

ALTER TABLE "runs" ADD COLUMN "server_url" TEXT;
