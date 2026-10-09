-- CreateTable
CREATE TABLE "audit_events" (
    "seq" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "action" TEXT NOT NULL,
    "actor_type" TEXT NOT NULL,
    "actor_id" TEXT,
    "actor_label" TEXT,
    "project_id" TEXT,
    "project_slug" TEXT,
    "target_type" TEXT,
    "target_id" TEXT,
    "target_label" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "ip" TEXT,
    "user_agent" TEXT,
    "prev_hash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("seq")
);

-- CreateIndex
CREATE INDEX "audit_events_created_at_idx" ON "audit_events"("created_at");

-- CreateIndex
CREATE INDEX "audit_events_action_idx" ON "audit_events"("action");

-- CreateIndex
CREATE INDEX "audit_events_project_id_idx" ON "audit_events"("project_id");

-- CreateIndex
CREATE INDEX "audit_events_actor_id_idx" ON "audit_events"("actor_id");


-- Audit events are append-only: refuse changes and deletions of single rows
CREATE FUNCTION audit_events_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit events cannot be changed or deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION audit_events_append_only();
