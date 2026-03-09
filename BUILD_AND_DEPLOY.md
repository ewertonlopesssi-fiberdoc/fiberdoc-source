# Build e Deploy do FiberDoc com Pacote tar.gz

## 📋 Visão Geral

Sistema completo para criar pacotes pré-compilados do FiberDoc em tar.gz e fazer deploy em qualquer servidor, exatamente como você estava fazendo manualmente.

```
┌──────────────────────────────────────────────────────────────┐
│  DESENVOLVIMENTO (Seu Computador)                            │
│                                                              │
│  bash scripts/build-package.sh 1.2.0 ~/packages/            │
│  ↓                                                           │
│  fiberdoc-deploy-v1.2.0.tar.gz (pré-compilado)              │
└──────────────────────────────────────────────────────────────┘
                            ↓
                    (Upload para servidor)
                            ↓
┌──────────────────────────────────────────────────────────────┐
│  SERVIDOR DE PRODUÇÃO                                        │
│                                                              │
│  cd ~                                                        │
│  wget -O fiberdoc-v1.2.0.tar.gz "https://..."               │
│  tar -xzf fiberdoc-v1.2.0.tar.gz                            │
│  cd fiberdoc-deploy-v1.2.0                                  │
│  bash deploy.sh                                             │
│  ↓                                                           │
│  ✓ FiberDoc instalado e rodando                             │
└──────────────────────────────────────────────────────────────┘
```

---

## 🔨 Build (Desenvolvimento)

### 1. Criar Pacote tar.gz

```bash
# Ir para diretório do projeto
cd /home/ubuntu/fiber_doc_system

# Criar pacote com versão específica
bash scripts/build-package.sh 1.2.0

# Ou deixar versão automática (do package.json)
bash scripts/build-package.sh

# Ou especificar diretório de saída
bash scripts/build-package.sh 1.2.0 ~/packages/
```

### 2. Saída do Build

```
fiberdoc-deploy-v1.2.0.tar.gz     (pacote compilado)
fiberdoc-deploy-v1.2.0.md5        (checksum MD5)
fiberdoc-deploy-v1.2.0.sha256     (checksum SHA256)
```

### 3. Verificar Integridade

```bash
# Verificar MD5
md5sum -c fiberdoc-deploy-v1.2.0.md5

# Verificar SHA256
sha256sum -c fiberdoc-deploy-v1.2.0.sha256
```

---

## 📤 Upload para Servidor

### Opção 1: Via SCP (Recomendado)

```bash
# Copiar pacote para servidor
scp fiberdoc-deploy-v1.2.0.tar.gz usuario@seu-servidor.com:~/

# Verificar
ssh usuario@seu-servidor.com "ls -lh ~/fiberdoc-deploy-v1.2.0.tar.gz"
```

### Opção 2: Via HTTP (Se tiver servidor web)

```bash
# Copiar para servidor web
cp fiberdoc-deploy-v1.2.0.tar.gz /var/www/html/

# Acessível via
# https://seu-servidor.com/fiberdoc-deploy-v1.2.0.tar.gz
```

### Opção 3: Via FTP/SFTP

```bash
# Usar cliente FTP/SFTP favorito
# Copiar para /home/usuario/
```

---

## 🚀 Deploy (Servidor)

### 1. Download e Extração

```bash
# SSH no servidor
ssh usuario@seu-servidor.com

# Ir para home
cd ~

# Download (escolha uma opção)

# Opção A: Via wget (HTTP)
wget -O fiberdoc-v1.2.0.tar.gz "https://seu-servidor.com/fiberdoc-deploy-v1.2.0.tar.gz"

# Opção B: Se arquivo já está no servidor
# (já foi copiado via SCP)
ls -lh fiberdoc-deploy-v1.2.0.tar.gz

# Extrair
tar -xzf fiberdoc-deploy-v1.2.0.tar.gz

# Entrar no diretório
cd fiberdoc-deploy-v1.2.0
```

### 2. Executar Deploy

```bash
# Deploy no diretório padrão (/opt/fiberdoc)
bash deploy.sh

# Ou especificar diretório customizado
bash deploy.sh /home/usuario/fiberdoc

# Ou com sudo (se necessário)
sudo bash deploy.sh /opt/fiberdoc
```

### 3. Monitorar Deploy

```bash
# Ver logs em tempo real
tail -f /var/log/fiberdoc-deploy.log

# Em outro terminal, verificar status
systemctl status fiberdoc

# Ou acessar
curl http://localhost:3000/health
```

### 4. Verificar Instalação

```bash
# Acessar via navegador
http://seu-servidor.com:3000

# Ou via curl
curl http://localhost:3000

# Ver logs da aplicação
journalctl -u fiberdoc -n 50 -f
```

---

## 📊 Fluxo Completo (Passo a Passo)

### No Desenvolvimento

```bash
# 1. Atualizar código
cd ~/fiber_doc_system
git pull origin main

# 2. Testar localmente
pnpm run dev

# 3. Criar pacote
bash scripts/build-package.sh 1.2.0 ~/packages/

# 4. Verificar pacote
ls -lh ~/packages/fiberdoc-deploy-v1.2.0*
md5sum -c ~/packages/fiberdoc-deploy-v1.2.0.md5

# 5. Copiar para servidor
scp ~/packages/fiberdoc-deploy-v1.2.0.tar.gz usuario@seu-servidor.com:~/
```

### No Servidor

```bash
# 1. SSH
ssh usuario@seu-servidor.com

# 2. Preparar
cd ~
tar -xzf fiberdoc-deploy-v1.2.0.tar.gz
cd fiberdoc-deploy-v1.2.0

# 3. Deploy
bash deploy.sh

# 4. Verificar
tail -f /var/log/fiberdoc-deploy.log

# 5. Testar
curl http://localhost:3000
```

---

## 🔄 Atualizar Versão Existente

Se já tem FiberDoc instalado e quer atualizar:

```bash
# No servidor
cd ~

# Download novo pacote
wget -O fiberdoc-v1.2.1.tar.gz "https://seu-servidor.com/fiberdoc-deploy-v1.2.1.tar.gz"

# Extrair
tar -xzf fiberdoc-v1.2.1.tar.gz
cd fiberdoc-deploy-v1.2.1

# Deploy (fará backup automático)
bash deploy.sh /opt/fiberdoc

# Ver logs
tail -f /var/log/fiberdoc-deploy.log
```

---

## 🔙 Rollback (Restaurar Versão Anterior)

Se algo der errado:

```bash
# Listar backups
ls -lt /opt/fiberdoc/backups/

# Restaurar backup
BACKUP_DATE="20260309-185426"
cp -r /opt/fiberdoc/backups/${BACKUP_DATE}/* /opt/fiberdoc/

# Reinstalar dependências
cd /opt/fiberdoc
pnpm install

# Reiniciar
systemctl restart fiberdoc

# Verificar
curl http://localhost:3000
```

---

## 🔐 Segurança

### Verificar Integridade do Pacote

Sempre verificar checksum antes de instalar:

```bash
# Calcular checksum local
sha256sum fiberdoc-deploy-v1.2.0.tar.gz

# Comparar com checksum fornecido
cat fiberdoc-deploy-v1.2.0.sha256

# Ou verificar automaticamente
sha256sum -c fiberdoc-deploy-v1.2.0.sha256
```

### Permissões

```bash
# Executar com permissões apropriadas
sudo bash deploy.sh /opt/fiberdoc

# Ou como usuário específico
sudo -u fiberdoc bash deploy.sh /home/fiberdoc
```

---

## 📊 Estrutura do Pacote tar.gz

```
fiberdoc-deploy-vX.X.X/
├── server/              # Código do servidor
├── client/              # Código do cliente (compilado)
├── drizzle/             # Migrações de banco
├── shared/              # Código compartilhado
├── scripts/             # Scripts utilitários
├── storage/             # Helpers de storage
├── package.json         # Dependências
├── pnpm-lock.yaml       # Lock file (opcional)
├── tsconfig.json        # Configuração TypeScript
├── vite.config.ts       # Configuração Vite
├── vitest.config.ts     # Configuração Vitest
├── deploy.sh            # Script de instalação
├── DEPLOY_README.md     # Documentação
└── README.md            # README original
```

---

## 🆘 Troubleshooting

### Erro: "Permissão negada ao criar /opt/fiberdoc"

```bash
# Solução 1: Usar sudo
sudo bash deploy.sh /opt/fiberdoc

# Solução 2: Usar diretório com permissão
bash deploy.sh /home/usuario/fiberdoc

# Solução 3: Criar diretório com permissão
sudo mkdir -p /opt/fiberdoc
sudo chown usuario:usuario /opt/fiberdoc
bash deploy.sh /opt/fiberdoc
```

---

### Erro: "Porta 3000 já em uso"

```bash
# Encontrar processo usando porta
lsof -i :3000

# Matar processo
kill -9 <PID>

# Ou mudar porta em .env
VITE_PORT=3001
```

---

### Erro: "Dependências não instaladas"

```bash
# Reinstalar manualmente
cd /opt/fiberdoc
pnpm install --frozen-lockfile

# Se ainda falhar, limpar cache
pnpm store prune
pnpm install
```

---

### Deploy Travou

```bash
# Ver logs
tail -100 /var/log/fiberdoc-deploy.log

# Restaurar backup
cp -r /opt/fiberdoc/backups/YYYYMMDD-HHMMSS/* /opt/fiberdoc/

# Reiniciar
systemctl restart fiberdoc
```

---

## 📝 Logs

### Build (Desenvolvimento)

```bash
# Logs aparecem no terminal durante build-package.sh
# Salvar logs
bash scripts/build-package.sh 1.2.0 ~/packages/ 2>&1 | tee build.log
```

### Deploy (Servidor)

```bash
# Log principal
/var/log/fiberdoc-deploy.log

# Log da aplicação
/var/log/fiberdoc.log
journalctl -u fiberdoc -n 100 -f
```

---

## 🎯 Checklist de Deploy

- [ ] Pacote tar.gz criado com `build-package.sh`
- [ ] Checksum verificado (SHA256)
- [ ] Pacote copiado para servidor via SCP
- [ ] SSH no servidor
- [ ] Pacote extraído com `tar -xzf`
- [ ] `bash deploy.sh` executado
- [ ] Logs verificados sem erros
- [ ] Aplicação acessível em http://localhost:3000
- [ ] Banco de dados conectado
- [ ] Backup criado automaticamente
- [ ] Documentação atualizada

---

## 📚 Referências

- [Script de Build](./scripts/build-package.sh)
- [Script de Deploy](./scripts/build-package.sh) (incluído no pacote)
- [Documentação de Deploy Remoto SSH](./REMOTE_UPDATE_SSH.md)
- [Sistema de Distribuição](./DISTRIBUTION_SYSTEM.md)

---

## 💡 Dicas

### 1. Automatizar Build com Cron

```bash
# Criar build automático diariamente
0 2 * * * cd /home/ubuntu/fiber_doc_system && bash scripts/build-package.sh $(date +%Y%m%d) /var/www/html/

# Verificar
crontab -l
```

### 2. Hospedar Pacotes em Servidor Web

```bash
# Copiar pacotes para servidor web
cp ~/packages/fiberdoc-deploy-v*.tar.gz /var/www/html/

# Acessível via
# https://seu-servidor.com/fiberdoc-deploy-vX.X.X.tar.gz
```

### 3. Criar Script de Deploy Automático

```bash
#!/bin/bash
# deploy-auto.sh

VERSION=$1
SERVER=$2
USER=$3

echo "Copiando pacote..."
scp ~/packages/fiberdoc-deploy-v${VERSION}.tar.gz ${USER}@${SERVER}:~/

echo "Executando deploy..."
ssh ${USER}@${SERVER} << EOF
cd ~
tar -xzf fiberdoc-deploy-v${VERSION}.tar.gz
cd fiberdoc-deploy-v${VERSION}
bash deploy.sh
EOF

echo "Deploy concluído!"
```

---

## 🔗 Integração com CI/CD

Para automatizar build em CI/CD (GitHub Actions, GitLab CI, etc.):

```yaml
# .github/workflows/build.yml
name: Build FiberDoc Package

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'pnpm'
      
      - name: Build Package
        run: bash scripts/build-package.sh ${{ github.ref_name }} ./dist/
      
      - name: Upload Artifacts
        uses: actions/upload-artifact@v3
        with:
          name: fiberdoc-packages
          path: dist/
```

