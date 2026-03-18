-- FiberDoc Schema Consolidado (gerado automaticamente)
-- Inclui todos os arquivos de migração Drizzle em ordem

-- === drizzle/0000_wealthy_hitman.sql ===
CREATE TABLE IF NOT EXISTS `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);

-- === drizzle/0001_military_captain_marvel.sql ===
CREATE TABLE IF NOT EXISTS `connections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128),
	`sourcePortId` int NOT NULL,
	`targetPortId` int NOT NULL,
	`fiberId` int,
	`connection_type` enum('direct','spliced','patch','cross_connect') NOT NULL DEFAULT 'direct',
	`connection_status` enum('active','inactive','testing') NOT NULL DEFAULT 'active',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `connections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `equipments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`equipment_type` enum('switch','olt','dgo','splitter','router','server','patch_panel','amplifier','other') NOT NULL,
	`model` varchar(128),
	`manufacturer` varchar(128),
	`serialNumber` varchar(128),
	`roomId` int,
	`rack` varchar(64),
	`rackPosition` varchar(32),
	`ipAddress` varchar(64),
	`macAddress` varchar(32),
	`totalPorts` int DEFAULT 0,
	`notes` text,
	`status` enum('active','inactive','maintenance') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `equipments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `fibers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`originEquipmentId` int,
	`originPortId` int,
	`destinationEquipmentId` int,
	`destinationPortId` int,
	`fiber_color` enum('blue','orange','green','brown','slate','white','red','black','yellow','violet','rose','aqua'),
	`fiber_type` enum('single_mode','multi_mode','armored','aerial','underground') NOT NULL DEFAULT 'single_mode',
	`lengthMeters` float,
	`cableId` varchar(64),
	`tubeColor` varchar(32),
	`attenuation` float,
	`fiber_status` enum('active','inactive','reserved','faulty') NOT NULL DEFAULT 'active',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fibers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `maintenance_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entity_type` enum('equipment','fiber','port','connection','room') NOT NULL,
	`entityId` int NOT NULL,
	`action` enum('created','updated','deleted','maintenance','repaired','inspected') NOT NULL,
	`description` text NOT NULL,
	`performedBy` varchar(128),
	`userId` int,
	`previousState` text,
	`newState` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `maintenance_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`equipmentId` int NOT NULL,
	`portNumber` varchar(32) NOT NULL,
	`label` varchar(64),
	`port_type` enum('sc','lc','fc','st','rj45','sfp','sfp_plus','qsfp','gpon','xgspon','other') NOT NULL DEFAULT 'lc',
	`port_status` enum('free','occupied','reserved','faulty') NOT NULL DEFAULT 'free',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `rooms` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`description` text,
	`address` text,
	`city` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rooms_id` PRIMARY KEY(`id`)
);

-- === drizzle/0002_cynical_tomas.sql ===
ALTER TABLE `rooms` ADD IF NOT EXISTS `room_type` enum('datacenter','noc','pop','cabinet','outdoor','other') DEFAULT 'pop' NOT NULL;--> statement-breakpoint
ALTER TABLE `rooms` ADD IF NOT EXISTS `location` varchar(128);--> statement-breakpoint
ALTER TABLE `rooms` ADD IF NOT EXISTS `floor` varchar(32);--> statement-breakpoint
ALTER TABLE `rooms` ADD IF NOT EXISTS `state` varchar(32);--> statement-breakpoint
ALTER TABLE `rooms` ADD IF NOT EXISTS `notes` text;
-- === drizzle/0003_furry_dexter_bennett.sql ===
ALTER TABLE `ports` MODIFY COLUMN `port_type` enum('sc','lc','fc','st','rj45','sfp','sfp_plus','qsfp','qsfp28','qsfp_dd','cfp','cfp2','cfp4','gpon','xgspon','dag','other') NOT NULL DEFAULT 'lc';--> statement-breakpoint
ALTER TABLE `ports` ADD IF NOT EXISTS `port_speed` enum('1g','10g','25g','40g','100g','400g','other');
-- === drizzle/0004_curly_kang.sql ===
CREATE TABLE IF NOT EXISTS `equipment_slots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`equipmentId` int NOT NULL,
	`slotNumber` varchar(16) NOT NULL,
	`label` varchar(64),
	`slot_port_type` enum('sc','lc','fc','st','rj45','sfp','sfp_plus','qsfp','qsfp28','qsfp_dd','cfp','cfp2','cfp4','gpon','xgspon','dag','other') DEFAULT 'lc',
	`slot_speed` enum('1g','10g','25g','40g','100g','400g','other'),
	`totalPorts` int DEFAULT 0,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `equipment_slots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `ports` ADD IF NOT EXISTS `slotId` int;
-- === drizzle/0005_petite_wallflower.sql ===
CREATE TABLE IF NOT EXISTS `ceo_tubes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ceoId` int NOT NULL,
	`ceo_tube_type` enum('tube','splitter') NOT NULL DEFAULT 'tube',
	`identifier` varchar(32) NOT NULL,
	`totalVias` int NOT NULL DEFAULT 12,
	`color` varchar(32),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ceo_tubes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ceo_vias` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tubeId` int NOT NULL,
	`ceoId` int NOT NULL,
	`viaNumber` int NOT NULL,
	`label` varchar(64),
	`fusedToViaId` int,
	`fusedToTubeId` int,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ceo_vias_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ceos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`location` varchar(256),
	`roomId` int,
	`notes` text,
	`ceo_status` enum('active','inactive','maintenance') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ceos_id` PRIMARY KEY(`id`)
);

-- === drizzle/0006_friendly_leopardon.sql ===
ALTER TABLE `ceo_vias` ADD IF NOT EXISTS `fiberId` int;
-- === drizzle/0007_cool_franklin_storm.sql ===
CREATE TABLE IF NOT EXISTS `backup_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`filename` varchar(256) NOT NULL,
	`fileUrl` text,
	`fileKey` varchar(512),
	`fileSizeBytes` int,
	`totalRecords` int,
	`backup_status` enum('success','error') NOT NULL DEFAULT 'success',
	`backup_trigger` enum('manual','scheduled') NOT NULL DEFAULT 'manual',
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `backup_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `backup_schedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`enabled` boolean NOT NULL DEFAULT false,
	`frequency` enum('daily','weekly','monthly') NOT NULL DEFAULT 'weekly',
	`hour` int NOT NULL DEFAULT 2,
	`dayOfWeek` int,
	`dayOfMonth` int,
	`retentionDays` int NOT NULL DEFAULT 30,
	`nextRunAt` timestamp,
	`lastRunAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `backup_schedules_id` PRIMARY KEY(`id`)
);

-- === drizzle/0008_lying_orphan.sql ===
CREATE TABLE IF NOT EXISTS `system_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(64) NOT NULL,
	`value` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `system_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `system_settings_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
ALTER TABLE `equipments` ADD IF NOT EXISTS `imageUrl` text;
-- === drizzle/0009_cuddly_rachel_grey.sql ===
ALTER TABLE `equipments` ADD IF NOT EXISTS `power_type` enum('ac','dc');--> statement-breakpoint
ALTER TABLE `equipments` ADD IF NOT EXISTS `power_source` enum('rectifier','inverter','ups','grid','other');--> statement-breakpoint
ALTER TABLE `equipments` ADD IF NOT EXISTS `powerSourceLabel` varchar(128);
-- === drizzle/0010_workable_harry_osborn.sql ===
ALTER TABLE `users` ADD IF NOT EXISTS `passwordHash` varchar(255);
-- === drizzle/0011_fast_power_pack.sql ===
CREATE TABLE IF NOT EXISTS `ip_addresses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`blockId` int NOT NULL,
	`address` varchar(39) NOT NULL,
	`ip_address_status` enum('free','allocated','reserved','dhcp') NOT NULL DEFAULT 'free',
	`hostname` varchar(255),
	`description` text,
	`equipmentId` int,
	`macAddress` varchar(17),
	`owner` varchar(128),
	`lastSeen` timestamp,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ip_addresses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ip_blocks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`cidr` varchar(43) NOT NULL,
	`networkAddress` varchar(39) NOT NULL,
	`broadcastAddress` varchar(39) NOT NULL,
	`totalHosts` int NOT NULL,
	`gateway` varchar(39),
	`dns1` varchar(39),
	`dns2` varchar(39),
	`vlan` int,
	`ip_block_type` enum('infrastructure','clients','management','transit','loopback','reserved','other') NOT NULL DEFAULT 'other',
	`ip_block_status` enum('active','inactive','reserved') NOT NULL DEFAULT 'active',
	`description` text,
	`roomId` int,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ip_blocks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `ip_addresses` ADD CONSTRAINT `ip_addresses_blockId_ip_blocks_id_fk` FOREIGN KEY (`blockId`) REFERENCES `ip_blocks`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ip_addresses` ADD CONSTRAINT `ip_addresses_equipmentId_equipments_id_fk` FOREIGN KEY (`equipmentId`) REFERENCES `equipments`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ip_blocks` ADD CONSTRAINT `ip_blocks_roomId_rooms_id_fk` FOREIGN KEY (`roomId`) REFERENCES `rooms`(`id`) ON DELETE set null ON UPDATE no action;
-- === drizzle/0012_optimal_brother_voodoo.sql ===
ALTER TABLE `equipments` ADD IF NOT EXISTS `vlan` int;--> statement-breakpoint
ALTER TABLE `equipments` ADD IF NOT EXISTS `interfaceIp` varchar(64);--> statement-breakpoint
ALTER TABLE `equipments` ADD IF NOT EXISTS `ipBlockId` int;--> statement-breakpoint
ALTER TABLE `equipments` ADD IF NOT EXISTS `serviceDescription` varchar(255);
-- === drizzle/0013_unusual_bruce_banner.sql ===
CREATE TABLE IF NOT EXISTS `ip_audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`blockId` int NOT NULL,
	`addressId` int,
	`address` varchar(39) NOT NULL,
	`ip_audit_action` enum('allocated','released','updated','deleted','imported') NOT NULL,
	`previousStatus` varchar(32),
	`newStatus` varchar(32),
	`hostname` varchar(255),
	`owner` varchar(128),
	`equipmentId` int,
	`equipmentName` varchar(128),
	`performedBy` varchar(128),
	`userId` int,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ip_audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `ip_audit_log` ADD CONSTRAINT `ip_audit_log_blockId_ip_blocks_id_fk` FOREIGN KEY (`blockId`) REFERENCES `ip_blocks`(`id`) ON DELETE cascade ON UPDATE no action;
-- === drizzle/0014_sad_jigsaw.sql ===
CREATE TABLE IF NOT EXISTS `equipment_interfaces` (
	`id` int AUTO_INCREMENT NOT NULL,
	`equipmentId` int NOT NULL,
	`name` varchar(64) NOT NULL,
	`vlan` int,
	`ipAddress` varchar(43),
	`macAddress` varchar(17),
	`ipBlockId` int,
	`serviceDescription` varchar(255),
	`isPrimary` boolean NOT NULL DEFAULT false,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `equipment_interfaces_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `equipment_interfaces` ADD CONSTRAINT `equipment_interfaces_equipmentId_equipments_id_fk` FOREIGN KEY (`equipmentId`) REFERENCES `equipments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `equipment_interfaces` ADD CONSTRAINT `equipment_interfaces_ipBlockId_ip_blocks_id_fk` FOREIGN KEY (`ipBlockId`) REFERENCES `ip_blocks`(`id`) ON DELETE set null ON UPDATE no action;
-- === drizzle/0015_mighty_jetstream.sql ===
CREATE TABLE IF NOT EXISTS `power_sources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`ps_type` enum('rectifier','inverter','ups','grid','generator','other') NOT NULL DEFAULT 'rectifier',
	`manufacturer` varchar(128),
	`model` varchar(128),
	`roomId` int,
	`location` varchar(255),
	`outputVoltage` float,
	`outputCurrentMax` float,
	`notes` text,
	`snmpEnabled` boolean NOT NULL DEFAULT false,
	`snmpHost` varchar(128),
	`snmpPort` int DEFAULT 161,
	`snmp_version` enum('v1','v2c','v3') DEFAULT 'v2c',
	`snmpCommunity` varchar(128),
	`snmpV3User` varchar(128),
	`snmpv3_auth_proto` enum('MD5','SHA'),
	`snmpV3AuthKey` varchar(255),
	`snmpv3_priv_proto` enum('DES','AES'),
	`snmpV3PrivKey` varchar(255),
	`oidOutputVoltage` varchar(128),
	`oidOutputCurrent` varchar(128),
	`oidTemperature` varchar(128),
	`oidAlarmStatus` varchar(128),
	`oidBatteryLevel` varchar(128),
	`oidLoadPercent` varchar(128),
	`snmpPollInterval` int DEFAULT 300,
	`lastPollAt` timestamp,
	`lastVoltage` float,
	`lastCurrent` float,
	`lastTemperature` float,
	`lastAlarmStatus` varchar(64),
	`lastBatteryLevel` float,
	`lastLoadPercent` float,
	`lastPollError` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `power_sources_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `power_sources` ADD CONSTRAINT `power_sources_roomId_rooms_id_fk` FOREIGN KEY (`roomId`) REFERENCES `rooms`(`id`) ON DELETE set null ON UPDATE no action;
-- === drizzle/0016_clumsy_romulus.sql ===
ALTER TABLE `equipments` ADD IF NOT EXISTS `powerSourceId` int;
-- === drizzle/0017_strong_chat.sql ===
CREATE TABLE IF NOT EXISTS `snmp_alerts` (
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
-- === drizzle/0018_past_sheva_callister.sql ===
ALTER TABLE `power_sources` ADD IF NOT EXISTS `alertsEnabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `power_sources` ADD IF NOT EXISTS `alertTempMax` float;--> statement-breakpoint
ALTER TABLE `power_sources` ADD IF NOT EXISTS `alertVoltageMin` float;--> statement-breakpoint
ALTER TABLE `power_sources` ADD IF NOT EXISTS `alertVoltageMax` float;--> statement-breakpoint
ALTER TABLE `power_sources` ADD IF NOT EXISTS `alertBatteryMin` float;--> statement-breakpoint
ALTER TABLE `power_sources` ADD IF NOT EXISTS `alertBatteryMax` float;--> statement-breakpoint
ALTER TABLE `power_sources` ADD IF NOT EXISTS `alertCurrentMax` float;--> statement-breakpoint
ALTER TABLE `power_sources` ADD IF NOT EXISTS `alertLoadMax` float;--> statement-breakpoint
ALTER TABLE `power_sources` ADD IF NOT EXISTS `alertAcFailEnabled` boolean DEFAULT false NOT NULL;
-- === drizzle/0019_volatile_boomerang.sql ===
CREATE TABLE IF NOT EXISTS `tuya_devices` (
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
-- === drizzle/0020_little_wendell_rand.sql ===
CREATE TABLE IF NOT EXISTS `tuya_accounts` (
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
ALTER TABLE `tuya_devices` ADD IF NOT EXISTS `tuyaAccountId` int;--> statement-breakpoint
ALTER TABLE `tuya_devices` ADD CONSTRAINT `tuya_devices_tuyaAccountId_tuya_accounts_id_fk` FOREIGN KEY (`tuyaAccountId`) REFERENCES `tuya_accounts`(`id`) ON DELETE set null ON UPDATE no action;
-- === drizzle/0021_curly_mysterio.sql ===
CREATE TABLE IF NOT EXISTS `tuya_readings` (
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
-- === drizzle/0022_black_tombstone.sql ===
ALTER TABLE `users` ADD IF NOT EXISTS `mustChangePassword` boolean DEFAULT false NOT NULL;
-- === drizzle/0023_cold_colossus.sql ===
ALTER TABLE `ports` ADD IF NOT EXISTS `sortOrder` int DEFAULT 0 NOT NULL;
-- === drizzle/0024_reflective_magus.sql ===
ALTER TABLE `equipments` ADD IF NOT EXISTS `rackUnits` int DEFAULT 1;
-- === drizzle/0025_marvelous_warpath.sql ===
ALTER TABLE `ports` ADD IF NOT EXISTS `connectedToEquipmentId` int;--> statement-breakpoint
ALTER TABLE `ports` ADD IF NOT EXISTS `connectedToPortId` int;
-- === drizzle/0026_mixed_krista_starr.sql ===
CREATE TABLE IF NOT EXISTS `topology_layouts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`roomFilter` varchar(32) NOT NULL DEFAULT 'all',
	`nodePositions` text NOT NULL,
	`ctrlPoints` text NOT NULL DEFAULT ('{}'),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `topology_layouts_id` PRIMARY KEY(`id`)
);

-- === drizzle/0027_stormy_red_shift.sql ===
CREATE TABLE IF NOT EXISTS `snmp_readings` (
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
-- === drizzle/0028_brown_robin_chapel.sql ===
ALTER TABLE `power_sources` ADD IF NOT EXISTS `snmpVoltageDivisor` float DEFAULT 1;--> statement-breakpoint
ALTER TABLE `power_sources` ADD IF NOT EXISTS `snmpCurrentDivisor` float DEFAULT 1;--> statement-breakpoint
ALTER TABLE `power_sources` ADD IF NOT EXISTS `snmpTempDivisor` float DEFAULT 1;--> statement-breakpoint
ALTER TABLE `power_sources` ADD IF NOT EXISTS `snmpBatteryDivisor` float DEFAULT 1;
-- === drizzle/0029_great_white_tiger.sql ===
CREATE TABLE IF NOT EXISTS `racks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(64) NOT NULL,
	`roomId` int,
	`totalUnits` int DEFAULT 44,
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `racks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `racks` ADD CONSTRAINT `racks_roomId_rooms_id_fk` FOREIGN KEY (`roomId`) REFERENCES `rooms`(`id`) ON DELETE cascade ON UPDATE no action;
-- === drizzle/0030_mighty_legion.sql ===
CREATE TABLE IF NOT EXISTS `ctos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`address` varchar(256),
	`capacity` int DEFAULT 8,
	`usedPorts` int DEFAULT 0,
	`status` varchar(32) DEFAULT 'active',
	`lat` double,
	`lng` double,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ctos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `map_elements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` varchar(8) NOT NULL,
	`referenceId` int NOT NULL,
	`lat` double NOT NULL,
	`lng` double NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `map_elements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `map_routes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128),
	`fromElementId` int NOT NULL,
	`toElementId` int NOT NULL,
	`fiberCount` int DEFAULT 12,
	`cableType` varchar(64) DEFAULT 'FO',
	`color` varchar(16) DEFAULT '#22d3ee',
	`path` text,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `map_routes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sgp_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`baseUrl` varchar(256) NOT NULL,
	`token` varchar(512) NOT NULL,
	`app` varchar(128) NOT NULL,
	`active` boolean DEFAULT true,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sgp_config_id` PRIMARY KEY(`id`)
);

-- === drizzle/0031_free_diamondback.sql ===
CREATE TABLE IF NOT EXISTS `cto_alert_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`enabled` boolean DEFAULT false,
	`warningThreshold` int DEFAULT 80,
	`criticalThreshold` int DEFAULT 90,
	`checkIntervalMinutes` int DEFAULT 60,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cto_alert_config_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `cto_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ctoId` int NOT NULL,
	`occupancyPct` int NOT NULL,
	`threshold` int NOT NULL DEFAULT 80,
	`cto_alert_severity` enum('warning','critical') NOT NULL DEFAULT 'warning',
	`message` text NOT NULL,
	`acknowledgedAt` timestamp,
	`acknowledgedBy` varchar(128),
	`resolvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cto_alerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `cto_alerts` ADD CONSTRAINT `cto_alerts_ctoId_ctos_id_fk` FOREIGN KEY (`ctoId`) REFERENCES `ctos`(`id`) ON DELETE cascade ON UPDATE no action;
-- === drizzle/0032_redundant_leader.sql ===
ALTER TABLE `map_routes` MODIFY COLUMN `fromElementId` int;--> statement-breakpoint
ALTER TABLE `map_routes` MODIFY COLUMN `toElementId` int;
-- === drizzle/0033_workable_robin_chapel.sql ===
ALTER TABLE `backup_history` ADD IF NOT EXISTS `localPath` varchar(512);
-- === drizzle/0034_narrow_domino.sql ===
CREATE TABLE IF NOT EXISTS `cto_tubes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ctoId` int NOT NULL,
	`cto_tube_type` enum('tube','splitter') NOT NULL DEFAULT 'tube',
	`identifier` varchar(32) NOT NULL,
	`totalVias` int NOT NULL DEFAULT 12,
	`color` varchar(32),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cto_tubes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `cto_vias` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tubeId` int NOT NULL,
	`ctoId` int NOT NULL,
	`viaNumber` int NOT NULL,
	`label` varchar(64),
	`fusedToViaId` int,
	`fusedToTubeId` int,
	`fiberId` int,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cto_vias_id` PRIMARY KEY(`id`)
);

-- === drizzle/0035_spooky_lord_tyger.sql ===
CREATE TABLE IF NOT EXISTS `map_element_groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`elementId` int NOT NULL,
	`groupId` int NOT NULL,
	CONSTRAINT `map_element_groups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `map_groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`color` varchar(16) NOT NULL DEFAULT '#6366f1',
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `map_groups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `map_route_groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`routeId` int NOT NULL,
	`groupId` int NOT NULL,
	CONSTRAINT `map_route_groups_id` PRIMARY KEY(`id`)
);

-- === drizzle/0036_cynical_masked_marvel.sql ===
CREATE TABLE IF NOT EXISTS `app_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(128) NOT NULL,
	`value` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `app_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `app_settings_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
ALTER TABLE `equipments` ADD IF NOT EXISTS `voltage` float;--> statement-breakpoint
ALTER TABLE `equipments` ADD IF NOT EXISTS `powerConsumptionW` float;--> statement-breakpoint
ALTER TABLE `map_routes` ADD IF NOT EXISTS `fromTubeId` int;--> statement-breakpoint
ALTER TABLE `map_routes` ADD IF NOT EXISTS `toTubeId` int;
-- === drizzle/0037_sweet_triton.sql ===
ALTER TABLE `ctos` ADD IF NOT EXISTS `sgpId` int;
-- === drizzle/0038_lame_morgan_stark.sql ===
CREATE TABLE IF NOT EXISTS `sgp_link_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ctoId` int NOT NULL,
	`ctoName` varchar(128) NOT NULL,
	`sgpId` int,
	`sgp_link_action` enum('linked','unlinked') NOT NULL,
	`performedBy` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sgp_link_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `sgp_link_history` ADD CONSTRAINT `sgp_link_history_ctoId_ctos_id_fk` FOREIGN KEY (`ctoId`) REFERENCES `ctos`(`id`) ON DELETE cascade ON UPDATE no action;
-- === drizzle/0039_nebulous_vengeance.sql ===
CREATE TABLE IF NOT EXISTS `ceo_bandejas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ceoId` int NOT NULL,
	`number` int NOT NULL,
	`label` varchar(64),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ceo_bandejas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ceo_splitter_vias` (
	`id` int AUTO_INCREMENT NOT NULL,
	`splitterId` int NOT NULL,
	`ceoId` int NOT NULL,
	`viaNumber` int NOT NULL,
	`label` varchar(64),
	`lossDb` float,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ceo_splitter_vias_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ceo_splitters` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ceoId` int NOT NULL,
	`bandejaId` int NOT NULL,
	`identifier` varchar(64) NOT NULL,
	`ceo_splitter_type` enum('balanced','unbalanced') NOT NULL DEFAULT 'balanced',
	`ratio` varchar(32) NOT NULL,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ceo_splitters_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ceo_via_associations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ceoId` int NOT NULL,
	`ceo_assoc_source_type` enum('tube','splitter') NOT NULL,
	`sourceViaId` int NOT NULL,
	`ceo_assoc_target_type` enum('tube','splitter') NOT NULL,
	`targetViaId` int NOT NULL,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ceo_via_associations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `ceo_tubes` ADD IF NOT EXISTS `bandejaId` int;
-- === drizzle/0040_medical_lockheed.sql ===
CREATE TABLE IF NOT EXISTS `ssh_commands` (
	`id` int AUTO_INCREMENT NOT NULL,
	`equipmentId` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`description` text,
	`commandLines` text NOT NULL,
	`sleepMs` int NOT NULL DEFAULT 300,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ssh_commands_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ssh_credentials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`equipmentId` int NOT NULL,
	`sshUser` varchar(128) NOT NULL,
	`sshPasswordEnc` text NOT NULL,
	`sshPort` int NOT NULL DEFAULT 22,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ssh_credentials_id` PRIMARY KEY(`id`),
	CONSTRAINT `ssh_credentials_equipmentId_unique` UNIQUE(`equipmentId`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ssh_execution_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`equipmentId` int NOT NULL,
	`commandId` int,
	`commandName` varchar(128) NOT NULL,
	`params` text,
	`output` text NOT NULL,
	`success` boolean NOT NULL DEFAULT true,
	`executedBy` varchar(128),
	`executedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ssh_execution_log_id` PRIMARY KEY(`id`)
);

-- === drizzle/0041_third_ravenous.sql ===
ALTER TABLE `ssh_commands` ADD IF NOT EXISTS `ssh_confirm_mode` enum('none','auto_y','auto_n','manual') DEFAULT 'none' NOT NULL;
-- === drizzle/0042_dark_bastion.sql ===
ALTER TABLE `equipments` ADD IF NOT EXISTS `sshUser` varchar(64);--> statement-breakpoint
ALTER TABLE `equipments` ADD IF NOT EXISTS `sshPasswordEnc` text;--> statement-breakpoint
ALTER TABLE `equipments` ADD IF NOT EXISTS `sshPort` int DEFAULT 22;
-- === drizzle/0043_bitter_sentinel.sql ===
CREATE TABLE IF NOT EXISTS `bgp_peers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`device_id` int NOT NULL,
	`peer_ip` varchar(45) NOT NULL,
	`remote_as` int NOT NULL,
	`description` varchar(200),
	`bgp_peer_type` enum('ebgp','ibgp') DEFAULT 'ebgp',
	`local_as` int,
	`activate_script` text,
	`deactivate_script` text,
	`notes` text,
	`bgp_peer_created_at` timestamp NOT NULL DEFAULT (now()),
	`bgp_peer_updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bgp_peers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ssh_device_commands` (
	`id` int AUTO_INCREMENT NOT NULL,
	`device_id` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`command` text NOT NULL,
	`category` varchar(50) DEFAULT 'diagnostico',
	`is_dangerous` int DEFAULT 0,
	`color` varchar(20) DEFAULT '#3B82F6',
	`sort_order` int DEFAULT 0,
	`ssh_dcmd_created_at` timestamp NOT NULL DEFAULT (now()),
	`ssh_dcmd_updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ssh_device_commands_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ssh_devices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`host` varchar(255) NOT NULL,
	`port` int NOT NULL DEFAULT 22,
	`username` varchar(100) NOT NULL,
	`ssh_auth_type` enum('password','key') NOT NULL DEFAULT 'password',
	`password` text,
	`private_key` text,
	`device_type` varchar(50) DEFAULT 'generic',
	`notes` text,
	`ssh_device_created_at` timestamp NOT NULL DEFAULT (now()),
	`ssh_device_updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ssh_devices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ssh_executions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`device_id` int NOT NULL,
	`command_name` varchar(100),
	`command_text` text NOT NULL,
	`output` text,
	`ssh_exec_status` enum('success','error','timeout') DEFAULT 'success',
	`duration_ms` int,
	`executed_by` int,
	`ssh_executed_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ssh_executions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ssh_quick_commands` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`command` text NOT NULL,
	`category` varchar(50) DEFAULT 'diagnostico',
	`device_type` varchar(50) DEFAULT 'generic',
	`is_dangerous` int DEFAULT 0,
	`color` varchar(20) DEFAULT '#3B82F6',
	`ssh_qcmd_created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ssh_quick_commands_id` PRIMARY KEY(`id`)
);

-- === drizzle/0044_slow_johnny_storm.sql ===
ALTER TABLE `map_elements` ADD IF NOT EXISTS `color` varchar(16);
-- === drizzle/0045_last_pretty_boy.sql ===
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','operator') NOT NULL DEFAULT 'user';
-- === drizzle/0046_funny_magma.sql ===
CREATE TABLE IF NOT EXISTS `network_port_readings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`portId` int NOT NULL,
	`equipmentId` int NOT NULL,
	`inBps` float,
	`outBps` float,
	`rxPowerDbm` float,
	`txPowerDbm` float,
	`gbicTemp` float,
	`net_port_reading_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `network_port_readings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `network_snmp_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`equipmentId` int NOT NULL,
	`portId` int,
	`net_alert_type` enum('cpu_high','mem_high','temp_high','port_down','port_up','rx_power_low','rx_power_high','tx_power_low','tx_power_high','snmp_unreachable') NOT NULL,
	`net_alert_severity` enum('info','warning','critical') NOT NULL DEFAULT 'warning',
	`message` text NOT NULL,
	`currentValue` float,
	`thresholdValue` float,
	`net_alert_ack_at` timestamp,
	`acknowledgedBy` varchar(128),
	`net_alert_resolved_at` timestamp,
	`net_alert_created_at` timestamp NOT NULL DEFAULT (now()),
	`net_alert_updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `network_snmp_alerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `network_snmp_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`equipmentId` int NOT NULL,
	`enabled` boolean NOT NULL DEFAULT false,
	`snmpHost` varchar(128),
	`snmpPort` int DEFAULT 161,
	`net_snmp_version` enum('v1','v2c','v3') DEFAULT 'v2c',
	`snmpCommunity` varchar(128),
	`snmpV3User` varchar(128),
	`net_snmpv3_auth_proto` enum('MD5','SHA'),
	`snmpV3AuthKey` varchar(255),
	`net_snmpv3_priv_proto` enum('DES','AES'),
	`snmpV3PrivKey` varchar(255),
	`pollInterval` int DEFAULT 300,
	`alertsEnabled` boolean NOT NULL DEFAULT false,
	`alertCpuMax` float,
	`alertMemMax` float,
	`alertTempMax` float,
	`lastPollAt` timestamp,
	`lastPollError` text,
	`lastCpuPercent` float,
	`lastMemPercent` float,
	`lastTemperature` float,
	`lastUptimeSeconds` int,
	`lastPortCount` int,
	`net_snmp_created_at` timestamp NOT NULL DEFAULT (now()),
	`net_snmp_updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `network_snmp_config_id` PRIMARY KEY(`id`),
	CONSTRAINT `network_snmp_config_equipmentId_unique` UNIQUE(`equipmentId`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `network_snmp_ports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`equipmentId` int NOT NULL,
	`ifIndex` int NOT NULL,
	`ifName` varchar(64),
	`ifAlias` varchar(128),
	`ifSpeed` int,
	`ifType` varchar(32),
	`if_oper_status` enum('up','down','testing','unknown','dormant','notPresent','lowerLayerDown') DEFAULT 'unknown',
	`if_admin_status` enum('up','down','testing') DEFAULT 'up',
	`lastInBps` float,
	`lastOutBps` float,
	`lastInOctets` int,
	`lastOutOctets` int,
	`gbicEnabled` boolean NOT NULL DEFAULT false,
	`lastRxPowerDbm` float,
	`lastTxPowerDbm` float,
	`lastGbicTemp` float,
	`lastGbicVoltage` float,
	`alertRxMin` float,
	`alertRxMax` float,
	`net_port_last_poll_at` timestamp,
	`net_port_created_at` timestamp NOT NULL DEFAULT (now()),
	`net_port_updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `network_snmp_ports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `network_snmp_readings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`equipmentId` int NOT NULL,
	`cpuPercent` float,
	`memPercent` float,
	`temperature` float,
	`uptimeSeconds` int,
	`net_reading_collected_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `network_snmp_readings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `network_port_readings` ADD CONSTRAINT `network_port_readings_portId_network_snmp_ports_id_fk` FOREIGN KEY (`portId`) REFERENCES `network_snmp_ports`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `network_snmp_alerts` ADD CONSTRAINT `network_snmp_alerts_equipmentId_equipments_id_fk` FOREIGN KEY (`equipmentId`) REFERENCES `equipments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `network_snmp_alerts` ADD CONSTRAINT `network_snmp_alerts_portId_network_snmp_ports_id_fk` FOREIGN KEY (`portId`) REFERENCES `network_snmp_ports`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `network_snmp_config` ADD CONSTRAINT `network_snmp_config_equipmentId_equipments_id_fk` FOREIGN KEY (`equipmentId`) REFERENCES `equipments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `network_snmp_ports` ADD CONSTRAINT `network_snmp_ports_equipmentId_equipments_id_fk` FOREIGN KEY (`equipmentId`) REFERENCES `equipments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `network_snmp_readings` ADD CONSTRAINT `network_snmp_readings_equipmentId_equipments_id_fk` FOREIGN KEY (`equipmentId`) REFERENCES `equipments`(`id`) ON DELETE cascade ON UPDATE no action;
-- === drizzle/0046_nervous_tattoo.sql ===
CREATE TABLE IF NOT EXISTS `network_port_readings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`portId` int NOT NULL,
	`equipmentId` int NOT NULL,
	`inBps` float,
	`outBps` float,
	`rxPowerDbm` float,
	`txPowerDbm` float,
	`gbicTemp` float,
	`net_port_reading_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `network_port_readings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `network_snmp_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`equipmentId` int NOT NULL,
	`portId` int,
	`net_alert_type` enum('cpu_high','mem_high','temp_high','port_down','port_up','rx_power_low','rx_power_high','tx_power_low','tx_power_high','snmp_unreachable','traffic_high') NOT NULL,
	`net_alert_severity` enum('info','warning','critical') NOT NULL DEFAULT 'warning',
	`message` text NOT NULL,
	`currentValue` float,
	`thresholdValue` float,
	`net_alert_ack_at` timestamp,
	`acknowledgedBy` varchar(128),
	`net_alert_resolved_at` timestamp,
	`net_alert_created_at` timestamp NOT NULL DEFAULT (now()),
	`net_alert_updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `network_snmp_alerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `network_snmp_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`equipmentId` int NOT NULL,
	`enabled` boolean NOT NULL DEFAULT false,
	`snmpHost` varchar(128),
	`snmpPort` int DEFAULT 161,
	`net_snmp_version` enum('v1','v2c','v3') DEFAULT 'v2c',
	`snmpCommunity` varchar(128),
	`snmpV3User` varchar(128),
	`net_snmpv3_auth_proto` enum('MD5','SHA'),
	`snmpV3AuthKey` varchar(255),
	`net_snmpv3_priv_proto` enum('DES','AES'),
	`snmpV3PrivKey` varchar(255),
	`pollInterval` int DEFAULT 300,
	`alertsEnabled` boolean NOT NULL DEFAULT false,
	`alertCpuMax` float,
	`alertMemMax` float,
	`alertTempMax` float,
	`lastPollAt` timestamp,
	`lastPollError` text,
	`lastCpuPercent` float,
	`lastMemPercent` float,
	`lastTemperature` float,
	`lastUptimeSeconds` int,
	`lastPortCount` int,
	`net_snmp_created_at` timestamp NOT NULL DEFAULT (now()),
	`net_snmp_updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `network_snmp_config_id` PRIMARY KEY(`id`),
	CONSTRAINT `network_snmp_config_equipmentId_unique` UNIQUE(`equipmentId`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `network_snmp_ports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`equipmentId` int NOT NULL,
	`ifIndex` int NOT NULL,
	`ifName` varchar(64),
	`ifAlias` varchar(128),
	`ifSpeed` int,
	`ifType` varchar(32),
	`if_oper_status` enum('up','down','testing','unknown','dormant','notPresent','lowerLayerDown') DEFAULT 'unknown',
	`if_admin_status` enum('up','down','testing') DEFAULT 'up',
	`lastInBps` float,
	`lastOutBps` float,
	`lastInOctets` int,
	`lastOutOctets` int,
	`gbicEnabled` boolean NOT NULL DEFAULT false,
	`lastRxPowerDbm` float,
	`lastTxPowerDbm` float,
	`lastGbicTemp` float,
	`lastGbicVoltage` float,
	`alertRxMin` float,
	`alertRxMax` float,
	`alertBpsMax` float,
	`net_port_last_poll_at` timestamp,
	`net_port_created_at` timestamp NOT NULL DEFAULT (now()),
	`net_port_updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `network_snmp_ports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `network_snmp_readings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`equipmentId` int NOT NULL,
	`cpuPercent` float,
	`memPercent` float,
	`temperature` float,
	`uptimeSeconds` int,
	`net_reading_collected_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `network_snmp_readings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `network_port_readings` ADD CONSTRAINT `network_port_readings_portId_network_snmp_ports_id_fk` FOREIGN KEY (`portId`) REFERENCES `network_snmp_ports`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `network_snmp_alerts` ADD CONSTRAINT `network_snmp_alerts_equipmentId_equipments_id_fk` FOREIGN KEY (`equipmentId`) REFERENCES `equipments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `network_snmp_alerts` ADD CONSTRAINT `network_snmp_alerts_portId_network_snmp_ports_id_fk` FOREIGN KEY (`portId`) REFERENCES `network_snmp_ports`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `network_snmp_config` ADD CONSTRAINT `network_snmp_config_equipmentId_equipments_id_fk` FOREIGN KEY (`equipmentId`) REFERENCES `equipments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `network_snmp_ports` ADD CONSTRAINT `network_snmp_ports_equipmentId_equipments_id_fk` FOREIGN KEY (`equipmentId`) REFERENCES `equipments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `network_snmp_readings` ADD CONSTRAINT `network_snmp_readings_equipmentId_equipments_id_fk` FOREIGN KEY (`equipmentId`) REFERENCES `equipments`(`id`) ON DELETE cascade ON UPDATE no action;
-- === drizzle/0047_illegal_madame_masque.sql ===
ALTER TABLE `network_snmp_ports` MODIFY COLUMN `lastInOctets` bigint;--> statement-breakpoint
ALTER TABLE `network_snmp_ports` MODIFY COLUMN `lastOutOctets` bigint;
-- === drizzle/0047_nasty_kree.sql ===
ALTER TABLE `network_snmp_ports` ADD IF NOT EXISTS `alertBpsMax` float;
-- === drizzle/0048_bent_sentry.sql ===
ALTER TABLE `network_snmp_ports` MODIFY COLUMN `ifSpeed` bigint;
-- === drizzle/0048_kind_silver_fox.sql ===
ALTER TABLE `network_snmp_alerts` MODIFY COLUMN `net_alert_type` enum('cpu_high','mem_high','temp_high','port_down','port_up','rx_power_low','rx_power_high','tx_power_low','tx_power_high','snmp_unreachable','traffic_high') NOT NULL;
-- === drizzle/0049_lovely_wasp.sql ===
ALTER TABLE `bgp_peers` ADD IF NOT EXISTS `peer_ipv6` varchar(64);--> statement-breakpoint
ALTER TABLE `bgp_peers` ADD IF NOT EXISTS `activate_script_v6` text;--> statement-breakpoint
ALTER TABLE `bgp_peers` ADD IF NOT EXISTS `deactivate_script_v6` text;
-- === drizzle/0050_bouncy_smiling_tiger.sql ===
CREATE TABLE IF NOT EXISTS `map_olt_elements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`equipmentId` int NOT NULL,
	`lat` double NOT NULL,
	`lng` double NOT NULL,
	`defaultTxPowerDbm` float DEFAULT 5,
	`fiberAttenuationDbPerKm` float DEFAULT 0.35,
	`fusionLossDb` float DEFAULT 0.1,
	`notes` text,
	`olt_map_created_at` timestamp NOT NULL DEFAULT (now()),
	`olt_map_updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `map_olt_elements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `olt_port_fiber_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`oltElementId` int NOT NULL,
	`portId` int NOT NULL,
	`txPowerDbm` float,
	`ceoElementId` int NOT NULL,
	`tubeId` int NOT NULL,
	`viaNumber` int NOT NULL,
	`notes` text,
	`olt_link_created_at` timestamp NOT NULL DEFAULT (now()),
	`olt_link_updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `olt_port_fiber_links_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `map_olt_elements` ADD CONSTRAINT `map_olt_elements_equipmentId_equipments_id_fk` FOREIGN KEY (`equipmentId`) REFERENCES `equipments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `olt_port_fiber_links` ADD CONSTRAINT `olt_port_fiber_links_oltElementId_map_olt_elements_id_fk` FOREIGN KEY (`oltElementId`) REFERENCES `map_olt_elements`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `olt_port_fiber_links` ADD CONSTRAINT `olt_port_fiber_links_portId_ports_id_fk` FOREIGN KEY (`portId`) REFERENCES `ports`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `olt_port_fiber_links` ADD CONSTRAINT `olt_port_fiber_links_ceoElementId_map_elements_id_fk` FOREIGN KEY (`ceoElementId`) REFERENCES `map_elements`(`id`) ON DELETE cascade ON UPDATE no action;
-- === drizzle/0051_common_gladiator.sql ===
CREATE TABLE IF NOT EXISTS `cto_via_associations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ctoId` int NOT NULL,
	`cto_assoc_source_type` enum('tube','splitter') NOT NULL,
	`sourceViaId` int NOT NULL,
	`cto_assoc_target_type` enum('tube','splitter') NOT NULL,
	`targetViaId` int NOT NULL,
	`notes` text,
	`cto_assoc_created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cto_via_associations_id` PRIMARY KEY(`id`)
);

-- === drizzle/0052_daily_wendell_vaughn.sql ===
CREATE TABLE IF NOT EXISTS `map_poles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`reference` varchar(128),
	`effort` varchar(64),
	`lat` double NOT NULL,
	`lng` double NOT NULL,
	`notes` text,
	`pole_created_at` timestamp NOT NULL DEFAULT (now()),
	`pole_updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `map_poles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `map_technical_reserves` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`sizeMeters` int NOT NULL DEFAULT 0,
	`routeId` int,
	`lat` double NOT NULL,
	`lng` double NOT NULL,
	`notes` text,
	`reserve_created_at` timestamp NOT NULL DEFAULT (now()),
	`reserve_updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `map_technical_reserves_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `map_groups` ADD IF NOT EXISTS `parentId` int DEFAULT null;
-- === drizzle/0053_wise_captain_midlands.sql ===
ALTER TABLE `ceo_vias` ADD IF NOT EXISTS `fusedToSplitterId` int;--> statement-breakpoint
ALTER TABLE `ceo_vias` ADD IF NOT EXISTS `fusedToSplitterViaId` int;
-- === drizzle/0054_equal_ben_grimm.sql ===
ALTER TABLE `map_groups` MODIFY COLUMN `parentId` int;--> statement-breakpoint
ALTER TABLE `cto_tubes` ADD IF NOT EXISTS `cto_splitter_type` enum('balanced','unbalanced') DEFAULT 'balanced';--> statement-breakpoint
ALTER TABLE `cto_tubes` ADD IF NOT EXISTS `ratio` varchar(32);
-- === drizzle/0055_sweet_king_cobra.sql ===
CREATE TABLE IF NOT EXISTS `map_pole_groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`poleId` int NOT NULL,
	`groupId` int NOT NULL,
	CONSTRAINT `map_pole_groups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `map_reserve_groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reserveId` int NOT NULL,
	`groupId` int NOT NULL,
	CONSTRAINT `map_reserve_groups_id` PRIMARY KEY(`id`)
);

-- === drizzle/0056_map_pois.sql ===
CREATE TABLE IF NOT EXISTS `map_pois` (
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
CREATE TABLE IF NOT EXISTS `map_poi_groups` (
`id` int AUTO_INCREMENT NOT NULL,
`poiId` int NOT NULL,
`groupId` int NOT NULL,
CONSTRAINT `map_poi_groups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `map_poi_groups` ADD CONSTRAINT `map_poi_groups_poiId_map_pois_id_fk` FOREIGN KEY (`poiId`) REFERENCES `map_pois`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `map_poi_groups` ADD CONSTRAINT `map_poi_groups_groupId_map_groups_id_fk` FOREIGN KEY (`groupId`) REFERENCES `map_groups`(`id`) ON DELETE cascade ON UPDATE no action;

