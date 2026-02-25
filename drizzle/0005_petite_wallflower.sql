CREATE TABLE `ceo_tubes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ceoId` int NOT NULL,
	`ceo_tube_type` enum('tube','splitter') NOT NULL DEFAULT 'tube',
	`identifier` varchar(32) NOT NULL,
	`totalVias` int NOT NULL DEFAULT 12,
	`color` varchar(32),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ceo_tubes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ceo_vias` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tubeId` int NOT NULL,
	`ceoId` int NOT NULL,
	`viaNumber` int NOT NULL,
	`label` varchar(64),
	`fusedToViaId` int,
	`fusedToTubeId` int,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ceo_vias_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ceos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`location` varchar(256),
	`roomId` int,
	`notes` text,
	`ceo_status` enum('active','inactive','maintenance') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ceos_id` PRIMARY KEY(`id`)
);
