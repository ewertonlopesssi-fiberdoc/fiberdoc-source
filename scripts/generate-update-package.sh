#!/bin/bash

###############################################################################
# generate-update-package.sh
#
# Script para gerar pacote de atualização do FiberDoc
# Cria um ZIP com todos os arquivos necessários para atualizar o servidor
#
# Uso: ./scripts/generate-update-package.sh [versão]
# Exemplo: ./scripts/generate-update-package.sh 1.2.0
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
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${PROJECT_ROOT}/dist"
BUILD_DIR="${PROJECT_ROOT}/build"
UPDATES_DIR="${PROJECT_ROOT}/updates"
VERSION="${1:-$(date +%Y%m%d-%H%M%S)}"
PACKAGE_NAME="fiberdoc-update-${VERSION}.zip"
PACKAGE_PATH="${UPDATES_DIR}/${PACKAGE_NAME}"

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  FiberDoc - Gerador de Pacote de Atualização${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Verificar se estamos no diretório correto
if [ ! -f "${PROJECT_ROOT}/package.json" ]; then
    echo -e "${RED}✗ Erro: package.json não encontrado${NC}"
    echo "Execute este script a partir do diretório raiz do FiberDoc"
    exit 1
fi

echo -e "${YELLOW}📦 Versão do Pacote: ${VERSION}${NC}"
echo ""

# Criar diretório de updates se não existir
mkdir -p "${UPDATES_DIR}"

# Limpar build anterior
if [ -d "${BUILD_DIR}" ]; then
    echo -e "${YELLOW}🧹 Limpando build anterior...${NC}"
    rm -rf "${BUILD_DIR}"
fi

mkdir -p "${BUILD_DIR}"

echo -e "${YELLOW}📁 Copiando arquivos...${NC}"

# Copiar arquivos necessários para atualização
# Estrutura do pacote:
# fiberdoc-update-VERSION/
# ├── server/
# ├── client/
# ├── drizzle/
# ├── shared/
# ├── package.json
# ├── pnpm-lock.yaml
# ├── tsconfig.json
# ├── vite.config.ts
# ├── vitest.config.ts
# ├── UPDATE_MANIFEST.json
# └── INSTALL.sh

# Copiar código-fonte
cp -r "${PROJECT_ROOT}/server" "${BUILD_DIR}/"
cp -r "${PROJECT_ROOT}/client" "${BUILD_DIR}/"
cp -r "${PROJECT_ROOT}/drizzle" "${BUILD_DIR}/"
cp -r "${PROJECT_ROOT}/shared" "${BUILD_DIR}/"

# Copiar arquivos de configuração
cp "${PROJECT_ROOT}/package.json" "${BUILD_DIR}/"
cp "${PROJECT_ROOT}/pnpm-lock.yaml" "${BUILD_DIR}/" 2>/dev/null || true
cp "${PROJECT_ROOT}/tsconfig.json" "${BUILD_DIR}/"
cp "${PROJECT_ROOT}/vite.config.ts" "${BUILD_DIR}/"
cp "${PROJECT_ROOT}/vitest.config.ts" "${BUILD_DIR}/"

# Copiar scripts de atualização
cp "${PROJECT_ROOT}/scripts/install-update.sh" "${BUILD_DIR}/" 2>/dev/null || true

# Criar manifesto de atualização
cat > "${BUILD_DIR}/UPDATE_MANIFEST.json" << EOF
{
  "version": "${VERSION}",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "description": "FiberDoc Update Package",
  "files": {
    "server": "Backend TypeScript",
    "client": "Frontend React",
    "drizzle": "Database migrations",
    "shared": "Shared types and constants",
    "package.json": "Dependencies",
    "tsconfig.json": "TypeScript config",
    "vite.config.ts": "Vite config",
    "vitest.config.ts": "Vitest config"
  },
  "instructions": {
    "1": "Fazer backup do servidor atual",
    "2": "Extrair pacote no servidor",
    "3": "Executar: bash INSTALL.sh",
    "4": "Reiniciar o FiberDoc",
    "5": "Verificar logs: tail -f /var/log/fiberdoc.log"
  },
  "checksum": "$(find ${BUILD_DIR} -type f -exec md5sum {} \\; | md5sum | awk '{print $1}')"
}
EOF

echo -e "${GREEN}✓ Arquivos copiados${NC}"

# Criar script de instalação
cat > "${BUILD_DIR}/INSTALL.sh" << 'INSTALL_SCRIPT'
#!/bin/bash

###############################################################################
# INSTALL.sh - Script de Instalação de Atualização do FiberDoc
#
# Este script é executado no servidor para aplicar a atualização
#
###############################################################################

set -e

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIBERDOC_HOME="${FIBERDOC_HOME:-/opt/fiberdoc}"
BACKUP_DIR="${FIBERDOC_HOME}/backups/$(date +%Y%m%d-%H%M%S)"

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  FiberDoc - Script de Instalação de Atualização${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Verificar se FiberDoc está instalado
if [ ! -d "${FIBERDOC_HOME}" ]; then
    echo -e "${RED}✗ Erro: FiberDoc não encontrado em ${FIBERDOC_HOME}${NC}"
    echo "Configure FIBERDOC_HOME antes de executar este script"
    exit 1
fi

echo -e "${YELLOW}📍 Diretório do FiberDoc: ${FIBERDOC_HOME}${NC}"
echo ""

# Parar o FiberDoc
echo -e "${YELLOW}⏹️  Parando o FiberDoc...${NC}"
systemctl stop fiberdoc 2>/dev/null || pkill -f "node.*fiberdoc" || true
sleep 2

# Fazer backup
echo -e "${YELLOW}💾 Fazendo backup...${NC}"
mkdir -p "${BACKUP_DIR}"
cp -r "${FIBERDOC_HOME}/server" "${BACKUP_DIR}/" || true
cp -r "${FIBERDOC_HOME}/client" "${BACKUP_DIR}/" || true
cp -r "${FIBERDOC_HOME}/drizzle" "${BACKUP_DIR}/" || true
cp "${FIBERDOC_HOME}/package.json" "${BACKUP_DIR}/" || true
echo -e "${GREEN}✓ Backup criado em: ${BACKUP_DIR}${NC}"
echo ""

# Copiar arquivos atualizados
echo -e "${YELLOW}📦 Instalando atualização...${NC}"
cp -r "${SCRIPT_DIR}/server" "${FIBERDOC_HOME}/"
cp -r "${SCRIPT_DIR}/client" "${FIBERDOC_HOME}/"
cp -r "${SCRIPT_DIR}/drizzle" "${FIBERDOC_HOME}/"
cp -r "${SCRIPT_DIR}/shared" "${FIBERDOC_HOME}/"
cp "${SCRIPT_DIR}/package.json" "${FIBERDOC_HOME}/"
cp "${SCRIPT_DIR}/tsconfig.json" "${FIBERDOC_HOME}/"
cp "${SCRIPT_DIR}/vite.config.ts" "${FIBERDOC_HOME}/"
cp "${SCRIPT_DIR}/vitest.config.ts" "${FIBERDOC_HOME}/"
echo -e "${GREEN}✓ Arquivos instalados${NC}"
echo ""

# Instalar dependências
echo -e "${YELLOW}📚 Instalando dependências...${NC}"
cd "${FIBERDOC_HOME}"
pnpm install --frozen-lockfile 2>&1 | tail -5
echo -e "${GREEN}✓ Dependências instaladas${NC}"
echo ""

# Build
echo -e "${YELLOW}🔨 Compilando...${NC}"
pnpm run build 2>&1 | tail -10
echo -e "${GREEN}✓ Compilação concluída${NC}"
echo ""

# Iniciar o FiberDoc
echo -e "${YELLOW}▶️  Iniciando o FiberDoc...${NC}"
systemctl start fiberdoc 2>/dev/null || (cd "${FIBERDOC_HOME}" && nohup pnpm run start > /var/log/fiberdoc.log 2>&1 &)
sleep 3

# Verificar se está rodando
if pgrep -f "node.*fiberdoc" > /dev/null; then
    echo -e "${GREEN}✓ FiberDoc iniciado com sucesso${NC}"
else
    echo -e "${RED}✗ Erro ao iniciar FiberDoc${NC}"
    echo "Verifique os logs: tail -f /var/log/fiberdoc.log"
    exit 1
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✓ Atualização instalada com sucesso!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}📋 Próximos passos:${NC}"
echo "1. Verificar logs: tail -f /var/log/fiberdoc.log"
echo "2. Acessar: https://seu-fiberdoc.com"
echo "3. Se houver problemas, restaurar backup:"
echo "   cp -r ${BACKUP_DIR}/* ${FIBERDOC_HOME}/"
echo ""
INSTALL_SCRIPT

chmod +x "${BUILD_DIR}/INSTALL.sh"

echo -e "${YELLOW}🗜️  Compactando pacote...${NC}"

# Criar ZIP
cd "${BUILD_DIR}/.."
zip -r -q "${PACKAGE_PATH}" "$(basename ${BUILD_DIR})"

echo -e "${GREEN}✓ Pacote criado${NC}"
echo ""

# Calcular tamanho e checksum
PACKAGE_SIZE=$(du -h "${PACKAGE_PATH}" | cut -f1)
PACKAGE_CHECKSUM=$(md5sum "${PACKAGE_PATH}" | awk '{print $1}')

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✓ Pacote de Atualização Gerado com Sucesso!${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}📦 Informações do Pacote:${NC}"
echo "  Nome: ${PACKAGE_NAME}"
echo "  Caminho: ${PACKAGE_PATH}"
echo "  Tamanho: ${PACKAGE_SIZE}"
echo "  Checksum (MD5): ${PACKAGE_CHECKSUM}"
echo "  Versão: ${VERSION}"
echo ""

# Criar arquivo de informações
cat > "${UPDATES_DIR}/${VERSION}.info" << EOF
{
  "version": "${VERSION}",
  "package": "${PACKAGE_NAME}",
  "size": "${PACKAGE_SIZE}",
  "checksum": "${PACKAGE_CHECKSUM}",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "url": "https://seu-fiberdoc.com/api/updates/${PACKAGE_NAME}"
}
EOF

echo -e "${YELLOW}📋 Como usar:${NC}"
echo ""
echo "1. Upload no servidor:"
echo "   scp ${PACKAGE_PATH} usuario@servidor:/tmp/"
echo ""
echo "2. No servidor, extrair e instalar:"
echo "   cd /tmp"
echo "   unzip ${PACKAGE_NAME}"
echo "   cd build-*"
echo "   bash INSTALL.sh"
echo ""
echo "3. Ou fazer upload via UI do FiberDoc:"
echo "   Sistema → Configurações → Atualização → Upload de Pacote"
echo ""

# Limpar diretório temporário
rm -rf "${BUILD_DIR}"

echo -e "${GREEN}✓ Concluído!${NC}"
echo ""
