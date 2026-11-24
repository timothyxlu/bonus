CREATE TABLE `user_preferences` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`home_state` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "user_preferences_home_state_check" CHECK("user_preferences"."home_state" IS NULL OR (length("user_preferences"."home_state") = 2 AND "user_preferences"."home_state" = upper("user_preferences"."home_state")))
);
