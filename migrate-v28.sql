-- migrate-v28: parametros opticos configuraveis
--
-- Ate aqui a atenuacao da fibra e a perda por fusao viviam em dois sitios que
-- nunca se encontravam:
--
--   map_olt_elements.fiberAttenuationDbPerKm / .fusionLossDb
--     Configuraveis por OLT, com ecra proprio. LIDAS POR NINGUEM: o unico ramo
--     que as le exige `foundOlt`, que exige uma linha em olt_port_fiber_links
--     -- tabela com ZERO linhas nos seis bancos (medido a 28/08/2026).
--
--   0.35 e 0.1, literais, no db.ts
--     Por onde passam TODOS os balancos que de facto funcionam, porque o ecra
--     chama calculateOpticalBalanceFromDgo, que chama o balanco com
--     overrideTxPowerDbm.
--
-- Agora ha um valor global aqui, lido em todos os ramos; o da OLT continua a
-- ganhar-lhe quando existir, para troços com fibra diferente.
--
-- INSERT IGNORE, nao INSERT ... ON DUPLICATE KEY UPDATE: este ficheiro volta a
-- correr em cada actualizacao (o laco do updater percorre todos os migrate-v*),
-- e um UPDATE aqui reescreveria em silencio, a cada update, o valor que alguem
-- tivesse escolhido. Semear uma vez e semear; semear sempre e mandar.
--
-- Os valores sao exactamente os literais que estavam no codigo, para que isto
-- nao mexa em nenhum numero ja apresentado.
--
-- perdaPorConectorDb fica definido mas NAO e somado em lado nenhum: o conector
-- pertence a uma porta de saida concreta e so conta se existir mesmo ali, e
-- esse dado por porta ainda nao existe no modelo.

INSERT IGNORE INTO `app_settings` (`key`, `value`) VALUES (
  'optica_parametros',
  '{"atenuacaoDbPorKm":0.35,"perdaPorFusaoDb":0.1,"perdaPorConectorDb":0.3,"potenciaTxPadraoDbm":5.0}'
);
