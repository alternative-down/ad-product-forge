-- Migration 0030: Fix corrupted __drizzle_migrations tracking table
--
-- Root cause: Duplicate migration prefix 0027_ caused Drizzle's migrator to insert
-- entries with WRONG sequential IDs (e.g., id:19 contained migration 0024's hash).
-- This caused the app to crash with "LibsqlError: SQLITE_OK: not an error".
--
-- Fix: Clear corrupted entries and re-populate with correct id→hash→tag mapping
-- based on the _journal.json entries 0-28.

-- Step 1: Remove all corrupted entries
DELETE FROM `__drizzle_migrations`;

-- Step 2: Re-insert all migration records with correct sequential IDs and hashes
-- Hash values are the SHA256 of each migration file content (computed from source files).
INSERT INTO `__drizzle_migrations` ("id", "hash", "created_at") VALUES
(0,  '18a5afa89a9447055d0d906a98dbf96cde7fa0be98975a660a672f31b0fc4134', strftime('%s','now') * 1000),
(1,  '5dfec8f4245f17eb7644f03b785ea7f45faf69f9fc6756422ae2cfb969ed024e', strftime('%s','now') * 1000),
(2,  '48b68d687a5f472a4fc186e89d31739bf4f915dc21bb2160cdaed8b0077a4107', strftime('%s','now') * 1000),
(3,  '02a95b3581169c681ab66c42084ff178c1451782da8ae6f003fcc1b399c22041', strftime('%s','now') * 1000),
(4,  'a7160297ae7a14680c1256e20c203b3e1bd15a68b0a9d01ed10188529af7d58b', strftime('%s','now') * 1000),
(5,  '489d6498d586cf3afa4983bacc2f46fd9c7146bb8a7d2142d8bb379526cf02f0', strftime('%s','now') * 1000),
(6,  '106bddaf938edab67cd7017bebb3a4e9a550f0af9d9aa0bcf09bc15b3381e96f', strftime('%s','now') * 1000),
(7,  'bca730ef17358024e5f9b50b5b4fbb602ce195433fae802fe7d7779eb082bfda', strftime('%s','now') * 1000),
(8,  'f69bdced84ce04919836a1e425850b9c6f2621bb264a8a2cf1e5d3e678185b39', strftime('%s','now') * 1000),
(9,  'fd492e75bda52c15f975f692d20a69a35cc0d853a6ce9e07504ef3793b5583a1', strftime('%s','now') * 1000),
(10, '79ac3557729b8ed75a8122cca5c13f4bfa3952249a8bb4e1cfe9eb22f31ee728',  strftime('%s','now') * 1000),
(11, '57fad2f0b9069f2fad395e42ee44f529af31a0cac1f42e5bc8460e38359c757c', strftime('%s','now') * 1000),
(12, '128ba4f7cd284ffceb1f60debff857cdb155c0c6d7e587d6329a50bec8ba2afd', strftime('%s','now') * 1000),
(13, 'd37f99193f879b61860fe0ad043e272fafacb1eb47f6105610b347e63501632e', strftime('%s','now') * 1000),
(14, '83866a6e00026e02f5b32513e85d8780e4d0a9f78f8ad0de685aa8db7dd62cfb', strftime('%s','now') * 1000),
(15, '35b342ad801dfa1d0a54f8acb1de3b3cae22bb9b8092ce36f2bb6308423ff36a', strftime('%s','now') * 1000),
(16, 'dd27dfcb399658778df2428425544a7192b31d1f7e589b99b0fc4f404d9dd1e8', strftime('%s','now') * 1000),
(17, 'f054e8ccb1567e6922df32eb96887c6d9805fe1eb53e690201082330850075f1', strftime('%s','now') * 1000),
(18, '8341d380b235e74b7078f2c52db37fc02fc0ec67154ef906a5d420ba41d36b0c', strftime('%s','now') * 1000),
(19, 'dac7128a5a00db99b48f94ffb8ca2c00696759ac9718d359f16791f142b891ba', strftime('%s','now') * 1000),
(20, 'b4e0497804e46e0a0b0b8c31975b062152d551bac49c3c2e80932567b4085dcd', strftime('%s','now') * 1000),
(21, 'ca16e89420e3037585dcb214909bfc231e0d657a006b6c29cc5152c1638bf00b', strftime('%s','now') * 1000),
(22, '9b904294736541316df35cf60371730dc767f763c68cabdcff47eae43db4ee28', strftime('%s','now') * 1000),
(23, '9b904294736541316df35cf60371730dc767f763c68cabdcff47eae43db4ee28', strftime('%s','now') * 1000),
(24, 'bb47bd1dedaafa60b96a850309237424097ff81f4ce8608a783ad8d3f07c0e55', strftime('%s','now') * 1000),
(25, 'f71f2bce5a50ad5ed15b0f23779da7131db7ed0e60035e26c4833419465e105a', strftime('%s','now') * 1000),
(26, 'd7129d340407d8ef66e1026436b47238670ea34794d1ee1a07a917aa5b9e929d', strftime('%s','now') * 1000),
(27, 'b96a009f8400d1c1359d31715100c9d169be8d687ec106b9faec6343dadf648f', strftime('%s','now') * 1000),
(28, '4393aa785aeecbbc2f081a53771613273956c00e2fde05dbf0eaa6a29891b0b7', strftime('%s','now') * 1000);
