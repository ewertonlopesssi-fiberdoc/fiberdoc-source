-- =============================================================================
--  FiberDoc — Migração v14
--  Criação das tabelas do sistema DGO (Distribuidor Geral Óptico) no Mapa
--  - map_dgo_elements: elementos DGO posicionados no mapa
--  - dgo_slot_cable_links: vinculação de bandejas DGO a cabos (rotas)
--  - map_dgo_groups: associação de DGOs a grupos/pastas do mapa
--  Seguro para re-execução (usa IF NOT EXISTS)
-- =============================================================================

-- Tabela de elementos DGO no mapa
CREATE TABLE IF NOT EXISTS `map_dgo_elements` (
  `id`                  int          NOT NULL AUTO_INCREMENT,
  `equipmentId`         int          NOT NULL,
  `lat`                 double       NOT NULL,
  `lng`                 double       NOT NULL,
  `notes`               text         DEFAULT NULL,
  `dgo_map_created_at`  timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `dgo_map_updated_at`  timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_map_dgo_equipment` (`equipmentId`),
  CONSTRAINT `fk_map_dgo_equipment`
    FOREIGN KEY (`equipmentId`) REFERENCES `equipments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tabela de vínculos entre bandejas DGO e cabos (rotas)
-- Cada bandeja (slot) representa um tubo de 12 vias; porta N = via N do cabo
CREATE TABLE IF NOT EXISTS `dgo_slot_cable_links` (
  `id`                  int          NOT NULL AUTO_INCREMENT,
  `dgoElementId`        int          NOT NULL,
  `slotId`              int          NOT NULL,
  `routeId`             int          NOT NULL,
  `dgo_link_side`       enum('in','out') NOT NULL DEFAULT 'in',
  `notes`               text         DEFAULT NULL,
  `dgo_link_created_at` timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_dgo_link_element` (`dgoElementId`),
  KEY `idx_dgo_link_slot` (`slotId`),
  KEY `idx_dgo_link_route` (`routeId`),
  CONSTRAINT `fk_dgo_link_element`
    FOREIGN KEY (`dgoElementId`) REFERENCES `map_dgo_elements` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tabela de associação de DGOs a grupos/pastas do mapa
CREATE TABLE IF NOT EXISTS `map_dgo_groups` (
  `id`        int NOT NULL AUTO_INCREMENT,
  `dgoId`     int NOT NULL,
  `groupId`   int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_map_dgo_group_dgo` (`dgoId`),
  KEY `idx_map_dgo_group_group` (`groupId`),
  CONSTRAINT `fk_map_dgo_group_dgo`
    FOREIGN KEY (`dgoId`) REFERENCES `map_dgo_elements` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_map_dgo_group_group`
    FOREIGN KEY (`groupId`) REFERENCES `map_groups` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
