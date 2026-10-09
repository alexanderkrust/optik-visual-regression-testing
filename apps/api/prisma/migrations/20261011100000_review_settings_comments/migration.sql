-- CreateTable
CREATE TABLE "snapshot_settings" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "suite" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ignore_regions" JSONB NOT NULL DEFAULT '[]',
    "threshold" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "snapshot_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "snapshot_comments" (
    "id" TEXT NOT NULL,
    "snapshot_id" TEXT NOT NULL,
    "author_id" TEXT,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "snapshot_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "snapshot_settings_project_id_suite_name_key" ON "snapshot_settings"("project_id", "suite", "name");

-- CreateIndex
CREATE INDEX "snapshot_comments_snapshot_id_idx" ON "snapshot_comments"("snapshot_id");

-- AddForeignKey
ALTER TABLE "snapshot_settings" ADD CONSTRAINT "snapshot_settings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "snapshot_comments" ADD CONSTRAINT "snapshot_comments_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "snapshot_comments" ADD CONSTRAINT "snapshot_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

