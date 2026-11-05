DROP INDEX `one_city_plot`;--> statement-breakpoint
ALTER TABLE `buildings` ADD `achieved_order` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `one_city_plot` ON `buildings` (`city_id`,`plot_id`) WHERE "buildings"."plot_id" >= 0;