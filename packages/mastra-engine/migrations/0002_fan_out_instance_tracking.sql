-- Migration: 0002_fan_out_instance_tracking
-- Description: Add instance tracking for cross-instance fan-out
-- Created: 2026-03-27

-- Add instance_id column to chat_group_members table for cross-instance tracking
ALTER TABLE forge_chat_group_members ADD COLUMN instance_id TEXT;

-- Create index for efficient instance-based queries
CREATE INDEX idx_chat_group_members_instance ON forge_chat_group_members(instance_id);

-- Create mastra_instances table to track known instances
CREATE TABLE IF NOT EXISTS mastra_instances (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    is_healthy INTEGER DEFAULT 1,
    last_seen_at TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now'))
);

-- Create index for healthy instance lookups
CREATE INDEX idx_mastra_instances_healthy ON mastra_instances(is_healthy) WHERE is_healthy = 1;
