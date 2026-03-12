CREATE TABLE `map_pole_groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`poleId` int NOT NULL,
	`groupId` int NOT NULL,
	CONSTRAINT `map_pole_groups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `map_reserve_groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reserveId` int NOT NULL,
	`groupId` int NOT NULL,
	CONSTRAINT `map_reserve_groups_id` PRIMARY KEY(`id`)
);
