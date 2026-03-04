#!/usr/bin/env bash
# =============================================================================
#  FiberDoc — Script de Actualização via wget
#  Versão: 1.1
#
#  Uso:
#    bash fiberdoc-wget-update.sh <URL_DO_PACOTE_ZIP>
#
#  Exemplos:
#    sudo bash fiberdoc-wget-update.sh https://releases.exemplo.com/fiberdoc-v6.5.6.zip
#
#  Ou com variáveis de ambiente:
#    FIBERDOC_UPDATE_URL=https://... FIBERDOC_DIR=/opt/fiberdoc sudo bash fiberdoc-wget-update.sh
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
NC='\033[0m'

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
echo -e "${BOLD}============================================================${NC}"
echo -e "${BOLD}  FiberDoc — Actualização via wget v1.1${NC}"
echo -e "${BOLD}  Directório: ${FIBERDOC_DIR}${NC}"
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
  echo "  Uso: sudo bash fiberdoc-wget-update.sh <URL_DO_PACOTE_ZIP>"
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

mkdir -p "${FIBERDOC_DIR}" "${BACKUP_DIR}" "${TMP_DIR}"
log_ok "Verificações concluídas."

# ── PRÉ-PASSO: Guardar DATABASE_URL antes de qualquer operação ────────────────
log_step "[PRÉ] A guardar DATABASE_URL de todas as fontes possíveis..."

SAVED_DB_URL=""

# Fonte 1: variável de ambiente actual
if [[ -n "${DATABASE_URL:-}" ]]; then
  SAVED_DB_URL="${DATABASE_URL}"
  log_info "DATABASE_URL encontrada na variável de ambiente."
fi

# Fonte 2: ficheiro .env actual (remover symlink quebrado primeiro)
if [[ -L "${FIBERDOC_DIR}/.env" ]] && [[ ! -e "${FIBERDOC_DIR}/.env" ]]; then
  rm -f "${FIBERDOC_DIR}/.env"
  log_info "Symlink quebrado .env removido."
fi
if [[ -z "${SAVED_DB_URL}" ]] && [[ -f "${FIBERDOC_DIR}/.env" ]]; then
  SAVED_DB_URL=$(grep -E '^DATABASE_URL=' "${FIBERDOC_DIR}/.env" 2>/dev/null \
                 | head -1 | sed 's/^DATABASE_URL=//' | tr -d '"' || true)
  if [[ -n "${SAVED_DB_URL}" ]]; then
    log_info "DATABASE_URL encontrada no .env actual."
  fi
fi

# Fonte 3: serviço systemd
SERVICE_FILE="/etc/systemd/system/${FIBERDOC_SERVICE}.service"
if [[ -z "${SAVED_DB_URL}" ]] && [[ -f "${SERVICE_FILE}" ]]; then
  SAVED_DB_URL=$(grep -E 'DATABASE_URL=' "${SERVICE_FILE}" 2>/dev/null \
                 | head -1 | sed 's/.*DATABASE_URL=//' | sed "s/'//g" | sed 's/"//g' | awk '{print $1}' || true)
  if [[ -n "${SAVED_DB_URL}" ]]; then
    log_info "DATABASE_URL encontrada no serviço systemd."
  fi
fi

if [[ -n "${SAVED_DB_URL}" ]]; then
  log_ok "DATABASE_URL guardada com sucesso."
else
  log_warn "DATABASE_URL não encontrada em nenhuma fonte!"
  log_warn "O servidor pode não arrancar após a actualização."
  log_warn "Se souber a DATABASE_URL, defina-a agora:"
  log_warn "  export DATABASE_URL=mysql://fiberdoc:SENHA@localhost:3306/fiberdoc"
  log_warn "  sudo -E bash fiberdoc-wget-update.sh <URL>"
fi

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
  exit 1
fi

# Verificar conteúdo mínimo esperado
REQUIRED_FILES=("dist/index.js" "package.json")
MISSING=()
for f in "${REQUIRED_FILES[@]}"; do
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

BACKUP_FILE=""
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

# Detectar se o ZIP tem uma pasta raiz
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

# Copiar ficheiros (preservar .env e backups)
rsync -a --delete \
  --exclude=".env" \
  --exclude="backups/" \
  --exclude="node_modules/" \
  --exclude="*.log" \
  --exclude="local-uploads/" \
  --exclude="local-backups/" \
  "${SOURCE_DIR}/" "${FIBERDOC_DIR}/"

log_ok "Ficheiros aplicados em ${FIBERDOC_DIR}."

# ── PASSO CRÍTICO: Garantir que o .env existe e tem DATABASE_URL ──────────────
log_step "[5b] A garantir que o .env está correcto..."

ENV_FILE="${FIBERDOC_DIR}/.env"

# Remover symlink quebrado no destino
if [[ -L "${ENV_FILE}" ]]; then
  rm -f "${ENV_FILE}"
  log_info "Symlink .env removido."
fi

# Verificar se o .env existe e tem DATABASE_URL
ENV_HAS_DB=false
if [[ -f "${ENV_FILE}" ]]; then
  if grep -q "DATABASE_URL=" "${ENV_FILE}" 2>/dev/null; then
    ENV_DB=$(grep "DATABASE_URL=" "${ENV_FILE}" | head -1 | sed 's/DATABASE_URL=//')
    if [[ -n "${ENV_DB}" ]]; then
      ENV_HAS_DB=true
      log_ok ".env existente com DATABASE_URL mantido."
    fi
  fi
fi

# Se o .env não tem DATABASE_URL, criar/actualizar com a URL guardada
if [[ "${ENV_HAS_DB}" == "false" ]]; then
  if [[ -n "${SAVED_DB_URL}" ]]; then
    # Preservar outras variáveis do .env se existir
    if [[ -f "${ENV_FILE}" ]]; then
      # Remover linha DATABASE_URL existente (vazia ou incorrecta) e adicionar a correcta
      grep -v "^DATABASE_URL=" "${ENV_FILE}" > "${ENV_FILE}.tmp" 2>/dev/null || true
      echo "DATABASE_URL=${SAVED_DB_URL}" >> "${ENV_FILE}.tmp"
      mv "${ENV_FILE}.tmp" "${ENV_FILE}"
      log_ok ".env actualizado com DATABASE_URL recuperada."
    else
      # Criar .env novo
      echo "DATABASE_URL=${SAVED_DB_URL}" > "${ENV_FILE}"
      log_ok ".env criado com DATABASE_URL recuperada."
    fi
  else
    log_warn "Não foi possível restaurar DATABASE_URL no .env!"
    log_warn "O servidor pode não arrancar. Crie o .env manualmente:"
    log_warn "  echo 'DATABASE_URL=mysql://fiberdoc:SENHA@localhost:3306/fiberdoc' > ${ENV_FILE}"
  fi
fi

# Verificar conteúdo final do .env (mascarar senha)
if [[ -f "${ENV_FILE}" ]]; then
  log_info "Conteúdo do .env (senha mascarada):"
  cat "${ENV_FILE}" | sed 's|://[^:]*:[^@]*@|://***:***@|g' | while read -r line; do
    log_info "  ${line}"
  done
fi

# ── 6. Instalar dependências ──────────────────────────────────────────────────
log_step "[6/7] A instalar dependências..."

cd "${FIBERDOC_DIR}"

if command -v pnpm &>/dev/null; then
  pnpm install --prod --no-frozen-lockfile 2>&1 | tail -5
  log_ok "Dependências instaladas com pnpm."
elif command -v npm &>/dev/null; then
  npm install --omit=dev 2>&1 | tail -5
  log_ok "Dependências instaladas com npm."
else
  log_warn "pnpm/npm não encontrado — node_modules pode estar desactualizado."
fi

# ── 6b. Migração SQL ──────────────────────────────────────────────────────────
MIGRATE_SQL=""
for candidate in \
  "${FIBERDOC_DIR}/dist/migrate.sql" \
  "${FIBERDOC_DIR}/migrate.sql" \
  "${FIBERDOC_DIR}/migrate-latest.sql" \
  "${SOURCE_DIR}/dist/migrate.sql" \
  "${SOURCE_DIR}/migrate.sql"; do
  if [[ -f "${candidate}" ]]; then
    MIGRATE_SQL="${candidate}"
    break
  fi
done

if [[ -n "${MIGRATE_SQL}" ]]; then
  log_info "Ficheiro de migração SQL encontrado: ${MIGRATE_SQL}"

  # Obter DATABASE_URL (usar a que já guardámos)
  DB_URL="${SAVED_DB_URL:-}"
  if [[ -z "${DB_URL}" ]] && [[ -f "${ENV_FILE}" ]]; then
    DB_URL=$(grep -E '^DATABASE_URL=' "${ENV_FILE}" 2>/dev/null \
             | head -1 | sed 's/^DATABASE_URL=//' | tr -d '"' || true)
  fi

  if [[ -z "${DB_URL}" ]]; then
    log_warn "DATABASE_URL não configurada — migração SQL ignorada."
  elif command -v mysql &>/dev/null; then
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
  fi
else
  log_info "Nenhum ficheiro de migração SQL encontrado — ignorado."
fi

# ── 7. Reiniciar o serviço ────────────────────────────────────────────────────
log_step "[7/7] A reiniciar o serviço ${FIBERDOC_SERVICE}..."

systemctl daemon-reload

if [[ -f "${SERVICE_FILE}" ]]; then
  systemctl restart "${FIBERDOC_SERVICE}" || true
  sleep 5

  if systemctl is-active --quiet "${FIBERDOC_SERVICE}"; then
    log_ok "Serviço reiniciado com sucesso!"
  else
    log_warn "Serviço não iniciou. A verificar logs..."
    echo ""
    echo -e "${YELLOW}Últimos logs do serviço:${NC}"
    journalctl -u "${FIBERDOC_SERVICE}" -n 15 --no-pager 2>/dev/null || true
    echo ""
    log_warn "Para diagnóstico completo, execute:"
    log_warn "  sudo bash ${FIBERDOC_DIR}/scripts/fiberdoc-fix-502.sh"
  fi
else
  log_warn "Ficheiro de serviço systemd não encontrado: ${SERVICE_FILE}"
  if [[ "${SERVICE_WAS_RUNNING}" == "true" ]]; then
    log_warn "Inicie manualmente: systemctl start ${FIBERDOC_SERVICE}"
  fi
fi

# ── Resumo final ──────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}============================================================${NC}"

if systemctl is-active --quiet "${FIBERDOC_SERVICE}" 2>/dev/null; then
  echo -e "${GREEN}${BOLD}  FiberDoc actualizado e a funcionar!${NC}"
else
  echo -e "${YELLOW}${BOLD}  FiberDoc actualizado — serviço pode precisar de atenção${NC}"
  echo ""
  echo -e "  Se aparecer erro 502, execute:"
  echo -e "    ${CYAN}sudo bash ${FIBERDOC_DIR}/scripts/fiberdoc-fix-502.sh${NC}"
fi

echo ""
if [[ -n "${BACKUP_FILE}" ]]; then
  echo -e "  Backup anterior: ${BACKUP_FILE}"
fi
echo -e "  Directório:      ${FIBERDOC_DIR}"
echo -e "  Serviço:         ${FIBERDOC_SERVICE}"
echo -e "  Data/Hora:       $(date '+%d/%m/%Y %H:%M:%S')"
echo ""
echo -e "  Para verificar o estado:"
echo -e "    systemctl status ${FIBERDOC_SERVICE}"
echo -e "    journalctl -u ${FIBERDOC_SERVICE} -f"
echo -e "${BOLD}============================================================${NC}"
echo ""
