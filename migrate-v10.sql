-- migrate-v10.sql: Adicionar campos IPv6 ao BGP Peer
ALTER TABLE `bgp_peers`
  ADD COLUMN IF NOT EXISTS `peer_ipv6` varchar(64),
  ADD COLUMN IF NOT EXISTS `activate_script_v6` text,
  ADD COLUMN IF NOT EXISTS `deactivate_script_v6` text;
