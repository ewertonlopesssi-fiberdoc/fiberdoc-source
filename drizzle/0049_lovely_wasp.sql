ALTER TABLE `bgp_peers` ADD `peer_ipv6` varchar(64);--> statement-breakpoint
ALTER TABLE `bgp_peers` ADD `activate_script_v6` text;--> statement-breakpoint
ALTER TABLE `bgp_peers` ADD `deactivate_script_v6` text;