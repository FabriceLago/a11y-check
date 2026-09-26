CREATE TABLE `devis` (
	`id` text PRIMARY KEY NOT NULL,
	`nom` text NOT NULL,
	`entreprise` text,
	`email` text NOT NULL,
	`telephone` text,
	`site` text NOT NULL,
	`outil` text NOT NULL,
	`besoins` text NOT NULL,
	`delai` text NOT NULL,
	`budget` text NOT NULL,
	`message` text,
	`scan_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`scan_id`) REFERENCES `scans`(`id`) ON UPDATE no action ON DELETE set null
);
