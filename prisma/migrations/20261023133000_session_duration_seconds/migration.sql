-- Add duration_seconds column to measurement_sessions
-- Default is 900 seconds (15 minutes), configurable by user per session.
ALTER TABLE "measurement_sessions" ADD COLUMN IF NOT EXISTS "duration_seconds" INTEGER;
