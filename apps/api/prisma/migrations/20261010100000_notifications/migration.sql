-- Notification channels per project (Slack, Teams, webhooks, email)
CREATE TYPE "NotificationChannelType" AS ENUM ('slack', 'teams', 'webhook', 'email');

CREATE TABLE "notification_channels" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "type" "NotificationChannelType" NOT NULL,
    "target_encrypted" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "secret_encrypted" TEXT,
    "events" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_channels_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "notification_channels" ADD CONSTRAINT "notification_channels_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
