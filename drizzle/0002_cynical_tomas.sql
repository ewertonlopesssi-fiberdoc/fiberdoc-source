ALTER TABLE `rooms` ADD `room_type` enum('datacenter','noc','pop','cabinet','outdoor','other') DEFAULT 'pop' NOT NULL;--> statement-breakpoint
ALTER TABLE `rooms` ADD `location` varchar(128);--> statement-breakpoint
ALTER TABLE `rooms` ADD `floor` varchar(32);--> statement-breakpoint
ALTER TABLE `rooms` ADD `state` varchar(32);--> statement-breakpoint
ALTER TABLE `rooms` ADD `notes` text;