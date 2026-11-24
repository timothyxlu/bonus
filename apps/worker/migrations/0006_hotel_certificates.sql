CREATE TABLE `hotel_certificates` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`account_id` text NOT NULL,
	`benefit_id` text,
	`name` text DEFAULT 'Free night certificate' NOT NULL,
	`hotel_program` text NOT NULL,
	`expires_on` text NOT NULL,
	`used_at` text,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`benefit_id`) REFERENCES `benefits`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `hotel_certificates_owner_expiry_idx` ON `hotel_certificates` (`owner_id`,`expires_on`);--> statement-breakpoint
CREATE INDEX `hotel_certificates_account_idx` ON `hotel_certificates` (`account_id`);--> statement-breakpoint
CREATE INDEX `hotel_certificates_benefit_idx` ON `hotel_certificates` (`benefit_id`);