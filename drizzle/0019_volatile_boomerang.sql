CREATE TABLE `tuya_devices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`deviceId` varchar(128) NOT NULL,
	`type` enum('temperature_humidity','temperature','humidity','co2','smoke','motion','door','power_meter','other') NOT NULL DEFAULT 'temperature_humidity',
	`roomId` int,
	`powerSourceId` int,
	`notes` text,
	`pollInterval` int NOT NULL DEFAULT 300,
	`lastPolledAt` timestamp,
	`lastPollError` text,
	`lastTemperature` float,
	`lastHumidity` float,
	`lastCo2` float,
	`lastPower` float,
	`lastVoltage` float,
	`lastCurrent` float,
	`lastRawData` text,
	`status` enum('online','offline','unknown') NOT NULL DEFAULT 'unknown',
	`alertsEnabled` boolean NOT NULL DEFAULT false,
	`alertTempMax` float,
	`alertTempMin` float,
	`alertHumidityMax` float,
	`alertHumidityMin` float,
	`alertCo2Max` float,
	`alertPowerMax` float,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tuya_devices_id` PRIMARY KEY(`id`),
	CONSTRAINT `tuya_devices_deviceId_unique` UNIQUE(`deviceId`)
);
--> statement-breakpoint
ALTER TABLE `tuya_devices` ADD CONSTRAINT `tuya_devices_roomId_rooms_id_fk` FOREIGN KEY (`roomId`) REFERENCES `rooms`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tuya_devices` ADD CONSTRAINT `tuya_devices_powerSourceId_power_sources_id_fk` FOREIGN KEY (`powerSourceId`) REFERENCES `power_sources`(`id`) ON DELETE set null ON UPDATE no action;