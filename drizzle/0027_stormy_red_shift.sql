CREATE TABLE `snmp_readings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`powerSourceId` int NOT NULL,
	`voltage` float,
	`current` float,
	`temperature` float,
	`batteryLevel` float,
	`loadPercent` float,
	`alarmStatus` varchar(64),
	`collectedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `snmp_readings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `snmp_readings` ADD CONSTRAINT `snmp_readings_powerSourceId_power_sources_id_fk` FOREIGN KEY (`powerSourceId`) REFERENCES `power_sources`(`id`) ON DELETE cascade ON UPDATE no action;