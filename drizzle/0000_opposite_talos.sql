CREATE TABLE `buildings` (
	`id` text PRIMARY KEY NOT NULL,
	`city_id` text NOT NULL,
	`player_id` text NOT NULL,
	`plot_id` integer NOT NULL,
	`color` text NOT NULL,
	`name` text NOT NULL,
	`best_run_id` text NOT NULL,
	`floors` integer NOT NULL,
	`tower_json` text NOT NULL,
	`achieved_at` integer NOT NULL,
	FOREIGN KEY (`city_id`) REFERENCES `cities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`best_run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_player_building` ON `buildings` (`city_id`,`player_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `one_city_plot` ON `buildings` (`city_id`,`plot_id`);--> statement-breakpoint
CREATE INDEX `city_ranking` ON `buildings` (`city_id`,`floors`);--> statement-breakpoint
CREATE TABLE `cities` (
	`id` text PRIMARY KEY NOT NULL,
	`epoch` text NOT NULL,
	`display_name` text NOT NULL,
	`ruleset_id` text NOT NULL,
	`is_test` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`next_plot` integer DEFAULT 0 NOT NULL,
	`capacity` integer DEFAULT 60 NOT NULL,
	CONSTRAINT "city_capacity" CHECK("cities"."next_plot" >= 0 AND "cities"."next_plot" <= "cities"."capacity")
);
--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`public_id` text NOT NULL,
	`credential_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `players_public_id_unique` ON `players` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `players_credential_hash_unique` ON `players` (`credential_hash`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`bucket` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`city_id` text NOT NULL,
	`player_id` text NOT NULL,
	`start_key` text NOT NULL,
	`ruleset_id` text NOT NULL,
	`rules_json` text NOT NULL,
	`geometry_version` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`request_hash` text,
	`trace_json` text,
	`tower_json` text,
	`floors` integer,
	`finalize_token` text,
	`result_kind` text,
	`previous_json` text,
	`receipt_json` text,
	FOREIGN KEY (`city_id`) REFERENCES `cities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `run_start_key` ON `runs` (`city_id`,`player_id`,`start_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `one_active_run` ON `runs` (`city_id`,`player_id`) WHERE "runs"."status" = 'active';--> statement-breakpoint
CREATE INDEX `run_history` ON `runs` (`city_id`,`player_id`,`created_at`);