CREATE TABLE `equipment_interfaces` (
	`id` int AUTO_INCREMENT NOT NULL,
	`equipmentId` int NOT NULL,
	`name` varchar(64) NOT NULL,
	`vlan` int,
	`ipAddress` varchar(43),
	`macAddress` varchar(17),
	`ipBlockId` int,
	`serviceDescription` varchar(255),
	`isPrimary` boolean NOT NULL DEFAULT false,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `equipment_interfaces_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `equipment_interfaces` ADD CONSTRAINT `equipment_interfaces_equipmentId_equipments_id_fk` FOREIGN KEY (`equipmentId`) REFERENCES `equipments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `equipment_interfaces` ADD CONSTRAINT `equipment_interfaces_ipBlockId_ip_blocks_id_fk` FOREIGN KEY (`ipBlockId`) REFERENCES `ip_blocks`(`id`) ON DELETE set null ON UPDATE no action;