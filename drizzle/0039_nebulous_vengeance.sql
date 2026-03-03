CREATE TABLE `ceo_bandejas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ceoId` int NOT NULL,
	`number` int NOT NULL,
	`label` varchar(64),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ceo_bandejas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ceo_splitter_vias` (
	`id` int AUTO_INCREMENT NOT NULL,
	`splitterId` int NOT NULL,
	`ceoId` int NOT NULL,
	`viaNumber` int NOT NULL,
	`label` varchar(64),
	`lossDb` float,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ceo_splitter_vias_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ceo_splitters` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ceoId` int NOT NULL,
	`bandejaId` int NOT NULL,
	`identifier` varchar(64) NOT NULL,
	`ceo_splitter_type` enum('balanced','unbalanced') NOT NULL DEFAULT 'balanced',
	`ratio` varchar(32) NOT NULL,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ceo_splitters_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ceo_via_associations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ceoId` int NOT NULL,
	`ceo_assoc_source_type` enum('tube','splitter') NOT NULL,
	`sourceViaId` int NOT NULL,
	`ceo_assoc_target_type` enum('tube','splitter') NOT NULL,
	`targetViaId` int NOT NULL,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ceo_via_associations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `ceo_tubes` ADD `bandejaId` int;