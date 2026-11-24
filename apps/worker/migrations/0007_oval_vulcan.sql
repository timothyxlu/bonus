CREATE TABLE `webauthn_challenges` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`challenge` text NOT NULL,
	`ceremony` text NOT NULL,
	`account_id` text,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `webauthn_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`public_key` text NOT NULL,
	`counter` integer DEFAULT 0 NOT NULL,
	`transports` text DEFAULT '[]' NOT NULL,
	`device_type` text NOT NULL,
	`backed_up` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`last_used_at` text
);
--> statement-breakpoint
CREATE INDEX `webauthn_credentials_owner_idx` ON `webauthn_credentials` (`owner_id`);