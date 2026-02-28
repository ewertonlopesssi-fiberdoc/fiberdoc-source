CREATE TABLE `map_element_groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`elementId` int NOT NULL,
	`groupId` int NOT NULL,
	CONSTRAINT `map_element_groups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `map_groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`color` varchar(16) NOT NULL DEFAULT '#6366f1',
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `map_groups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `map_route_groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`routeId` int NOT NULL,
	`groupId` int NOT NULL,
	CONSTRAINT `map_route_groups_id` PRIMARY KEY(`id`)
);
