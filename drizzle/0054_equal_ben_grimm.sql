ALTER TABLE `map_groups` MODIFY COLUMN `parentId` int;--> statement-breakpoint
ALTER TABLE `cto_tubes` ADD `cto_splitter_type` enum('balanced','unbalanced') DEFAULT 'balanced';--> statement-breakpoint
ALTER TABLE `cto_tubes` ADD `ratio` varchar(32);