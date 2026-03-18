-- FiberDoc v18 — Campo txPowerDbm por porta (override)
-- Adiciona coluna txPowerDbm na tabela ports
-- Se null, o sistema usa o txPowerDbm do equipamento (OLT/Switch) como fallback
ALTER TABLE ports
  ADD COLUMN IF NOT EXISTS txPowerDbm FLOAT NULL
  COMMENT 'Override da potência TX desta porta em dBm. Se NULL, usa txPowerDbm do equipamento.';
