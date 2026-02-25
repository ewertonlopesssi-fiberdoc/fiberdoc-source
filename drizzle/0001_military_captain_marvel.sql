CREATE TABLE `connections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128),
	`sourcePortId` int NOT NULL,
	`targetPortId` int NOT NULL,
	`fiberId` int,
	`connection_type` enum('direct','spliced','patch','cross_connect') NOT NULL DEFAULT 'direct',
	`connection_status` enum('active','inactive','testing') NOT NULL DEFAULT 'active',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `connections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `equipments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`equipment_type` enum('switch','olt','dgo','splitter','router','server','patch_panel','amplifier','other') NOT NULL,
	`model` varchar(128),
	`manufacturer` varchar(128),
	`serialNumber` varchar(128),
	`roomId` int,
	`rack` varchar(64),
	`rackPosition` varchar(32),
	`ipAddress` varchar(64),
	`macAddress` varchar(32),
	`totalPorts` int DEFAULT 0,
	`notes` text,
	`status` enum('active','inactive','maintenance') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `equipments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fibers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`originEquipmentId` int,
	`originPortId` int,
	`destinationEquipmentId` int,
	`destinationPortId` int,
	`fiber_color` enum('blue','orange','green','brown','slate','white','red','black','yellow','violet','rose','aqua'),
	`fiber_type` enum('single_mode','multi_mode','armored','aerial','underground') NOT NULL DEFAULT 'single_mode',
	`lengthMeters` float,
	`cableId` varchar(64),
	`tubeColor` varchar(32),
	`attenuation` float,
	`fiber_status` enum('active','inactive','reserved','faulty') NOT NULL DEFAULT 'active',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fibers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `maintenance_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entity_type` enum('equipment','fiber','port','connection','room') NOT NULL,
	`entityId` int NOT NULL,
	`action` enum('created','updated','deleted','maintenance','repaired','inspected') NOT NULL,
	`description` text NOT NULL,
	`performedBy` varchar(128),
	`userId` int,
	`previousState` text,
	`newState` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `maintenance_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`equipmentId` int NOT NULL,
	`portNumber` varchar(32) NOT NULL,
	`label` varchar(64),
	`port_type` enum('sc','lc','fc','st','rj45','sfp','sfp_plus','qsfp','gpon','xgspon','other') NOT NULL DEFAULT 'lc',
	`port_status` enum('free','occupied','reserved','faulty') NOT NULL DEFAULT 'free',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`description` text,
	`address` text,
	`city` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rooms_id` PRIMARY KEY(`id`)
);
