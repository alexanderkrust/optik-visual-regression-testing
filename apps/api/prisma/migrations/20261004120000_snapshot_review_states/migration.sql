-- New snapshot states. Enum values can only be used after this migration commits,
-- so defaults and data updates live in the next migration.
ALTER TYPE "SnapshotStatus" ADD VALUE IF NOT EXISTS 'new' BEFORE 'pending';
ALTER TYPE "SnapshotStatus" ADD VALUE IF NOT EXISTS 'unchanged' BEFORE 'pending';
