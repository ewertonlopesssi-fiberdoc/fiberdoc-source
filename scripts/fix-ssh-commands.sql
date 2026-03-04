-- =============================================================================
--  FiberDoc — Correcção de Migração: tabela ssh_commands
--  Versão: 6.5.4-hotfix-3
--  Compatível com: MySQL 5.7+, MySQL 8.0+, MariaDB 10.1+
--
--  Problema: tabela ssh_commands tem nomes de colunas antigos (snake_case)
--  mas o código espera camelCase + coluna ssh_confirm_mode.
--
--  Mapeamento de colunas:
--    equipment_id  → equipmentId
--    command_lines → commandLines
--    sleep_ms      → sleepMs
--    confirm_mode  → ssh_confirm_mode (enum com mesmo tipo)
--    created_at    → createdAt (bigint → timestamp DEFAULT now())
--    updated_at    → updatedAt (bigint → timestamp DEFAULT now() ON UPDATE)
--    params        → mantida (já existe)
--
--  Como executar:
--    mysql -h localhost -P 3306 -u fiberdoc -pSENHA fiberdoc < fix-ssh-commands.sql
-- =============================================================================

DROP PROCEDURE IF EXISTS fiberdoc_fix_ssh_commands;

DELIMITER $$
CREATE PROCEDURE fiberdoc_fix_ssh_commands()
BEGIN

  -- ── 1. Renomear equipment_id → equipmentId ─────────────────────────────────
  IF EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ssh_commands' AND COLUMN_NAME = 'equipment_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ssh_commands' AND COLUMN_NAME = 'equipmentId'
  ) THEN
    ALTER TABLE `ssh_commands`
      CHANGE COLUMN `equipment_id` `equipmentId` int(11) NOT NULL;
    SELECT 'OK: equipment_id → equipmentId' AS resultado;
  END IF;

  -- ── 2. Renomear command_lines → commandLines ───────────────────────────────
  IF EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ssh_commands' AND COLUMN_NAME = 'command_lines'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ssh_commands' AND COLUMN_NAME = 'commandLines'
  ) THEN
    ALTER TABLE `ssh_commands`
      CHANGE COLUMN `command_lines` `commandLines` text NOT NULL;
    SELECT 'OK: command_lines → commandLines' AS resultado;
  END IF;

  -- ── 3. Renomear sleep_ms → sleepMs ────────────────────────────────────────
  IF EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ssh_commands' AND COLUMN_NAME = 'sleep_ms'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ssh_commands' AND COLUMN_NAME = 'sleepMs'
  ) THEN
    ALTER TABLE `ssh_commands`
      CHANGE COLUMN `sleep_ms` `sleepMs` int(11) NOT NULL DEFAULT 300;
    SELECT 'OK: sleep_ms → sleepMs' AS resultado;
  END IF;

  -- ── 4. Renomear confirm_mode → ssh_confirm_mode ───────────────────────────
  IF EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ssh_commands' AND COLUMN_NAME = 'confirm_mode'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ssh_commands' AND COLUMN_NAME = 'ssh_confirm_mode'
  ) THEN
    ALTER TABLE `ssh_commands`
      CHANGE COLUMN `confirm_mode`
        `ssh_confirm_mode` enum('none','auto_y','auto_n','manual') NOT NULL DEFAULT 'none';
    SELECT 'OK: confirm_mode → ssh_confirm_mode' AS resultado;
  END IF;

  -- ── 5. Converter created_at (bigint) → createdAt (timestamp) ──────────────
  IF EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ssh_commands' AND COLUMN_NAME = 'created_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ssh_commands' AND COLUMN_NAME = 'createdAt'
  ) THEN
    ALTER TABLE `ssh_commands`
      ADD COLUMN `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;
    -- Converter valores existentes (milissegundos → timestamp)
    UPDATE `ssh_commands`
      SET `createdAt` = FROM_UNIXTIME(`created_at` / 1000)
      WHERE `created_at` > 0;
    ALTER TABLE `ssh_commands`
      DROP COLUMN `created_at`;
    SELECT 'OK: created_at (bigint) → createdAt (timestamp)' AS resultado;
  END IF;

  -- ── 6. Converter updated_at (bigint) → updatedAt (timestamp) ──────────────
  IF EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ssh_commands' AND COLUMN_NAME = 'updated_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ssh_commands' AND COLUMN_NAME = 'updatedAt'
  ) THEN
    ALTER TABLE `ssh_commands`
      ADD COLUMN `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
    -- Converter valores existentes
    UPDATE `ssh_commands`
      SET `updatedAt` = FROM_UNIXTIME(`updated_at` / 1000)
      WHERE `updated_at` > 0;
    ALTER TABLE `ssh_commands`
      DROP COLUMN `updated_at`;
    SELECT 'OK: updated_at (bigint) → updatedAt (timestamp)' AS resultado;
  END IF;

  -- ── 7. Garantir que params existe com DEFAULT '[]' ─────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ssh_commands' AND COLUMN_NAME = 'params'
  ) THEN
    ALTER TABLE `ssh_commands`
      ADD COLUMN `params` text NOT NULL DEFAULT ('[]');
    SELECT 'OK: coluna params adicionada' AS resultado;
  END IF;

END$$
DELIMITER ;

CALL fiberdoc_fix_ssh_commands();
DROP PROCEDURE IF EXISTS fiberdoc_fix_ssh_commands;

-- Confirmar estrutura final
SELECT
  COLUMN_NAME    AS coluna,
  COLUMN_TYPE    AS tipo,
  IS_NULLABLE    AS nulo,
  COLUMN_DEFAULT AS padrao,
  EXTRA          AS extra
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'ssh_commands'
ORDER BY ORDINAL_POSITION;
