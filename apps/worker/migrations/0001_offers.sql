CREATE TABLE `offers` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`product_id` text,
	`institution_id` text NOT NULL,
	`title` text NOT NULL,
	`reward_amount` real NOT NULL,
	`reward_unit` text DEFAULT 'points' NOT NULL,
	`cents_per_point` real,
	`est_value_usd` real,
	`requirement_type` text DEFAULT 'spend' NOT NULL,
	`amount_required` real,
	`window_months` integer,
	`annual_fee` real,
	`fee_waived_first_year` integer DEFAULT false NOT NULL,
	`other_cost` real,
	`cooldown_months` integer,
	`expires_at` text,
	`source_url` text,
	`notes` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `offers_owner_idx` ON `offers` (`owner_id`,`status`);