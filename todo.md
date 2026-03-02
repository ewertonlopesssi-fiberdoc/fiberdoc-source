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

## v5.32 — Cabo pelo Mapa e Busca de Endereço
- [x] Criar cabo clicando em dois marcadores (CEO/CTO) no mapa sem informar IDs manualmente
- [x] Busca de endereço com Google Places Autocomplete no toolbar do mapa

## v5.33 — Traçado Livre de Cabo
- [ ] Modo de traçado livre: clicar em qualquer ponto do mapa para desenhar o percurso da fibra
- [ ] Prévia em tempo real da polyline enquanto o usuário clica nos pontos
- [ ] Diálogo de confirmação com seleção de origem/destino (CEO/CTO) e configuração do cabo
- [ ] Desfazer último ponto (Backspace/botão Desfazer)
- [ ] Vincular cabo a CEO/CTO arrastando o ponto sobre o ícone (snap por drag)

## Bugs v5.33 — Backup sem credenciais Manus
- [x] Backup falha com "Storage proxy credentials missing" em servidores físicos sem BUILT_IN_FORGE_API_KEY
- [x] Implementado armazenamento local: quando S3 não disponível, salva em /opt/fiberdoc/backups/
- [x] Coluna localPath adicionada à tabela backup_history (migration 0033)
- [x] Rota Express GET /api/backup/download/:filename para servir arquivos locais
- [x] Frontend atualizado: botão de download usa /api/backup/download/:filename quando localPath presente
- [x] 169 testes passando

## v5.34 — Mapa OpenStreetMap/Leaflet (sem dependência Google/Manus)

- [x] Instalar leaflet, @types/leaflet e leaflet-geosearch
- [x] Criar componente LeafletMap.tsx substituindo Map.tsx
- [x] Adaptar InfrastructureMap.tsx para usar Leaflet (marcadores CEO/CTO, polylines de cabo)
- [x] Adaptar traçado livre ponto-a-ponto para Leaflet
- [x] Adaptar busca de endereço para Nominatim (OpenStreetMap geocoding gratuito)
- [x] Adaptar exportação KML/KMZ
- [x] Preparar suporte a VITE_GOOGLE_MAPS_KEY para migração futura
- [x] Gerar pacote de deployment v5.34

## v5.35 — Satélite, Google Maps e Importação KML

- [x] Botão de alternância de camada no toolbar (Ruas / Satélite ESRI)
- [x] Suporte a Google Maps via VITE_GOOGLE_MAPS_KEY (detecção automática no .env)
- [x] Importação de posições CEO/CTO via arquivo KML (upload + parser + diálogo de confirmação)
- [x] Gerar pacote de deployment v5.35

## v5.36 — Correções e Módulo CTO Completo

- [x] Corrigir falha ao adicionar cabo pelo mapa
- [x] Corrigir falha ao adicionar CEO pelo mapa
- [x] Rótulos de distância nos cabos (km/m sobre a polyline)
- [x] Schema: tabela cto_tubes (id, ctoId, type: tube|splitter, identifier, totalVias, notes)
- [x] Schema: tabela cto_vias (id, tubeId, viaNumber, label, fusedToViaId, fusedToTubeId, notes)
- [x] Migration SQL para cto_tubes e cto_vias
- [x] Helpers de DB para CTO tubos e vias
- [x] Procedures tRPC: ctoTubes.byCTO, ctoTubes.create, ctoTubes.update, ctoTubes.delete
- [x] Procedures tRPC: ctoVias.byTube, ctoVias.setFusion, ctoVias.clearFusion
- [x] Página de detalhes da CTO com abas por tubo/splitter e grid de vias
- [x] Dialog de fusão de vias na CTO
- [x] Associação de via a fibra óptica na CTO
- [x] Gerar pacote de deployment v5.36

## v5.36 — Grupos/Pastas no Mapa (Setores)

- [x] Schema: tabela map_groups (id, name, color, description, createdAt, updatedAt)
- [x] Schema: tabelas map_element_groups e map_route_groups (associações N:N)
- [x] Migration SQL para map_groups, map_element_groups e map_route_groups
- [x] Helpers de DB: getMapGroups, createMapGroup, updateMapGroup, deleteMapGroup, addElementToGroup, removeElementFromGroup, addRouteToGroup, removeRouteFromGroup
- [x] Procedures tRPC: mapGroups.list (com membros), create, update, delete, addElement, removeElement, addRoute, removeRoute
- [x] Painel lateral de grupos no mapa (lista de grupos, criar/editar/excluir)
- [x] Filtro por grupo no toolbar (botão Grupos + painel lateral com toggle de filtro)
- [x] Seleção em grupo para atribuir múltiplos elementos de uma vez
- [x] Diálogo de criação/edição de grupo com nome, cor e descrição

## Bug v5.36 — Configurações do Sistema

- [x] Corrigir erro ao salvar nome do sistema e imagem/logo nas configurações

## v5.36 — Busca de Porta por Etiqueta/Descrição

- [x] Procedure tRPC: ports.search (busca por label/notes/portNumber em todas as portas)
- [x] Página dedicada Busca de Porta com barra de busca e resultados em tempo real
- [x] Resultado exibe: equipamento, porta, etiqueta, tipo, velocidade, status, observações
- [x] Navegar diretamente para o equipamento ao clicar no resultado

## v5.36 — Rodapé com dados da empresa

- [x] Adicionar rodapé "© 2026 SuporTI - CNPJ 18.643.297/0001-79. Todos os direitos reservados." no DashboardLayout

## v5.37 — Edição e Grupos no Painel Lateral do Mapa

- [x] Seletor de grupo no painel lateral ao clicar em CEO (dropdown com grupos disponíveis)
- [x] Seletor de grupo no painel lateral ao clicar em CTO (dropdown com grupos disponíveis)
- [x] Seletor de grupo no painel lateral ao clicar em cabo (dropdown com grupos disponíveis)
- [x] Botão "Editar" no painel lateral ao clicar em CEO (abre diálogo de edição inline)
- [x] Botão "Editar" no painel lateral ao clicar em CTO (abre diálogo de edição inline)
- [x] Botão "Editar" no painel lateral ao clicar em cabo (abre diálogo de edição inline)
- [x] Gerar pacote de deployment v5.37

## v5.38 — Detalhes de Tubos e Vias no Painel Lateral do Mapa

- [x] Buscar tubos e vias do CEO/CTO ao clicar no elemento no mapa
- [x] Exibir lista de tubos com barra de ocupação (vias fusionadas/total) abaixo do botão Editar
- [x] Expandir tubo para ver lista de vias com status (fusionada/livre) e etiqueta
- [x] Indicador visual de cor do tubo (padrão fibra óptica)
- [x] Gerar pacote de deployment v5.38

## v5.38 — Relatório de Fusões da CTO (Imprimível)

- [x] Criar CtoFusionPrint.tsx com layout imprimível (igual ao CeoFusionPrint)
- [x] Cabeçalho com nome da CTO, capacidade, data e localização
- [x] Tabela por tubo/splitter com colunas: Via, Etiqueta, Fusão, Observações
- [x] Layout espelhado: pares de tubos lado a lado com setas bidirecionais
- [x] Diálogo de filtro antes de imprimir (selecionar quais tubos incluir)
- [x] Badge colorido com a cor do tubo no cabeçalho de cada seção
- [x] Botão "Imprimir Mapa de Fusões" na página de detalhes da CTO

## v5.38.1 — Adicionar Tubos/Splitters pelo Mapa

- [x] Botão "Adicionar Tubo" no painel lateral do mapa (CEO/CTO) quando não há tubos
- [x] Botão "+" ao lado do título "Tubos e Vias" quando já há tubos
- [x] Diálogo inline para criar tubo/splitter: identificador, tipo, total de vias, cor, observações
- [x] Após criar, atualizar automaticamente a lista de tubos no painel
- [x] Exibir mensagem "Nenhum tubo cadastrado" quando vazio (em vez de não mostrar nada)
- [x] Gerar pacote de deployment v5.38.1

## v5.39 — Gestão Completa de Tubos e Fusões pelo Mapa

- [x] Botão de editar tubo na linha de cada tubo no painel lateral (abre diálogo inline)
- [x] Botão de excluir tubo na linha de cada tubo no painel lateral (com confirmação)
- [x] Registrar fusão pelo mapa: clicar em via livre abre seletor de via de destino
- [x] Desfazer fusão pelo mapa: clicar em via fusionada oferece opção de remover fusão
- [x] Botão "Abrir detalhes" no painel lateral que navega para /cto/:id ou /ceo/:id
- [x] Gerar pacote de deployment v5.39

## v5.40 — Sincronização Mapa ↔ Cadastro CEO/CTO

- [x] Editar CEO pelo mapa atualiza também o registro na tabela ceos (nome, status)
- [x] Editar CTO pelo mapa atualiza também o registro na tabela ctos (nome, capacidade, status)
- [x] Excluir CEO pelo mapa remove também o registro na tabela ceos
- [x] Excluir CTO pelo mapa remove também o registro na tabela ctos
- [x] Gerar pacote de deployment v5.40

## v5.40.1 — Correções de Bugs no Mapa

- [x] Corrigir INSERT de cto_tubes falhando com string vazia em color/notes
- [x] Corrigir INSERT de ceo_tubes com o mesmo problema
- [x] Corrigir nome não atualiza sem F5 após adicionar CEO/CTO no mapa
- [x] Corrigir mapa em branco após recarregar a página (F5)
- [x] Gerar pacote de deployment v5.40.1

## v5.40.2 — Correção definitiva INSERT cto_tubes

- [x] Corrigir createCtoTube no db.ts para converter string vazia em null antes do INSERT
- [x] Gerar pacote de deployment v5.40.2

## v5.41 — Correção INSERT tubos CTO + Sincronização Bidirecional Mapa ↔ CEO/CTO

- [x] Corrigir definitivamente erro ao adicionar tubos em CTO pelo mapa
- [x] Sincronização bidirecional: alterações no mapa refletem nos menus CEO/CTO
- [x] Sincronização bidirecional: alterações nos menus CEO/CTO refletem no mapa
- [x] Gerar pacote de deployment v5.41

## v5.42 — Editar Vias pelo Mapa

- [x] Botão de editar (✏️) em cada via no painel expandido do mapa (CEO e CTO)
- [x] Diálogo inline para editar label e observações da via (CEO e CTO)
- [x] Salvar e atualizar a lista de vias sem sair do mapa
- [x] Gerar pacote de deployment v5.42

## v5.42.1 — Correção INSERT cto_tubes color NOT NULL

- [x] Corrigir createCtoTube para usar 'blue' como padrão quando color for vazio/null
- [x] Gerar pacote de deployment v5.42.1

## v5.42.2 — Correção INSERT cto_tubes notes NOT NULL

- [x] Omitir notes do INSERT quando vazio (compatível com NOT NULL sem default)
- [x] Gerar pacote de deployment v5.42.2

## v5.42.3 — Correção INSERT map_routes NOT NULL

- [ ] Corrigir createRoute no db.ts para passar valores explícitos em name, fromElementId, toElementId e notes
- [ ] Gerar pacote de deployment v5.42.3

## v5.52 — Botão "Ver no Mapa" nos detalhes de CEO e CTO

- [x] Procedure ceos.mapElement: retorna o map_element vinculado ao CEO (lat, lng, id)
- [x] Procedure ctos.mapElement: retorna o map_element vinculado ao CTO (lat, lng, id)
- [x] Botão "Ver no Mapa" na página CeoDetail (visível apenas quando CEO está no mapa)
- [x] Botão "Ver no Mapa" na página CtoDetail (visível apenas quando CTO está no mapa)
- [x] InfrastructureMap lê parâmetros ?lat=&lng=&highlight= da URL ao carregar
- [x] Mapa centraliza na posição do CEO/CTO com zoom 17
- [x] Marcador pisca 3 vezes para destacar visualmente o elemento
- [x] Painel lateral abre automaticamente com os detalhes do CEO/CTO destacado
- [x] URL limpa após aplicar os parâmetros (sem re-execução no re-render)

## v5.53 — Correção: excluir CTO/CEO remove marcador do mapa

- [x] Ao excluir CTO pelo menu, remover automaticamente o map_element vinculado
- [x] Ao excluir CEO pelo menu, remover automaticamente o map_element vinculado
- [x] deleteCto: agora faz cascade em cto_vias, cto_tubes, map_elements e ctos
- [x] deleteCeo: agora remove map_element vinculado antes de excluir o CEO

## v5.54 — Botão "Usar Minha Localização" no formulário de CEO e CTO

- [x] Botão "Usar Minha Localização" no formulário de edição/criação de CEO
- [x] Botão "Usar Minha Localização" no formulário de edição/criação de CTO
- [x] Usar API de Geolocalização do navegador (navigator.geolocation)
- [x] Preencher lat/lng automaticamente com as coordenadas do técnico
- [x] Fazer geocodificação reversa via Nominatim para preencher o endereço
- [x] Mostrar estado de carregamento enquanto obtém a localização
- [x] Tratar erros (permissão negada, GPS indisponível)

## v5.55 — Geolocalização avançada: detalhe CEO/CTO + mapa automático

- [x] Botão "Minha Localização" no header do CeoDetail (atualiza location via mutation ceos.update)
- [x] Botão "Minha Localização" no header do CtoDetail (atualiza address+lat+lng via mutation ctos.update)
- [x] Ao obter localização nos formulários de Ceos/Ctos, fechar dialog e abrir mapa centralizado
- [x] InfrastructureMap lê parâmetro ?zoom= da URL (padrão 17) e centraliza mesmo sem elementos no mapa

## v5.56 — Posicionamento automático no mapa ao obter localização GPS

- [x] Ao clicar "Usar Minha Localização" em Ceos.tsx (criação), passa ?addMode=ceo na URL do mapa
- [x] Ao clicar "Usar Minha Localização" em Ctos.tsx (criação), passa ?addMode=cto na URL do mapa
- [x] InfrastructureMap lê ?addMode= e ativa setAddingMode("ceo"|"cto") automaticamente
- [x] Toast orienta o técnico a clicar no mapa para posicionar o marcador (6s de duração)
- [x] Parâmetro addMode é removido da URL após ativar o modo

## v5.57 — Botão GPS no dialog de Editar CTO/CEO

- [x] Botão GPS grande (h-11, w-full) no dialog de edição de CTO — otimizado para mobile
- [x] Botão GPS grande (h-11, w-full) no dialog de edição de CEO — otimizado para mobile
- [x] No modo edição: preenche lat/lng e endereço sem fechar o dialog nem redirecionar
- [x] No modo criação: fecha o dialog e abre o mapa com modo de adição ativado
- [x] Label do botão muda: "Atualizar Minha Localização" (edição) vs "Usar Minha Localização" (criação)
- [x] Hint de instrucao exibido apenas no modo edição: "Toque no botão... depois toque em Salvar"

## v5.58 — Página /mobile: abas CEO e CTO para técnico em campo

- [x] Aba CTO adicionada na navegação mobile (MobileCtos.tsx completo)
- [x] Aba CEO com botão GPS no painel de edição (MobileCeos.tsx atualizado)
- [x] Layout responsivo e touch-friendly (botões grandes, espaçamento adequado)

## v5.59 — Portas mobile agrupadas por slot

- [x] Agrupar portas por slot na listagem mobile do equipamento
- [x] Exibir cabeçalho de seção "Slot X" antes de cada grupo de portas
- [x] Mostrar contagem de portas livres/ocupadas por slot no cabeçalho

## v5.60 — Busca de portas inline na página de gestão de portas

- [x] Campo de busca ao lado dos botões "Novo Slot"/"Criar em Lote"/"Nova Porta"
- [x] Filtrar portas em tempo real por número, label, tipo, velocidade ou status
- [x] Manter agrupamento por slot mesmo com filtro ativo
- [x] Ocultar grupos de slot que ficarem vazios após o filtro
- [x] Exibir contagem de resultados e estado vazio com ícone de busca

## v5.61 — Busca de portas no mobile

- [x] Campo de busca na tela de portas do equipamento no mobile
- [x] Filtrar portas por número, label, tipo ou status em tempo real
- [x] Manter agrupamento por slot com filtro ativo

## v5.62 — Coordenadas padrão do mapa nas configurações do sistema

- [x] Campo de lat/lng padrão nas configurações do sistema
- [x] Botão GPS para capturar a posição atual como padrão
- [x] Salvar as coordenadas no banco (tabela system_settings)
- [x] InfrastructureMap lê as coordenadas padrão ao inicializar
- [x] Zoom padrão também configurável

## v5.63 — Edição completa de portas no mobile

- [x] Editar etiqueta/label da porta no mobile
- [x] Editar tipo de conector (LC, SC, SFP+, GPON...) no mobile
- [x] Editar velocidade da porta no mobile
- [x] Vincular porta a um equipamento no mobile (connectedToEquipmentId + connectedToPortId)
- [x] Salvar todas as alterações via trpc.ports.update

## v5.64 — Exibir vínculo atual da porta no mobile

- [x] Card "Vínculo Atual" exibido no topo da tela editPort
- [x] Exibe nome do equipamento e número/label da porta destino
- [x] Botão "Remover" para desvincular com um toque (limpa connectedEqId e connectedPortId)
- [x] Portas do equipamento vinculado são pré-carregadas ao abrir a tela
- [x] Estado "Sem vínculo" exibido com ícone quando a porta não tem conexão

## v5.65 — Correção: Identificar Fusão no mapa não lista tubos

- [ ] Investigar por que o seletor de tubo/splitter aparece vazio no dialog do mapa
- [ ] Corrigir o carregamento dos tubos no painel lateral do mapa (CTO)

## v5.65 — Identificar Fusão bidirecional (mapa ↔ menu CEO/CTO)

- [ ] Botão "Identificar Fusão" nas vias do painel lateral do mapa (CTO e CEO)
- [ ] Dialog de fusão no mapa lista os tubos/vias disponíveis do mesmo elemento
- [ ] Ao registrar fusão no mapa, o menu CEO/CTO atualiza automaticamente (invalidate)
- [ ] Ao registrar fusão no menu CEO/CTO, o painel lateral do mapa atualiza automaticamente
- [ ] Botão para desfazer fusão também disponível no painel lateral do mapa
- [ ] Indicador visual de via fundida (cor diferente) no painel lateral do mapa

## v5.66 — Aba Mapa no Mobile + Tubos/Vias em CEO e CTO Mobile

- [x] Aba "Mapa" adicionada na navegação mobile (6ª aba com ícone Map)
- [x] Componente MobileMap.tsx com mapa Leaflet (OpenStreetMap)
- [x] Marcadores CEO (roxo) e CTO (verde) no mapa mobile
- [x] Painel deslizante ao tocar num marcador (ocupa 70% da tela)
- [x] Painel: ver detalhes do CEO/CTO (nome, endereço, status, capacidade)
- [x] Painel: editar CEO/CTO directamente (nome, endereço, GPS, status, notas)
- [x] Painel: listar tubos do CEO/CTO com indicador de cor
- [x] Painel: criar novo tubo (identificador, tipo, total de vias, cor)
- [x] Painel: listar vias de um tubo com status de fusão e etiqueta
- [x] Painel: editar tubo (identificador, cor) e excluir com confirmação
- [x] Painel: editar via (etiqueta, observações)
- [x] Painel: identificar fusão (seleccionar tubo destino + via destino)
- [x] Painel: remover fusão com um toque
- [x] Legenda de marcadores (CEO/CTO) no canto superior esquerdo do mapa
- [x] Botão de recarregar dados no cabeçalho
- [x] MobileCeos: gestão completa de tubos e vias com edição de fusões
- [x] MobileCtos: gestão completa de tubos e vias com edição de fusões
- [x] 169 testes passando, 0 erros TypeScript

## v5.67 — Deep-link Mapa Mobile → Aba CEO/CTO

- [x] Botão "Abrir detalhes" no painel do MobileMap navega para aba CEO ou CTO
- [x] MobileApp passa callback de navegação para MobileMap
- [x] MobileCeos recebe prop initialCeoId e abre o detalhe directamente
- [x] MobileCtos recebe prop initialCtoId e abre o detalhe directamente
- [x] Gerar pacote de actualização v5.67

## v5.68 — Gestão de Fusões no Painel Lateral do Mapa Desktop

- [x] Botão de identificar fusão em cada via livre no painel lateral do mapa (CEO e CTO)
- [x] Botão de remover fusão em cada via fusionada no painel lateral do mapa (CEO e CTO)
- [x] Dialog de fusão inline no painel lateral (seleccionar tubo destino + via destino)
- [x] Indicador visual de via fusionada (cor diferente) no painel lateral
- [x] Gerar pacote de actualização v5.68

## v5.69 — Filtros e GPS no Mapa Mobile

- [x] Barra de filtros rápidos no topo do mapa mobile (Todos / CEO / CTO / Activos / Inativos)
- [x] Botão "Minha Localização" no rodapé do mapa mobile (centraliza no GPS do técnico)
- [x] Marcador de posição actual do técnico no mapa (ponto azul pulsante)
- [x] Gerar pacote de actualização v5.69

## v5.70 — Preview da Via de Destino na Fusão

- [x] Dialog de fusão no mapa desktop mostra preview "Via X — Label" da via de destino seleccionada
- [x] PanelSetFusion no mobile mostra preview "Via X — Label" da via de destino seleccionada
- [x] Painel de confirmação com origem e destino lado a lado antes de guardar
- [x] Gerar pacote de actualização v5.70

## v5.70 — Preview de Fusão + Relatório PDF de Fusões

- [x] Endpoint tRPC fusionReport.byCeo e fusionReport.byCto com dados completos de tubos/vias/fusões
- [x] Preview da via de destino no Dialog de fusão do mapa desktop
- [x] Preview da via de destino no PanelSetFusion do mobile
- [x] Botão "Exportar PDF" no painel lateral do mapa desktop (CEO/CTO)
- [x] Botão "Exportar PDF" no PanelDetail do mobile
- [x] Geração do PDF no servidor com tabela de tubos, vias e fusões
- [x] Gerar pacote de actualização v5.70

## v5.71 — Sincronização Bidirecional de Etiquetas em Vias Fundidas

- [x] ceoVias.update propaga label à via fundida (fusedToViaId) quando label é alterado
- [x] ctoVias.update propaga label à via fundida (fusedToViaId) quando label é alterado
- [x] Gerar pacote de actualização v5.71

## v5.72 — Integração SGP

- [x] Tabela app_settings na BD para guardar credenciais SGP configuráveis
- [x] Helper sgpApi.ts no servidor (fetch autenticado Token+App, fallback para env vars)
- [x] Procedimentos tRPC settings.getSgp e settings.saveSgp (ler/gravar credenciais)
- [x] Procedimento sgp.listCtos — listar CTOs do SGP
- [x] Procedimento sgp.syncCto — importar CTO do SGP para FiberDoc
- [x] Procedimento sgp.createCtoInSgp — criar CTO no SGP ao criar no FiberDoc
- [x] Procedimento sgp.onusByCto — listar ONUs vinculadas a uma CTO do SGP
- [x] Procedimento sgp.onuSignal — status de sinal de uma ONU
- [x] Procedimento sgp.authorizeOnu — autorizar ONU via SGP
- [x] Procedimento sgp.resetOnu — resetar ONU via SGP
- [x] Procedimento sgp.searchClients — pesquisar clientes/contratos no SGP
- [x] Página Integrações SGP no desktop com formulário de credenciais + lista de CTOs + sincronizar
- [x] CtoDetail mostra ONUs por via com status Online/Offline e botões autorizar/resetar
- [x] MobileCtos mostra ONUs por via com status e botões autorizar/resetar
- [x] Marcadores do mapa mostram badge de status ONUs (verde=todas online, vermelho=alguma offline)
- [x] Dialog de fusão tem campo de pesquisa de cliente SGP para vincular ao label da via
- [x] Gerar pacote de actualização v5.72

## v5.73 — Sincronização ONU + Webhook SGP + Relatório PDF SGP

- [ ] Procedimento tRPC sgp.syncOnuLabels — busca ONUs da CTO no SGP e actualiza labels das vias automaticamente
- [ ] Botão "Sincronizar ONUs" no CtoDetail (desktop) que preenche labels das vias com nomes de clientes SGP
- [ ] Endpoint HTTP /api/sgp/webhook para receber notificações do SGP (ONU autorizada/desactivada)
- [ ] Webhook actualiza label e status da via correspondente na BD
- [ ] URL do webhook exibida na página de Integrações SGP para configurar no SGP
- [ ] Endpoint HTTP /api/sgp-occupancy-report/:ctoId para gerar PDF de ocupação integrado
- [ ] PDF mostra: nome da CTO, lista de vias ocupadas, cliente SGP vinculado, status ONU, sinal óptico
- [ ] Botão "Relatório SGP PDF" no CtoDetail (desktop) e no PanelDetail do mobile
- [ ] Gerar pacote de actualização v5.73
- [x] Botão "Vincular ao SGP" no painel lateral da CTO no mapa (desktop e mobile) com dialog de selecção da CTO SGP correspondente
- [x] Feedback visual de carregamento na lista de CTOs do SGP no dialog desktop e modal mobile
- [x] Botão "Tentar novamente" no estado de erro do dialog Vincular ao SGP (desktop e mobile)
- [x] Contagem de CTOs disponíveis no cabeçalho do dialog Vincular ao SGP
- [x] Destaque visual para CTOs do SGP já vinculadas a outras CTOs locais
- [x] Ordenação da lista SGP: não vinculadas primeiro, vinculadas no fundo
- [x] Debounce de 300ms na pesquisa do dialog Vincular ao SGP
- [x] Tooltip com nome da CTO local nas CTOs SGP já vinculadas
- [x] Endpoint REST para actualização de vínculo CTO-SGP via cURL
- [x] Corrigir erro HTTP 403 na sincronização de CTOs SGP (botão oculto para não-admins no mobile)
- [x] Histórico de vínculos SGP na BD (tabela sgp_link_history)
- [x] Botão "Sincronizar todos" com sugestões por semelhança de nome
- [x] Script de actualização automática (cURL/shell)
- [ ] Endpoint /api/sgp/auto-sync com token secreto para actualização automática de vínculos CTO ↔ SGP
- [ ] Interface de gestão do webhook na página de Integrações SGP
- [x] Cache em memória (TTL 5min) nas procedures SGP para reduzir pedidos ao servidor externo
- [x] Consulta ao SGP apenas sob demanda (botão Atualizar/Sincronizar) — sem consultas automáticas ao abrir página ou dialog
- [x] Corrigir pedidos HTTP ao SGP: Authorization header + FormData com token e app=FIBERDOC
- [x] Corrigir queryClientsByCto para usar sgpId (ID do splitter) em vez do nome da CTO
- [x] Corrigir queryClientsByCto para usar sgpId e endpoint directo do splitter
- [x] Corrigir sgpFetch para usar POST com FormData em todos os pedidos SGP
- [x] Exibir clientes SGP no painel mobile (MobileMap)
- [x] Corrigir queryClientsByCto para usar endpoint /api/fttx/splitter/{id}/onu/list/ (em vez de /cliente/list/ que retorna 404)
- [x] Actualizar UI desktop e mobile para exibir ONUs com serial, status (online/offline) e sinal óptico (RX/TX dBm)
- [x] Mostrar sinal RX/TX, status Online/Offline e descrição da ONU no painel lateral da CTO (desktop e mobile)
- [x] Badge de ONUs nos marcadores de CTO no mapa: onu_count do splitter/all como total, actualiza para X online/Y total após clique
- [x] Corrigir badge de ONUs: campo connection não está a ser lido correctamente (mostra 0/3 em vez de 2/3)
- [x] Adicionar bolinha verde/cinza ao lado do nome do cliente na lista de ONUs (indicador de status online/offline)
- [x] Melhorar importação KML/KMZ: suporte a .kmz directamente, detecção por ícone, detecção por nome de pasta (Folder), importação de cabos/fibras por LineString (nome contém "caminho", "fibra" ou "cabo")
- [x] Importação KML/KMZ: ler cor do traçado (LineStyle AABBGGRR → HEX RGB) e extrair nome da fibra da descrição ("fibra X para CTO Y" → nome = "fibra X")
- [ ] Pré-visualização antes de importar KML/KMZ: mostrar lista de elementos detectados (nome, tipo, cor) com possibilidade de corrigir tipo manualmente antes de confirmar
- [x] Pré-visualização KML antes de importar: tabela editável com nome, tipo e cor por elemento, com checkbox de selecção individual e global
- [x] Selecção de slot no formulário de conexão de porta (desktop Ports.tsx e mobile MobileEquipments.tsx): após seleccionar o equipamento, aparece dropdown de slot para filtrar as portas disponíveis
