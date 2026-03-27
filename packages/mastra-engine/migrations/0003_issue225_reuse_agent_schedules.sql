-- Migration: Issue #225 rework - reuse agent_schedules table instead of scheduled_tasks
-- Adds cross-agent columns to agent_schedules

-- Add columns to agent_schedules for cross-agent task scheduling
ALTER TABLE agent_schedules ADD COLUMN source_coordinator_id TEXT;
ALTER TABLE agent_schedules ADD COLUMN target_agent_id TEXT;
ALTER TABLE agent_schedules ADD COLUMN task_type TEXT NOT NULL DEFAULT 'schedule';
ALTER TABLE agent_schedules ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE agent_schedules ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE agent_schedules ADD COLUMN result TEXT;
ALTER TABLE agent_schedules ADD COLUMN error TEXT;

-- Add indexes for new columns
CREATE INDEX IF NOT EXISTS agent_schedules_target_status_idx ON agent_schedules(target_agent_id, status);
CREATE INDEX IF NOT EXISTS agent_schedules_coordinator_idx ON agent_schedules(source_coordinator_id);

-- Drop the scheduled_tasks table (replaced by agent_schedules with new columns)
DROP TABLE IF EXISTS scheduled_tasks;
