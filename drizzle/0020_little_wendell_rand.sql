CREATE TABLE `tuya_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`accessId` varchar(128) NOT NULL,
	`accessSecret` varchar(256) NOT NULL,
	`region` enum('us','eu','cn','in') NOT NULL DEFAULT 'us',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tuya_accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `tuya_devices` ADD `tuyaAccountId` int;--> statement-breakpoint
ALTER TABLE `tuya_devices` ADD CONSTRAINT `tuya_devices_tuyaAccountId_tuya_accounts_id_fk` FOREIGN KEY (`tuyaAccountId`) REFERENCES `tuya_accounts`(`id`) ON DELETE set null ON UPDATE no action;