ALTER TABLE `equipments` ADD `sshUser` varchar(64);--> statement-breakpoint
ALTER TABLE `equipments` ADD `sshPasswordEnc` text;--> statement-breakpoint
ALTER TABLE `equipments` ADD `sshPort` int DEFAULT 22;