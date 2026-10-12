CREATE TABLE `building_facades` (
	`building_id` text PRIMARY KEY NOT NULL,
	`asset_id` text,
	`version` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`building_id`) REFERENCES `buildings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_id`) REFERENCES `photo_assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `game_clock` (
	`id` text PRIMARY KEY NOT NULL,
	`day_start` integer NOT NULL,
	`reset_token` text
);
--> statement-breakpoint
CREATE TABLE `photo_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`city_id` text NOT NULL,
	`player_id` text NOT NULL,
	`upload_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`image_key` text NOT NULL,
	`thumbnail_key` text NOT NULL,
	`bytes` integer DEFAULT 0 NOT NULL,
	`width` integer DEFAULT 512 NOT NULL,
	`height` integer DEFAULT 768 NOT NULL,
	FOREIGN KEY (`city_id`) REFERENCES `cities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `photo_upload_retry` ON `photo_assets` (`city_id`,`player_id`,`upload_key`);--> statement-breakpoint
CREATE INDEX `photo_expiry` ON `photo_assets` (`expires_at`);