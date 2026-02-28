CREATE TABLE `cto_alert_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`enabled` boolean DEFAULT false,
	`warningThreshold` int DEFAULT 80,
	`criticalThreshold` int DEFAULT 90,
	`checkIntervalMinutes` int DEFAULT 60,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cto_alert_config_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cto_alerts` (
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