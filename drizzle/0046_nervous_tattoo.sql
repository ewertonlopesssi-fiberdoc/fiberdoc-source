CREATE TABLE `network_port_readings` (
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
CREATE TABLE `network_snmp_alerts` (
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
CREATE TABLE `network_snmp_config` (
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
CREATE TABLE `network_snmp_ports` (
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
CREATE TABLE `network_snmp_readings` (
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