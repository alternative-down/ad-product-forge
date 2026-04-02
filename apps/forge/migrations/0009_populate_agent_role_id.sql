-- Custom SQL migration file, put your code below! --
UPDATE `agents`
SET `role_id` = `function_id`
WHERE `role_id` IS NULL
  AND `function_id` IS NOT NULL;
