-- Migration: 0002_fan_out_instance_tracking
-- Description: Add instance tracking for cross-instance fan-out
-- Created: 2026-03-27
-- Updated: 2026-03-28 to match schema.ts

-- Create mastra_instances table to track known instances
CREATE TABLE IF NOT EXISTS mastra_instances (
    instance_id TEXT PRIMARY KEY,
    base_url TEXT NOT NULL,
    display_name TEXT,
    is_local INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Index for fast lookup by base_url
CREATE INDEX IF NOT EXISTS idx_mastra_instances_base_url ON mastra_instances(base_url);

-- Index for finding local instance
CREATE INDEX IF NOT EXISTS idx_mastra_instances_is_local ON mastra_instances(is_local);

-- Add instance_id column to chat_group_members table for cross-instance tracking
ALTER TABLE forge_chat_group_members ADD COLUMN instance_id TEXT;

-- Create index for efficient instance-based queries
CREATE INDEX IF NOT EXISTS idx_chat_group_members_instance_id ON forge_chat_group_members(instance_id);
