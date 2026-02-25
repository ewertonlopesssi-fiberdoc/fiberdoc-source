# Sistema de Gestão de Infraestrutura de Rede Óptica - TODO

## Schema e Banco de Dados
- [x] Tabela de equipamentos (switches, OLTs, DGOs, etc.)
- [x] Tabela de fibras ópticas
- [x] Tabela de portas por equipamento
- [x] Tabela de conexões entre portas
- [x] Tabela de histórico de alterações e manutenções
- [x] Tabela de salas/localizações
- [x] Tabela equipment_slots (id, equipmentId, slotNumber, label, portType, speed, totalPorts, notes)
- [x] Campo slotId (nullable) na tabela ports

## Backend (tRPC Procedures)
- [x] CRUD de equipamentos
- [x] CRUD de fibras
- [x] CRUD de portas
- [x] CRUD de conexões
- [x] CRUD de histórico/manutenções
- [x] CRUD de salas/localizações
- [x] Busca e filtragem de equipamentos
- [x] Busca e filtragem de fibras
- [x] Estatísticas de ocupação (dashboard)
- [x] Topologia de conexões
- [x] Procedures tRPC: slots.byEquipment, slots.create, slots.update, slots.delete
- [x] bulkCreatePorts com suporte a slotId

## Frontend - Layout e Design
- [x] Design system: paleta de cores, tipografia, tokens
- [x] DashboardLayout com sidebar de navegação
- [x] Tema escuro elegante com acentos em azul/ciano

## Frontend - Páginas
- [x] Dashboard com estatísticas e gráficos
- [x] Página de Equipamentos (listagem, cadastro, edição)
- [x] Página de Fibras Ópticas (listagem, cadastro, edição)
- [x] Página de Portas por Equipamento com abas por slot
- [x] Modal de criação/edição de slot com nome, tipo de porta e quantidade
- [x] Criação em lote com seleção de slot de destino
- [x] Página de Conexões (mapeamento visual)
- [x] Topologia de racks 44U com equipamentos posicionados por rack/posição U
- [x] Painel de detalhes ao clicar no equipamento na topologia
- [x] Filtro por sala na topologia
- [x] Página de Histórico e Manutenções
- [x] Página de Salas/Localizações
- [x] Sistema de busca e filtragem global

## Importação em Massa via CSV
- [x] Procedure tRPC para importação em lote de equipamentos
- [x] Procedure tRPC para importação em lote de fibras
- [x] Página de Importação com upload de arquivo CSV
- [x] Preview dos dados antes de confirmar importação
- [x] Validação de campos obrigatórios e tipos
- [x] Relatório de erros por linha
- [x] Templates CSV para download
- [x] Integração com menu de navegação

## Portas de Alta Velocidade (100G/40G)
- [x] Tipos qsfp28 (100G), qsfp_plus_40g (40G), cfp/cfp2/cfp4 (100G), qsfp_dd (400G)
- [x] Campo speed nas portas (1G, 10G, 25G, 40G, 100G, 400G)
- [x] Destaque visual para portas de alta velocidade
- [x] Template CSV atualizado com novos tipos

## Testes
- [x] 37 testes unitários passando (auth, fiber_doc, import)
- [x] Validação de formulários

## Módulo CEO (Caixa de Emenda Óptica)
- [x] Tabela ceos (id, name, location, roomId, notes, createdAt, updatedAt)
- [x] Tabela ceo_tubes (id, ceoId, type: tube|splitter, identifier, totalVias, notes)
- [x] Tabela ceo_vias (id, tubeId, viaNumber, label, fusedToViaId, fusedToTubeId, notes)
- [x] Gerar e aplicar migration SQL
- [x] Helpers de DB para CEOs, tubos e vias
- [x] Procedures tRPC: ceos.list, ceos.create, ceos.update, ceos.delete, ceos.byId
- [x] Procedures tRPC: ceoTubes.byCEO, ceoTubes.create, ceoTubes.update, ceoTubes.delete
- [x] Procedures tRPC: ceoVias.byTube, ceoVias.setFusion, ceoVias.clearFusion
- [x] Página de listagem/cadastro de CEOs com filtro por sala
- [x] Página de detalhes do CEO com abas por tubo/splitter
- [x] Grid de vias por tubo com status de fusão
- [x] Dialog de identificação de fusão: selecionar tubo destino + número da via
- [x] Navegação no menu lateral
- [x] Testes unitários para o módulo CEO

## Impressão do Mapa de Fusões (CEO)
- [x] Estilos CSS de impressão (@media print) no index.css
- [x] Componente CeoFusionMap.tsx com layout imprimível (tabela por tubo, vias e fusões)
- [x] Botão "Imprimir Mapa" na página de detalhes do CEO
- [x] Cabeçalho do relatório com nome da CEO, data e localização
- [x] Tabela de cada tubo/splitter com colunas: Via, Etiqueta, Fusão, Observações
- [x] Rodapé com data de geração e nome do sistema

## Correções e Melhorias CEO
- [x] Mover botões editar/excluir para dentro de cada aba (aparecer apenas no tubo ativo)
- [x] Implementar associação de via a fibra óptica (dialog de seleção de fibra por via)
- [x] Exibir fibra associada no card da via

## Fusão Bidirecional (CEO)
- [x] setViaFusion grava nos dois sentidos (VIA A → VIA B e VIA B → VIA A)
- [x] clearViaFusion remove a fusão nos dois sentidos

## Impressão Mapa de Fusões (Atualização)
- [ ] Layout espelhado: pares de tubos lado a lado com setas bidirecionais
- [ ] Tabela com colunas: VIA (tubo A) | Etiqueta | ↔ | Etiqueta | VIA (tubo B)
- [ ] Resumo de ocupação por tubo no cabeçalho de cada bloco
- [ ] Vias sem fusão exibidas com traço (—) em cinza

## Controle de Acesso por Grupo
- [x] adminProcedure no backend (bloqueia role != admin)
- [x] Router de gerenciamento de usuários (listar, alterar role, remover)
- [x] Proteger todas as mutations com adminProcedure
- [x] Página de Usuários acessível apenas para admins
- [x] Badge de papel (Admin/Visualizador) no menu lateral
- [x] Botões de criar/editar/excluir ocultos para visualizadores
- [x] Testes unitários para o controle de acesso

## Módulo de Backup e Atualização
- [x] Procedure exportBackup: exporta todos os dados (salas, equipamentos, fibras, portas, conexões, CEOs, tubos, vias) em JSON
- [x] Procedure importBackup: restaura dados a partir de um JSON de backup (merge seguro, sem apagar dados existentes)
- [x] Página de Backup & Atualização (apenas admin)
- [x] Seção de Backup: botão de download do JSON completo com data/hora
- [x] Seção de Restauração: upload de arquivo JSON com preview e confirmação
- [x] Seção de Atualização: instruções claras do fluxo seguro via Publish do Manus
- [x] Histórico de backups gerados (data, tamanho, usuário)
- [x] Item no menu lateral (apenas admin)
- [x] Testes unitários para as procedures de backup
