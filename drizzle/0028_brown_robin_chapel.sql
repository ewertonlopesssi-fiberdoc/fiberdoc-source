ALTER TABLE `power_sources` ADD `snmpVoltageDivisor` float DEFAULT 1;--> statement-breakpoint
ALTER TABLE `power_sources` ADD `snmpCurrentDivisor` float DEFAULT 1;--> statement-breakpoint
ALTER TABLE `power_sources` ADD `snmpTempDivisor` float DEFAULT 1;--> statement-breakpoint
ALTER TABLE `power_sources` ADD `snmpBatteryDivisor` float DEFAULT 1;