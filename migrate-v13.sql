-- =============================================================================
--  FiberDoc v5.95 — Migração v13
--  Criação das tabelas de Grupos/Pastas do Mapa e tabelas de associação
--  (map_groups, map_element_groups, map_route_groups, map_pole_groups, map_reserve_groups)
--  Seguro para re-execução (usa IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
-- =============================================================================

-- Tabela principal de grupos/pastas
CREATE TABLE IF NOT EXISTS `map_groups` (
  `id`          int          NOT NULL AUTO_INCREMENT,
  `name`        varchar(128) NOT NULL,
  `color`       varchar(16)  NOT NULL DEFAULT '#6366f1',
  `description` text         DEFAULT NULL,
  `createdAt`   timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`   timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `parentId`    int          DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Associação de Elementos de Mapa (CTO/CEO) a Grupos
CREATE TABLE IF NOT EXISTS `map_element_groups` (
  `id`        int NOT NULL AUTO_INCREMENT,
  `elementId` int NOT NULL,
  `groupId`   int NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Associação de Rotas/Cabos a Grupos
CREATE TABLE IF NOT EXISTS `map_route_groups` (
  `id`      int NOT NULL AUTO_INCREMENT,
  `routeId` int NOT NULL,
  `groupId` int NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Associação de Postes a Grupos
CREATE TABLE IF NOT EXISTS `map_pole_groups` (
  `id`      int NOT NULL AUTO_INCREMENT,
  `poleId`  int NOT NULL,
  `groupId` int NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Associação de Reservas Técnicas a Grupos
CREATE TABLE IF NOT EXISTS `map_reserve_groups` (
  `id`        int NOT NULL AUTO_INCREMENT,
  `reserveId` int NOT NULL,
  `groupId`   int NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Garantir coluna parentId caso a tabela já existisse sem ela
ALTER TABLE `map_groups` ADD COLUMN IF NOT EXISTS `parentId` int DEFAULT NULL;
