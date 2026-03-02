CREATE TABLE `app_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(128) NOT NULL,
	`value` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `app_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `app_settings_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
ALTER TABLE `equipments` ADD `voltage` float;--> statement-breakpoint
ALTER TABLE `equipments` ADD `powerConsumptionW` float;--> statement-breakpoint
ALTER TABLE `map_routes` ADD `fromTubeId` int;--> statement-breakpoint
ALTER TABLE `map_routes` ADD `toTubeId` int;