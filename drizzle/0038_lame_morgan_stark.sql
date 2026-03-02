CREATE TABLE `sgp_link_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ctoId` int NOT NULL,
	`ctoName` varchar(128) NOT NULL,
	`sgpId` int,
	`sgp_link_action` enum('linked','unlinked') NOT NULL,
	`performedBy` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sgp_link_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `sgp_link_history` ADD CONSTRAINT `sgp_link_history_ctoId_ctos_id_fk` FOREIGN KEY (`ctoId`) REFERENCES `ctos`(`id`) ON DELETE cascade ON UPDATE no action;