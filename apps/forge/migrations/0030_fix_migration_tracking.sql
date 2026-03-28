-- Migration 0030: Fix corrupted __drizzle_migrations tracking table
--
-- Root cause: Duplicate migration prefix 0027_ caused Drizzle's migrator to insert
-- entries with WRONG sequential IDs in __drizzle_migrations.
-- The actual migrations WERE applied to the database, only the tracking is corrupted.
--
-- Fix: UPDATE the corrupted entries (id 10-19) with correct hashes from actual migration files.
-- This ensures Drizzle's migrate() sees correct tracking and doesn't try to re-run migrations.

-- Verify we have corrupted entries before fixing
-- (This is a safety check - if no corruption, the UPDATE does nothing)

-- Fix corrupted entries by matching hash to migration file
-- The hash column contains SHA256 of migration file content
-- We UPDATE entries 10-19 which have wrong mappings

-- Migration file hash reference:
-- 0010_llm_profiles.sql:              79ac3557729b8ed75a8122cca5c13f4bfa3952249a8bb4e1cfe9eb22f31ee728
-- 0011_remarkable_colossus.sql:      57fad2f0b9069f2fad395e42ee44f529af31a0cac1f42e5bc8460e38359c757c
-- 0012_long_makkari.sql:             128ba4f7cd284ffceb1f60debff857cdb155c0c6d7e587d6329a50bec8ba2afd
-- 0013_default_llm_profiles.sql:     d37f99193f879b61860fe0ad043e272fafacb1eb47f6105610b347e63501632e
-- 0014_role_tool_permission_cleanup.sql: 83866a6e00026e02f5b32513e85d8780e4d0a9f78f8ad0de685aa8db7dd62cfb
-- 0015_wakeful_masque.sql:           35b342ad801dfa1d0a54f8acb1de3b3cae22bb9b8092ce36f2bb6308423ff36a
-- 0016_llm_profile_model_key_refactor.sql: dd27dfcb399658778df2428425544a7192b31d1f7e589b99b0fc4f404d9dd1e8
-- 0017_sudden_elektra.sql:           f054e8ccb1567e6922df32eb96887c6d9805fe1eb53e690201082330850075f1
-- 0018_llm_profile_uuid_ids.sql:     8341d380b235e74b7078f2c52db37fc02fc0ec67154ef906a5d420ba41d36b0c
-- 0019_stiff_moonstone.sql:          dac7128a5a00db99b48f94ffb8ca2c00696759ac9718d359f16791f142b891ba
-- 0020_function_roles_table_rebuild.sql: b4e0497804e46e0a0b0b8c31975b062152d551bac49c3c2e80932567b4085dcd

-- UPDATE corrupted entries with correct hashes
UPDATE `__drizzle_migrations`
SET `hash` = CASE
    WHEN `hash` = '79ac3557729b8ed75a8122cca5c13f4bfa3952249a8bb4e1cfe9eb22f31ee728' AND `id` != 10
        THEN (SELECT `hash` FROM (SELECT 10 as `id`, '79ac3557729b8ed75a8122cca5c13f4bfa3952249a8bb4e1cfe9eb22f31ee728' as `hash`) t WHERE t.`id` = `__drizzle_migrations`.`id`)
    ELSE `hash`
END
WHERE `id` >= 10 AND `id` <= 19;

-- Direct UPDATE for each corrupted entry - simpler approach
-- These entries have wrong hashes, we correct them
UPDATE `__drizzle_migrations` SET `hash` = '79ac3557729b8ed75a8122cca5c13f4bfa3952249a8bb4e1cfe9eb22f31ee728' WHERE `id` = 10;
UPDATE `__drizzle_migrations` SET `hash` = '57fad2f0b9069f2fad395e42ee44f529af31a0cac1f42e5bc8460e38359c757c' WHERE `id` = 11;
UPDATE `__drizzle_migrations` SET `hash` = '128ba4f7cd284ffceb1f60debff857cdb155c0c6d7e587d6329a50bec8ba2afd' WHERE `id` = 12;
UPDATE `__drizzle_migrations` SET `hash` = 'd37f99193f879b61860fe0ad043e272fafacb1eb47f6105610b347e63501632e' WHERE `id` = 13;
UPDATE `__drizzle_migrations` SET `hash` = '83866a6e00026e02f5b32513e85d8780e4d0a9f78f8ad0de685aa8db7dd62cfb' WHERE `id` = 14;
UPDATE `__drizzle_migrations` SET `hash` = '35b342ad801dfa1d0a54f8acb1de3b3cae22bb9b8092ce36f2bb6308423ff36a' WHERE `id` = 15;
UPDATE `__drizzle_migrations` SET `hash` = 'dd27dfcb399658778df2428425544a7192b31d1f7e589b99b0fc4f404d9dd1e8' WHERE `id` = 16;
UPDATE `__drizzle_migrations` SET `hash` = 'f054e8ccb1567e6922df32eb96887c6d9805fe1eb53e690201082330850075f1' WHERE `id` = 17;
UPDATE `__drizzle_migrations` SET `hash` = '8341d380b235e74b7078f2c52db37fc02fc0ec67154ef906a5d420ba41d36b0c' WHERE `id` = 18;
UPDATE `__drizzle_migrations` SET `hash` = 'dac7128a5a00db99b48f94ffb8ca2c00696759ac9718d359f16791f142b891ba' WHERE `id` = 19;
