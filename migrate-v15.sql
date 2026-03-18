-- migrate-v15.sql: Tubos extras por cabo (múltiplos tubos de origem/destino)
-- Criado em: 2026-03-16
-- Descrição: Permite associar mais de um tubo de origem ou destino ao mesmo cabo,
--            sem alterar a lógica do balanço óptico estimado (fromTubeId/toTubeId intactos).

CREATE TABLE IF NOT EXISTS route_extra_tubes (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  routeId       INT NOT NULL,
  elementId     INT NOT NULL,
  tubeId        INT NOT NULL,
  side          ENUM('from','to') NOT NULL,
  notes         TEXT,
  createdAt     TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  INDEX idx_route_extra_tubes_routeId (routeId),
  INDEX idx_route_extra_tubes_elementId (elementId),
  INDEX idx_route_extra_tubes_tubeId (tubeId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
