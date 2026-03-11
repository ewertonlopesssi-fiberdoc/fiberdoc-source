CREATE TABLE `cto_via_associations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ctoId` int NOT NULL,
	`cto_assoc_source_type` enum('tube','splitter') NOT NULL,
	`sourceViaId` int NOT NULL,
	`cto_assoc_target_type` enum('tube','splitter') NOT NULL,
	`targetViaId` int NOT NULL,
	`notes` text,
	`cto_assoc_created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cto_via_associations_id` PRIMARY KEY(`id`)
);
