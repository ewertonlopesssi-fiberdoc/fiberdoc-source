-- FiberDoc v19 — Tabela dgo_port_fiber_links
-- Vincula uma porta do DGO a um tubo de CEO (igual ao olt_port_fiber_links para OLT)
-- Permite que o calculateOpticalBalance rastreie o DGO como ponto de origem do sinal

CREATE TABLE IF NOT EXISTS dgo_port_fiber_links (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  dgoElementId    INT NOT NULL,                          -- FK map_dgo_elements.id
  portId          INT NOT NULL,                          -- FK ports.id (porta do equipamento DGO)
  txPowerDbm      FLOAT NULL,                            -- Override da potência TX desta porta (null = usa txPowerDbm do equipamento)
  ceoElementId    INT NOT NULL,                          -- FK map_elements.id (CEO onde a fibra entra)
  tubeId          INT NOT NULL,                          -- FK ceo_tubes.id
  viaNumber       INT NOT NULL,                          -- Número da via dentro do tubo
  notes           TEXT NULL,
  createdAt       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_dgo_pfl_dgoElement FOREIGN KEY (dgoElementId) REFERENCES map_dgo_elements(id) ON DELETE CASCADE,
  CONSTRAINT fk_dgo_pfl_port       FOREIGN KEY (portId)       REFERENCES ports(id)            ON DELETE CASCADE,
  CONSTRAINT fk_dgo_pfl_ceoElement FOREIGN KEY (ceoElementId) REFERENCES map_elements(id)     ON DELETE CASCADE
);
