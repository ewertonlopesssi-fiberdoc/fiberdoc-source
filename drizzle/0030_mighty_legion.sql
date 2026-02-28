CREATE TABLE `ctos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`address` varchar(256),
	`capacity` int DEFAULT 8,
	`usedPorts` int DEFAULT 0,
	`status` varchar(32) DEFAULT 'active',
	`lat` double,
	`lng` double,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ctos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `map_elements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` varchar(8) NOT NULL,
	`referenceId` int NOT NULL,
	`lat` double NOT NULL,
	`lng` double NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `map_elements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `map_routes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128),
	`fromElementId` int NOT NULL,
	`toElementId` int NOT NULL,
	`fiberCount` int DEFAULT 12,
	`cableType` varchar(64) DEFAULT 'FO',
	`color` varchar(16) DEFAULT '#22d3ee',
	`path` text,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `map_routes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sgp_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`baseUrl` varchar(256) NOT NULL,
	`token` varchar(512) NOT NULL,
	`app` varchar(128) NOT NULL,
	`active` boolean DEFAULT true,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sgp_config_id` PRIMARY KEY(`id`)
);
