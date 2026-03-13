CREATE TABLE `map_pois` (
`id` int AUTO_INCREMENT NOT NULL,
`name` varchar(128) NOT NULL,
`category` varchar(64) NOT NULL DEFAULT 'geral',
`lat` double NOT NULL,
`lng` double NOT NULL,
`notes` text,
`color` varchar(16) DEFAULT '#6366f1',
`poi_created_at` timestamp NOT NULL DEFAULT (now()),
`poi_updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
CONSTRAINT `map_pois_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `map_poi_groups` (
`id` int AUTO_INCREMENT NOT NULL,
`poiId` int NOT NULL,
`groupId` int NOT NULL,
CONSTRAINT `map_poi_groups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `map_poi_groups` ADD CONSTRAINT `map_poi_groups_poiId_map_pois_id_fk` FOREIGN KEY (`poiId`) REFERENCES `map_pois`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `map_poi_groups` ADD CONSTRAINT `map_poi_groups_groupId_map_groups_id_fk` FOREIGN KEY (`groupId`) REFERENCES `map_groups`(`id`) ON DELETE cascade ON UPDATE no action;
