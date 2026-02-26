CREATE TABLE `tuya_readings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deviceId` int NOT NULL,
	`temperature` float,
	`humidity` float,
	`co2` float,
	`power` float,
	`voltage` float,
	`current` float,
	`rawData` text,
	`collectedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tuya_readings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `tuya_readings` ADD CONSTRAINT `tuya_readings_deviceId_tuya_devices_id_fk` FOREIGN KEY (`deviceId`) REFERENCES `tuya_devices`(`id`) ON DELETE cascade ON UPDATE no action;