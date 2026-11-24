CREATE TABLE `account_secrets` (
	`account_id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`key_id` text NOT NULL,
	`iv` text NOT NULL,
	`ciphertext` text NOT NULL,
	`fields` text DEFAULT '[]' NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `secret_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`account_id` text NOT NULL,
	`action` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `secret_audit_owner_idx` ON `secret_audit` (`owner_id`,`action`,`created_at`);