CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`stripe_session_id` text NOT NULL,
	`scan_id` text,
	`url` text NOT NULL,
	`email` text NOT NULL,
	`amount_total` integer NOT NULL,
	`currency` text NOT NULL,
	`payment_intent` text,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`pdf_path` text,
	`download_token` text NOT NULL,
	`created_at` integer NOT NULL,
	`ready_at` integer,
	FOREIGN KEY (`scan_id`) REFERENCES `scans`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_stripe_session_id_unique` ON `orders` (`stripe_session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_download_token_unique` ON `orders` (`download_token`);--> statement-breakpoint
CREATE TABLE `stripe_events` (
	`id` text PRIMARY KEY NOT NULL,
	`received_at` integer NOT NULL
);
