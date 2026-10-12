-- Capture settings of a run without errors (browsers, viewports, renderer),
-- reported by the client on completion. TurboSnap only builds on a run with
-- the same settings.
ALTER TABLE "runs" ADD COLUMN "capture_key" TEXT;
