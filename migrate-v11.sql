-- migrate-v11.sql: Associações de Vias CTO (tubo ↔ splitter)
-- Permite associar vias de tubos CTO a vias de splitters CTO (e vice-versa),
-- espelhando o mecanismo de ceo_via_associations para CTOs.
CREATE TABLE IF NOT EXISTS `cto_via_associations` (
  `id` int AUTO_INCREMENT NOT NULL,
  `ctoId` int NOT NULL,
  `cto_assoc_source_type` enum('tube','splitter') NOT NULL,
  `sourceViaId` int NOT NULL,
  `cto_assoc_target_type` enum('tube','splitter') NOT NULL,
  `targetViaId` int NOT NULL,
  `notes` text,
  `cto_assoc_created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `cto_via_associations_id` PRIMARY KEY(`id`)
);
