-- ============================================================
-- Script de Atualização — Postes e Reservas Técnicas
-- Sistema de Documentação de Fibras e Equipamentos
-- Gerado em: 2026-03-12
-- ============================================================
-- Execute este script no banco de dados MySQL/MariaDB do servidor
-- de produção. As instruções usam IF NOT EXISTS / IF EXISTS para
-- serem seguras em caso de re-execução.
-- ============================================================

-- 1. Tabela de Postes
CREATE TABLE IF NOT EXISTS `map_poles` (
  `id`               int          NOT NULL AUTO_INCREMENT,
  `name`             varchar(128) NOT NULL,
  `reference`        varchar(128) DEFAULT NULL,
  `effort`           varchar(64)  DEFAULT NULL,
  `lat`              double       NOT NULL,
  `lng`              double       NOT NULL,
  `notes`            text         DEFAULT NULL,
  `pole_created_at`  timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `pole_updated_at`  timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Tabela de Reservas Técnicas
CREATE TABLE IF NOT EXISTS `map_technical_reserves` (
  `id`                  int          NOT NULL AUTO_INCREMENT,
  `name`                varchar(128) NOT NULL,
  `sizeMeters`          int          NOT NULL DEFAULT 0,
  `routeId`             int          DEFAULT NULL,
  `lat`                 double       NOT NULL,
  `lng`                 double       NOT NULL,
  `notes`               text         DEFAULT NULL,
  `reserve_created_at`  timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reserve_updated_at`  timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Adicionar campo parentId na tabela map_groups (grupos hierárquicos)
--    Ignorar erro se a coluna já existir.
ALTER TABLE `map_groups`
  ADD COLUMN IF NOT EXISTS `parentId` int DEFAULT NULL;

-- ============================================================
-- Verificação final (opcional — rode para confirmar)
-- ============================================================
-- SHOW TABLES LIKE 'map_poles';
-- SHOW TABLES LIKE 'map_technical_reserves';
-- SHOW COLUMNS FROM map_groups LIKE 'parentId';
-- ============================================================
