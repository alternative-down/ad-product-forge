-- Add get_github_issue_comment tool permission to github role
INSERT INTO `role_tool_permissions` (`role_id`, `tool_id`, `created_at`)
SELECT 'github', 'get_github_issue_comment', strftime('%s','now') * 1000
WHERE NOT EXISTS (
  SELECT 1 FROM `role_tool_permissions`
  WHERE `role_id` = 'github' AND `tool_id` = 'get_github_issue_comment'
);
