-- Users get an instance role; projects get members with project roles;
-- invitations; snapshots remember who reviewed them.
CREATE TYPE "UserRole" AS ENUM ('admin', 'member');
CREATE TYPE "ProjectRole" AS ENUM ('viewer', 'reviewer', 'maintainer');

ALTER TABLE "users" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'member';
-- Until now every user could do everything
UPDATE "users" SET "role" = 'admin';

CREATE TABLE "project_members" (
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "ProjectRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_members_pkey" PRIMARY KEY ("project_id","user_id")
);
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'member',
    "project_id" TEXT,
    "project_role" "ProjectRole",
    "invited_by_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "snapshots" ADD COLUMN "reviewed_by_id" TEXT;
ALTER TABLE "snapshots" ADD COLUMN "reviewed_at" TIMESTAMP(3);
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
