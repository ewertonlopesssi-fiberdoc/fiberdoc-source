CREATE TABLE `map_poles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`reference` varchar(128),
	`effort` varchar(64),
	`lat` double NOT NULL,
	`lng` double NOT NULL,
	`notes` text,
	`pole_created_at` timestamp NOT NULL DEFAULT (now()),
	`pole_updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `map_poles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `map_technical_reserves` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`sizeMeters` int NOT NULL DEFAULT 0,
	`routeId` int,
	`lat` double NOT NULL,
	`lng` double NOT NULL,
	`notes` text,
	`reserve_created_at` timestamp NOT NULL DEFAULT (now()),
	`reserve_updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `map_technical_reserves_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `map_groups` ADD `parentId` int DEFAULT null;