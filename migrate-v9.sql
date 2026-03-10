-- ── Migração v9.0 — FiberDoc ─────────────────────────────────────────────────
-- Adiciona colunas em falta e corrige tipos na tabela network_snmp_ports
-- Seguro executar múltiplas vezes (IF NOT EXISTS / MODIFY idempotente)
-- Gerado em: 2026-03-10
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Adicionar coluna ifAlias (se não existir)
ALTER TABLE `network_snmp_ports`
  ADD COLUMN IF NOT EXISTS `ifAlias` varchar(128) AFTER `ifName`;

-- 2. Corrigir ifSpeed: INT → BIGINT (necessário para valores 0xFFFFFFFF = 4294967295)
ALTER TABLE `network_snmp_ports`
  MODIFY COLUMN `ifSpeed` bigint;

-- 3. Corrigir lastInOctets: INT → BIGINT (necessário para contadores HC 64-bit)
ALTER TABLE `network_snmp_ports`
  MODIFY COLUMN `lastInOctets` bigint;

-- 4. Corrigir lastOutOctets: INT → BIGINT (necessário para contadores HC 64-bit)
ALTER TABLE `network_snmp_ports`
  MODIFY COLUMN `lastOutOctets` bigint;

-- 5. Adicionar equipmentId à tabela network_port_readings (se não existir)
ALTER TABLE `network_port_readings`
  ADD COLUMN IF NOT EXISTS `equipmentId` int AFTER `portId`;

-- ── Fim da migração v9.0 ─────────────────────────────────────────────────────
