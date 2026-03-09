#!/bin/bash

###############################################################################
# build-package.sh — Criar Pacote tar.gz Pré-compilado do FiberDoc
#
# Este script compila o FiberDoc e cria um pacote tar.gz pronto para deploy
# em qualquer servidor, sem necessidade de compilação no servidor de destino
#
# Uso:
#   bash build-package.sh [versão] [saída]
#
# Exemplos:
#   bash build-package.sh 1.2.0
#   bash build-package.sh 1.2.0 /tmp/
#   bash build-package.sh latest ~/packages/
#
###############################################################################

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configurações
VERSION="${1:-$(grep -oP '"version":\s*"\K[^"]+' package.json)}"
OUTPUT_DIR="${2:-.}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "${SCRIPT_DIR}")"
BUILD_DIR="/tmp/fiberdoc-build-${VERSION}-$$"
PACKAGE_NAME="fiberdoc-deploy-v${VERSION}"
PACKAGE_FILE="${OUTPUT_DIR}/${PACKAGE_NAME}.tar.gz"

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  FiberDoc - Build & Package${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Função de log
log() {
    local level=$1
    shift
    local message="$@"
    echo -e "${BLUE}[${level}]${NC} ${message}"
}

# Função de erro
error_exit() {
    echo -e "${RED}[ERROR]${NC} $@"
    rm -rf "${BUILD_DIR}"
    exit 1
}

log "INFO" "Versão: ${VERSION}"
log "INFO" "Diretório de saída: ${OUTPUT_DIR}"
log "INFO" "Diretório de build: ${BUILD_DIR}"
echo ""

# ─── FASE 1: Validar Ambiente ─────────────────────────────────────────────

log "INFO" "Fase 1: Validando ambiente..."

if [ ! -f "${PROJECT_DIR}/package.json" ]; then
    error_exit "package.json não encontrado em ${PROJECT_DIR}"
fi

if ! command -v pnpm &> /dev/null; then
    error_exit "pnpm não está instalado"
fi

if ! command -v node &> /dev/null; then
    error_exit "Node.js não está instalado"
fi

NODE_VERSION=$(node -v)
PNPM_VERSION=$(pnpm -v)

log "INFO" "Node.js: ${NODE_VERSION}"
log "INFO" "pnpm: ${PNPM_VERSION}"
echo ""

# ─── FASE 2: Preparar Diretório de Build ──────────────────────────────────

log "INFO" "Fase 2: Preparando diretório de build..."

rm -rf "${BUILD_DIR}"
mkdir -p "${BUILD_DIR}"

# Copiar arquivos do projeto
cp -r "${PROJECT_DIR}/server" "${BUILD_DIR}/"
cp -r "${PROJECT_DIR}/client" "${BUILD_DIR}/"
cp -r "${PROJECT_DIR}/drizzle" "${BUILD_DIR}/"
cp -r "${PROJECT_DIR}/shared" "${BUILD_DIR}/"
cp -r "${PROJECT_DIR}/scripts" "${BUILD_DIR}/"
cp -r "${PROJECT_DIR}/storage" "${BUILD_DIR}/"
cp "${PROJECT_DIR}/package.json" "${BUILD_DIR}/"
cp "${PROJECT_DIR}/pnpm-lock.yaml" "${BUILD_DIR}/" 2>/dev/null || true
cp "${PROJECT_DIR}/tsconfig.json" "${BUILD_DIR}/"
cp "${PROJECT_DIR}/vite.config.ts" "${BUILD_DIR}/"
cp "${PROJECT_DIR}/vitest.config.ts" "${BUILD_DIR}/"
cp "${PROJECT_DIR}/.env.example" "${BUILD_DIR}/" 2>/dev/null || true
cp "${PROJECT_DIR}/README.md" "${BUILD_DIR}/" 2>/dev/null || true

log "INFO" "Arquivos copiados"
echo ""

# ─── FASE 3: Instalar Dependências ────────────────────────────────────────

log "INFO" "Fase 3: Instalando dependências..."

cd "${BUILD_DIR}"

if ! pnpm install --frozen-lockfile 2>&1 | tail -10; then
    error_exit "Erro ao instalar dependências"
fi

log "INFO" "Dependências instaladas"
echo ""

# ─── FASE 4: Compilar TypeScript ──────────────────────────────────────────

log "INFO" "Fase 4: Compilando TypeScript..."

if ! pnpm run build 2>&1 | tail -20; then
    error_exit "Erro na compilação"
fi

log "INFO" "Compilação concluída"
echo ""

# ─── FASE 5: Criar Script de Deploy ───────────────────────────────────────

log "INFO" "Fase 5: Criando script de deploy..."

cat > "${BUILD_DIR}/deploy.sh" << 'DEPLOY_SCRIPT'
#!/bin/bash

###############################################################################
# deploy.sh — Script de Deploy do FiberDoc
#
# Este script é executado no servidor de destino para instalar o FiberDoc
#
# Uso:
#   bash deploy.sh [diretório-destino]
#
# Exemplos:
#   bash deploy.sh
#   bash deploy.sh /opt/fiberdoc
#
###############################################################################

set -e

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configurações
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST_DIR="${1:-/opt/fiberdoc}"
BACKUP_DIR="${DEST_DIR}/backups/$(date +%Y%m%d-%H%M%S)"
LOG_FILE="/var/log/fiberdoc-deploy.log"

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  FiberDoc - Deploy${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

log() {
    local level=$1
    shift
    local message="$@"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${timestamp} [${level}] ${message}" | tee -a "${LOG_FILE}"
}

error_exit() {
    log "ERROR" "$@"
    exit 1
}

log "INFO" "Diretório de destino: ${DEST_DIR}"
log "INFO" "Log: ${LOG_FILE}"
echo ""

# ─── FASE 1: Verificar Permissões ─────────────────────────────────────────

log "INFO" "Fase 1: Verificando permissões..."

if [ ! -w "$(dirname "${DEST_DIR}")" ]; then
    error_exit "Sem permissão de escrita em $(dirname "${DEST_DIR}")"
fi

log "INFO" "Permissões OK"
echo ""

# ─── FASE 2: Fazer Backup ─────────────────────────────────────────────────

if [ -d "${DEST_DIR}" ]; then
    log "INFO" "Fase 2: Fazendo backup..."
    
    mkdir -p "${BACKUP_DIR}"
    cp -r "${DEST_DIR}/"* "${BACKUP_DIR}/" 2>/dev/null || true
    
    log "INFO" "Backup criado em: ${BACKUP_DIR}"
else
    log "INFO" "Fase 2: Primeira instalação (sem backup)"
    mkdir -p "${DEST_DIR}"
fi

echo ""

# ─── FASE 3: Parar FiberDoc (se estiver rodando) ──────────────────────────

log "INFO" "Fase 3: Parando FiberDoc..."

systemctl stop fiberdoc 2>/dev/null || pkill -f "node.*fiberdoc" 2>/dev/null || true
sleep 2

log "INFO" "FiberDoc parado"
echo ""

# ─── FASE 4: Copiar Arquivos ──────────────────────────────────────────────

log "INFO" "Fase 4: Copiando arquivos..."

cp -r "${SCRIPT_DIR}/server" "${DEST_DIR}/"
cp -r "${SCRIPT_DIR}/client" "${DEST_DIR}/"
cp -r "${SCRIPT_DIR}/drizzle" "${DEST_DIR}/"
cp -r "${SCRIPT_DIR}/shared" "${DEST_DIR}/"
cp -r "${SCRIPT_DIR}/scripts" "${DEST_DIR}/"
cp -r "${SCRIPT_DIR}/storage" "${DEST_DIR}/"
cp "${SCRIPT_DIR}/package.json" "${DEST_DIR}/"
cp "${SCRIPT_DIR}/tsconfig.json" "${DEST_DIR}/"
cp "${SCRIPT_DIR}/vite.config.ts" "${DEST_DIR}/"
cp "${SCRIPT_DIR}/vitest.config.ts" "${DEST_DIR}/"

log "INFO" "Arquivos copiados"
echo ""

# ─── FASE 5: Instalar Dependências ────────────────────────────────────────

log "INFO" "Fase 5: Instalando dependências..."

cd "${DEST_DIR}"

if [ -f "${SCRIPT_DIR}/pnpm-lock.yaml" ]; then
    cp "${SCRIPT_DIR}/pnpm-lock.yaml" "${DEST_DIR}/"
    pnpm install --frozen-lockfile 2>&1 | tail -10
else
    pnpm install 2>&1 | tail -10
fi

log "INFO" "Dependências instaladas"
echo ""

# ─── FASE 6: Iniciar FiberDoc ─────────────────────────────────────────────

log "INFO" "Fase 6: Iniciando FiberDoc..."

# Tentar via systemd
if systemctl start fiberdoc 2>/dev/null; then
    log "INFO" "FiberDoc iniciado via systemd"
else
    # Fallback: iniciar em background
    log "INFO" "Iniciando FiberDoc em background..."
    cd "${DEST_DIR}"
    nohup pnpm run start > /var/log/fiberdoc.log 2>&1 &
    sleep 3
fi

log "INFO" "FiberDoc iniciado"
echo ""

# ─── FASE 7: Verificação Final ────────────────────────────────────────────

log "INFO" "Fase 7: Verificando integridade..."

sleep 2

if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    log "INFO" "✓ Servidor respondendo corretamente"
else
    log "WARN" "Servidor pode estar iniciando ainda, aguarde alguns segundos"
fi

echo ""

log "INFO" "═══════════════════════════════════════════════════════════"
log "INFO" "✓ Deploy concluído com sucesso!"
log "INFO" "═══════════════════════════════════════════════════════════"
echo ""

log "INFO" "Diretório: ${DEST_DIR}"
log "INFO" "Backup: ${BACKUP_DIR}"
log "INFO" "Log: ${LOG_FILE}"
echo ""

log "INFO" "Próximos passos:"
log "INFO" "1. Verificar logs: tail -f ${LOG_FILE}"
log "INFO" "2. Acessar: http://localhost:3000"
log "INFO" "3. Se houver problemas, restaurar backup:"
log "INFO" "   cp -r ${BACKUP_DIR}/* ${DEST_DIR}/"
log "INFO" "   systemctl restart fiberdoc"
echo ""

exit 0
DEPLOY_SCRIPT

chmod +x "${BUILD_DIR}/deploy.sh"

log "INFO" "Script de deploy criado"
echo ""

# ─── FASE 6: Criar Arquivo README ─────────────────────────────────────────

log "INFO" "Fase 6: Criando documentação..."

cat > "${BUILD_DIR}/DEPLOY_README.md" << 'README_CONTENT'
# FiberDoc Deploy Package

## 📦 Conteúdo do Pacote

Este pacote contém o FiberDoc pré-compilado e pronto para deploy.

```
fiberdoc-deploy-vX.X.X/
├── server/           # Código do servidor compilado
├── client/           # Código do cliente compilado
├── drizzle/          # Migrações de banco de dados
├── shared/           # Código compartilhado
├── scripts/          # Scripts utilitários
├── storage/          # Helpers de armazenamento
├── package.json      # Dependências
├── deploy.sh         # Script de instalação
└── DEPLOY_README.md  # Este arquivo
```

## 🚀 Instalação Rápida

### 1. Download e Extração

```bash
cd ~
wget -O fiberdoc-vX.X.X.tar.gz "https://seu-servidor.com/fiberdoc-vX.X.X.tar.gz"
tar -xzf fiberdoc-vX.X.X.tar.gz
cd fiberdoc-deploy-vX.X.X
```

### 2. Deploy

```bash
# Deploy no diretório padrão (/opt/fiberdoc)
bash deploy.sh

# Ou especificar diretório customizado
bash deploy.sh /home/usuario/fiberdoc
```

### 3. Verificar Status

```bash
# Ver logs
tail -f /var/log/fiberdoc-deploy.log

# Acessar
http://localhost:3000
```

## 🔧 Configuração Pós-Deploy

Após o deploy, configure as variáveis de ambiente:

```bash
# Editar arquivo de configuração
nano /opt/fiberdoc/.env

# Ou via systemd
systemctl edit fiberdoc
```

Variáveis obrigatórias:
- `DATABASE_URL` — Conexão MySQL
- `JWT_SECRET` — Secret para JWT
- `VITE_APP_ID` — ID da aplicação OAuth
- `OAUTH_SERVER_URL` — URL do servidor OAuth

## 📊 Gerenciar Serviço

```bash
# Iniciar
systemctl start fiberdoc

# Parar
systemctl stop fiberdoc

# Reiniciar
systemctl restart fiberdoc

# Status
systemctl status fiberdoc

# Ver logs
journalctl -u fiberdoc -n 50 -f
```

## 🔄 Atualizar

Para atualizar para uma nova versão:

```bash
cd ~
wget -O fiberdoc-vX.X.X.tar.gz "https://seu-servidor.com/fiberdoc-vX.X.X.tar.gz"
tar -xzf fiberdoc-vX.X.X.tar.gz
cd fiberdoc-deploy-vX.X.X
bash deploy.sh /opt/fiberdoc
```

O script fará backup automático antes de atualizar.

## 🔙 Rollback

Se algo der errado:

```bash
# Restaurar backup
cp -r /opt/fiberdoc/backups/YYYYMMDD-HHMMSS/* /opt/fiberdoc/

# Reiniciar
systemctl restart fiberdoc
```

## 📝 Logs

- Deploy: `/var/log/fiberdoc-deploy.log`
- Aplicação: `/var/log/fiberdoc.log` ou `journalctl -u fiberdoc`

## 🆘 Troubleshooting

### Erro: "Permissão negada"

```bash
# Executar com sudo
sudo bash deploy.sh /opt/fiberdoc
```

### Erro: "Porta 3000 já em uso"

```bash
# Encontrar processo usando porta 3000
lsof -i :3000

# Matar processo
kill -9 <PID>
```

### Erro: "Dependências não instaladas"

```bash
# Reinstalar manualmente
cd /opt/fiberdoc
pnpm install
```

## 📞 Suporte

Para dúvidas ou problemas, consulte a documentação completa em:
https://github.com/seu-usuario/fiberdoc

README_CONTENT

log "INFO" "Documentação criada"
echo ""

# ─── FASE 7: Criar Pacote tar.gz ──────────────────────────────────────────

log "INFO" "Fase 7: Criando pacote tar.gz..."

mkdir -p "${OUTPUT_DIR}"

cd /tmp

if tar -czf "${PACKAGE_FILE}" "fiberdoc-build-${VERSION}-$$/" 2>&1 | tail -5; then
    log "INFO" "Pacote criado: ${PACKAGE_FILE}"
else
    error_exit "Erro ao criar pacote tar.gz"
fi

PACKAGE_SIZE=$(du -h "${PACKAGE_FILE}" | cut -f1)
log "INFO" "Tamanho: ${PACKAGE_SIZE}"
echo ""

# ─── FASE 8: Gerar Checksum ───────────────────────────────────────────────

log "INFO" "Fase 8: Gerando checksum..."

cd "${OUTPUT_DIR}"
md5sum "${PACKAGE_NAME}.tar.gz" > "${PACKAGE_NAME}.md5"
sha256sum "${PACKAGE_NAME}.tar.gz" > "${PACKAGE_NAME}.sha256"

log "INFO" "Checksums gerados"
echo ""

# ─── Limpeza ──────────────────────────────────────────────────────────────

log "INFO" "Limpando arquivos temporários..."
rm -rf "${BUILD_DIR}"
log "INFO" "Limpeza concluída"
echo ""

# ─── Conclusão ─────────────────────────────────────────────────────────────

log "INFO" "═══════════════════════════════════════════════════════════"
log "INFO" "✓ Build concluído com sucesso!"
log "INFO" "═══════════════════════════════════════════════════════════"
echo ""

echo -e "${GREEN}Pacote pronto para deploy:${NC}"
echo ""
echo "  Arquivo: ${PACKAGE_FILE}"
echo "  Tamanho: ${PACKAGE_SIZE}"
echo "  MD5: $(cat ${OUTPUT_DIR}/${PACKAGE_NAME}.md5)"
echo "  SHA256: $(cat ${OUTPUT_DIR}/${PACKAGE_NAME}.sha256)"
echo ""

echo -e "${GREEN}Para fazer deploy:${NC}"
echo ""
echo "  1. Copiar arquivo para servidor:"
echo "     scp ${PACKAGE_FILE} usuario@servidor:~/"
echo ""
echo "  2. SSH no servidor:"
echo "     ssh usuario@servidor"
echo ""
echo "  3. Extrair e instalar:"
echo "     cd ~"
echo "     tar -xzf ${PACKAGE_NAME}.tar.gz"
echo "     cd fiberdoc-deploy-v${VERSION}"
echo "     bash deploy.sh"
echo ""

exit 0
