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
