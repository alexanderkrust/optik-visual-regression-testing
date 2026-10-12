-- Changed anti-aliased (edge) pixels now count; projects whose rendering
-- varies between runs can leave them out again
ALTER TABLE "projects" ADD COLUMN "ignore_anti_aliasing" BOOLEAN NOT NULL DEFAULT false;
