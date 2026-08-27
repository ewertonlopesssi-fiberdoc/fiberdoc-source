-- ============================================================
-- migrate-v24: tabelas de mapa que nunca chegaram aos tenants
-- ============================================================
--
-- Porquê existe:
--
-- 1. map_olt_groups só estava definida em migration_olt_groups.sql. O
--    atualizador aplica apenas os ficheiros migrate-v*.sql, portanto esse
--    nunca correu em lado nenhum -- o banco principal recebeu-o à mão. Os
--    seis bancos foram conferidos: a tabela existe só no principal.
--
-- 2. map_olt_elements, olt_port_fiber_links, map_pois e map_poi_groups só
--    existem em schema-base.sql, que corre quando um tenant é criado. Os
--    tenants anteriores a essas tabelas ficaram sem elas e nenhuma migração
--    as acrescentava depois. Faltam em fiberdoc_edivaldofibra e fiberdoc_ctel.
--
-- Tudo aqui é CREATE TABLE IF NOT EXISTS com as chaves estrangeiras dentro da
-- própria criação, e não em ALTER separado: assim, num banco onde a tabela já
-- existe, a instrução não faz nada e não há erro de constraint duplicada a
-- poluir a contagem do atualizador.
--
-- A ordem importa -- map_olt_elements antes de quem a referencia, map_pois
-- antes de map_poi_groups.

-- ── OLT no mapa ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `map_olt_elements` (
  `id`                      int AUTO_INCREMENT NOT NULL,
  `equipmentId`             int NOT NULL,
  `lat`                     double NOT NULL,
  `lng`                     double NOT NULL,
  `defaultTxPowerDbm`       float DEFAULT 5,
  `fiberAttenuationDbPerKm` float DEFAULT 0.35,
  `fusionLossDb`            float DEFAULT 0.1,
  `notes`                   text,
  `olt_map_created_at`      timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `olt_map_updated_at`      timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_map_olt_equipment` (`equipmentId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `olt_port_fiber_links` (
  `id`                  int AUTO_INCREMENT NOT NULL,
  `oltElementId`        int NOT NULL,
  `portId`              int NOT NULL,
  `txPowerDbm`          float,
  `ceoElementId`        int NOT NULL,
  `tubeId`              int NOT NULL,
  `viaNumber`           int NOT NULL,
  `notes`               text,
  `olt_link_created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `olt_link_updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_olt_link_element` (`oltElementId`),
  KEY `idx_olt_link_port` (`portId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Nomes de coluna em snake_case porque foi assim que a tabela nasceu no banco
-- principal; o drizzle/schema.ts foi acertado para os ler.
CREATE TABLE IF NOT EXISTS `map_olt_groups` (
  `id`       int AUTO_INCREMENT NOT NULL,
  `olt_id`   int NOT NULL,
  `group_id` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_olt_group` (`olt_id`, `group_id`),
  CONSTRAINT `fk_olt_groups_olt`
    FOREIGN KEY (`olt_id`) REFERENCES `map_olt_elements` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_olt_groups_group`
    FOREIGN KEY (`group_id`) REFERENCES `map_groups` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Pontos de interesse ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `map_pois` (
  `id`              int AUTO_INCREMENT NOT NULL,
  `name`            varchar(128) NOT NULL,
  `category`        varchar(64) NOT NULL DEFAULT 'geral',
  `lat`             double NOT NULL,
  `lng`             double NOT NULL,
  `notes`           text,
  `color`           varchar(16) DEFAULT '#6366f1',
  `poi_created_at`  timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `poi_updated_at`  timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `map_poi_groups` (
  `id`      int AUTO_INCREMENT NOT NULL,
  `poiId`   int NOT NULL,
  `groupId` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_poi_group` (`poiId`, `groupId`),
  CONSTRAINT `fk_poi_groups_poi`
    FOREIGN KEY (`poiId`) REFERENCES `map_pois` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_poi_groups_group`
    FOREIGN KEY (`groupId`) REFERENCES `map_groups` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
