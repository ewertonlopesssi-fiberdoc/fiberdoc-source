ALTER TABLE `equipments` ADD `power_type` enum('ac','dc');--> statement-breakpoint
ALTER TABLE `equipments` ADD `power_source` enum('rectifier','inverter','ups','grid','other');--> statement-breakpoint
ALTER TABLE `equipments` ADD `powerSourceLabel` varchar(128);