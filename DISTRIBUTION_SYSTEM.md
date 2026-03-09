# Sistema de Distribuição de Atualizações do FiberDoc

## 📋 Visão Geral

O FiberDoc possui um sistema completo de **distribuição automática de atualizações** baseado em modelo "pull" (cliente busca no servidor):

```
┌──────────────────────────────────────────────────────────────────┐
│                  SERVIDOR CENTRAL DE DISTRIBUIÇÃO                │
│              (updates.fiberdoc.com ou seu servidor)              │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ • Gerencia releases (versões)                              │ │
│  │ • Armazena pacotes ZIP                                     │ │
│  │ • Fornece informações sobre atualizações                   │ │
│  │ • Valida integridade com checksum                          │ │
│  └────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
                              ↑
                              │ (pull automático a cada 24h)
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│              FIBERDOC (Cliente de Atualização)                   │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ • Verifica atualizações periodicamente                     │ │
│  │ • Baixa pacotes automaticamente                            │ │
│  │ • Instala com backup automático                            │ │
│  │ • Notifica admin sobre atualizações críticas               │ │
│  └────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Arquitetura

### Servidor Central (updateDistributionServer.ts)

**Responsabilidades:**
- Gerenciar releases (versões)
- Armazenar pacotes ZIP
- Fornecer informações sobre atualizações
- Validar integridade com checksum MD5
- Controlar acesso com API key

**Endpoints:**
```
GET  /api/distribution/releases              → Listar todas as releases
GET  /api/distribution/check-update          → Verificar atualização disponível
GET  /api/distribution/download/:version     → Download de pacote
POST /api/distribution/register-release      → Registrar nova release (admin)
DELETE /api/distribution/releases/:version   → Deletar release (admin)
GET  /api/distribution/health                → Health check
```

### Cliente (updateClient.ts)

**Responsabilidades:**
- Verificar atualizações periodicamente (a cada 24h)
- Baixar pacotes automaticamente
- Instalar com backup e rollback
- Manter status de atualização
- Notificar sobre atualizações críticas

**Funções:**
```typescript
checkForUpdates()              → Verificar atualizações disponíveis
downloadAndInstallUpdate()     → Baixar e instalar
getUpdateStatus()              → Obter status atual
startUpdateChecker()           → Iniciar verificação periódica
forceCheckNow()                → Forçar verificação imediata
installUpdate(version)         → Instalar versão específica
cancelUpdate()                 → Cancelar atualização em progresso
```

---

## 📦 Estrutura de Release

```json
{
  "version": "1.2.0",
  "releaseDate": "2026-03-09T18:54:26Z",
  "description": "Adicionado suporte a monitoramento SNMP de equipamentos de rede",
  "changelog": "- Novo: Coleta SNMP de NE8000, CCR, Switches\n- Novo: Mapa de topologia de rede\n- Correção: Bug no webhook SGP",
  "critical": false,
  "prerelease": false,
  "minVersion": "1.0.0",
  "maxVersion": null,
  "platform": "all",
  "downloadUrl": "/api/distribution/download/1.2.0",
  "checksum": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "size": 47185920
}
```

---

## 🔧 Como Configurar

### 1. Instalar Servidor Central

```bash
# Clone o repositório
git clone https://seu-repo/fiberdoc.git
cd fiberdoc

# Instale dependências
pnpm install

# Configure variáveis de ambiente
export DISTRIBUTION_API_KEY="sua-chave-secreta-aqui"
export PACKAGES_DIR="/var/fiberdoc/packages"

# Inicie o servidor
pnpm run start:distribution
```

### 2. Configurar Cliente no FiberDoc

No arquivo `.env` do FiberDoc:

```bash
# Servidor de distribuição
DISTRIBUTION_SERVER=https://updates.fiberdoc.com

# Intervalo de verificação (em ms, padrão: 86400000 = 24h)
UPDATE_CHECK_INTERVAL=86400000

# Versão atual (será detectada automaticamente)
FIBERDOC_VERSION=1.1.0
```

### 3. Iniciar Verificação Automática

No `server/_core/index.ts`, adicione:

```typescript
import { startUpdateChecker } from "../updateClient";

// Iniciar verificador de atualizações
await startUpdateChecker();
```

---

## 📋 Fluxo de Atualização Automática

```
1. INICIALIZAÇÃO (ao ligar FiberDoc)
   └─ startUpdateChecker()
      ├─ Carregar status anterior
      ├─ Fazer verificação inicial
      └─ Agendar verificações periódicas (24h)

2. VERIFICAÇÃO PERIÓDICA (a cada 24h)
   └─ checkForUpdates()
      ├─ Conectar ao servidor de distribuição
      ├─ Enviar versão atual
      ├─ Receber lista de atualizações disponíveis
      └─ Salvar status no banco de dados

3. DETECÇÃO DE ATUALIZAÇÃO
   ├─ Se atualização crítica: notificar admin imediatamente
   ├─ Se atualização normal: aguardar confirmação do admin
   └─ Se pré-release: ignorar (a menos que configurado)

4. DOWNLOAD E INSTALAÇÃO (manual ou automático)
   └─ downloadAndInstallUpdate(version)
      ├─ Fazer backup dos arquivos atuais
      ├─ Download do pacote ZIP
      ├─ Verificar integridade (checksum MD5)
      ├─ Extrair pacote
      ├─ Executar script INSTALL.sh
      ├─ Reiniciar FiberDoc
      └─ Salvar novo status

5. NOTIFICAÇÃO
   ├─ Notificar admin sobre sucesso/erro
   ├─ Registrar no log de auditoria
   └─ Atualizar dashboard de status
```

---

## 🔐 Segurança

### Validação de Integridade

Cada pacote é validado com:
- **Checksum MD5** — Verificar se arquivo não foi corrompido
- **Tamanho máximo** — Prevenir ataques DoS
- **Assinatura digital** — (Opcional) Verificar autenticidade

### Autenticação

- **Servidor:** API key via header `X-API-Key`
- **Cliente:** Sem autenticação (downloads são públicos)
- **Admin:** JWT token para operações sensíveis

### Backup Automático

Antes de cada instalação:
- Backup completo em `/opt/fiberdoc/backups/YYYYMMDD-HHMMSS/`
- Retenção de 30 dias
- Rollback automático em caso de erro

---

## 📊 Endpoints da API

### GET /api/distribution/releases
Listar todas as releases

```bash
curl https://updates.fiberdoc.com/api/distribution/releases
```

**Resposta:**
```json
{
  "releases": [
    {
      "version": "1.2.0",
      "releaseDate": "2026-03-09T18:54:26Z",
      "description": "...",
      "changelog": "...",
      "critical": false,
      "prerelease": false,
      "downloadUrl": "/api/distribution/download/1.2.0",
      "checksum": "a1b2c3d4...",
      "size": 47185920
    }
  ],
  "latestVersion": "1.2.0",
  "latestStableVersion": "1.2.0"
}
```

---

### GET /api/distribution/check-update
Verificar se há atualização disponível

```bash
curl "https://updates.fiberdoc.com/api/distribution/check-update?currentVersion=1.1.0&includePrerelease=false"
```

**Resposta:**
```json
{
  "currentVersion": "1.1.0",
  "hasUpdate": true,
  "nextVersion": "1.2.0",
  "nextRelease": {
    "version": "1.2.0",
    "description": "...",
    "changelog": "...",
    "critical": false,
    "downloadUrl": "/api/distribution/download/1.2.0",
    "checksum": "a1b2c3d4...",
    "size": 47185920
  },
  "criticalUpdate": null,
  "availableReleases": [...]
}
```

---

### GET /api/distribution/download/:version
Download de pacote específico

```bash
curl -O https://updates.fiberdoc.com/api/distribution/download/1.2.0
```

---

### POST /api/distribution/register-release
Registrar nova release (admin)

```bash
curl -X POST https://updates.fiberdoc.com/api/distribution/register-release \
  -H "X-API-Key: sua-chave-secreta" \
  -H "Content-Type: application/json" \
  -d '{
    "version": "1.2.0",
    "description": "Nova versão",
    "changelog": "- Novo: Feature X\n- Correção: Bug Y",
    "critical": false,
    "prerelease": false,
    "filename": "fiberdoc-update-1.2.0.zip",
    "platform": "all"
  }'
```

---

## 🎯 Casos de Uso

### Caso 1: Atualização Automática Silenciosa
```typescript
// FiberDoc verifica a cada 24h
// Se houver atualização não-crítica, aguarda confirmação do admin
// Se houver atualização crítica, instala automaticamente
```

### Caso 2: Atualização Manual
```typescript
// Admin clica em "Verificar Atualizações" no dashboard
// FiberDoc verifica imediatamente
// Admin clica em "Instalar" se houver atualização
```

### Caso 3: Rollback
```typescript
// Se instalação falhar, FiberDoc restaura backup automaticamente
// Admin pode restaurar versão anterior manualmente
```

---

## 📈 Monitoramento

### Status de Atualização

```typescript
const status = await getUpdateStatus();
// {
//   status: "idle" | "checking" | "downloading" | "installing" | "completed" | "failed",
//   currentVersion: "1.1.0",
//   latestVersion: "1.2.0",
//   progress: 45,
//   error: null,
//   lastCheck: "2026-03-09T18:54:26Z",
//   nextCheck: "2026-03-10T18:54:26Z"
// }
```

### Logs

```bash
# Ver logs de atualização
tail -f /var/log/fiberdoc.log | grep UpdateClient

# Ver logs do servidor de distribuição
tail -f /var/log/fiberdoc-distribution.log | grep UpdateDistribution
```

---

## 🚨 Troubleshooting

### Erro: "Servidor de distribuição indisponível"

**Causa:** Servidor central está offline

**Solução:**
```bash
# Verificar health do servidor
curl https://updates.fiberdoc.com/api/distribution/health

# Se offline, tentar novamente em 24h (próxima verificação automática)
# Ou forçar verificação manual quando servidor estiver online
```

---

### Erro: "Checksum inválido"

**Causa:** Arquivo foi corrompido durante download

**Solução:**
```bash
# FiberDoc tenta novamente automaticamente
# Se persistir, contatar suporte técnico
```

---

### Atualização Falhou

**Solução:**
```bash
# 1. FiberDoc restaura backup automaticamente
# 2. Verificar logs
tail -f /var/log/fiberdoc.log

# 3. Se necessário, restaurar manualmente
cd /opt/fiberdoc/backups
ls -lt | head -1  # Ver backup mais recente
cp -r YYYYMMDD-HHMMSS/* /opt/fiberdoc/

# 4. Reiniciar
systemctl restart fiberdoc
```

---

## 📚 Referências

- [Geração de Pacotes](./UPDATE_SYSTEM.md)
- [Servidor de Distribuição](./server/updateDistributionServer.ts)
- [Cliente de Atualização](./server/updateClient.ts)
- [Webhook SGP](./WEBHOOK_SGP_SETUP.md)
