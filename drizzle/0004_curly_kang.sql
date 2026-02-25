CREATE TABLE `equipment_slots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`equipmentId` int NOT NULL,
	`slotNumber` varchar(16) NOT NULL,
	`label` varchar(64),
	`slot_port_type` enum('sc','lc','fc','st','rj45','sfp','sfp_plus','qsfp','qsfp28','qsfp_dd','cfp','cfp2','cfp4','gpon','xgspon','dag','other') DEFAULT 'lc',
	`slot_speed` enum('1g','10g','25g','40g','100g','400g','other'),
	`totalPorts` int DEFAULT 0,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `equipment_slots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `ports` ADD `slotId` int;