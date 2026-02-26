CREATE TABLE `ip_addresses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`blockId` int NOT NULL,
	`address` varchar(39) NOT NULL,
	`ip_address_status` enum('free','allocated','reserved','dhcp') NOT NULL DEFAULT 'free',
	`hostname` varchar(255),
	`description` text,
	`equipmentId` int,
	`macAddress` varchar(17),
	`owner` varchar(128),
	`lastSeen` timestamp,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ip_addresses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ip_blocks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`cidr` varchar(43) NOT NULL,
	`networkAddress` varchar(39) NOT NULL,
	`broadcastAddress` varchar(39) NOT NULL,
	`totalHosts` int NOT NULL,
	`gateway` varchar(39),
	`dns1` varchar(39),
	`dns2` varchar(39),
	`vlan` int,
	`ip_block_type` enum('infrastructure','clients','management','transit','loopback','reserved','other') NOT NULL DEFAULT 'other',
	`ip_block_status` enum('active','inactive','reserved') NOT NULL DEFAULT 'active',
	`description` text,
	`roomId` int,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ip_blocks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `ip_addresses` ADD CONSTRAINT `ip_addresses_blockId_ip_blocks_id_fk` FOREIGN KEY (`blockId`) REFERENCES `ip_blocks`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ip_addresses` ADD CONSTRAINT `ip_addresses_equipmentId_equipments_id_fk` FOREIGN KEY (`equipmentId`) REFERENCES `equipments`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ip_blocks` ADD CONSTRAINT `ip_blocks_roomId_rooms_id_fk` FOREIGN KEY (`roomId`) REFERENCES `rooms`(`id`) ON DELETE set null ON UPDATE no action;