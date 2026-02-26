CREATE TABLE `ip_audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`blockId` int NOT NULL,
	`addressId` int,
	`address` varchar(39) NOT NULL,
	`ip_audit_action` enum('allocated','released','updated','deleted','imported') NOT NULL,
	`previousStatus` varchar(32),
	`newStatus` varchar(32),
	`hostname` varchar(255),
	`owner` varchar(128),
	`equipmentId` int,
	`equipmentName` varchar(128),
	`performedBy` varchar(128),
	`userId` int,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ip_audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `ip_audit_log` ADD CONSTRAINT `ip_audit_log_blockId_ip_blocks_id_fk` FOREIGN KEY (`blockId`) REFERENCES `ip_blocks`(`id`) ON DELETE cascade ON UPDATE no action;