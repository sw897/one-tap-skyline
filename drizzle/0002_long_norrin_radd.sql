CREATE TABLE `city_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`city_id` text NOT NULL,
	`epoch` text NOT NULL,
	`revision` integer NOT NULL,
	`run_id` text NOT NULL,
	`kind` text NOT NULL,
	`player_public_id` text NOT NULL,
	`plot_id` integer NOT NULL,
	`name` text NOT NULL,
	`previous_floors` integer DEFAULT 0 NOT NULL,
	`floors` integer NOT NULL,
	`global_record` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`city_id`) REFERENCES `cities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `city_events_run_id_unique` ON `city_events` (`run_id`);--> statement-breakpoint
CREATE INDEX `city_event_cursor` ON `city_events` (`city_id`,`id`);--> statement-breakpoint
ALTER TABLE `cities` ADD `layout_json` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `runs` ADD `previous_max_floors` integer DEFAULT 0 NOT NULL;