# Atualização Remota do FiberDoc via SSH

## 📋 Visão Geral

Sistema completo para atualizar o FiberDoc no servidor remoto via SSH, sem necessidade de acesso direto ao servidor.

```
┌─────────────────────────────────────────────────────────────┐
│  SEU COMPUTADOR (Desenvolvimento)                           │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ FiberDoc Dashboard                                    │ │
│  │ Sistema → Configurações → Atualização Remota         │ │
│  │                                                       │ │
│  │ [Disparar Atualização] ← Clica aqui                  │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ↓
                     Endpoint tRPC
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  SERVIDOR DE PRODUÇÃO                                       │
│  (ex: 192.168.1.100)                                        │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ Executa:                                              │ │
│  │ bash /opt/fiberdoc/scripts/remote-update.sh           │ │
│  │                                                       │ │
│  │ 1. Verifica versão disponível                         │ │
│  │ 2. Faz backup                                         │ │
│  │ 3. Para FiberDoc                                      │ │
│  │ 4. Baixa pacote                                       │ │
│  │ 5. Extrai e instala                                   │ │
│  │ 6. Compila                                            │ │
│  │ 7. Reinicia FiberDoc                                  │ │
│  │ 8. Verifica integridade                               │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔧 Configuração

### 1. Preparar Servidor Remoto

```bash
# SSH no servidor
ssh usuario@seu-servidor.com

# Criar diretório de scripts (se não existir)
mkdir -p /opt/fiberdoc/scripts

# Copiar script de atualização
scp scripts/remote-update.sh usuario@seu-servidor.com:/opt/fiberdoc/scripts/

# Dar permissão de execução
ssh usuario@seu-servidor.com "chmod +x /opt/fiberdoc/scripts/remote-update.sh"
```

### 2. Configurar Chave SSH (Recomendado)

Para autenticação sem senha:

```bash
# Gerar chave SSH (se não tiver)
ssh-keygen -t ed25519 -f ~/.ssh/fiberdoc -N ""

# Copiar chave pública para servidor
ssh-copy-id -i ~/.ssh/fiberdoc usuario@seu-servidor.com

# Testar conexão
ssh -i ~/.ssh/fiberdoc usuario@seu-servidor.com "echo 'OK'"
```

### 3. Configurar Variáveis de Ambiente

No FiberDoc, adicione ao `.env`:

```bash
# Configuração SSH para servidor remoto
REMOTE_SSH_HOST=seu-servidor.com
REMOTE_SSH_USER=usuario
REMOTE_SSH_PORT=22
REMOTE_SSH_KEY=/home/seu-usuario/.ssh/fiberdoc

# Servidor de distribuição
DISTRIBUTION_SERVER=https://updates.fiberdoc.com
```

---

## 🚀 Como Usar

### Opção 1: Via Dashboard (Recomendado)

1. Acessar: **Sistema → Configurações → Atualização Remota**
2. Preencher dados SSH:
   - Host: `seu-servidor.com`
   - Usuário: `usuario`
   - Porta: `22`
   - Chave privada: (colar conteúdo ou deixar em branco se usar senha)
3. Clicar: **"Verificar Atualizações"**
4. Se houver atualização, clicar: **"Instalar"**

### Opção 2: Via API tRPC

```typescript
// Verificar atualizações
const check = await trpc.remoteUpdate.checkRemoteUpdates.mutate({
  host: "seu-servidor.com",
  user: "usuario",
  port: 22,
  privateKey: "-----BEGIN OPENSSH PRIVATE KEY-----\n...",
});

// Disparar atualização
const update = await trpc.remoteUpdate.triggerRemoteUpdate.mutate({
  host: "seu-servidor.com",
  user: "usuario",
  port: 22,
  version: "latest",
  distributionServer: "https://updates.fiberdoc.com",
  privateKey: "...",
});

// Obter logs
const logs = await trpc.remoteUpdate.getRemoteUpdateLogs.query({
  host: "seu-servidor.com",
  user: "usuario",
  port: 22,
  lines: 50,
});
```

### Opção 3: Via SSH Direto

```bash
# SSH no servidor
ssh usuario@seu-servidor.com

# Executar script manualmente
bash /opt/fiberdoc/scripts/remote-update.sh latest https://updates.fiberdoc.com

# Ou especificar versão
bash /opt/fiberdoc/scripts/remote-update.sh 1.2.0
```

---

## 📊 Endpoints tRPC

### getStatus
Obter status atual de atualização

```typescript
const status = await trpc.remoteUpdate.getStatus.query();
// {
//   status: "idle" | "checking" | "updating" | "completed" | "failed",
//   currentVersion: "1.1.0",
//   targetVersion: "1.2.0",
//   progress: 45,
//   message: "Instalando dependências...",
//   error: null
// }
```

---

### checkRemoteUpdates
Verificar atualizações no servidor remoto

```typescript
const result = await trpc.remoteUpdate.checkRemoteUpdates.mutate({
  host: "seu-servidor.com",
  user: "usuario",
  port: 22,
  privateKey: "...", // opcional
});
// {
//   success: true,
//   remoteVersion: "1.1.0",
//   localVersion: "1.2.0",
//   updateAvailable: false
// }
```

---

### triggerRemoteUpdate
Disparar atualização remota

```typescript
const result = await trpc.remoteUpdate.triggerRemoteUpdate.mutate({
  host: "seu-servidor.com",
  user: "usuario",
  port: 22,
  version: "latest",
  distributionServer: "https://updates.fiberdoc.com",
  privateKey: "...", // opcional
});
// {
//   success: true,
//   status: "updating",
//   message: "Atualização iniciada para versão 1.2.0",
//   note: "Monitore o progresso via logs do servidor"
// }
```

---

### getRemoteUpdateLogs
Obter logs de atualização do servidor

```typescript
const logs = await trpc.remoteUpdate.getRemoteUpdateLogs.query({
  host: "seu-servidor.com",
  user: "usuario",
  port: 22,
  lines: 50,
});
// {
//   success: true,
//   logs: "2026-03-09 18:54:26 [INFO] Fase 1: Verificando atualizações...\n..."
// }
```

---

### listRemoteBackups
Listar backups disponíveis no servidor

```typescript
const backups = await trpc.remoteUpdate.listRemoteBackups.query({
  host: "seu-servidor.com",
  user: "usuario",
  port: 22,
});
// {
//   success: true,
//   backups: [
//     { date: "20260309-185426", timestamp: "2026-03-09T18:54:26Z" },
//     { date: "20260308-120000", timestamp: "2026-03-08T12:00:00Z" }
//   ]
// }
```

---

### rollbackRemote
Fazer rollback para versão anterior

```typescript
const result = await trpc.remoteUpdate.rollbackRemote.mutate({
  host: "seu-servidor.com",
  user: "usuario",
  port: 22,
  backupDate: "20260308-120000",
});
// {
//   success: true,
//   message: "Rollback iniciado para backup 20260308-120000"
// }
```

---

## 📋 Fluxo de Atualização Remota

```
1. VERIFICAÇÃO
   └─ checkRemoteUpdates()
      ├─ Conectar via SSH
      ├─ Obter versão remota
      ├─ Comparar com versão local
      └─ Retornar resultado

2. DISPARO
   └─ triggerRemoteUpdate()
      ├─ Validar permissão (admin)
      ├─ Conectar via SSH
      ├─ Executar remote-update.sh em background
      └─ Retornar status "updating"

3. MONITORAMENTO
   └─ getRemoteUpdateLogs()
      ├─ Conectar via SSH
      ├─ Obter últimas linhas do log
      └─ Retornar logs

4. CONCLUSÃO
   ├─ Status muda para "completed" ou "failed"
   ├─ Notificar admin
   └─ Opção de rollback se necessário
```

---

## 🔐 Segurança

### Autenticação SSH

**Opção 1: Chave Privada (Recomendado)**
```bash
# Gerar chave
ssh-keygen -t ed25519 -f ~/.ssh/fiberdoc -N ""

# Usar na API
const result = await trpc.remoteUpdate.triggerRemoteUpdate.mutate({
  host: "seu-servidor.com",
  user: "usuario",
  privateKey: fs.readFileSync("~/.ssh/fiberdoc", "utf-8"),
});
```

**Opção 2: Senha (Menos Seguro)**
```bash
# Usar SSH com prompt de senha
ssh -p 22 usuario@seu-servidor.com "bash /opt/fiberdoc/scripts/remote-update.sh"
```

### Validações

- ✅ Validação de host (apenas caracteres alfanuméricos e pontos)
- ✅ Validação de usuário (apenas caracteres válidos)
- ✅ Validação de porta (1-65535)
- ✅ Timeout de conexão (10 segundos)
- ✅ Permissão admin obrigatória para atualizar/rollback
- ✅ Backup automático antes de atualizar

---

## 📊 Monitoramento

### Logs de Atualização

No servidor remoto:

```bash
# Ver logs em tempo real
tail -f /var/log/fiberdoc-update.log

# Ver últimas 100 linhas
tail -100 /var/log/fiberdoc-update.log

# Filtrar por fase
grep "Fase" /var/log/fiberdoc-update.log
```

### Status do FiberDoc

```bash
# Verificar se está rodando
systemctl status fiberdoc

# Ver logs do FiberDoc
journalctl -u fiberdoc -n 50 -f
```

---

## 🚨 Troubleshooting

### Erro: "Conexão SSH recusada"

**Causa:** Servidor SSH não está acessível

**Solução:**
```bash
# Testar conexão SSH
ssh -v usuario@seu-servidor.com

# Verificar firewall
sudo ufw allow 22/tcp

# Verificar SSH está rodando
sudo systemctl status ssh
```

---

### Erro: "Autenticação falhou"

**Causa:** Credenciais incorretas ou chave inválida

**Solução:**
```bash
# Testar com chave específica
ssh -i ~/.ssh/fiberdoc usuario@seu-servidor.com

# Se usar senha, remover chave privada do formulário
# e deixar em branco (será solicitada senha)
```

---

### Atualização Travou

**Solução:**
```bash
# SSH no servidor
ssh usuario@seu-servidor.com

# Ver processo
ps aux | grep fiberdoc

# Matar processo se necessário
pkill -f "node.*fiberdoc"

# Verificar logs
tail -f /var/log/fiberdoc-update.log

# Se necessário, restaurar backup manualmente
cp -r /opt/fiberdoc/backups/YYYYMMDD-HHMMSS/* /opt/fiberdoc/
systemctl restart fiberdoc
```

---

### Rollback Falhou

**Solução:**
```bash
# SSH no servidor
ssh usuario@seu-servidor.com

# Listar backups
ls -lt /opt/fiberdoc/backups/

# Restaurar manualmente
BACKUP_DATE="20260308-120000"
cp -r /opt/fiberdoc/backups/${BACKUP_DATE}/* /opt/fiberdoc/

# Reinstalar dependências
cd /opt/fiberdoc
pnpm install

# Reiniciar
systemctl restart fiberdoc
```

---

## 📚 Referências

- [Sistema de Distribuição](./DISTRIBUTION_SYSTEM.md)
- [Sistema de Atualização](./UPDATE_SYSTEM.md)
- [Script de Atualização Remota](./scripts/remote-update.sh)
- [Router tRPC](./server/remoteUpdateRouter.ts)

---

## 🎯 Checklist de Configuração

- [ ] Servidor SSH acessível
- [ ] Chave SSH configurada (ou senha disponível)
- [ ] Script `remote-update.sh` no servidor
- [ ] Variáveis de ambiente configuradas
- [ ] Servidor de distribuição acessível
- [ ] Permissões corretas no servidor
- [ ] Backup automático funcionando
- [ ] Logs sendo registrados
- [ ] Teste com atualização não-crítica
- [ ] Documentação atualizada

