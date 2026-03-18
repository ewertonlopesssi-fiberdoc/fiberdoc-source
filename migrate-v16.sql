-- ─── Migração v16: Vinculação de portas DGO ──────────────────────────────────
-- Adiciona rastreabilidade por porta individual no DGO:
--   bandeja → tubo (livre ou de CEO) → porta → CEO passagem + equipamento (OLT/switch)

-- 1. Adicionar colunas tubeId e tubeElementId na tabela dgo_slot_cable_links
--    (tubo do cabo vinculado à bandeja — opcional, pode ser livre)
ALTER TABLE dgo_slot_cable_links
  ADD COLUMN IF NOT EXISTS tubeId        INT NULL COMMENT 'FK ceo_tubes.id (tubo do cabo nesta bandeja, opcional)',
  ADD COLUMN IF NOT EXISTS tubeElementId INT NULL COMMENT 'FK map_elements.id do CEO/CTO de onde vem o tubo (opcional)';

-- 2. Criar tabela dgo_port_links para rastreabilidade por porta individual
CREATE TABLE IF NOT EXISTS dgo_port_links (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  dgoElementId   INT NOT NULL COMMENT 'FK map_dgo_elements.id',
  slotId         INT NOT NULL COMMENT 'FK equipment_slots.id (bandeja)',
  portNumber     INT NOT NULL COMMENT 'Número da porta dentro da bandeja (1..N)',
  ceoElementId   INT NULL     COMMENT 'FK map_elements.id (CEO de passagem, opcional)',
  portId         INT NULL     COMMENT 'FK ports.id (porta do equipamento: OLT, switch, etc.)',
  notes          TEXT,
  createdAt      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_dgo_port (dgoElementId, slotId, portNumber),
  KEY idx_dgo_port_dgo (dgoElementId),
  KEY idx_dgo_port_slot (slotId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Rastreabilidade por porta individual do DGO: CEO passagem + equipamento conectado';
