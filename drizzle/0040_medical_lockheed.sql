CREATE TABLE `ssh_commands` (
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
CREATE TABLE `ssh_credentials` (
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
CREATE TABLE `ssh_execution_log` (
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
