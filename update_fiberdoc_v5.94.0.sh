#!/bin/bash
# ============================================================
#  FiberDoc — Script de Atualização v5.94.0
#  Gerado em: 2026-03-13
#  Checkpoint: 13892a7c
# ============================================================
#
#  COMO USAR:
#    sudo bash update_fiberdoc_v5.94.0.sh
#
#  Ou em uma linha (baixar e executar):
#    sudo bash -c "$(curl -fsSL https://files.manuscdn.com/user_upload_by_module/session_file/310519663372947788/zaPNYCzhMfvQzhmI.zip | bash)" 2>&1
#
#  MELHORIAS DESTA VERSÃO:
#    • CPE Manager: usa exclusivamente a API do SGP (sem GenieACS)
#    • Mobile: ícones da barra inferior iguais ao web
#    • Mobile: botão "Balanço Óptico" no painel de CTO no mapa
#    • Mobile: botão "OTDR Virtual" direto no painel do mapa
#    • Mobile: marcador GPS melhorado com anel pulsante e erros detalhados
#
# ============================================================

set -euo pipefail

FIBERDOC_DIR="${FIBERDOC_DIR:-/opt/fiberdoc}"
FIBERDOC_SERVICE="${FIBERDOC_SERVICE:-fiberdoc}"
UPDATE_URL="https://files.manuscdn.com/user_upload_by_module/session_file/310519663372947788/zaPNYCzhMfvQzhmI.zip"
VERSION="5.94.0"

# Cores
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log_step()  { echo -e "\n${CYAN}${BOLD}> $1${NC}"; }
log_ok()    { echo -e "  ${GREEN}✓${NC} $1"; }
log_warn()  { echo -e "  ${YELLOW}⚠${NC}  $1"; }
log_error() { echo -e "  ${RED}✗${NC} $1" >&2; }
log_info()  { echo -e "  ${CYAN}i${NC}  $1"; }

echo ""
echo -e "${BOLD}============================================================${NC}"
echo -e "${CYAN}${BOLD}  FiberDoc — Atualização v${VERSION}${NC}"
echo -e "${BOLD}  Data: $(date '+%d/%m/%Y %H:%M:%S')${NC}"
echo -e "${BOLD}============================================================${NC}"
echo ""

# Verificar root
if [ "$(id -u)" -ne 0 ]; then
  log_error "Execute como root: sudo bash $0"
  exit 1
fi

# Verificar diretório
if [ ! -d "${FIBERDOC_DIR}" ]; then
  log_error "FiberDoc não encontrado em ${FIBERDOC_DIR}"
  log_info  "Defina o diretório: FIBERDOC_DIR=/caminho/do/fiberdoc sudo bash $0"
  exit 1
fi

# Verificar downloader
if command -v wget >/dev/null 2>&1; then
  DOWNLOADER="wget"
elif command -v curl >/dev/null 2>&1; then
  DOWNLOADER="curl"
else
  log_error "wget ou curl não encontrado. Instale: apt-get install -y wget"
  exit 1
fi

if ! command -v unzip >/dev/null 2>&1; then
  log_error "unzip não encontrado. Instale: apt-get install -y unzip"
  exit 1
fi

TMP_DIR="/tmp/fiberdoc-update-$$"
BACKUP_DIR="${FIBERDOC_DIR}/backups"
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
mkdir -p "${TMP_DIR}" "${BACKUP_DIR}"

# ── 1. Backup ─────────────────────────────────────────────────────────────────
log_step "[1/6] Criando backup..."
BACKUP_FILE="${BACKUP_DIR}/fiberdoc_backup_${TIMESTAMP}.tar.gz"
if [ -f "${FIBERDOC_DIR}/dist/index.js" ]; then
  tar -czf "${BACKUP_FILE}" \
    -C "${FIBERDOC_DIR}" \
    --exclude="backups" \
    --exclude="node_modules" \
    --exclude="updates" \
    . 2>/dev/null || true
  log_ok "Backup criado: ${BACKUP_FILE}"
else
  log_warn "Nenhuma instalação anterior encontrada — backup ignorado."
fi

# ── 2. Parar serviço ──────────────────────────────────────────────────────────
log_step "[2/6] Parando o FiberDoc..."
if systemctl is-active --quiet "${FIBERDOC_SERVICE}" 2>/dev/null; then
  systemctl stop "${FIBERDOC_SERVICE}"
  log_ok "Serviço parado."
else
  log_warn "Serviço não estava em execução."
fi

# ── 3. Download do pacote ─────────────────────────────────────────────────────
log_step "[3/6] Baixando pacote v${VERSION}..."
ZIP_FILE="${TMP_DIR}/fiberdoc-v${VERSION}.zip"
log_info "URL: ${UPDATE_URL}"

if [ "${DOWNLOADER}" = "wget" ]; then
  wget -q --show-progress -O "${ZIP_FILE}" "${UPDATE_URL}" 2>&1 || {
    log_error "Falha no download com wget."
    exit 1
  }
else
  curl -fL --progress-bar -o "${ZIP_FILE}" "${UPDATE_URL}" 2>&1 || {
    log_error "Falha no download com curl."
    exit 1
  }
fi

ZIP_SIZE=$(du -sh "${ZIP_FILE}" | cut -f1)
log_ok "Pacote baixado: ${ZIP_SIZE}"

# ── 4. Extrair e copiar arquivos ──────────────────────────────────────────────
log_step "[4/6] Extraindo e copiando arquivos..."
EXTRACT_DIR="${TMP_DIR}/extract"
mkdir -p "${EXTRACT_DIR}"
unzip -q "${ZIP_FILE}" -d "${EXTRACT_DIR}"

# Detectar pasta raiz dentro do ZIP
ZIP_ROOT=$(ls "${EXTRACT_DIR}/" | head -1)
SOURCE_DIR="${EXTRACT_DIR}/${ZIP_ROOT}"

# Copiar dist/ (frontend + backend compilados)
if [ -d "${SOURCE_DIR}/dist" ]; then
  rsync -a --delete "${SOURCE_DIR}/dist/" "${FIBERDOC_DIR}/dist/"
  log_ok "dist/ copiado."
fi

# Copiar package.json e pnpm-lock.yaml
[ -f "${SOURCE_DIR}/package.json" ]   && cp "${SOURCE_DIR}/package.json"   "${FIBERDOC_DIR}/package.json"   && log_ok "package.json atualizado."
[ -f "${SOURCE_DIR}/pnpm-lock.yaml" ] && cp "${SOURCE_DIR}/pnpm-lock.yaml" "${FIBERDOC_DIR}/pnpm-lock.yaml" && log_ok "pnpm-lock.yaml atualizado."

# Copiar scripts de atualização
if [ -d "${SOURCE_DIR}/scripts" ]; then
  rsync -a "${SOURCE_DIR}/scripts/" "${FIBERDOC_DIR}/scripts/"
  chmod +x "${FIBERDOC_DIR}/scripts/"*.sh 2>/dev/null || true
  log_ok "scripts/ copiados."
fi

# Copiar arquivos SQL de migração
for sql_file in "${SOURCE_DIR}"/migrate-v*.sql "${SOURCE_DIR}"/dist/migrate.sql; do
  if [ -f "${sql_file}" ]; then
    cp "${sql_file}" "${FIBERDOC_DIR}/" 2>/dev/null || true
    log_ok "$(basename ${sql_file}) copiado."
  fi
done

# ── 5. Instalar dependências ──────────────────────────────────────────────────
log_step "[5/6] Instalando dependências..."
cd "${FIBERDOC_DIR}"
if command -v pnpm >/dev/null 2>&1; then
  pnpm install --prod --no-frozen-lockfile 2>&1 | tail -5
  log_ok "Dependências instaladas com pnpm."
elif command -v npm >/dev/null 2>&1; then
  npm install --production 2>&1 | tail -5
  log_ok "Dependências instaladas com npm."
else
  log_warn "pnpm/npm não encontrado — node_modules pode estar desatualizado."
fi

# ── 6. Reiniciar serviço ──────────────────────────────────────────────────────
log_step "[6/6] Reiniciando o FiberDoc..."
systemctl daemon-reload 2>/dev/null || true
if systemctl restart "${FIBERDOC_SERVICE}" 2>/dev/null; then
  sleep 4
  if systemctl is-active --quiet "${FIBERDOC_SERVICE}"; then
    log_ok "Serviço reiniciado com sucesso!"
  else
    log_warn "Serviço pode estar iniciando. Verifique:"
    log_info "  journalctl -u ${FIBERDOC_SERVICE} -n 30 --no-pager"
  fi
else
  log_warn "Não foi possível reiniciar via systemctl."
  log_info "Tente manualmente: systemctl start ${FIBERDOC_SERVICE}"
fi

# Limpeza
rm -rf "${TMP_DIR}" 2>/dev/null || true

echo ""
echo -e "${BOLD}============================================================${NC}"
echo -e "${GREEN}${BOLD}  FiberDoc v${VERSION} atualizado com sucesso!${NC}"
echo ""
echo -e "  Backup anterior: ${BACKUP_FILE:-N/A}"
echo -e "  Versão:          v${VERSION}"
echo -e "  Data:            $(date '+%d/%m/%Y %H:%M:%S')"
echo ""
echo -e "  Estado:  systemctl status ${FIBERDOC_SERVICE}"
echo -e "  Logs:    journalctl -u ${FIBERDOC_SERVICE} -f"
echo ""
echo -e "  Em caso de problema, restaure o backup:"
echo -e "  ${CYAN}tar -xzf ${BACKUP_FILE:-BACKUP.tar.gz} -C ${FIBERDOC_DIR}/${NC}"
echo -e "  ${CYAN}systemctl restart ${FIBERDOC_SERVICE}${NC}"
echo -e "${BOLD}============================================================${NC}"
echo ""
