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
- [x] Layout espelhado: pares de tubos lado a lado com setas bidirecionais
- [x] Tabela com colunas: VIA (tubo A) | Etiqueta | ↔ | Etiqueta | VIA (tubo B)
- [x] Resumo de ocupação por tubo no cabeçalho de cada bloco
- [x] Vias sem fusão exibidas com traço (—) em cinza

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

## Agendamento Automático de Backup
- [x] Tabela backup_schedules (frequência, hora, dia, ativo, próxima execução)
- [x] Tabela backup_history (data, tamanho, URL S3, status, registros)
- [x] Gerar e aplicar migration SQL
- [x] Função de execução do backup agendado (gera JSON, faz upload S3, salva histórico)
- [x] Endpoint /api/backup/run-scheduled para execução pelo cron do servidor
- [x] Cron job no servidor (setInterval) para verificar e disparar backups agendados
- [x] Procedures tRPC: getSchedule, saveSchedule, getHistory, downloadBackup, deleteBackup
- [x] Seção de Agendamento na página de Backup (frequência, hora, dia da semana/mês)
- [x] Seção de Histórico de Backups com lista, tamanho, status e botão de download
- [x] Notificação ao admin após backup gerado automaticamente
- [x] Testes unitários para as procedures de agendamento

## Imagens de Equipamentos na Topologia
- [x] Campo imageUrl na tabela equipments (migration)
- [x] Upload de imagem no formulário de cadastro/edição de equipamento (S3)
- [x] Exibição da imagem do equipamento na topologia de racks
- [x] Fallback com ícone por tipo quando não há imagem

## Menu Sistema (Configurações)
- [x] Tabela system_settings no banco (chave/valor)
- [x] Migration SQL
- [x] Procedures tRPC: getSettings, saveSettings
- [x] Upload de logomarca para S3
- [x] Página de Configurações do Sistema (nome, logomarca, tema)
- [x] Seletor de temas pré-configurados (dark padrão + 3 opções)
- [x] Aplicação do tema selecionado globalmente via CSS variables
- [x] Item "Sistema" no menu lateral (apenas admin)

## Mapa de Fusões Espelhado (Impressão)
- [x] Layout lado a lado: pares de tubos em colunas espelhadas
- [x] Colunas: VIA (tubo A) | Etiqueta | ↔ | Etiqueta | VIA (tubo B)
- [x] Vias livres exibidas com traço (—) em cinza
- [x] Resumo de ocupação por tubo no cabeçalho de cada bloco
- [x] Índice de tubos no início do relatório

## Botões de Edição para Visualizadores
- [x] Equipamentos: ocultar botões Novo/Editar/Excluir para role=viewer
- [x] Fibras: ocultar botões Novo/Editar/Excluir para role=viewer
- [x] Portas: ocultar botões Novo/Editar/Excluir/Lote para role=viewer
- [x] CEO: ocultar botões Novo/Editar/Excluir/Fusão para role=viewer
- [x] Conexões: ocultar botões Nova/Excluir para role=viewer
- [x] Salas: ocultar botões Novo/Editar/Excluir para role=viewer
- [x] Histórico: ocultar botão Registrar Manutenção para role=viewer

## Reorganização do Menu Lateral
- [x] Nova ordem: Dashboard, Salas/Locais, Equipamentos, Topologia, CEO, Fibras, Portas, Conexões, Histórico, Importar CSV, Relatório de Ocupação

## Alertas de Capacidade no Dashboard
- [x] Procedure tRPC para buscar equipamentos com 80%+ de ocupação
- [x] Card de alertas no Dashboard com lista de equipamentos críticos
- [x] Badge de percentual colorido (amarelo 80%, laranja 90%, vermelho 100%)
- [x] Link direto para o equipamento na lista de alertas

## Relatório de Ocupação em PDF
- [x] Procedure tRPC reports.occupancy com filtros por sala e equipamento
- [x] Página OccupancyReport com filtros, estatísticas e lista de equipamentos
- [x] Tabela de portas: número, etiqueta, tipo, velocidade, status, observações
- [x] Barra de ocupação por equipamento e global
- [x] Botão Imprimir/PDF com estilos @media print
- [x] Expandir/recolher todos os equipamentos
- [x] Item no menu lateral
- [x] Testes unitários para reports.occupancy (5 testes)

## Campos de Energia nos Equipamentos
- [ ] Adicionar campo powerType (DC/AC) ao schema de equipamentos
- [ ] Adicionar campo powerSource (retificadora/inversora/ups/grid/other) ao schema
- [ ] Gerar e aplicar migration SQL
- [ ] Atualizar helper getEquipments e getEquipmentById
- [ ] Atualizar formulários de criação/edição de equipamento
- [ ] Exibir tipo de energia e fonte na listagem e detalhes
- [ ] Exibir na topologia de racks

## Threshold Configurável de Alertas
- [ ] Adicionar chave capacity_alert_threshold nas system_settings
- [ ] Procedure getSettings já retorna todas as chaves — usar diretamente
- [ ] Atualizar getDashboardStats para usar o threshold do banco
- [ ] Campo de configuração na página Sistema (slider ou input numérico)
- [ ] Atualizar Dashboard para exibir o threshold configurado

## Indicador de Capacidade na Topologia
- [ ] Calcular ocupação por equipamento na query de topologia
- [ ] Exibir barra de capacidade colorida em cada equipamento no rack
- [ ] Tooltip com % de ocupação ao passar o mouse

## PWA Mobile
- [x] manifest.json com meta tags PWA no index.html
- [x] Cache offline IndexedDB para equipamentos, portas, CEO e vias
- [x] Campo passwordHash na tabela users + migration
- [x] Procedure mobileAuth.login (email + senha → JWT 30d)
- [x] Procedure mobileAuth.setPassword (admin define senha de usuário)
- [x] Suporte a Bearer token JWT no context.ts
- [x] Shell mobile /mobile com bottom navigation (4 abas)
- [x] Tela MobileSetup (configuração de URL do servidor)
- [x] Tela MobileLogin (email/senha)
- [x] Tela MobileEquipments (lista, detalhe, editar, portas, status, manutenção)
- [x] Tela MobileCeos (lista, detalhe, tubos, vias, edição completa)
- [x] Tela MobileReport (relatório de ocupação)
- [x] Tela MobileProfile (perfil, status conexão, alterar servidor, logout)
- [x] Indicador de status offline/online no banner superior
- [x] Campos de energia (powerType, powerSource) no formulário mobile

## Ícones PWA Personalizados
- [x] Gerar icon-192.png com logo FiberDoc
- [x] Gerar icon-512.png com logo FiberDoc
- [x] Upload para S3 e ícones salvos em client/public/

## Indicador de Capacidade na Topologia
- [x] Incluir dados de ocupação de portas na query getEquipments
- [x] Barra de progresso colorida em cada equipamento no rack (verde/amarelo/vermelho)
- [x] Barra visível dentro do bloco do equipamento no rack

## QR Code de Equipamento
- [x] Instalar biblioteca qrcode.react
- [x] Componente EquipmentQRCode reutilizável com dialog, imprimir e baixar SVG
- [x] Botão QR Code (compact) em cada card na página de Equipamentos
- [x] Botão QR Code no DetailPanel da Topologia
- [x] Deep-link /mobile?eq=ID abre diretamente o equipamento no app mobile
- [x] Suporte a deep-link no MobileApp.tsx e MobileEquipments.tsx
