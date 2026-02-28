CREATE TABLE `racks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(64) NOT NULL,
	`roomId` int,
	`totalUnits` int DEFAULT 44,
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `racks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `racks` ADD CONSTRAINT `racks_roomId_rooms_id_fk` FOREIGN KEY (`roomId`) REFERENCES `rooms`(`id`) ON DELETE cascade ON UPDATE no action;