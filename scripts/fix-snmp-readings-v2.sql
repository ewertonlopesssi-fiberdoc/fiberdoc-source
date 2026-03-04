-- =============================================================================
--  FiberDoc — Correcção de Migração v2: tabela snmp_readings
--  Versão: 6.5.4-hotfix-2
--  Compatível com: MySQL 5.7+, MySQL 8.0+, MariaDB 10.1+
--
--  Problema 1: coluna alarmStatus em falta (corrigido no fix anterior)
--  Problema 2: coluna collectedAt é bigint sem DEFAULT em vez de
--              timestamp NOT NULL DEFAULT (now())
--
--  Como executar:
--    mysql -h localhost -P 3306 -u fiberdoc -pSENHA fiberdoc < fix-snmp-readings-v2.sql
-- =============================================================================

DROP PROCEDURE IF EXISTS fiberdoc_fix_snmp_readings;

DELIMITER $$
CREATE PROCEDURE fiberdoc_fix_snmp_readings()
BEGIN
  DECLARE col_type VARCHAR(64);
  DECLARE col_default VARCHAR(64);

  -- ── 1. Corrigir alarmStatus (caso ainda não tenha sido aplicado) ──────────
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'snmp_readings'
      AND COLUMN_NAME  = 'alarmStatus'
  ) THEN
    ALTER TABLE `snmp_readings`
      ADD COLUMN `alarmStatus` varchar(64) NULL;
    SELECT 'OK: Coluna alarmStatus adicionada.' AS resultado;
  ELSE
    SELECT 'INFO: alarmStatus já existe.' AS resultado;
  END IF;

  -- ── 2. Corrigir collectedAt: converter bigint → timestamp com DEFAULT ─────
  SELECT COLUMN_TYPE INTO col_type
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'snmp_readings'
    AND COLUMN_NAME  = 'collectedAt';

  IF col_type LIKE '%bigint%' OR col_type LIKE '%int%' THEN
    -- Converter: bigint (milissegundos epoch) → timestamp
    -- Primeiro adicionar coluna temporária
    ALTER TABLE `snmp_readings`
      ADD COLUMN `collectedAt_new` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;

    -- Converter valores existentes (milissegundos → timestamp)
    UPDATE `snmp_readings`
      SET `collectedAt_new` = FROM_UNIXTIME(`collectedAt` / 1000)
      WHERE `collectedAt` > 0;

    -- Remover coluna antiga e renomear nova
    ALTER TABLE `snmp_readings`
      DROP COLUMN `collectedAt`,
      CHANGE COLUMN `collectedAt_new` `collectedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;

    SELECT 'OK: collectedAt convertido de bigint para timestamp com DEFAULT.' AS resultado;
  ELSE
    -- Apenas garantir que tem DEFAULT CURRENT_TIMESTAMP
    ALTER TABLE `snmp_readings`
      MODIFY COLUMN `collectedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;
    SELECT CONCAT('OK: collectedAt (', col_type, ') actualizado com DEFAULT CURRENT_TIMESTAMP.') AS resultado;
  END IF;

END$$
DELIMITER ;

CALL fiberdoc_fix_snmp_readings();
DROP PROCEDURE IF EXISTS fiberdoc_fix_snmp_readings;

-- Confirmar estrutura final
SELECT
  COLUMN_NAME    AS coluna,
  COLUMN_TYPE    AS tipo,
  IS_NULLABLE    AS nulo,
  COLUMN_DEFAULT AS padrao,
  EXTRA          AS extra
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'snmp_readings'
ORDER BY ORDINAL_POSITION;
