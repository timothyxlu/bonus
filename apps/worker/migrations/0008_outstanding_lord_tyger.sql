PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_webauthn_challenges` (
	`challenge` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`ceremony` text NOT NULL,
	`account_id` text,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_webauthn_challenges`("challenge", "owner_id", "ceremony", "account_id", "expires_at", "created_at") SELECT "challenge", "owner_id", "ceremony", "account_id", "expires_at", "created_at" FROM `webauthn_challenges`;--> statement-breakpoint
DROP TABLE `webauthn_challenges`;--> statement-breakpoint
ALTER TABLE `__new_webauthn_challenges` RENAME TO `webauthn_challenges`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `webauthn_challenges_owner_idx` ON `webauthn_challenges` (`owner_id`);