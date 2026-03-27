-- Migration: 0027_contact_id_refactor
-- Feature: Use contactId (UUID) as PK instead of slug (Fixes #280)
-- Adds contactId column, generates UUIDs for existing contacts, updates FK references

-- Step 1: Add contactId column to communicationContacts (nullable initially)
ALTER TABLE `communication_contacts` ADD COLUMN `contact_id` text;

-- Step 2: Generate UUIDs for existing contacts using slug as seed
-- Using hex(sha1(slug))[:16] to create deterministic-ish UUIDs for existing data
UPDATE `communication_contacts` 
SET `contact_id` = lower(hex(sha1(`slug`))) || '00000000-0000-0000-0000-000000000000'
WHERE `contact_id` IS NULL;

-- Step 3: Update communicationContactAccounts to use contactId
UPDATE `communication_contact_accounts`
SET `contact_id` = (
    SELECT cc.`contact_id` 
    FROM `communication_contacts` cc 
    WHERE cc.`slug` = `communication_contact_accounts`.`slug`
);

-- Step 4: Update communicationConversations to use contactId
UPDATE `communication_conversations`
SET `contact_id` = (
    SELECT cc.`contact_id` 
    FROM `communication_contacts` cc 
    WHERE cc.`slug` = `communication_conversations`.`contact_slug`
);

-- Step 5: Populate externalUserId from accounts where empty
UPDATE `communication_contacts` 
SET `external_user_id` = (
    SELECT `external_user_id` 
    FROM `communication_contact_accounts` cca 
    WHERE cca.`contact_id` = `communication_contacts`.`contact_id` 
    AND cca.`external_user_id` IS NOT NULL 
    LIMIT 1
)
WHERE `external_user_id` IS NULL;

-- Step 6: Add NOT NULL constraint and make contactId the primary key
-- SQLite doesn't support DROP PRIMARY KEY, so we recreate the table
CREATE TABLE `communication_contacts_new` (
  `contact_id` text PRIMARY KEY NOT NULL,
  `slug` text NOT NULL,
  `display_name` text,
  `description` text,
  `external_user_id` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

-- Copy data to new table
INSERT INTO `communication_contacts_new` 
SELECT `contact_id`, `slug`, `display_name`, `description`, `external_user_id`, `created_at`, `updated_at`
FROM `communication_contacts`;

-- Drop old table
DROP TABLE `communication_contacts`;

-- Rename new table
ALTER TABLE `communication_contacts_new` RENAME TO `communication_contacts`;

-- Recreate indexes
CREATE UNIQUE INDEX `communication_contacts_slug_idx` ON `communication_contacts` (`slug`);

-- Step 7: Add FK constraint to communicationContactAccounts
CREATE TABLE `communication_contact_accounts_new` (
  `id` text PRIMARY KEY NOT NULL,
  `contact_id` text NOT NULL,
  `provider` text NOT NULL,
  `external_user_id` text,
  `username` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`contact_id`) REFERENCES `communication_contacts`(`contact_id`) ON UPDATE NO ACTION ON DELETE CASCADE
);

INSERT INTO `communication_contact_accounts_new`
SELECT `id`, `contact_id`, `provider`, `external_user_id`, `username`, `created_at`, `updated_at`
FROM `communication_contact_accounts`;

DROP TABLE `communication_contact_accounts`;
ALTER TABLE `communication_contact_accounts_new` RENAME TO `communication_contact_accounts`;

CREATE UNIQUE INDEX `communication_contact_accounts_contact_provider_idx` ON `communication_contact_accounts` (`contact_id`, `provider`);

-- Step 8: Add FK constraint to communicationConversations
CREATE TABLE `communication_conversations_new` (
  `id` text PRIMARY KEY NOT NULL,
  `contact_id` text NOT NULL,
  `provider` text NOT NULL,
  `conversation_key` text NOT NULL,
  `display_name` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`contact_id`) REFERENCES `communication_contacts`(`contact_id`) ON UPDATE NO ACTION ON DELETE CASCADE
);

INSERT INTO `communication_conversations_new`
SELECT `id`, `contact_id`, `provider`, `conversation_key`, `display_name`, `created_at`, `updated_at`
FROM `communication_conversations`;

DROP TABLE `communication_conversations`;
ALTER TABLE `communication_conversations_new` RENAME TO `communication_conversations`;

CREATE UNIQUE INDEX `communication_conversations_provider_key_idx` ON `communication_conversations` (`provider`, `conversation_key`);
