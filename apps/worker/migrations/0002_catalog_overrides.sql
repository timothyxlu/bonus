CREATE TABLE `app_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `catalog_overrides` (
	`owner_id` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`data` text DEFAULT '{}' NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`owner_id`, `entity`, `entity_id`)
);
--> statement-breakpoint
ALTER TABLE `products` ADD `archived_at` text;