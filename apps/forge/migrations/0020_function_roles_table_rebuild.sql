-- Migration 0020 was replaced by 0022/0023 function_roles_repair migrations
-- This no-op migration exists to maintain journal idx:20 alignment
-- Using PRAGMA to avoid libsql/drizzle incompatibility with SELECT result sets
PRAGMA application_id;
