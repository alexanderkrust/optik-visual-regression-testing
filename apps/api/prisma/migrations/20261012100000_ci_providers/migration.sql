-- CreateEnum
CREATE TYPE "CiProvider" AS ENUM ('github', 'gitlab', 'bitbucket', 'bitbucket_server', 'azure_devops');

-- Commit statuses for more CI systems: the GitHub settings become generic,
-- existing configurations keep working as provider "github"
ALTER TABLE "projects" RENAME COLUMN "github_repo" TO "ci_repository";
ALTER TABLE "projects" RENAME COLUMN "github_api_url" TO "ci_api_url";
ALTER TABLE "projects" RENAME COLUMN "github_token_encrypted" TO "ci_token_encrypted";
ALTER TABLE "projects" ADD COLUMN "ci_provider" "CiProvider";
UPDATE "projects" SET "ci_provider" = 'github'
  WHERE "ci_repository" IS NOT NULL OR "ci_token_encrypted" IS NOT NULL;

-- AlterTable
ALTER TABLE "runs" ADD COLUMN "pull_request" TEXT;
