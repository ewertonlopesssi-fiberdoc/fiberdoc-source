CREATE TABLE `cto_tubes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ctoId` int NOT NULL,
	`cto_tube_type` enum('tube','splitter') NOT NULL DEFAULT 'tube',
	`identifier` varchar(32) NOT NULL,
	`totalVias` int NOT NULL DEFAULT 12,
	`color` varchar(32),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cto_tubes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cto_vias` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tubeId` int NOT NULL,
	`ctoId` int NOT NULL,
	`viaNumber` int NOT NULL,
	`label` varchar(64),
	`fusedToViaId` int,
	`fusedToTubeId` int,
	`fiberId` int,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cto_vias_id` PRIMARY KEY(`id`)
);
