CREATE TABLE `topology_layouts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`roomFilter` varchar(32) NOT NULL DEFAULT 'all',
	`nodePositions` text NOT NULL,
	`ctrlPoints` text NOT NULL DEFAULT ('{}'),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `topology_layouts_id` PRIMARY KEY(`id`)
);
