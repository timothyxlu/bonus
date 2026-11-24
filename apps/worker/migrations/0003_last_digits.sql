-- Trailing digits: allow 4 or 5 (Amex shows 5). SQLite cannot alter the existing CHECK on
-- `last4` without rebuilding `accounts` (which would cascade-delete child rows on D1), so a new
-- column with its own CHECK is added and existing values are copied over. Additive only.
ALTER TABLE `accounts` ADD `last_digits` text CHECK (`last_digits` IS NULL OR `last_digits` GLOB '[0-9][0-9][0-9][0-9]' OR `last_digits` GLOB '[0-9][0-9][0-9][0-9][0-9]');
--> statement-breakpoint
UPDATE `accounts` SET `last_digits` = `last4` WHERE `last4` IS NOT NULL AND `last_digits` IS NULL;
