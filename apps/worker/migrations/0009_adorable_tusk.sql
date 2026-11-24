CREATE TABLE `loyalty_balances` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`category` text NOT NULL,
	`program` text NOT NULL,
	`balance` integer NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "loyalty_balances_balance_check" CHECK("loyalty_balances"."balance" >= 0)
);
--> statement-breakpoint
CREATE INDEX `loyalty_balances_owner_category_idx` ON `loyalty_balances` (`owner_id`,`category`);