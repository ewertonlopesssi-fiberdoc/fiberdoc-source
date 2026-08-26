-- =============================================================================
--  FiberDoc — Migração v22
--  Ciclo de vida de projeto por elemento
--
--  O campo `status` que já existe nessas tabelas é OPERACIONAL: diz se o
--  elemento está funcionando (active / inactive / maintenance). Não diz em que
--  ponto do projeto ele está.
--
--  `projectStatus` é essa segunda dimensão, e é o que permite ao mapa mostrar
--  o que está apenas projetado, o que já foi implantado e o que falta — e daí
--  calcular o percentual de implantação de um projeto.
--
--    planned    Em projeto     — desenhado, ainda não existe em campo
--    pending    Não implantado — aprovado, aguardando execução
--    deployed   Implantado     — instalado em campo
--    certified  Certificado    — instalado e medido/aceito
--
--  O padrão é `deployed` de propósito: tudo o que já está cadastrado hoje
--  existe em campo, senão não teria sido documentado. Assim nenhum dado
--  existente muda de significado ao aplicar esta migração.
--
--  Seguro para re-execução (IF NOT EXISTS).
-- =============================================================================

ALTER TABLE `ceos`
  ADD COLUMN IF NOT EXISTS `projectStatus` VARCHAR(16) NOT NULL DEFAULT 'deployed';

ALTER TABLE `ctos`
  ADD COLUMN IF NOT EXISTS `projectStatus` VARCHAR(16) NOT NULL DEFAULT 'deployed';

ALTER TABLE `map_routes`
  ADD COLUMN IF NOT EXISTS `projectStatus` VARCHAR(16) NOT NULL DEFAULT 'deployed';

ALTER TABLE `map_poles`
  ADD COLUMN IF NOT EXISTS `projectStatus` VARCHAR(16) NOT NULL DEFAULT 'deployed';

ALTER TABLE `map_technical_reserves`
  ADD COLUMN IF NOT EXISTS `projectStatus` VARCHAR(16) NOT NULL DEFAULT 'deployed';

-- Índices: o filtro por estado de projeto é a consulta que a tela do mapa fará
-- com mais frequência, e sem índice ela varre a tabela inteira.
CREATE INDEX IF NOT EXISTS `idx_ceos_project_status` ON `ceos` (`projectStatus`);
CREATE INDEX IF NOT EXISTS `idx_ctos_project_status` ON `ctos` (`projectStatus`);
CREATE INDEX IF NOT EXISTS `idx_map_routes_project_status` ON `map_routes` (`projectStatus`);
CREATE INDEX IF NOT EXISTS `idx_map_poles_project_status` ON `map_poles` (`projectStatus`);
CREATE INDEX IF NOT EXISTS `idx_map_reserves_project_status` ON `map_technical_reserves` (`projectStatus`);
