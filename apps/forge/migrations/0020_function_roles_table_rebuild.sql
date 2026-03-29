-- Migration 0020 was replaced by 0022/0023 function_roles_repair migrations
-- This no-op migration exists to maintain journal idx:20 alignment
-- Using PRAGMA foreign_keys (no result set returned) to avoid libsql/drizzle incompatibility
PRAGMA foreign_keys = ON;
