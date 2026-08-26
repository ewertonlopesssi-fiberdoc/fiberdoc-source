-- =============================================================================
--  FiberDoc — Migração v23
--  Grupo do mapa pode ser um projeto
--
--  Um projeto FTTH é, na prática, um conjunto nomeado de itens do mapa: os
--  CTOs, CEOs, cabos, postes e reservas de uma expansão. Isso é exatamente o
--  que `map_groups` já é — com hierarquia, cor e as seis tabelas de associação
--  que já existem. Criar uma segunda tabela significaria dois lugares para
--  adicionar o mesmo CTO, dois filtros no menu Camadas e duas árvores no
--  painel, com a certeza de que um dia divergiriam.
--
--  Por isso um campo, e não uma entidade nova. O que o campo liga é a leitura:
--  um grupo marcado como projeto passa a exibir o percentual implantado do
--  seu próprio conjunto, calculado do `projectStatus` dos membros (v22), em
--  vez do número global que hoje aparece no canto do mapa.
--
--  O padrão é 0. Todos os grupos existentes continuam sendo grupos comuns e
--  nada na tela muda para quem não usar projetos.
--
--  Seguro para re-execução (IF NOT EXISTS).
-- =============================================================================

ALTER TABLE `map_groups`
  ADD COLUMN IF NOT EXISTS `isProject` TINYINT(1) NOT NULL DEFAULT 0;

-- O painel lateral separa projetos de grupos comuns a cada abertura do mapa,
-- e essa é a única consulta que filtra por esta coluna.
CREATE INDEX IF NOT EXISTS `idx_map_groups_is_project` ON `map_groups` (`isProject`);
