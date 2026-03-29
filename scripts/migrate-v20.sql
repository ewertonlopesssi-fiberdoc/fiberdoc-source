-- migrate-v20.sql
-- Estende o enum entity_type da tabela maintenance_history para incluir ceo, cto e cable
ALTER TABLE `maintenance_history`
  MODIFY COLUMN `entity_type` enum('equipment','fiber','port','connection','room','ceo','cto','cable') NOT NULL;
