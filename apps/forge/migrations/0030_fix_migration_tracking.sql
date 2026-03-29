-- Fix corrupted __drizzle_migrations entries caused by duplicate migration file prefixes (Issue #335)
-- DB has entries 10-19 with wrong hashes (off by 1), and missing entries 20-24

-- Step 1: UPDATE corrupted entries 10-19 with correct hashes
UPDATE `__drizzle_migrations`
SET hash = CASE
    WHEN id = 10 THEN '79ac3557729b8ed75a8122cca5c13f4bfa3952249a8bb4e1cfe9eb22f31ee728'  -- 0010_llm_profiles
    WHEN id = 11 THEN '57fad2f0b9069f2fad395e42ee44f529af31a0cac1f42e5bc8460e38359c757c'  -- 0011_remarkable_colossus
    WHEN id = 12 THEN '128ba4f7cd284ffceb1f60debff857cdb155c0c6d7e587d6329a50bec8ba2afd'  -- 0012_long_makkari
    WHEN id = 13 THEN 'd37f99193f879b61860fe0ad043e272fafacb1eb47f6105610b347e63501632e'  -- 0013_default_llm_profiles
    WHEN id = 14 THEN '83866a6e00026e02f5b32513e85d8780e4d0a9f78f8ad0de685aa8db7dd62cfb'  -- 0014_role_tool_permission_cleanup
    WHEN id = 15 THEN '35b342ad801dfa1d0a54f8acb1de3b3cae22bb9b8092ce36f2bb6308423ff36a'  -- 0015_wakeful_masque
    WHEN id = 16 THEN 'dd27dfcb399658778df2428425544a7192b31d1f7e589b99b0fc4f404d9dd1e8'  -- 0016_llm_profile_model_key_refactor
    WHEN id = 17 THEN 'f054e8ccb1567e6922df32eb96887c6d9805fe1eb53e690201082330850075f1'  -- 0017_sudden_elektra
    WHEN id = 18 THEN '8341d380b235e74b7078f2c52db37fc02fc0ec67154ef906a5d420ba41d36b0c'  -- 0018_llm_profile_uuid_ids
    WHEN id = 19 THEN 'dac7128a5a00db99b48f94ffb8ca2c00696759ac9718d359f16791f142b891ba'  -- 0019_stiff_moonstone
END
WHERE id BETWEEN 10 AND 19;

-- Step 2: INSERT missing entries 20-24 (timestamps must be in correct order)
INSERT INTO `__drizzle_migrations` (id, hash, created_at)
SELECT 20, 'b4e0497804e46e0a0b0b8c31975b062152d551bac49c3c2e80932567b4085dcd', 1775500000000
WHERE NOT EXISTS (SELECT 1 FROM `__drizzle_migrations` WHERE id = 20);

INSERT INTO `__drizzle_migrations` (id, hash, created_at)
SELECT 21, 'ca16e89420e3037585dcb214909bfc231e0d657a006b6c29cc5152c1638bf00b', 1775501000000
WHERE NOT EXISTS (SELECT 1 FROM `__drizzle_migrations` WHERE id = 21);

INSERT INTO `__drizzle_migrations` (id, hash, created_at)
SELECT 22, '9b904294736541316df35cf60371730dc767f763c68cabdcff47eae43db4ee28', 1775502000000
WHERE NOT EXISTS (SELECT 1 FROM `__drizzle_migrations` WHERE id = 22);

INSERT INTO `__drizzle_migrations` (id, hash, created_at)
SELECT 23, '9b904294736541316df35cf60371730dc767f763c68cabdcff47eae43db4ee28', 1775503000000
WHERE NOT EXISTS (SELECT 1 FROM `__drizzle_migrations` WHERE id = 23);

INSERT INTO `__drizzle_migrations` (id, hash, created_at)
SELECT 24, 'bb47bd1dedaafa60b96a850309237424097ff81f4ce8608a783ad8d3f07c0e55', 1775504000000
WHERE NOT EXISTS (SELECT 1 FROM `__drizzle_migrations` WHERE id = 24);
