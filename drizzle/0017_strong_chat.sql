CREATE TABLE `snmp_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`powerSourceId` int NOT NULL,
	`alert_type` enum('temp_high','voltage_low','voltage_high','battery_low','battery_high','current_high','load_high','ac_fail','snmp_unreachable') NOT NULL,
	`alert_severity` enum('warning','critical') NOT NULL DEFAULT 'warning',
	`message` text NOT NULL,
	`currentValue` float,
	`thresholdValue` float,
	`acknowledgedAt` timestamp,
	`acknowledgedBy` varchar(128),
	`resolvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `snmp_alerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `snmp_alerts` ADD CONSTRAINT `snmp_alerts_powerSourceId_power_sources_id_fk` FOREIGN KEY (`powerSourceId`) REFERENCES `power_sources`(`id`) ON DELETE cascade ON UPDATE no action;