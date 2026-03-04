-- =============================================================================
--  FiberDoc — Correcção de Migração: coluna alarmStatus em snmp_readings
--  Versão: 6.5.4-hotfix
--  Compatível com: MySQL 5.7+, MySQL 8.0+, MariaDB 10.1+
--
--  Problema: A tabela snmp_readings existe mas sem a coluna alarmStatus.
--  Solução:  Adicionar a coluna de forma segura (verifica antes de adicionar).
--
--  Como executar no servidor de produção:
--    mysql -h HOST -P PORTA -u USER -pSENHA DBNAME < fix-snmp-readings.sql
--
--  Exemplo:
--    mysql -h localhost -P 3306 -u fiberdoc -pSUASENHA fiberdoc_db < fix-snmp-readings.sql
-- =============================================================================

-- Usar procedure para verificar e adicionar coluna de forma segura
DROP PROCEDURE IF EXISTS fiberdoc_add_alarm_status;

DELIMITER $$
CREATE PROCEDURE fiberdoc_add_alarm_status()
BEGIN
  -- Verificar se a coluna alarmStatus já existe
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'snmp_readings'
      AND COLUMN_NAME  = 'alarmStatus'
  ) THEN
    ALTER TABLE `snmp_readings`
      ADD COLUMN `alarmStatus` varchar(64) NULL;
    SELECT 'OK: Coluna alarmStatus adicionada com sucesso.' AS resultado;
  ELSE
    SELECT 'INFO: Coluna alarmStatus já existe — nenhuma alteração necessária.' AS resultado;
  END IF;
END$$
DELIMITER ;

-- Executar a procedure
CALL fiberdoc_add_alarm_status();

-- Limpar a procedure temporária
DROP PROCEDURE IF EXISTS fiberdoc_add_alarm_status;

-- Confirmar estrutura final da tabela
SELECT
  COLUMN_NAME        AS coluna,
  COLUMN_TYPE        AS tipo,
  IS_NULLABLE        AS nulo,
  COLUMN_DEFAULT     AS padrao
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'snmp_readings'
ORDER BY ORDINAL_POSITION;
