-- Add list_github_pull_request_comments tool permission for GitHub role
INSERT INTO `role_tool_permissions` (`role_id`, `tool_id`, `created_at`) VALUES
  ('github', 'list_github_pull_request_comments', strftime('%s','now') * 1000);
