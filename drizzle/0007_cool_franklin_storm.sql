CREATE TABLE `backup_history` (
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
CREATE TABLE `backup_schedules` (
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
