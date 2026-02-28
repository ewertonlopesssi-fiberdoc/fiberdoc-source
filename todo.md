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

## Mecanismo de Atualização via ZIP
- [x] Script fiberdoc-update.sh (aplica pacote ZIP no servidor sem perder dados)
- [x] Script gerar-update.sh (empacota arquivos do projeto para distribuição)
- [x] Guia completo de atualização com tutorial de envio (Windows/Mac/Linux/Pendrive)

## QR Code de Rack/Sala com Relatório PDF
- [x] Procedure reports.byRoom com portas e dados de energia por sala
- [x] Página RoomReport acessível via /relatorio-sala/:id (QR Code)
- [x] Tabela de portas: número, etiqueta, tipo, velocidade, status, observações
- [x] Dados de energia por equipamento: tipo (DC/AC) e fonte (retificadora/inversora)
- [x] Estatísticas de ocupação por sala e por equipamento
- [x] Botão Imprimir/PDF com estilos @media print
- [x] QR Code por sala na página de Salas (botão compacto em cada card)
- [x] Botão QR Code na Topologia ao selecionar sala no filtro
- [x] Dialog com QR Code, URL e botão Abrir Relatório

## QR Code Individual por Equipamento no Relatório de Sala
- [x] Botão QR Code em cada bloco de equipamento na página /relatorio-sala/:id
- [x] Dialog com QR Code que gera deep-link /mobile?eq=ID para o app mobile
- [x] Botão Imprimir e Abrir no Mobile no dialog do QR Code

## Módulo IP DOC
- [x] Schema: tabelas ip_blocks e ip_addresses no banco de dados
- [x] Migration SQL aplicada
- [x] DB helpers: CRUD de blocos e endereços IP
- [x] tRPC procedures: ipBlocks (list, create, update, delete, byId, summary)
- [x] tRPC procedures: ipAddresses (byBlock, allocate, update, release)
- [x] Dashboard de Blocos IP com KPIs e gráficos de utilização
- [x] Gerenciamento de Blocos IP (CRUD + visualização de IPs por bloco)
- [x] Alocação e liberação de endereços IP individuais
- [x] Relatórios de utilização de blocos IP
- [x] Navegação: adicionar IP DOC ao sidebar
- [x] Testes vitest para procedures de IP DOC

## Melhorias IP DOC — Rodada 2

- [x] Reposicionar IP DOC no sidebar: abaixo de Equipamentos
- [x] Importação CSV em massa de IPs (address;hostname;owner;mac) no detalhe do bloco
- [x] Procedure tRPC: ipDoc.importCsv
- [x] Procedure tRPC: ipDoc.primaryByEquipment (IP alocado por equipmentId)
- [x] Testes vitest para importCsv

## Equipamentos — Campos VLAN, Interface/IP e Serviço

- [x] Schema: adicionar vlan, interfaceIp, ipBlockId, serviceDescription na tabela equipments
- [x] Migration SQL aplicada
- [x] Procedure tRPC: atualizar equipments.create e equipments.update com novos campos
- [x] Formulário de cadastro/edição: seção "Rede" com VLAN, Interface/IP e Descrição do Serviço
- [x] Listagem de equipamentos: exibir VLAN e IP principal no card
- [x] Importação CSV de IPs: botão no detalhe do bloco IP

## Melhorias IP DOC — Rodada 3

- [x] Seletor de equipamento no formulário de alocação de IP
- [x] Coluna "Equipamento" na tabela de IPs do bloco com link para topologia
- [x] Exportar relatório de IPs em PDF (endpoint /api/ip-report-pdf)
- [x] Botão "Exportar PDF" na tela de Relatórios do IP DOC
- [x] Filtro de busca por IP, VLAN e descrição de serviço na listagem de equipamentos
- [x] 105 testes passando (10 arquivos)

## Auditoria de IPs e Relatório PDF de Equipamentos

- [x] Registrar log de auditoria em alocação, liberação e edição de IPs (procedures tRPC)
- [x] Query getIpAuditByBlock para buscar histórico de um bloco
- [x] Aba "Histórico de Alterações" no detalhe do bloco com tabela de eventos
- [x] Endpoint /api/equipment-report-pdf com PDFKit (A4 landscape)
- [x] Botão "Exportar PDF" na tela de Equipamentos
- [x] 112 testes passando (11 arquivos)

## Módulo de Atualização Remota (Upload via Browser)

- [x] Instalar multer para upload de arquivos no servidor
- [x] Endpoint POST /api/system/update — recebe ZIP, valida, extrai e aplica
- [x] Endpoint GET /api/system/version — retorna versão atual e histórico
- [x] Endpoint GET /api/system/update-status — retorna progresso em tempo real (SSE)
- [x] Tela de Atualização do Sistema na página de Configurações (admin only)
- [x] Exibir versão atual, histórico de atualizações e botão de upload
- [x] Barra de progresso em tempo real durante a aplicação
- [x] 123 testes passando (12 arquivos)

## Senha Mobile — Melhoria de Usabilidade

- [x] Botão "Definir Senha Mobile" (ícone smartphone ciano) em cada usuário na tela de Usuários
- [x] Dialog com campo de nova senha + confirmação e botão gerar senha aleatória (12 chars)
- [x] Tela de sucesso com instruções passo a passo de acesso ao app mobile
- [x] Explicação sobre autenticação offline no dialog
- [x] 123 testes passando (12 arquivos)

## Correções e Múltiplas Interfaces

- [ ] Corrigir erro ao cadastrar bloco IP
- [ ] Tabela equipment_interfaces (id, equipmentId, vlan, interfaceIp, description, isPrimary)
- [ ] Migration SQL aplicada
- [ ] Procedures tRPC: interfaces.byEquipment, interfaces.create, interfaces.update, interfaces.delete
- [ ] Formulário de equipamentos: seção "Interfaces/VLANs" com lista dinâmica (adicionar/remover)
- [ ] Exibir interfaces no card do equipamento e na topologia
- [ ] Manter campos legados vlan/interfaceIp/serviceDescription para compatibilidade
- [ ] Testes vitest para as novas procedures

## Correções e Múltiplas Interfaces por Equipamento

- [x] Corrigir erro SelectItem value="" no formulário de bloco IP (roomId __none__)
- [x] Tabela equipment_interfaces no schema e migration aplicada
- [x] DB helpers: CRUD de interfaces (create, update, delete, byEquipment)
- [x] Procedures tRPC: ipDoc.interfaces (byEquipment, create, update, delete)
- [x] Formulário de equipamentos: seção "Interfaces de Rede" com lista de interfaces
- [x] Componente IfaceForm: campos nome, VLAN, IP/máscara, MAC, descrição, isPrimary, notas
- [x] Botão "Adicionar Interface" visível ao editar equipamento existente
- [x] Edição e exclusão de interfaces individuais inline
- [x] 123 testes passando (12 arquivos)

## Fonte de Energia Cadastrada e Upload de Imagem

- [x] Schema: tabela power_sources com campos SNMP completos (SNMPv1/v2c/v3, OIDs configuráveis)
- [x] Campo powerSourceId (FK) na tabela equipments
- [x] Migration SQL aplicada (0015 power_sources, 0016 powerSourceId)
- [x] DB helpers: getPowerSources, getPowerSourceById, createPowerSource, updatePowerSource, deletePowerSource
- [x] tRPC procedures: powerSources (list, byId, create, update, delete, pollNow)
- [x] Módulo snmpPoller.ts com coleta SNMP (v1/v2c/v3) e polling automático por intervalo
- [x] Página /fontes-energia com cards de status SNMP em tempo real
- [x] Formulário de fonte com abas Geral e SNMP (OIDs configuráveis, botão OIDs Huawei)
- [x] Seletor de fonte cadastrada no formulário de equipamentos (com link para cadastrar nova)
- [x] Procedure equipments.uploadImage (base64 → S3)
- [x] Componente de upload de imagem com preview e botão remover no formulário de equipamentos
- [x] Item "Fontes de Energia" no menu lateral
- [x] 133 testes passando (13 arquivos)

## Sistema de Alertas SNMP para Fontes de Energia

- [ ] Schema: tabela snmp_alerts (id, powerSourceId, alertType, severity, message, currentValue, thresholdValue, acknowledgedAt, resolvedAt, createdAt)
- [ ] Schema: campos de threshold na tabela power_sources (alertTempMax, alertVoltageMin, alertVoltageMax, alertBatteryMin, alertBatteryMax, alertCurrentMax, alertLoadMax, alertsEnabled)
- [ ] Migration SQL aplicada
- [ ] Lógica de avaliação de alertas no snmpPoller após cada coleta
- [ ] Notificação ao proprietário via notifyOwner quando alerta crítico é gerado
- [ ] tRPC procedures: alerts.list, alerts.acknowledge, alerts.resolve, alerts.history, alerts.activeCount
- [ ] Aba "Alertas" no formulário de fontes com configuração de thresholds
- [ ] Página /alertas com alertas ativos, histórico e botão de reconhecimento
- [ ] Badge de alertas ativos no menu lateral (item Fontes de Energia)
- [ ] Testes vitest para a lógica de avaliação de alertas

## Notificações via Telegram para Alertas SNMP

- [ ] Módulo server/telegram.ts com helper sendTelegramMessage(token, chatId, text)
- [ ] Chaves telegram_bot_token e telegram_chat_id na tabela system_settings
- [ ] Migration SQL para novas chaves (ou inserção via upsert)
- [ ] Lógica de avaliação de thresholds no snmpPoller após cada coleta
- [ ] Envio de mensagem Telegram formatada quando alerta é gerado/resolvido
- [ ] tRPC procedures: alerts.list, alerts.acknowledge, alerts.resolve, alerts.activeCount
- [ ] Aba "Alertas" no formulário de fontes com configuração de thresholds
- [ ] Página /alertas com alertas ativos, histórico e botão de reconhecimento
- [ ] Badge de alertas ativos no item "Fontes de Energia" no menu lateral
- [ ] Seção Telegram na página de Sistema (bot token + chat ID + botão testar)
- [ ] Testes vitest para a lógica de avaliação de alertas e helper Telegram

## Sistema de Alertas SNMP e Notificações Telegram

- [x] Tabela snmp_alerts (id, powerSourceId, alertType, severity, status, currentValue, thresholdValue, message, triggeredAt, acknowledgedAt, acknowledgedBy, resolvedAt, notifiedTelegram)
- [x] Campos de threshold na tabela power_sources (alertsEnabled, alertTempMax, alertVoltageMin, alertVoltageMax, alertBatteryMin, alertBatteryMax, alertCurrentMax, alertLoadMax, alertAcFail)
- [x] Migrations SQL aplicadas (0017 snmp_alerts, 0018 threshold fields)
- [x] DB helpers: getSnmpAlerts, getActiveSnmpAlerts, createSnmpAlert, acknowledgeSnmpAlert, resolveSnmpAlert, getActiveAlertCount
- [x] Módulo telegram.ts com sendTelegramMessage (suporte a HTML parse_mode, retry, tratamento de erro)
- [x] snmpPoller.ts atualizado com avaliação de thresholds após cada coleta
- [x] Alertas gerados para: temperatura alta, tensão baixa/alta, bateria baixa/alta, corrente alta, carga alta, falta de AC, SNMP inacessível
- [x] Notificação Telegram enviada na criação de cada alerta (com emoji, nome da fonte, valor e limite)
- [x] tRPC procedures: alerts.list, alerts.activeCount, alerts.acknowledge, alerts.resolve, alerts.testTelegram
- [x] Aba "Alertas" no formulário de fontes de energia com toggle de habilitação e campos de threshold
- [x] Página /alertas com abas Ativos e Histórico, cards de alerta com botões Reconhecer/Resolver
- [x] Badge de contagem de alertas ativos no item "Alertas" do menu lateral (atualiza a cada 30s)
- [x] Seção Telegram na página de Sistema com campos Bot Token e Chat ID, botão de teste e salvar
- [x] systemConfig.save aceita telegram_bot_token e telegram_chat_id
- [x] 145 testes passando (14 arquivos)

## Integração Tuya IoT (Sensores via Cloud API)

- [ ] Tabela tuya_devices (id, name, deviceId, type, roomId, powerSourceId, alertsEnabled, thresholds, lastValue, lastPolledAt, status, notes)
- [ ] Migration SQL aplicada
- [ ] DB helpers: getTuyaDevices, getTuyaDeviceById, createTuyaDevice, updateTuyaDevice, deleteTuyaDevice, updateTuyaDeviceStatus
- [ ] Módulo tuyaPoller.ts com autenticação HMAC-SHA256 na Tuya Cloud API
- [ ] Suporte a regiões: us (América), eu (Europa), cn (China)
- [ ] Coleta de status do dispositivo via GET /v1.0/devices/{deviceId}/status
- [ ] Avaliação de thresholds e geração de alertas (reusa tabela snmp_alerts)
- [ ] Notificação Telegram ao gerar alerta Tuya
- [ ] Polling automático configurável por dispositivo
- [ ] tRPC procedures: tuyaDevices (list, byId, create, update, delete, pollNow, testConnection)
- [ ] Página /sensores-tuya com cards de status em tempo real
- [ ] Formulário de cadastro com campos: nome, Device ID, tipo, sala, intervalo de polling, thresholds
- [ ] Botão "Testar Conexão" no formulário
- [ ] Item "Sensores Tuya" no menu lateral
- [ ] Configuração global Tuya (Access ID, Secret, Região) na página de Sistema
- [ ] Testes vitest para o módulo Tuya

## Múltiplas Contas Tuya

- [ ] Tabela tuya_accounts (id, name, accessId, accessSecret, region, notes, createdAt)
- [ ] Campo tuyaAccountId (FK) na tabela tuya_devices
- [ ] Migration SQL aplicada
- [ ] DB helpers: getTuyaAccounts, createTuyaAccount, updateTuyaAccount, deleteTuyaAccount
- [ ] tuyaPoller: usar credenciais da conta vinculada ao dispositivo (fallback para config global)
- [ ] tRPC procedures: tuyaAccounts (list, create, update, delete, testConnection)
- [ ] Atualizar procedure tuyaDevices.create/update para aceitar tuyaAccountId
- [ ] Seletor de conta no formulário de dispositivos Tuya
- [ ] Seção "Contas Tuya" na página de Sistema com CRUD de contas
- [ ] Testes vitest para múltiplas contas

## Integração Tuya IoT (Sensores)

- [x] Tabela tuya_accounts (id, name, accessId, accessSecret, region, notes)
- [x] Tabela tuya_devices (id, name, deviceId, type, tuyaAccountId, thresholds, enabled, pollingInterval)
- [x] Campo tuyaAccountId (FK) na tabela tuya_devices
- [x] Migrations SQL aplicadas (0019 tuya_devices, 0020 tuya_accounts + FK)
- [x] DB helpers: getTuyaAccounts, getTuyaAccountById, createTuyaAccount, updateTuyaAccount, deleteTuyaAccount
- [x] DB helpers: getTuyaDevices, getTuyaDeviceById, createTuyaDevice, updateTuyaDevice, deleteTuyaDevice
- [x] Módulo tuyaPoller.ts com autenticação HMAC-SHA256, coleta via Tuya Cloud API e polling automático
- [x] Avaliação de thresholds (temperatura, umidade, CO2, potência) com geração de alertas e notificação Telegram
- [x] tRPC procedures: tuyaAccounts (list, create, update, delete, testConnection)
- [x] tRPC procedures: tuyaDevices (list, create, update, delete, pollNow)
- [x] Página /sensores-tuya com CRUD de dispositivos, seletor de conta, thresholds e status em tempo real
- [x] Seção Contas Tuya IoT na página de Sistema com CRUD e botão Testar conexão
- [x] Item "Sensores Tuya" no menu lateral
- [x] 156 testes passando (15 arquivos)

## Dashboard Tuya, Histórico de Leituras e Sensores nas Salas

- [ ] Tabela tuya_readings (id, deviceId, temperature, humidity, co2, power, rawData, collectedAt)
- [ ] Migration SQL aplicada
- [ ] DB helpers: createTuyaReading, getTuyaReadingsByDevice (últimas 24h)
- [ ] tuyaPoller: salvar leitura no histórico após cada coleta bem-sucedida
- [ ] Procedure tRPC: tuyaDevices.readings (últimas N leituras por device)
- [ ] Procedure tRPC: tuyaDevices.latestAll (último valor de todos os sensores ativos)
- [ ] Card de sensores Tuya no Dashboard (temperatura, umidade, CO2 por sensor)
- [ ] Gráfico de linha 24h na página /sensores-tuya (temperatura e umidade)
- [ ] Campo roomId (FK) na tabela tuya_devices para associar sensor à sala
- [ ] Migration SQL do campo roomId
- [ ] Seletor de sala no formulário de cadastro de sensor Tuya
- [ ] Exibir temperatura/umidade do sensor na página de Salas/Locais
- [ ] Exibir temperatura/umidade do sensor na Topologia de Racks

## Dashboard Tuya, Histórico de Leituras e Sensores nas Salas

- [x] Tabela tuya_readings para histórico de leituras (migration 0021 aplicada)
- [x] tuyaPoller atualizado para salvar cada leitura no histórico
- [x] DB helpers: createTuyaReading, getTuyaReadingsByDevice, getLatestTuyaReadings
- [x] Procedures tRPC: tuyaDevices.readings e tuyaDevices.latestAll
- [x] Card de sensores Tuya no Dashboard com temperatura, umidade e CO₂ em tempo real
- [x] Modal de histórico com gráficos de área (temperatura, umidade, CO₂, potência) — períodos 6h/12h/24h/48h/7d
- [x] Temperatura e umidade do sensor exibidos nos cards de Salas e Locais
- [x] 156 testes passando (15 arquivos)

## Correção do Login Local (Instalação Standalone)
- [x] DashboardLayout: redirecionar para /login quando não autenticado e modo local ativo
- [x] DashboardLayout: detectar modo local via /api/local-auth-enabled e mostrar botão correto
- [x] LocalLogin.tsx: simplificado — sem opção de criar conta, usa admin padrão seedado automaticamente
- [x] Corrigir erro banco de dados (Access denied) no servidor do usuário — script fiberdoc-update-v5.sh
- [x] Criar script de atualização v5 com as correções

## Correções v5.1
- [x] Corrigir erro "Não autenticado" na tela de troca de senha (cookie sameSite=lax em HTTP)
- [x] Alterar subtítulo para "Sistema de Documentação de Redes" em LocalLogin, ChangePassword e DashboardLayout
- [x] Corrigir redirecionamento automático após troca de senha (window.location.href para reload completo)
- [ ] Corrigir redirecionamento pós-troca de senha (ainda precisa F5 após salvar)
- [x] Corrigir redirecionamento pós-troca de senha (ainda precisa F5)
- [x] Implementar gestão de operadores: criar, listar, editar, desativar usuários locais
- [x] Página /usuarios com tabela de operadores e formulário de criação
- [x] Editar número da porta na tela de portas
- [ ] Campo de posição/ordem para controlar sequência das portas na grade
- [x] Campo de altura em U (unidades de rack) nos equipamentos
- [ ] Corrigir rackUnits voltando para 1 ao salvar
- [ ] Vincular porta a porta de outro equipamento
- [x] Vínculo bidirecional entre portas
- [ ] Mapa de conexões na tela de topologia
- [ ] Corrigir altura em U na topologia de rack

## Melhorias v5.9
- [x] Corrigir altura em U na topologia de rack (usar rackUnits do banco em vez de parseSizeU do modelo)
- [x] Mapa de conexões na tela de topologia (aba "Mapa" com SVG mostrando linhas entre equipamentos vinculados)
- [x] Procedure ports.allLinks no backend para buscar todas as conexões de portas
- [x] Função getAllPortLinks no db.ts para retornar vínculos de portas entre equipamentos
- [x] Tooltip nas linhas do mapa mostrando portas vinculadas
- [x] Contador de portas no centro das linhas de conexão

## Melhorias v5.9
- [x] Corrigir altura em U na topologia de rack (usar rackUnits do banco)
- [x] Mapa de conexoes na tela de topologia (aba Mapa com SVG)
- [x] Procedure ports.allLinks no backend
- [x] Funcao getAllPortLinks no db.ts
- [x] Mapa de conexões: drag-and-drop nos nós para reorganizar equipamentos
- [x] Mapa: área SVG dinâmica (cresce conforme nós são movidos)
- [x] Mapa: ponto de controle arrastável no meio das linhas de conexão
- [x] Tabela topology_layout no schema e migration SQL
- [x] DB helpers e procedures tRPC: topologyLayout.get e topologyLayout.save
- [x] Auto-save do layout ao soltar nó/linha no mapa
- [x] Restaurar layout ao abrir o mapa
- [x] Mapa: botão Salvar layout manual
- [x] CEO: remover item 2 da lista Atualização Segura do Sistema

## Melhorias v5.14
- [ ] Dashboard: widget de status SNMP das fontes de energia com dados em tempo real
- [ ] PowerSources: tela de detalhes SNMP expandida com gauge/indicadores visuais

## Melhorias v5.15
- [ ] Tabela snmp_readings para histórico de leituras SNMP
- [ ] Procedure powerSources.readings para buscar histórico SNMP
- [ ] Gráfico de histórico SNMP na tela PowerSources (modal)
- [ ] Exibir voltagem e amperagem nos sensores Tuya (power_meter)
- [ ] Histórico de voltagem/corrente no modal de histórico Tuya

## Melhorias v5.17 — Suporte Huawei ETP48300-C6A1
- [x] Adicionar campos snmpVoltageDivisor, snmpCurrentDivisor, snmpTempDivisor no schema power_sources
- [x] Aplicar divisores no snmpPoller ao salvar valores coletados
- [x] Adicionar preset Huawei ETP48300-C6A1 no formulário PowerSources
- [x] Atualizar formulário para exibir campos de divisor de escala

## Correção v5.18
- [x] Corrigir impressão do CEO (página em branco ao imprimir mapa de fusões)

## Correção v5.19
- [x] Reimplementar impressão CEO via window.open (janela separada com HTML completo)

## v5.20
- [x] Alterar impressão CEO: cada tubo individual com vias e associações de fusão

## v5.21
- [x] Badge de cor do tubo no cabeçalho de cada seção na impressão CEO
- [x] Diálogo de filtro de tubos antes de imprimir CEO

## v5.22
- [x] Adicionar cor padrão de fibra óptica (grupo 1, vias 1-12) nos ViaCards na tela
- [x] Adicionar cor padrão de fibra óptica na impressão do CEO

## v5.23
- [x] Filtro por cor de via e por status (fusionada/livre) no TubePanel do CEO

## v5.24
- [x] Corrigir topologia de racks: quantidade de U dos equipamentos e mapa não exibidos corretamente (servidor de produção com versão antiga do Topology.tsx)

## v5.25 — PWA
- [x] Criar manifest.json com nome, cores e ícones do FiberDoc
- [x] Criar service worker para cache offline básico
- [x] Configurar Vite para incluir manifest e service worker no build
- [x] Gerar ícones PWA (192x192 e 512x512)
- [x] Gerar URL do Equipments.tsx atualizado para produção

## v5.26 — Racks selecionáveis
- [ ] Criar tabela racks no banco (id, name, roomId, totalUnits, description)
- [ ] Criar procedures CRUD de racks no routers.ts
- [ ] Adicionar gerenciamento de racks na página Salas/Locais
- [ ] Substituir campo Rack (texto livre) por seletor no formulário de Equipamentos
- [ ] Gerar ícone personalizado FiberDoc para PWA (192x192 e 512x512)
- [ ] Implementar notificações push para alarmes no service worker
- [ ] Modo offline CEO: pré-cachear dados dos CEOs mais acessados
- [ ] Criar tabela sgp_config no banco (url, token, app, ativo)
- [ ] Procedure CRUD de configuração SGP no routers.ts
- [ ] Criar página SgpConfig.tsx com formulário de URL, Token e App
- [ ] Procedure de consulta de clientes por CTO via API SGP (proxy server-side)
- [ ] Exibir clientes SGP no painel de detalhes da CTO (tooltip + lista)

## Módulo de Mapa de Infraestrutura (v5.26)
- [ ] Criar tabela ctos (nome, endereço, capacidade, status, lat, lng, observações)
- [ ] Criar tabela map_elements (tipo ceo/cto, referenceId, lat, lng)
- [ ] Criar tabela map_routes (nome, fromId, toId, fiberCount, cableType, cor, path JSON)
- [ ] Criar tabela sgp_config (url, token, app, ativo)
- [ ] Helpers CRUD de CTOs no db.ts
- [ ] Helpers de map_elements e map_routes no db.ts
- [ ] Helpers de sgp_config no db.ts
- [ ] Procedures tRPC: ctos.list, ctos.create, ctos.update, ctos.delete
- [ ] Procedures tRPC: map.getElements, map.savePosition, map.getRoutes, map.saveRoute, map.deleteRoute
- [ ] Procedures tRPC: sgp.getConfig, sgp.saveConfig, sgp.getClientesByCto
- [ ] Página Ctos.tsx — listagem e cadastro de CTOs
- [ ] Página InfraMap.tsx — mapa interativo com Google Maps
- [ ] Ícones: CEO = círculo azul, CTO = quadrado (verde/amarelo/vermelho por status)
- [ ] Filtros de camada: CEOs, CTOs, Cabos
- [ ] Arrastar para reposicionar elementos no mapa
- [ ] Traçar linhas de cabo entre dois pontos com pontos intermediários
- [ ] Painel lateral ao clicar em CEO/CTO
- [ ] Integração SGP: tooltip na CTO com clientes por porta
- [ ] Página SgpConfig.tsx — configuração URL, Token e App do SGP
- [ ] Adicionar rotas /ctos, /mapa-infra, /sgp-config no App.tsx
- [ ] Adicionar itens no menu lateral do DashboardLayout
- [ ] Exportar dados do mapa em KML/KMZ (Google Earth)

## v5.26 — Módulo de Mapa de Infraestrutura (CONCLUÍDO)
- [x] Tabela ctos criada no banco com campos: nome, endereço, capacidade, status, lat, lng, observações
- [x] Tabela map_elements criada (tipo ceo/cto, referenceId, lat, lng)
- [x] Tabela map_routes criada (nome, fromId, toId, fiberCount, cableType, cor, path JSON)
- [x] Tabela sgp_config criada (url, token, app, ativo)
- [x] Helpers CRUD de CTOs no db.ts
- [x] Helpers de map_elements e map_routes no db.ts
- [x] Helpers de sgp_config no db.ts
- [x] Procedures tRPC: ctos.list, ctos.create, ctos.update, ctos.delete
- [x] Procedures tRPC: infraMap.elements, infraMap.routes, infraMap.upsertElement, infraMap.deleteElement, infraMap.createRoute, infraMap.deleteRoute, infraMap.exportKml
- [x] Procedures tRPC: sgp.config, sgp.saveConfig, sgp.queryClientsByCto
- [x] Página Ctos.tsx — listagem e cadastro de CTOs com filtros e stats
- [x] Página InfrastructureMap.tsx — mapa interativo com Google Maps
- [x] Ícones: CEO = círculo, CTO = quadrado (verde/amarelo/vermelho por status)
- [x] Filtros de camada: CEOs, CTOs, Cabos
- [x] Adicionar elementos ao mapa com clique
- [x] Traçar linhas de cabo entre dois pontos
- [x] Painel lateral ao clicar em CEO/CTO com dados SGP
- [x] Integração SGP: clientes por CTO no painel lateral
- [x] Página SgpConfig.tsx — configuração URL, Token e App do SGP
- [x] Rotas /cto, /mapa, /sgp adicionadas no App.tsx
- [x] Itens CTO, Mapa de Infraestrutura e SGP Config adicionados no menu lateral
- [x] Exportar dados do mapa em KML (Google Earth)

## v5.27 — Melhorias do Módulo de Mapa
- [x] Marcadores arrastáveis no mapa (draggable AdvancedMarkerElement + salvar posição ao soltar)
- [x] Importação de CTOs via CSV (nome, endereço, capacidade, lat, lng)
- [x] Widget de CTOs no Dashboard (total, ocupação média, link para mapa)

## v5.28 — Exportação Avançada e Alertas de CTOs
- [x] Exportação KML/KMZ com seleção granular (escolher quais fibras, CTOs e CEOs exportar)
- [x] Empacotamento KMZ (ZIP do KML) compatível com Google Earth Desktop
- [x] Filtro de CTOs por percentual de ocupação (ex: acima de 80%)
- [x] Alertas de alta ocupação de CTOs integrados ao sistema de alertas existente

## Bugs
- [x] Erro ao salvar nome/logo nas configurações do sistema (investigado: procedures funcionam corretamente, erro ocorre quando sessão expira)

## Bugs v5.29
- [x] Backup: falha ao gerar e salvar na nuvem (S3) — corrigido ECONNRESET com pool mysql2 + keepAlive + reconexão automática

## v5.30 — Seleção em Grupo no Mapa
- [x] Botão de modo de seleção em grupo no toolbar do mapa
- [x] Seleção múltipla de CTOs, CEOs e cabos com clique
- [x] Painel de ações em lote (exportar seleção, excluir seleção)
- [x] Indicação visual dos elementos selecionados (borda cyan nos marcadores, espessura aumentada nos cabos)

## Bugs v5.31
- [x] Mapa de infraestrutura não aparece (mapa em branco) — corrigido carregamento duplo do Google Maps com singleton promise
- [x] Botões de adicionar CEO/CTO/cabo no mapa apenas selecionavam o botão sem abrir formulário — corrigido
- [x] Melhorar fluxo: cadastrar CEO/CTO/cabo diretamente pelo mapa e arrastar para posicionar — implementado diálogo moderno de seleção/criação
