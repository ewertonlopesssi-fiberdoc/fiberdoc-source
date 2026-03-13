-- ============================================================
-- Migração: Suporte a grupos para OLTs
-- Versão: ef013e48
-- Data: 2026-03-13
-- Descrição: Cria a tabela map_olt_groups que permite associar
--            elementos OLT (mapOltElements) a grupos/pastas do
--            mapa de infraestrutura, completando o suporte
--            bidirecional de todos os tipos de elementos.
-- ============================================================

CREATE TABLE IF NOT EXISTS `map_olt_groups` (
  `id`        INT NOT NULL AUTO_INCREMENT,
  `olt_id`    INT NOT NULL,
  `group_id`  INT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_olt_group` (`olt_id`, `group_id`),
  CONSTRAINT `fk_olt_groups_olt`
    FOREIGN KEY (`olt_id`)
    REFERENCES `map_olt_elements` (`id`)
    ON DELETE CASCADE,
  CONSTRAINT `fk_olt_groups_group`
    FOREIGN KEY (`group_id`)
    REFERENCES `map_groups` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
