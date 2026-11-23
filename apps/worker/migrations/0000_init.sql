CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`owner_type` text DEFAULT 'personal' NOT NULL,
	`product_id` text,
	`institution_id` text,
	`nickname` text,
	`last4` text,
	`status` text DEFAULT 'open' NOT NULL,
	`applied_at` text,
	`opened_at` text,
	`closed_at` text,
	`is_authorized_user` integer DEFAULT false NOT NULL,
	`details` text DEFAULT '{}' NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "accounts_last4_check" CHECK("accounts"."last4" IS NULL OR "accounts"."last4" GLOB '[0-9][0-9][0-9][0-9]')
);
--> statement-breakpoint
CREATE INDEX `accounts_owner_idx` ON `accounts` (`owner_id`);--> statement-breakpoint
CREATE INDEX `accounts_product_idx` ON `accounts` (`product_id`);--> statement-breakpoint
CREATE TABLE `benefit_uses` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`benefit_id` text NOT NULL,
	`used_on` text NOT NULL,
	`amount` real DEFAULT 0 NOT NULL,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`benefit_id`) REFERENCES `benefits`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `benefit_uses_benefit_idx` ON `benefit_uses` (`benefit_id`,`used_on`);--> statement-breakpoint
CREATE TABLE `benefits` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`account_id` text NOT NULL,
	`name` text NOT NULL,
	`amount` real DEFAULT 0 NOT NULL,
	`period` text NOT NULL,
	`reset_rule` text,
	`notes` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `benefits_owner_idx` ON `benefits` (`owner_id`);--> statement-breakpoint
CREATE INDEX `benefits_account_idx` ON `benefits` (`account_id`);--> statement-breakpoint
CREATE TABLE `bonuses` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`account_id` text NOT NULL,
	`product_id` text,
	`description` text,
	`requirement_type` text DEFAULT 'spend' NOT NULL,
	`amount_required` real,
	`progress` real DEFAULT 0 NOT NULL,
	`deadline` text,
	`reward_amount` real,
	`reward_unit` text DEFAULT 'points' NOT NULL,
	`status` text DEFAULT 'in_progress' NOT NULL,
	`earned_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bonuses_owner_idx` ON `bonuses` (`owner_id`);--> statement-breakpoint
CREATE INDEX `bonuses_account_idx` ON `bonuses` (`account_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`account_id` text NOT NULL,
	`type` text NOT NULL,
	`date` text NOT NULL,
	`from_product_id` text,
	`to_product_id` text,
	`note` text,
	`data` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `events_owner_idx` ON `events` (`owner_id`);--> statement-breakpoint
CREATE INDEX `events_account_idx` ON `events` (`account_id`,`date`);--> statement-breakpoint
CREATE TABLE `institutions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text,
	`name` text NOT NULL,
	`type` text DEFAULT 'issuer' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `institutions_owner_idx` ON `institutions` (`owner_id`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text,
	`institution_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'credit_card' NOT NULL,
	`owner_type` text DEFAULT 'personal' NOT NULL,
	`family` text,
	`annual_fee` real DEFAULT 0 NOT NULL,
	`network` text,
	`currency` text,
	`rules` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `products_owner_idx` ON `products` (`owner_id`);--> statement-breakpoint
CREATE INDEX `products_institution_idx` ON `products` (`institution_id`);