-- ============================================================
-- migrate-v25: alinhar tenants com o modelo (colunas divergentes)
-- ============================================================
--
-- Encontrado pelo conferir-schema.mjs depois de a migrate-v24 limpar o banco
-- principal. Duas famílias de problema, ambas nos tenants e nenhuma no
-- principal -- que é justamente porque nunca ninguém deu por elas.
--
-- 1. map_pole_groups e map_reserve_groups têm a MESMA tabela com nomes de
--    coluna diferentes conforme o banco:
--
--      fiberdoc                id, pole_id,  group_id, created_at
--      os cinco tenants        id, poleId,   groupId
--
--    O drizzle/schema.ts diz pole_id/group_id. Está certo para o principal e
--    errado para os cinco, portanto qualquer leitura destas tabelas pelo
--    Drizzle falha lá -- inclusive o getProjectSummaries, que conta postes e
--    reservas por grupo. A percentagem de projeto do Mapa 2.0 estava partida
--    nos tenants. Aqui renomeiam-se as colunas para o nome do principal, e
--    não o contrário: o modelo fica com um nome só e o principal não se mexe.
--
--    created_at fica de fora de propósito. O modelo não a declara, portanto
--    não faz falta a ninguém, e acrescentar coluna é mais arriscado do que
--    alinhar nomes.
--
-- 2. Quatro colunas que só existem em schema-base.sql -- o ficheiro que corre
--    quando um tenant é criado. Os dois tenants mais antigos são anteriores a
--    elas e nada as acrescentava depois. São copiadas aqui tal e qual.
--
-- Tudo é idempotente: CHANGE IF EXISTS e ADD IF NOT EXISTS (sintaxe MariaDB,
-- já usada no schema-base). Correr duas vezes não dá erro, o que importa
-- porque o atualizador reaplica todas as migrações a cada release.

-- ── 1. Nomes de coluna dos grupos de postes e reservas ───────────────────────
ALTER TABLE `map_pole_groups`
  CHANGE IF EXISTS `poleId`  `pole_id`  int NOT NULL;
ALTER TABLE `map_pole_groups`
  CHANGE IF EXISTS `groupId` `group_id` int NOT NULL;

ALTER TABLE `map_reserve_groups`
  CHANGE IF EXISTS `reserveId` `reserve_id` int NOT NULL;
ALTER TABLE `map_reserve_groups`
  CHANGE IF EXISTS `groupId`   `group_id`   int NOT NULL;

-- ── 2. Colunas que ficaram só no schema-base ─────────────────────────────────
ALTER TABLE `ceo_vias` ADD IF NOT EXISTS `fusedToSplitterId` int;
ALTER TABLE `ceo_vias` ADD IF NOT EXISTS `fusedToSplitterViaId` int;

ALTER TABLE `cto_tubes` ADD IF NOT EXISTS `cto_splitter_type` enum('balanced','unbalanced') DEFAULT 'balanced';
ALTER TABLE `cto_tubes` ADD IF NOT EXISTS `ratio` varchar(32);
