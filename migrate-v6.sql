-- =============================================================================
--  FiberDoc v6.0 — Migração Incremental
--  Novas tabelas: bandejas CEO, splitters, vias de splitter, associações de vias
--  Alteração: coluna bandejaId em ceo_tubes
--
--  Execute este script UMA VEZ na base de dados de produção:
--    mysql -u USER -p DBNAME < migrate-v6.sql
--
--  O script é idempotente: verifica a existência das tabelas antes de criar.
-- =============================================================================

-- ── 1. Tabela ceo_bandejas ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ceo_bandejas` (
  `id`        int AUTO_INCREMENT NOT NULL,
  `ceoId`     int NOT NULL,
  `number`    int NOT NULL,
  `label`     varchar(64),
  `notes`     text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `ceo_bandejas_id` PRIMARY KEY(`id`)
);

-- ── 2. Tabela ceo_splitters ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ceo_splitters` (
  `id`                  int AUTO_INCREMENT NOT NULL,
  `ceoId`               int NOT NULL,
  `bandejaId`           int NOT NULL,
  `identifier`          varchar(64) NOT NULL,
  `ceo_splitter_type`   enum('balanced','unbalanced') NOT NULL DEFAULT 'balanced',
  `ratio`               varchar(32) NOT NULL,
  `notes`               text,
  `createdAt`           timestamp NOT NULL DEFAULT (now()),
  `updatedAt`           timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `ceo_splitters_id` PRIMARY KEY(`id`)
);

-- ── 3. Tabela ceo_splitter_vias ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ceo_splitter_vias` (
  `id`          int AUTO_INCREMENT NOT NULL,
  `splitterId`  int NOT NULL,
  `ceoId`       int NOT NULL,
  `viaNumber`   int NOT NULL,
  `label`       varchar(64),
  `lossDb`      float,
  `notes`       text,
  `createdAt`   timestamp NOT NULL DEFAULT (now()),
  `updatedAt`   timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `ceo_splitter_vias_id` PRIMARY KEY(`id`)
);

-- ── 4. Tabela ceo_via_associations ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ceo_via_associations` (
  `id`                    int AUTO_INCREMENT NOT NULL,
  `ceoId`                 int NOT NULL,
  `ceo_assoc_source_type` enum('tube','splitter') NOT NULL,
  `sourceViaId`           int NOT NULL,
  `ceo_assoc_target_type` enum('tube','splitter') NOT NULL,
  `targetViaId`           int NOT NULL,
  `notes`                 text,
  `createdAt`             timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `ceo_via_associations_id` PRIMARY KEY(`id`)
);

-- ── 5. Adicionar coluna bandejaId à tabela ceo_tubes (se não existir) ────────
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'ceo_tubes'
    AND COLUMN_NAME  = 'bandejaId'
);

SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `ceo_tubes` ADD COLUMN `bandejaId` int NULL',
  'SELECT "coluna bandejaId já existe em ceo_tubes" AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =============================================================================
--  Migração v6.0 concluída.
-- =============================================================================
