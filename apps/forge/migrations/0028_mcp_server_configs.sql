-- Migration: 0028_mcp_server_configs
-- Description: MCP server connection configs and agent-to-server relations
-- Created: 2026-03-28
-- Issue: #263

-- MCP Server Configurations
CREATE TABLE mcp_server_configs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  transport_type TEXT NOT NULL CHECK(transport_type IN ('stdio', 'http_streamable')),
  command TEXT,
  url TEXT,
  env_vars TEXT,
  headers TEXT,
  is_active INTEGER DEFAULT 1 NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for mcp_server_configs
CREATE INDEX idx_mcp_server_configs_is_active ON mcp_server_configs(is_active);
CREATE INDEX idx_mcp_server_configs_name ON mcp_server_configs(name);

-- Agent to MCP Server Relations
CREATE TABLE agent_mcp_configs (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  server_id TEXT NOT NULL,
  is_active INTEGER DEFAULT 1 NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(agent_id, server_id),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (server_id) REFERENCES mcp_server_configs(id) ON DELETE CASCADE
);

-- Indexes for agent_mcp_configs
CREATE INDEX idx_agent_mcp_configs_agent_id ON agent_mcp_configs(agent_id);
CREATE INDEX idx_agent_mcp_configs_server_id ON agent_mcp_configs(server_id);
CREATE INDEX idx_agent_mcp_configs_is_active ON agent_mcp_configs(is_active);
