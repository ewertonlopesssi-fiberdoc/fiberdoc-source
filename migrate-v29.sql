-- migrate-v29: metragem medida por cabo
--
-- Ate aqui o comprimento de um cabo era sempre o do traco desenhado no mapa,
-- ou -- quando nao havia traco -- a linha recta entre as duas pontas. Nenhum
-- dos dois e o que existe no poste: um cabo sobe, desce, contorna, e a fibra
-- que o OTDR mede e sempre mais do que a distancia no mapa.
--
-- Isso importa porque o balanco optico multiplica esta distancia pela atenuacao
-- da fibra. Subestimar o comprimento subestima a perda, e o resultado sai
-- OPTIMISTA -- a mesma direccao errada de todos os defeitos deste dia.
--
-- `length_meters_override` guarda o valor medido em campo. Quando esta
-- preenchido ganha ao traco; quando esta a NULL nada muda, e o calculo continua
-- exactamente como estava.
--
-- A reserva tecnica NAO entra aqui: ja e modelada em `map_technical_reserves`,
-- por elemento do mapa, e o rastreio ja a soma. Sao coisas diferentes -- a
-- reserva e fibra enrolada num ponto, isto e o comprimento do lanco.

ALTER TABLE `map_routes`
  ADD COLUMN IF NOT EXISTS `length_meters_override` FLOAT NULL
  COMMENT 'Metragem medida em campo, em metros. NULL = usar o traco do mapa.';
