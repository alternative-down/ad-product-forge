-- Migration: seed_system_llm_defaults
-- Description: Seed default LLM profile assignments

-- Default LLM profile configuration
INSERT INTO system_llm_defaults (id, primary_profile_id, om_profile_id, hiring_rh_profile_id, created_at, updated_at)
VALUES
  ('default_config', 'prof_gpt54', 'prof_claudeopus', 'prof_claudesonnet', 1711663200, 1711663200);
