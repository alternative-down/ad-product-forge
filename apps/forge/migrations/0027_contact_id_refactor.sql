-- Migration: 0027_contact_id_refactor
-- Feature: Use contactId (UUID) as PK, consolidate duplicates (Fixes #280)
-- Nicolas decision: Merge duplicate contacts into one canonical contact per externalUserId/slug

-- Step 1: Add contactId column
ALTER TABLE `communication_contacts` ADD COLUMN `contact_id` text;

-- Step 2: Add unique_contact_id column for consolidation mapping
ALTER TABLE `communication_contacts` ADD COLUMN `unique_contact_id` text;

-- Step 3: Generate unique_contact_id based on external_user_id if exists, else slug
-- This groups duplicates together: same external_user_id OR same slug → same unique_contact_id
UPDATE `communication_contacts`
SET `unique_contact_id` = COALESCE(
    `external_user_id`,
    `slug`
)
WHERE `unique_contact_id` IS NULL;

-- Step 4: Generate contactId for each unique group
-- Use the contact with the smallest rowid as the canonical one
UPDATE `communication_contacts`
SET `contact_id` = (
    SELECT `contact_id` 
    FROM (
        SELECT `slug`, MIN(rowid) as min_rowid
        FROM `communication_contacts`
        WHERE `unique_contact_id` IS NOT NULL
        GROUP BY `unique_contact_id`
    ) as groups
    WHERE groups.`slug` = `communication_contacts`.`slug`
    AND groups.min_rowid = (
        SELECT MIN(rowid) 
        FROM `communication_contacts` c2 
        WHERE c2.`unique_contact_id` = `communication_contacts`.`unique_contact_id`
    )
)
WHERE `contact_id` IS NULL
AND `unique_contact_id` IS NOT NULL;

-- Step 5: Update non-canonical duplicates to use canonical contactId
UPDATE `communication_contacts`
SET `contact_id` = (
    SELECT cc2.`contact_id`
    FROM `communication_contacts` cc2
    WHERE cc2.`unique_contact_id` = `communication_contacts`.`unique_contact_id`
    AND cc2.`contact_id` IS NOT NULL
    LIMIT 1
)
WHERE `contact_id` IS NULL;

-- Step 6: Update communicationContactAccounts to use contactId
UPDATE `communication_contact_accounts`
SET `contact_id` = (
    SELECT cc.`contact_id` 
    FROM `communication_contacts` cc 
    WHERE cc.`slug` = `communication_contact_accounts`.`slug`
);

-- Step 7: Update communicationConversations to use contactId
UPDATE `communication_conversations`
SET `contact_id` = (
    SELECT cc.`contact_id` 
    FROM `communication_contacts` cc 
    WHERE cc.`slug` = `communication_conversations`.`contact_slug`
);

-- Step 8: Populate externalUserId from accounts where empty
UPDATE `communication_contacts` 
SET `external_user_id` = (
    SELECT `external_user_id` 
    FROM `communication_contact_accounts` cca 
    WHERE cca.`contact_id` = `communication_contacts`.`contact_id` 
    AND cca.`external_user_id` IS NOT NULL 
    LIMIT 1
)
WHERE `external_user_id` IS NULL;

-- Step 9: Rebuild communicationContacts with NOT NULL PK
CREATE TABLE `communication_contacts_new` (
  `contact_id` text PRIMARY KEY NOT NULL,
  `slug` text NOT NULL,
  `display_name` text,
  `description` text,
  `external_user_id` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

INSERT INTO `communication_contacts_new` 
SELECT `contact_id`, `slug`, `display_name`, `description`, `external_user_id`, `created_at`, `updated_at`
FROM `communication_contacts`;

DROP TABLE `communication_contacts`;
ALTER TABLE `communication_contacts_new` RENAME TO `communication_contacts`;

CREATE UNIQUE INDEX `communication_contacts_slug_idx` ON `communication_contacts` (`slug`);
CREATE INDEX `communication_contacts_external_user_id_idx` ON `communication_contacts` (`external_user_id`);

-- Step 10: Rebuild communicationContactAccounts with FK
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

-- Step 11: Rebuild communicationConversations with FK
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
