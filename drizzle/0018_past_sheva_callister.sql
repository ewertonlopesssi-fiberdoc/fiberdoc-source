ALTER TABLE `power_sources` ADD `alertsEnabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `power_sources` ADD `alertTempMax` float;--> statement-breakpoint
ALTER TABLE `power_sources` ADD `alertVoltageMin` float;--> statement-breakpoint
ALTER TABLE `power_sources` ADD `alertVoltageMax` float;--> statement-breakpoint
ALTER TABLE `power_sources` ADD `alertBatteryMin` float;--> statement-breakpoint
ALTER TABLE `power_sources` ADD `alertBatteryMax` float;--> statement-breakpoint
ALTER TABLE `power_sources` ADD `alertCurrentMax` float;--> statement-breakpoint
ALTER TABLE `power_sources` ADD `alertLoadMax` float;--> statement-breakpoint
ALTER TABLE `power_sources` ADD `alertAcFailEnabled` boolean DEFAULT false NOT NULL;