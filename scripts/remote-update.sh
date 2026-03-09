#!/bin/bash

###############################################################################
# remote-update.sh — Script de Atualização Remota do FiberDoc via SSH
#
# Este script é executado no servidor remoto para atualizar o FiberDoc
# Pode ser chamado via SSH ou via endpoint HTTP
#
# Uso:
#   bash remote-update.sh [versão] [servidor-distribuição]
#
# Exemplos:
#   bash remote-update.sh 1.2.0
#   bash remote-update.sh latest https://updates.fiberdoc.com
#   bash remote-update.sh 1.2.0 https://seu-servidor.com
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
VERSION="${1:-latest}"
DISTRIBUTION_SERVER="${2:-https://updates.fiberdoc.com}"
FIBERDOC_HOME="${FIBERDOC_HOME:-/opt/fiberdoc}"
BACKUP_DIR="${FIBERDOC_HOME}/backups/$(date +%Y%m%d-%H%M%S)"
UPDATES_DIR="${FIBERDOC_HOME}/updates"
LOG_FILE="/var/log/fiberdoc-update.log"

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  FiberDoc - Atualização Remota via SSH${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Função de log
log() {
    local level=$1
    shift
    local message="$@"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${timestamp} [${level}] ${message}" | tee -a "${LOG_FILE}"
}

# Função de erro
error_exit() {
    log "ERROR" "$@"
    exit 1
}

# Verificar se FiberDoc está instalado
if [ ! -d "${FIBERDOC_HOME}" ]; then
    error_exit "FiberDoc não encontrado em ${FIBERDOC_HOME}"
fi

log "INFO" "Diretório do FiberDoc: ${FIBERDOC_HOME}"
log "INFO" "Versão a instalar: ${VERSION}"
log "INFO" "Servidor de distribuição: ${DISTRIBUTION_SERVER}"
echo ""

# ─── FASE 1: Verificar Atualização Disponível ──────────────────────────────

log "INFO" "Fase 1: Verificando atualizações disponíveis..."

CURRENT_VERSION=$(grep -oP '"version":\s*"\K[^"]+' "${FIBERDOC_HOME}/package.json" 2>/dev/null || echo "unknown")
log "INFO" "Versão atual: ${CURRENT_VERSION}"

# Se versão for "latest", obter versão mais recente
if [ "${VERSION}" = "latest" ]; then
    log "INFO" "Obtendo versão mais recente do servidor..."
    
    CHECK_URL="${DISTRIBUTION_SERVER}/api/distribution/check-update?currentVersion=${CURRENT_VERSION}&includePrerelease=false"
    
    RESPONSE=$(curl -s "${CHECK_URL}" 2>/dev/null || echo "{}")
    VERSION=$(echo "${RESPONSE}" | grep -oP '"nextVersion":\s*"\K[^"]+' || echo "")
    
    if [ -z "${VERSION}" ]; then
        log "WARN" "Nenhuma atualização disponível"
        exit 0
    fi
    
    log "INFO" "Versão mais recente: ${VERSION}"
fi

if [ "${VERSION}" = "${CURRENT_VERSION}" ]; then
    log "WARN" "Já está na versão ${VERSION}"
    exit 0
fi

echo ""

# ─── FASE 2: Fazer Backup ──────────────────────────────────────────────────

log "INFO" "Fase 2: Fazendo backup..."

mkdir -p "${BACKUP_DIR}"
cp -r "${FIBERDOC_HOME}/server" "${BACKUP_DIR}/" 2>/dev/null || true
cp -r "${FIBERDOC_HOME}/client" "${BACKUP_DIR}/" 2>/dev/null || true
cp -r "${FIBERDOC_HOME}/drizzle" "${BACKUP_DIR}/" 2>/dev/null || true
cp "${FIBERDOC_HOME}/package.json" "${BACKUP_DIR}/" 2>/dev/null || true

log "INFO" "Backup criado em: ${BACKUP_DIR}"
echo ""

# ─── FASE 3: Parar o FiberDoc ──────────────────────────────────────────────

log "INFO" "Fase 3: Parando o FiberDoc..."

systemctl stop fiberdoc 2>/dev/null || pkill -f "node.*fiberdoc" || true
sleep 2

log "INFO" "FiberDoc parado"
echo ""

# ─── FASE 4: Download do Pacote ────────────────────────────────────────────

log "INFO" "Fase 4: Baixando pacote de atualização..."

mkdir -p "${UPDATES_DIR}"

DOWNLOAD_URL="${DISTRIBUTION_SERVER}/api/distribution/download/${VERSION}"
ZIP_FILE="${UPDATES_DIR}/fiberdoc-update-${VERSION}.zip"

log "INFO" "URL de download: ${DOWNLOAD_URL}"

if ! curl -f -L -o "${ZIP_FILE}" "${DOWNLOAD_URL}" 2>&1 | tee -a "${LOG_FILE}"; then
    error_exit "Erro ao baixar pacote de atualização"
fi

if [ ! -f "${ZIP_FILE}" ]; then
    error_exit "Arquivo não foi baixado"
fi

ZIP_SIZE=$(du -h "${ZIP_FILE}" | cut -f1)
log "INFO" "Pacote baixado: ${ZIP_SIZE}"
echo ""

# ─── FASE 5: Extrair Pacote ────────────────────────────────────────────────

log "INFO" "Fase 5: Extraindo pacote..."

EXTRACT_DIR="${UPDATES_DIR}/build-${VERSION}"
rm -rf "${EXTRACT_DIR}"
mkdir -p "${EXTRACT_DIR}"

if ! unzip -q "${ZIP_FILE}" -d "${EXTRACT_DIR}" 2>&1 | tee -a "${LOG_FILE}"; then
    error_exit "Erro ao extrair pacote"
fi

log "INFO" "Pacote extraído: ${EXTRACT_DIR}"
echo ""

# ─── FASE 6: Copiar Arquivos ──────────────────────────────────────────────

log "INFO" "Fase 6: Copiando arquivos atualizados..."

cp -r "${EXTRACT_DIR}/server" "${FIBERDOC_HOME}/"
cp -r "${EXTRACT_DIR}/client" "${FIBERDOC_HOME}/"
cp -r "${EXTRACT_DIR}/drizzle" "${FIBERDOC_HOME}/"
cp -r "${EXTRACT_DIR}/shared" "${FIBERDOC_HOME}/"
cp "${EXTRACT_DIR}/package.json" "${FIBERDOC_HOME}/"
cp "${EXTRACT_DIR}/tsconfig.json" "${FIBERDOC_HOME}/"
cp "${EXTRACT_DIR}/vite.config.ts" "${FIBERDOC_HOME}/"
cp "${EXTRACT_DIR}/vitest.config.ts" "${FIBERDOC_HOME}/"

log "INFO" "Arquivos copiados"
echo ""

# ─── FASE 7: Instalar Dependências ────────────────────────────────────────

log "INFO" "Fase 7: Instalando dependências..."

cd "${FIBERDOC_HOME}"

if ! pnpm install --frozen-lockfile 2>&1 | tail -20 | tee -a "${LOG_FILE}"; then
    log "ERROR" "Erro ao instalar dependências, restaurando backup..."
    cp -r "${BACKUP_DIR}/"* "${FIBERDOC_HOME}/"
    systemctl start fiberdoc 2>/dev/null || true
    error_exit "Falha na instalação de dependências"
fi

log "INFO" "Dependências instaladas"
echo ""

# ─── FASE 8: Compilar ─────────────────────────────────────────────────────

log "INFO" "Fase 8: Compilando..."

if ! pnpm run build 2>&1 | tail -20 | tee -a "${LOG_FILE}"; then
    log "ERROR" "Erro na compilação, restaurando backup..."
    cp -r "${BACKUP_DIR}/"* "${FIBERDOC_HOME}/"
    systemctl start fiberdoc 2>/dev/null || true
    error_exit "Falha na compilação"
fi

log "INFO" "Compilação concluída"
echo ""

# ─── FASE 9: Iniciar o FiberDoc ───────────────────────────────────────────

log "INFO" "Fase 9: Iniciando o FiberDoc..."

systemctl start fiberdoc 2>/dev/null || (cd "${FIBERDOC_HOME}" && nohup pnpm run start > /var/log/fiberdoc.log 2>&1 &)
sleep 3

if pgrep -f "node.*fiberdoc" > /dev/null; then
    log "INFO" "FiberDoc iniciado com sucesso"
else
    log "ERROR" "Erro ao iniciar FiberDoc, restaurando backup..."
    cp -r "${BACKUP_DIR}/"* "${FIBERDOC_HOME}/"
    systemctl start fiberdoc 2>/dev/null || true
    error_exit "Falha ao iniciar FiberDoc"
fi

echo ""

# ─── FASE 10: Verificação Final ────────────────────────────────────────────

log "INFO" "Fase 10: Verificando integridade..."

sleep 2

# Verificar se servidor está respondendo
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    log "INFO" "Servidor respondendo corretamente"
else
    log "WARN" "Servidor pode estar iniciando ainda, aguarde alguns segundos"
fi

echo ""

# ─── Conclusão ─────────────────────────────────────────────────────────────

log "INFO" "═══════════════════════════════════════════════════════════"
log "INFO" "✓ Atualização concluída com sucesso!"
log "INFO" "═══════════════════════════════════════════════════════════"
echo ""

log "INFO" "Versão anterior: ${CURRENT_VERSION}"
log "INFO" "Versão atual: ${VERSION}"
log "INFO" "Backup: ${BACKUP_DIR}"
log "INFO" "Log: ${LOG_FILE}"
echo ""

log "INFO" "Próximos passos:"
log "INFO" "1. Verificar logs: tail -f ${LOG_FILE}"
log "INFO" "2. Acessar: https://seu-fiberdoc.com"
log "INFO" "3. Se houver problemas, restaurar backup:"
log "INFO" "   cp -r ${BACKUP_DIR}/* ${FIBERDOC_HOME}/"
log "INFO" "   systemctl restart fiberdoc"
echo ""

exit 0
