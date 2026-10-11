-- Browser and viewport a screenshot was taken with. Empty for snapshots from
-- before variants (and from adapters that don't send them).
ALTER TABLE "snapshots" ADD COLUMN "browser" TEXT NOT NULL DEFAULT '';
ALTER TABLE "snapshots" ADD COLUMN "viewport" TEXT NOT NULL DEFAULT '';

-- Ignore regions are in pixels, so they apply per viewport
ALTER TABLE "snapshot_settings" ADD COLUMN "viewport" TEXT NOT NULL DEFAULT '';
DROP INDEX "snapshot_settings_project_id_suite_name_key";
CREATE UNIQUE INDEX "snapshot_settings_project_id_suite_name_viewport_key" ON "snapshot_settings"("project_id", "suite", "name", "viewport");

-- Baseline search: per name and variant
DROP INDEX "snapshots_name_image_hash_idx";
CREATE INDEX "snapshots_name_browser_viewport_image_hash_idx" ON "snapshots"("name", "browser", "viewport", "image_hash");
