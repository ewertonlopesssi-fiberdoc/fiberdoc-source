CREATE TABLE `map_olt_elements` (
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
CREATE TABLE `olt_port_fiber_links` (
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