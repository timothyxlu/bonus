ALTER TABLE `benefits` ADD `unit` text DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE `benefits` ADD `value_description` text;--> statement-breakpoint
ALTER TABLE `benefits` ADD `est_value_usd` real;--> statement-breakpoint
ALTER TABLE `benefits` ADD `every_months` integer;--> statement-breakpoint
ALTER TABLE `benefits` ADD `amount_by_period` text;--> statement-breakpoint
ALTER TABLE `benefits` ADD `enrollment_required` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `benefits` ADD `limitations` text;--> statement-breakpoint
ALTER TABLE `benefits` ADD `source_url` text;--> statement-breakpoint
ALTER TABLE `benefits` ADD `starts_at` text;--> statement-breakpoint
ALTER TABLE `benefits` ADD `ends_at` text;