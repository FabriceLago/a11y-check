CREATE TABLE `leads` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`scan_id` text,
	`token` text NOT NULL,
	`marketing_consent` text NOT NULL,
	`consent_text` text,
	`consent_version` text,
	`consent_requested_at` integer,
	`consent_confirmed_at` integer,
	`consent_withdrawn_at` integer,
	`created_at` integer NOT NULL,
	`last_contact_at` integer NOT NULL,
	FOREIGN KEY (`scan_id`) REFERENCES `scans`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `leads_email_unique` ON `leads` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `leads_token_unique` ON `leads` (`token`);--> statement-breakpoint
CREATE TABLE `scans` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`result` text,
	`report` text,
	`created_at` integer NOT NULL
);
