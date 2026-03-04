#!/usr/bin/env bash
# =============================================================================
#  Fiber#  FiberDoc — Actualização via wget
#  Versão: 1.2.0
#
#  Uso:
#    bash fiberdoc-wget-update.sh <URL_DO_PACOTE_ZIP>
#
#  Exemplos:
#    bash fiberdoc-wget-update.sh https://releases.exemplo.com/fiberdoc-v6.5.4.zip
#    bash fiberdoc-wget-update.sh https://manus.space/fiberdoc-latest.zip
#
#  Ou com variáveis de ambiente:
#    FIBERDOC_UPDATE_URL=https://... FIBERDOC_DIR=/opt/fiberdoc bash fiberdoc-wget-update.sh
#
#  Requisitos:
#    - wget ou curl
#    - unzip
#    - systemctl (systemd)
#    - mysql-client (opcional, para migração SQL automática)
#    - Executar como root (sudo)
# =============================================================================
set -euo pipefail

# ── Configuração ──────────────────────────────────────────────────────────────
UPDATE_URL="${1:-${FIBERDOC_UPDATE_URL:-}}"
FIBERDOC_DIR="${FIBERDOC_DIR:-/opt/fiberdoc}"
FIBERDOC_SERVICE="${FIBERDOC_SERVICE:-fiberdoc}"
BACKUP_DIR="${FIBERDOC_DIR}/backups"
TMP_DIR="/tmp/fiberdoc-update-$$"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# ── Cores para output ─────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

log_info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
log_ok()      { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()    { echo -e "${YELLOW}[AVISO]${NC} $*"; }
log_error()   { echo -e "${RED}[ERRO]${NC}  $*"; }
log_step()    { echo -e "\n${BOLD}$*${NC}"; }

# ── Limpeza ao sair ───────────────────────────────────────────────────────────
cleanup() {
  if [[ -d "${TMP_DIR}" ]]; then
    rm -rf "${TMP_DIR}"
    log_info "Directório temporário removido."
  fi
}
trap cleanup EXIT

# ── Banner ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}============================================================${Necho -e "${BOLD}  FiberDoc — Actualização via wget v1.2${NC}"echo -e "${BOLD}  Directório: ${FIBERDOC_DIR}${NC}"
echo -e "${BOLD}  Serviço:    ${FIBERDOC_SERVICE}${NC}"
echo -e "${BOLD}  Data/Hora:  $(date '+%d/%m/%Y %H:%M:%S')${NC}"
echo -e "${BOLD}============================================================${NC}"
echo ""

# ── 0. Verificações iniciais ──────────────────────────────────────────────────
log_step "[0/7] Verificações iniciais..."

# Verificar root
if [[ $EUID -ne 0 ]]; then
  log_error "Este script deve ser executado como root."
  echo "       Execute: sudo bash fiberdoc-wget-update.sh <URL>"
  exit 1
fi

# Verificar URL
if [[ -z "${UPDATE_URL}" ]]; then
  log_error "URL do pacote de actualização não fornecida."
  echo ""
  echo "  Uso: bash fiberdoc-wget-update.sh <URL_DO_PACOTE_ZIP>"
  echo ""
  echo "  Exemplo:"
  echo "    bash fiberdoc-wget-update.sh https://releases.exemplo.com/fiberdoc-v6.5.4.zip"
  echo ""
  echo "  Ou defina a variável de ambiente:"
  echo "    export FIBERDOC_UPDATE_URL=https://..."
  echo "    bash fiberdoc-wget-update.sh"
  exit 1
fi

# Verificar wget ou curl
DOWNLOADER=""
if command -v wget &>/dev/null; then
  DOWNLOADER="wget"
  log_ok "wget encontrado."
elif command -v curl &>/dev/null; then
  DOWNLOADER="curl"
  log_ok "curl encontrado (usado como alternativa ao wget)."
else
  log_error "Nem wget nem curl estão instalados."
  echo "       Instale com: apt-get install -y wget"
  exit 1
fi

# Verificar unzip
if ! command -v unzip &>/dev/null; then
  log_error "unzip não está instalado."
  echo "       Instale com: apt-get install -y unzip"
  exit 1
fi
log_ok "unzip encontrado."

# Verificar instalação existente
if [[ ! -d "${FIBERDOC_DIR}" ]]; then
  log_warn "Directório ${FIBERDOC_DIR} não existe. Será criado (instalação nova)."
fi

mkdir -p "${FIBERDOC_DIR}" "${BACKUP_DIR}" "${TMP_DIR}"
log_ok "Verificações concluídas."

# ── 1. Download do pacote ─────────────────────────────────────────────────────
log_step "[1/7] A fazer download do pacote de actualização..."
log_info "URL: ${UPDATE_URL}"

ZIP_FILE="${TMP_DIR}/fiberdoc-update.zip"

if [[ "${DOWNLOADER}" == "wget" ]]; then
  wget \
    --progress=bar:force \
    --timeout=120 \
    --tries=3 \
    --output-document="${ZIP_FILE}" \
    "${UPDATE_URL}" 2>&1 \
    || { log_error "Falha no download. Verifique a URL e a ligação à internet."; exit 1; }
else
  curl \
    --location \
    --progress-bar \
    --connect-timeout 30 \
    --max-time 300 \
    --retry 3 \
    --output "${ZIP_FILE}" \
    "${UPDATE_URL}" \
    || { log_error "Falha no download. Verifique a URL e a ligação à internet."; exit 1; }
fi

# Verificar se o ficheiro foi descarregado e tem tamanho razoável
if [[ ! -f "${ZIP_FILE}" ]] || [[ ! -s "${ZIP_FILE}" ]]; then
  log_error "Ficheiro descarregado está vazio ou não existe."
  exit 1
fi

ZIP_SIZE=$(du -sh "${ZIP_FILE}" | cut -f1)
log_ok "Download concluído. Tamanho: ${ZIP_SIZE}"

# ── 2. Validar o ZIP ──────────────────────────────────────────────────────────
log_step "[2/7] A validar o pacote..."

if ! unzip -t "${ZIP_FILE}" &>/dev/null; then
  log_error "O ficheiro descarregado não é um ZIP válido."
  echo "       Verifique se a URL aponta para um ficheiro .zip correcto."
  exit 1
fi

# Verificar conteúdo mínimo esperado (aceita pasta raiz no ZIP)
REQUIRED_FILES=("dist/index.js" "package.json")
MISSING=()
for f in "${REQUIRED_FILES[@]}"; do
  # Aceita tanto na raiz como dentro de uma pasta raiz (ex: fiberdoc-v6.5.4/dist/index.js)
  if ! unzip -l "${ZIP_FILE}" | grep -qE "(^|/)${f}$"; then
    MISSING+=("${f}")
  fi
done

if [[ ${#MISSING[@]} -gt 0 ]]; then
  log_warn "Ficheiros esperados não encontrados no ZIP: ${MISSING[*]}"
  log_warn "O pacote pode estar incompleto. Continuar mesmo assim? (s/N)"
  read -r CONFIRM
  if [[ ! "${CONFIRM}" =~ ^[sS]$ ]]; then
    log_error "Actualização cancelada pelo utilizador."
    exit 1
  fi
fi

log_ok "Pacote ZIP válido."

# ── 3. Backup da instalação actual ────────────────────────────────────────────
log_step "[3/7] A criar backup da instalação actual..."

if [[ -f "${FIBERDOC_DIR}/dist/index.js" ]]; then
  BACKUP_FILE="${BACKUP_DIR}/fiberdoc_backup_${TIMESTAMP}.tar.gz"
  tar -czf "${BACKUP_FILE}" \
    -C "${FIBERDOC_DIR}" \
    --exclude="backups" \
    --exclude="node_modules" \
    --exclude="*.log" \
    . 2>/dev/null || true
  BACKUP_SIZE=$(du -sh "${BACKUP_FILE}" | cut -f1)
  log_ok "Backup criado: ${BACKUP_FILE} (${BACKUP_SIZE})"
else
  log_info "Nenhuma instalação anterior encontrada — backup ignorado."
fi

# ── 4. Parar o serviço ────────────────────────────────────────────────────────
log_step "[4/7] A parar o serviço ${FIBERDOC_SERVICE}..."

SERVICE_WAS_RUNNING=false
if systemctl is-active --quiet "${FIBERDOC_SERVICE}" 2>/dev/null; then
  systemctl stop "${FIBERDOC_SERVICE}"
  SERVICE_WAS_RUNNING=true
  log_ok "Serviço parado."
else
  log_info "Serviço não estava em execução."
fi

# ── 5. Extrair e aplicar o pacote ─────────────────────────────────────────────
log_step "[5/7] A extrair e aplicar o pacote..."

EXTRACT_DIR="${TMP_DIR}/extracted"
mkdir -p "${EXTRACT_DIR}"
unzip -q "${ZIP_FILE}" -d "${EXTRACT_DIR}"

# Detectar se o ZIP tem uma pasta raiz (ex: fiberdoc-v6.5.4/)
INNER_DIR=$(find "${EXTRACT_DIR}" -maxdepth 1 -mindepth 1 -type d | head -1)
if [[ -n "${INNER_DIR}" ]] && [[ -f "${INNER_DIR}/dist/index.js" ]]; then
  SOURCE_DIR="${INNER_DIR}"
  log_info "Pasta raiz detectada: $(basename "${INNER_DIR}")"
elif [[ -f "${EXTRACT_DIR}/dist/index.js" ]]; then
  SOURCE_DIR="${EXTRACT_DIR}"
else
  log_error "Estrutura do ZIP não reconhecida. Esperado: dist/index.js na raiz."
  exit 1
fi

# Preservar ficheiros críticos antes do rsync
ENV_BACKUP="${TMP_DIR}/env_backup"
mkdir -p "${ENV_BACKUP}"
# Remover symlink quebrado se existir, antes de tentar copiar
if [[ -L "${FIBERDOC_DIR}/.env" ]] && [[ ! -e "${FIBERDOC_DIR}/.env" ]]; then
  rm -f "${FIBERDOC_DIR}/.env"
  log_info "Symlink quebrado .env removido."
fi
if [[ -f "${FIBERDOC_DIR}/.env" ]]; then
  cp "${FIBERDOC_DIR}/.env" "${ENV_BACKUP}/.env"
  log_info ".env guardado para preservação."
fi
if [[ -d "${FIBERDOC_DIR}/local-uploads" ]]; then
  cp -r "${FIBERDOC_DIR}/local-uploads" "${ENV_BACKUP}/local-uploads" 2>/dev/null || true
fi

# Copiar ficheiros (preservar .env, backups e pastas residuais não geridas)
# --delete-excluded garante que ficheiros excluídos não são apagados
# Pastas residuais (fiberdoc-v530, .manus-logs, etc.) são ignoradas pelo rsync
rsync -a --delete \
  --exclude=".env" \
  --exclude="backups/" \
  --exclude="node_modules/" \
  --exclude="*.log" \
  --exclude="local-uploads/" \
  --exclude="local-backups/" \
  --exclude=".manus-logs/" \
  --exclude="fiberdoc-v*/" \
  --exclude="fiberdoc-v[0-9]*/" \
  --filter="protect fiberdoc-v*/" \
  --filter="protect .manus-logs/" \
  "${SOURCE_DIR}/" "${FIBERDOC_DIR}/" 2>&1 | grep -v 'cannot delete' || true

# Restaurar ficheiros críticos após rsync
if [[ -f "${ENV_BACKUP}/.env" ]]; then
  # Remover symlink quebrado no destino se existir
  if [[ -L "${FIBERDOC_DIR}/.env" ]]; then
    rm -f "${FIBERDOC_DIR}/.env"
  fi
  cp "${ENV_BACKUP}/.env" "${FIBERDOC_DIR}/.env"
  log_ok ".env restaurado com sucesso."
fi
if [[ -d "${ENV_BACKUP}/local-uploads" ]]; then
  cp -r "${ENV_BACKUP}/local-uploads" "${FIBERDOC_DIR}/" 2>/dev/null || true
fi

log_ok "Ficheiros aplicados em ${FIBERDOC_DIR}."

# ── 6. Instalar dependências ──────────────────────────────────────────────────
log_step "[6/7] A instalar dependências..."

cd "${FIBERDOC_DIR}"

# Tentar npm primeiro (mais estável em servidores de produção)
# Se falhar, tentar pnpm
INSTALL_OK=false

if command -v npm &>/dev/null; then
  log_info "A instalar dependências com npm..."
  if npm install --omit=dev --ignore-scripts 2>&1 | tail -5; then
    log_ok "Dependências instaladas com npm."
    INSTALL_OK=true
  else
    log_warn "npm install falhou. A tentar pnpm..."
  fi
fi

if [[ "${INSTALL_OK}" == "false" ]] && command -v pnpm &>/dev/null; then
  log_info "A instalar dependências com pnpm..."
  if pnpm install --prod --no-frozen-lockfile --ignore-scripts 2>&1 | tail -5; then
    log_ok "Dependências instaladas com pnpm."
    INSTALL_OK=true
  else
    log_warn "pnpm install também falhou."
  fi
fi

if [[ "${INSTALL_OK}" == "false" ]]; then
  log_warn "Não foi possível instalar dependências automaticamente."
  log_warn "Execute manualmente: cd ${FIBERDOC_DIR} && npm install --omit=dev"
filog_warn "Instale Node.js: https://nodejs.org"
fi

# ── 6b. Migração SQL (se existir migrate.sql no pacote) ───────────────────────
MIGRATE_SQL=""
for candidate in \
  "${FIBERDOC_DIR}/migrate.sql" \
  "${FIBERDOC_DIR}/migrate-latest.sql" \
  "${SOURCE_DIR}/migrate.sql" \
  "${SOURCE_DIR}/migrate-latest.sql"; do
  if [[ -f "${candidate}" ]]; then
    MIGRATE_SQL="${candidate}"
    break
  fi
done

if [[ -n "${MIGRATE_SQL}" ]]; then
  log_info "Ficheiro de migração SQL encontrado: ${MIGRATE_SQL}"

  # Obter DATABASE_URL
  DB_URL=""
  # 1. Variável de ambiente actual
  DB_URL="${DATABASE_URL:-}"
  # 2. Ficheiro .env
  if [[ -z "${DB_URL}" ]] && [[ -f "${FIBERDOC_DIR}/.env" ]]; then
    DB_URL=$(grep -E '^DATABASE_URL=' "${FIBERDOC_DIR}/.env" 2>/dev/null \
             | head -1 | sed 's/^DATABASE_URL=//' | tr -d '"' || true)
  fi
  # 3. Serviço systemd
  SERVICE_FILE="/etc/systemd/system/${FIBERDOC_SERVICE}.service"
  if [[ -z "${DB_URL}" ]] && [[ -f "${SERVICE_FILE}" ]]; then
    DB_URL=$(grep -E '^Environment=DATABASE_URL=' "${SERVICE_FILE}" 2>/dev/null \
             | head -1 | sed 's/^Environment=DATABASE_URL=//' || true)
  fi

  if [[ -z "${DB_URL}" ]]; then
    log_warn "DATABASE_URL não configurada — migração SQL ignorada."
    log_warn "Execute manualmente após configurar:"
    log_warn "  mysql -h HOST -P PORTA -u USER -pSENHA DBNAME < ${MIGRATE_SQL}"
  elif command -v mysql &>/dev/null; then
    # Parsear URL: mysql://user:pass@host:port/dbname
    DB_CLEAN=$(echo "${DB_URL}" | sed 's|mysql://||' | sed 's|?.*||')
    DB_USER=$(echo "${DB_CLEAN}" | sed 's|:.*||')
    DB_REST=$(echo "${DB_CLEAN}" | sed "s|${DB_USER}:||")
    DB_PASS=$(echo "${DB_REST}" | sed 's|@.*||')
    DB_HOSTPORT=$(echo "${DB_REST}" | sed "s|${DB_PASS}@||" | sed 's|/.*||')
    DB_NAME=$(echo "${DB_REST}" | sed "s|${DB_PASS}@${DB_HOSTPORT}/||")
    DB_HOST=$(echo "${DB_HOSTPORT}" | cut -d: -f1)
    DB_PORT=$(echo "${DB_HOSTPORT}" | cut -d: -f2)
    DB_PORT="${DB_PORT:-3306}"

    SSL_OPT=""
    if [[ "${DB_PORT}" == "4000" ]] || echo "${DB_HOST}" | grep -qiE "tidb|cloud|aws|azure|gcp"; then
      SSL_OPT="--ssl-mode=REQUIRED"
    fi

    log_info "A aplicar migração SQL em ${DB_HOST}:${DB_PORT}/${DB_NAME}..."
    if mysql -h "${DB_HOST}" -P "${DB_PORT}" -u "${DB_USER}" "-p${DB_PASS}" \
             ${SSL_OPT} "${DB_NAME}" < "${MIGRATE_SQL}" 2>&1; then
      log_ok "Migração SQL aplicada com sucesso."
    else
      log_warn "Falha ao aplicar migração. Execute manualmente:"
      log_warn "  mysql -h ${DB_HOST} -P ${DB_PORT} -u ${DB_USER} -pSENHA ${DB_NAME} < ${MIGRATE_SQL}"
    fi
  else
    log_warn "mysql-client não encontrado — migração ignorada."
    log_warn "Instale com: apt-get install -y mysql-client"
    log_warn "Depois execute: mysql ... < ${MIGRATE_SQL}"
  fi
else
  log_info "Nenhum ficheiro de migração SQL encontrado — ignorado."
fi

# ── 7. Reiniciar o serviço ────────────────────────────────────────────────────
log_step "[7/7] A reiniciar o serviço ${FIBERDOC_SERVICE}..."

systemctl daemon-reload

SERVICE_FILE="/etc/systemd/system/${FIBERDOC_SERVICE}.service"
if [[ -f "${SERVICE_FILE}" ]]; then
  systemctl restart "${FIBERDOC_SERVICE}" || true
  sleep 3
  if systemctl is-active --quiet "${FIBERDOC_SERVICE}"; then
    log_ok "Serviço reiniciado com sucesso!"
  else
    log_warn "Serviço não iniciou. Verifique os logs:"
    log_warn "  journalctl -u ${FIBERDOC_SERVICE} -n 30 --no-pager"
  fi
else
  log_warn "Ficheiro de serviço systemd não encontrado: ${SERVICE_FILE}"
  log_warn "O serviço não foi reiniciado automaticamente."
  if [[ "${SERVICE_WAS_RUNNING}" == "true" ]]; then
    log_warn "O serviço estava em execução antes da actualização."
    log_warn "Inicie manualmente: systemctl start ${FIBERDOC_SERVICE}"
  fi
fi

# ── Resumo final ──────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}============================================================${NC}"
echo -e "${GREEN}${BOLD}  FiberDoc actualizado com sucesso!${NC}"
echo ""
if [[ -n "${BACKUP_FILE:-}" ]]; then
  echo -e "  Backup anterior: ${BACKUP_FILE}"
fi
echo -e "  Directório:      ${FIBERDOC_DIR}"
echo -e "  Serviço:         ${FIBERDOC_SERVICE}"
echo -e "  Data/Hora:       $(date '+%d/%m/%Y %H:%M:%S')"
echo ""
echo -e "  Para verificar o estado do serviço:"
echo -e "    systemctl status ${FIBERDOC_SERVICE}"
echo -e "    journalctl -u ${FIBERDOC_SERVICE} -f"
echo -e "${BOLD}============================================================${NC}"
echo ""
