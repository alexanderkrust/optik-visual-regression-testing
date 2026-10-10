-- AlterTable
ALTER TABLE "teams" ADD COLUMN     "scim_external_id" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "deactivated_at" TIMESTAMP(3),
ADD COLUMN     "scim_external_id" TEXT;

