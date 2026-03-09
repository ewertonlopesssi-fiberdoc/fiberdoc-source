# Sistema de Atualização do FiberDoc

## 📋 Visão Geral

O FiberDoc possui um sistema completo de atualização que permite:

1. **Gerar pacotes de atualização** — Criar ZIP com todas as mudanças
2. **Servir pacotes via HTTP** — Download seguro com validação
3. **Instalar automaticamente** — Script que aplica atualização no servidor
4. **Fazer backup automático** — Backup antes de cada atualização
5. **Rollback** — Restaurar versão anterior se necessário

---

## 🔧 Como Usar

### Passo 1: Gerar Pacote de Atualização (Desenvolvimento)

No seu computador local (onde está o código-fonte):

```bash
cd /home/ubuntu/fiber_doc_system

# Gerar pacote com versão automática
./scripts/generate-update-package.sh

# Ou especificar versão
./scripts/generate-update-package.sh 1.2.0
```

**Resultado:**
```
📦 Pacote criado: fiberdoc-update-1.2.0.zip
📍 Localização: /home/ubuntu/fiber_doc_system/updates/fiberdoc-update-1.2.0.zip
📊 Tamanho: 45 MB
🔐 Checksum: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
```

---

### Passo 2: Upload do Pacote no Servidor

#### **Opção A: Via SCP (Recomendado)**

```bash
# Do seu computador local
scp updates/fiberdoc-update-1.2.0.zip usuario@servidor:/tmp/

# No servidor
cd /tmp
unzip fiberdoc-update-1.2.0.zip
cd build-*
bash INSTALL.sh
```

#### **Opção B: Via UI do FiberDoc (Admin)**

1. Acessar: **Sistema → Configurações → Atualização**
2. Clicar em: **"Upload de Pacote"**
3. Selecionar arquivo ZIP
4. Clicar em: **"Instalar"**

#### **Opção C: Via API REST**

```bash
# Upload do pacote
curl -X POST https://seu-fiberdoc.com/api/updates/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@fiberdoc-update-1.2.0.zip"

# Resposta
{
  "success": true,
  "filename": "fiberdoc-update-1.2.0.zip",
  "size": 47185920,
  "url": "/api/updates/download/fiberdoc-update-1.2.0.zip"
}
```

---

### Passo 3: Verificar Atualizações Disponíveis

#### **Via API**

```bash
# Obter informações de atualização
curl https://seu-fiberdoc.com/api/updates/info

# Resposta
{
  "currentVersion": "1.1.0",
  "latestVersion": "1.2.0",
  "packages": [
    {
      "version": "1.2.0",
      "filename": "fiberdoc-update-1.2.0.zip",
      "size": 47185920,
      "checksum": "a1b2c3d4...",
      "timestamp": "2026-03-09T18:54:26Z",
      "url": "/api/updates/download/fiberdoc-update-1.2.0.zip"
    }
  ]
}
```

#### **Via UI**

1. Acessar: **Sistema → Configurações → Atualização**
2. Ver versão atual e disponível
3. Clicar em: **"Verificar Atualizações"**

---

## 📦 Estrutura do Pacote

```
fiberdoc-update-1.2.0.zip
├── server/                    # Backend TypeScript
│   ├── db.ts
│   ├── routers.ts
│   ├── webhookHandler.ts     # ← Nova funcionalidade
│   └── ...
├── client/                    # Frontend React
│   ├── src/
│   ├── public/
│   └── ...
├── drizzle/                   # Database migrations
│   ├── schema.ts
│   └── migrations/
├── shared/                    # Tipos compartilhados
├── package.json               # Dependências
├── tsconfig.json              # Config TypeScript
├── vite.config.ts             # Config Vite
├── UPDATE_MANIFEST.json       # Metadados da atualização
└── INSTALL.sh                 # Script de instalação
```

---

## 🔄 Fluxo de Instalação

```
1. BACKUP
   ├─ Parar FiberDoc
   ├─ Copiar server/ para backup/
   ├─ Copiar client/ para backup/
   └─ Copiar drizzle/ para backup/

2. INSTALAÇÃO
   ├─ Copiar arquivos atualizados
   ├─ Instalar dependências (pnpm install)
   ├─ Compilar (pnpm run build)
   └─ Iniciar FiberDoc

3. VERIFICAÇÃO
   ├─ Verificar se processo está rodando
   ├─ Verificar logs
   └─ Testar endpoints principais

4. ROLLBACK (se necessário)
   ├─ Parar FiberDoc
   ├─ Restaurar arquivos do backup
   ├─ Instalar dependências
   └─ Reiniciar FiberDoc
```

---

## 📊 Endpoints da API de Atualização

### GET /api/updates/info
Obter informações sobre atualizações disponíveis

```bash
curl https://seu-fiberdoc.com/api/updates/info
```

**Resposta:**
```json
{
  "currentVersion": "1.1.0",
  "latestVersion": "1.2.0",
  "packages": [...],
  "changelog": "Veja CHANGELOG.md"
}
```

---

### GET /api/updates/list
Listar todos os pacotes de atualização

```bash
curl https://seu-fiberdoc.com/api/updates/list
```

---

### GET /api/updates/download/:filename
Download de pacote específico

```bash
curl -O https://seu-fiberdoc.com/api/updates/download/fiberdoc-update-1.2.0.zip
```

---

### POST /api/updates/upload
Upload de novo pacote (admin only)

```bash
curl -X POST https://seu-fiberdoc.com/api/updates/upload \
  -H "Authorization: Bearer TOKEN" \
  -F "file=@fiberdoc-update-1.2.0.zip"
```

---

### DELETE /api/updates/:filename
Deletar pacote (admin only)

```bash
curl -X DELETE https://seu-fiberdoc.com/api/updates/fiberdoc-update-1.2.0.zip \
  -H "Authorization: Bearer TOKEN"
```

---

## 🔐 Segurança

### Validação de Pacote

Cada pacote é validado com:

1. **Checksum MD5** — Verificar integridade
2. **Tamanho máximo** — 500 MB
3. **Tipo de arquivo** — Apenas ZIP
4. **Nome do arquivo** — Validação de padrão

### Autenticação

- Upload/Delete requerem **admin**
- Download é **público** (sem autenticação)
- Validação via JWT token

### Backup Automático

Antes de cada instalação:
- Backup em: `/opt/fiberdoc/backups/YYYYMMDD-HHMMSS/`
- Inclui: `server/`, `client/`, `drizzle/`, `package.json`
- Retenção: 30 dias (configurável)

---

## 🚨 Troubleshooting

### Erro: "Pacote não encontrado"

**Causa:** Arquivo não foi enviado corretamente

**Solução:**
```bash
# Verificar se arquivo existe
ls -lh /opt/fiberdoc/updates/

# Se não existir, fazer upload novamente
```

---

### Erro: "Arquivo muito grande"

**Causa:** Pacote > 500 MB

**Solução:**
```bash
# Verificar tamanho
du -h fiberdoc-update-1.2.0.zip

# Comprimir mais (remover node_modules, etc.)
./scripts/generate-update-package.sh 1.2.0
```

---

### Erro: "Falha na instalação"

**Causa:** Erro durante compilação ou instalação

**Solução:**
```bash
# 1. Verificar logs
tail -f /var/log/fiberdoc.log

# 2. Restaurar backup
cp -r /opt/fiberdoc/backups/YYYYMMDD-HHMMSS/* /opt/fiberdoc/

# 3. Reiniciar
systemctl restart fiberdoc
```

---

### FiberDoc não inicia após atualização

**Solução:**
```bash
# 1. Parar processo
pkill -f "node.*fiberdoc"

# 2. Restaurar backup
cd /opt/fiberdoc/backups
ls -lt | head -1  # Ver backup mais recente
cp -r YYYYMMDD-HHMMSS/* /opt/fiberdoc/

# 3. Instalar dependências
cd /opt/fiberdoc
pnpm install

# 4. Iniciar
systemctl start fiberdoc

# 5. Verificar logs
tail -f /var/log/fiberdoc.log
```

---

## 📋 Checklist de Atualização

- [ ] Gerar pacote: `./scripts/generate-update-package.sh`
- [ ] Verificar tamanho: `du -h updates/fiberdoc-update-*.zip`
- [ ] Testar em ambiente de staging
- [ ] Fazer backup manual: `cp -r /opt/fiberdoc /opt/fiberdoc.backup`
- [ ] Upload do pacote
- [ ] Executar instalação
- [ ] Verificar se FiberDoc iniciou
- [ ] Testar endpoints principais
- [ ] Verificar logs: `tail -f /var/log/fiberdoc.log`
- [ ] Confirmar versão: `curl /api/updates/info`
- [ ] Limpar pacotes antigos: `rm updates/fiberdoc-update-old-*.zip`

---

## 🔄 Rollback para Versão Anterior

Se algo der errado:

```bash
# 1. Listar backups disponíveis
ls -lt /opt/fiberdoc/backups/

# 2. Restaurar backup
BACKUP_DATE="20260309-185426"
cp -r /opt/fiberdoc/backups/${BACKUP_DATE}/* /opt/fiberdoc/

# 3. Reinstalar dependências
cd /opt/fiberdoc
pnpm install

# 4. Reiniciar
systemctl restart fiberdoc

# 5. Verificar
curl https://seu-fiberdoc.com/api/updates/info
```

---

## 📞 Suporte

Para problemas:

1. Verificar logs: `tail -f /var/log/fiberdoc.log`
2. Verificar disk space: `df -h`
3. Verificar memória: `free -h`
4. Contactar suporte técnico com logs

---

## 📚 Referências

- [Geração de Pacotes](./scripts/generate-update-package.sh)
- [Servidor de Atualização](./server/updateServer.ts)
- [Webhook SGP](./WEBHOOK_SGP_SETUP.md)
- [Changelog](./CHANGELOG.md)
