-- =============================================================================
--  FiberDoc v5.96.30 — Migração v21
--  Adiciona coluna sortOrder à tabela map_groups
--  (coluna existia no schema Drizzle mas nunca foi migrada para o banco)
--  Seguro para re-execução (usa IF NOT EXISTS via COLUMN_NAME check)
-- =============================================================================
ALTER TABLE `map_groups`
  ADD COLUMN IF NOT EXISTS `sortOrder` int NOT NULL DEFAULT 0;
