-- =============================================================================
--  FiberDoc — Correcção de Migração: ssh_credentials + ssh_execution_log
--  Versão: 6.5.4-hotfix-4
--  Compatível com: MySQL 5.7+, MySQL 8.0+, MariaDB 10.1+
--
--  Mapeamento ssh_credentials:
--    equipment_id     → equipmentId
--    ssh_user         → sshUser
--    ssh_password_enc → sshPasswordEnc
--    ssh_port         → sshPort
--    ssh_key_path     → removida (não existe no schema actual)
--    created_at       → createdAt (bigint → timestamp DEFAULT now())
--    updated_at       → updatedAt (bigint → timestamp DEFAULT now() ON UPDATE)
--    notes            → adicionada (text NULL)
--
--  Mapeamento ssh_execution_log:
--    equipment_id  → equipmentId
--    command_id    → commandId
--    command_name  → commandName
--    executed_by   → executedBy
--    executed_at   → executedAt (bigint → timestamp DEFAULT now())
--    params        → adicionada (text NULL)
--
--  Como executar:
--    mysql -h localhost -P 3306 -u fiberdoc -pSENHA fiberdoc < fix-ssh-tables-v2.sql
-- =============================================================================

-- ═══════════════════════════════════════════════════════════════════════════════
--  TABELA: ssh_credentials
-- ═══════════════════════════════════════════════════════════════════════════════

DROP PROCEDURE IF EXISTS fiberdoc_fix_ssh_credentials;

DELIMITER $$
CREATE PROCEDURE fiberdoc_fix_ssh_credentials()
BEGIN

  -- 1. equipment_id → equipmentId
  IF EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ssh_credentials' AND COLUMN_NAME='equipment_id')
  AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ssh_credentials' AND COLUMN_NAME='equipmentId')
  THEN
    ALTER TABLE `ssh_credentials` CHANGE COLUMN `equipment_id` `equipmentId` int(11) NOT NULL;
    SELECT 'OK: equipment_id → equipmentId' AS resultado;
  END IF;

  -- 2. ssh_user → sshUser
  IF EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ssh_credentials' AND COLUMN_NAME='ssh_user')
  AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ssh_credentials' AND COLUMN_NAME='sshUser')
  THEN
    ALTER TABLE `ssh_credentials` CHANGE COLUMN `ssh_user` `sshUser` varchar(128) NOT NULL;
    SELECT 'OK: ssh_user → sshUser' AS resultado;
  END IF;

  -- 3. ssh_password_enc → sshPasswordEnc
  IF EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ssh_credentials' AND COLUMN_NAME='ssh_password_enc')
  AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ssh_credentials' AND COLUMN_NAME='sshPasswordEnc')
  THEN
    ALTER TABLE `ssh_credentials` CHANGE COLUMN `ssh_password_enc` `sshPasswordEnc` text NULL;
    SELECT 'OK: ssh_password_enc → sshPasswordEnc' AS resultado;
  END IF;

  -- 4. ssh_port → sshPort
  IF EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ssh_credentials' AND COLUMN_NAME='ssh_port')
  AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ssh_credentials' AND COLUMN_NAME='sshPort')
  THEN
    ALTER TABLE `ssh_credentials` CHANGE COLUMN `ssh_port` `sshPort` int(11) NOT NULL DEFAULT 22;
    SELECT 'OK: ssh_port → sshPort' AS resultado;
  END IF;

  -- 5. Remover ssh_key_path (não existe no schema actual)
  IF EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ssh_credentials' AND COLUMN_NAME='ssh_key_path')
  THEN
    ALTER TABLE `ssh_credentials` DROP COLUMN `ssh_key_path`;
    SELECT 'OK: ssh_key_path removida' AS resultado;
  END IF;

  -- 6. Adicionar notes se não existir
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ssh_credentials' AND COLUMN_NAME='notes')
  THEN
    ALTER TABLE `ssh_credentials` ADD COLUMN `notes` text NULL;
    SELECT 'OK: coluna notes adicionada' AS resultado;
  END IF;

  -- 7. created_at (bigint) → createdAt (timestamp)
  IF EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ssh_credentials' AND COLUMN_NAME='created_at')
  AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ssh_credentials' AND COLUMN_NAME='createdAt')
  THEN
    ALTER TABLE `ssh_credentials` ADD COLUMN `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;
    UPDATE `ssh_credentials` SET `createdAt` = FROM_UNIXTIME(`created_at` / 1000) WHERE `created_at` > 0;
    ALTER TABLE `ssh_credentials` DROP COLUMN `created_at`;
    SELECT 'OK: created_at → createdAt (timestamp)' AS resultado;
  END IF;

  -- 8. updated_at (bigint) → updatedAt (timestamp)
  IF EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ssh_credentials' AND COLUMN_NAME='updated_at')
  AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ssh_credentials' AND COLUMN_NAME='updatedAt')
  THEN
    ALTER TABLE `ssh_credentials` ADD COLUMN `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
    UPDATE `ssh_credentials` SET `updatedAt` = FROM_UNIXTIME(`updated_at` / 1000) WHERE `updated_at` > 0;
    ALTER TABLE `ssh_credentials` DROP COLUMN `updated_at`;
    SELECT 'OK: updated_at → updatedAt (timestamp)' AS resultado;
  END IF;

END$$
DELIMITER ;

CALL fiberdoc_fix_ssh_credentials();
DROP PROCEDURE IF EXISTS fiberdoc_fix_ssh_credentials;

-- ═══════════════════════════════════════════════════════════════════════════════
--  TABELA: ssh_execution_log
-- ═══════════════════════════════════════════════════════════════════════════════

DROP PROCEDURE IF EXISTS fiberdoc_fix_ssh_execution_log;

DELIMITER $$
CREATE PROCEDURE fiberdoc_fix_ssh_execution_log()
BEGIN

  -- 1. equipment_id → equipmentId
  IF EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ssh_execution_log' AND COLUMN_NAME='equipment_id')
  AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ssh_execution_log' AND COLUMN_NAME='equipmentId')
  THEN
    ALTER TABLE `ssh_execution_log` CHANGE COLUMN `equipment_id` `equipmentId` int(11) NOT NULL;
    SELECT 'OK: equipment_id → equipmentId (log)' AS resultado;
  END IF;

  -- 2. command_id → commandId
  IF EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ssh_execution_log' AND COLUMN_NAME='command_id')
  AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ssh_execution_log' AND COLUMN_NAME='commandId')
  THEN
    ALTER TABLE `ssh_execution_log` CHANGE COLUMN `command_id` `commandId` int(11) NULL;
    SELECT 'OK: command_id → commandId' AS resultado;
  END IF;

  -- 3. command_name → commandName
  IF EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ssh_execution_log' AND COLUMN_NAME='command_name')
  AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ssh_execution_log' AND COLUMN_NAME='commandName')
  THEN
    ALTER TABLE `ssh_execution_log` CHANGE COLUMN `command_name` `commandName` varchar(128) NOT NULL;
    SELECT 'OK: command_name → commandName' AS resultado;
  END IF;

  -- 4. executed_by → executedBy
  IF EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ssh_execution_log' AND COLUMN_NAME='executed_by')
  AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ssh_execution_log' AND COLUMN_NAME='executedBy')
  THEN
    ALTER TABLE `ssh_execution_log` CHANGE COLUMN `executed_by` `executedBy` varchar(128) NULL;
    SELECT 'OK: executed_by → executedBy' AS resultado;
  END IF;

  -- 5. Adicionar params se não existir
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ssh_execution_log' AND COLUMN_NAME='params')
  THEN
    ALTER TABLE `ssh_execution_log` ADD COLUMN `params` text NULL;
    SELECT 'OK: coluna params adicionada (log)' AS resultado;
  END IF;

  -- 6. executed_at (bigint) → executedAt (timestamp)
  IF EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ssh_execution_log' AND COLUMN_NAME='executed_at')
  AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ssh_execution_log' AND COLUMN_NAME='executedAt')
  THEN
    ALTER TABLE `ssh_execution_log` ADD COLUMN `executedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;
    UPDATE `ssh_execution_log` SET `executedAt` = FROM_UNIXTIME(`executed_at` / 1000) WHERE `executed_at` > 0;
    ALTER TABLE `ssh_execution_log` DROP COLUMN `executed_at`;
    SELECT 'OK: executed_at → executedAt (timestamp)' AS resultado;
  END IF;

END$$
DELIMITER ;

CALL fiberdoc_fix_ssh_execution_log();
DROP PROCEDURE IF EXISTS fiberdoc_fix_ssh_execution_log;

-- ── Confirmação final ─────────────────────────────────────────────────────────
SELECT '=== ssh_credentials ===' AS tabela;
SELECT COLUMN_NAME AS coluna, COLUMN_TYPE AS tipo, IS_NULLABLE AS nulo, COLUMN_DEFAULT AS padrao, EXTRA AS extra
FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ssh_credentials' ORDER BY ORDINAL_POSITION;

SELECT '=== ssh_execution_log ===' AS tabela;
SELECT COLUMN_NAME AS coluna, COLUMN_TYPE AS tipo, IS_NULLABLE AS nulo, COLUMN_DEFAULT AS padrao, EXTRA AS extra
FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ssh_execution_log' ORDER BY ORDINAL_POSITION;
