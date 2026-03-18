-- migrate-v17.sql
-- Adiciona campo de potência TX óptica (dBm) na tabela de equipamentos.
-- Usado para OLTs e Switches com portas ópticas, permitindo que o balanço
-- óptico estimado use a potência cadastrada no equipamento quando a porta
-- estiver vinculada ao DGO.

ALTER TABLE equipments
  ADD COLUMN IF NOT EXISTS txPowerDbm FLOAT NULL COMMENT 'Potência TX óptica em dBm (ex: 5.0 para OLT GPON). Usado no cálculo do balanço óptico estimado via DGO.';
