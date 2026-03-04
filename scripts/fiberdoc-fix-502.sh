#!/usr/bin/env bash
# =============================================================================
#  FiberDoc — Script de Recuperação Rápida do Erro 502 Bad Gateway
#  Versão: 1.0
#
#  Uso:
#    sudo bash fiberdoc-fix-502.sh
#
#  O que este script faz:
#    1. Verifica e recria o ficheiro .env se estiver em falta
#    2. Verifica se o node_modules está instalado
#    3. Reinicia o serviço e verifica o estado
#    4. Mostra os últimos logs de erro
# =============================================================================
set -euo pipefail

FIBERDOC_DIR="${FIBERDOC_DIR:-/opt/fiberdoc}"
FIBERDOC_SERVICE="${FIBERDOC_SERVICE:-fiberdoc}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log_info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()  { echo -e "${YELLOW}[AVISO]${NC} $*"; }
log_error() { echo -e "${RED}[ERRO]${NC}  $*"; }
log_step()  { echo -e "\n${BOLD}$*${NC}"; }

echo ""
echo -e "${BOLD}============================================================${NC}"
echo -e "${BOLD}  FiberDoc — Diagnóstico e Recuperação do Erro 502${NC}"
echo -e "${BOLD}  Directório: ${FIBERDOC_DIR}${NC}"
echo -e "${BOLD}  Data/Hora:  $(date '+%d/%m/%Y %H:%M:%S')${NC}"
echo -e "${BOLD}============================================================${NC}"
echo ""

# Verificar root
if [[ $EUID -ne 0 ]]; then
  log_error "Este script deve ser executado como root."
  echo "       Execute: sudo bash fiberdoc-fix-502.sh"
  exit 1
fi

# ── 1. Verificar directório ───────────────────────────────────────────────────
log_step "[1/6] A verificar directório de instalação..."
if [[ ! -d "${FIBERDOC_DIR}" ]]; then
  log_error "Directório ${FIBERDOC_DIR} não encontrado!"
  echo "       O FiberDoc não está instalado em ${FIBERDOC_DIR}"
  exit 1
fi
log_ok "Directório encontrado: ${FIBERDOC_DIR}"

# ── 2. Verificar e reparar o .env ─────────────────────────────────────────────
log_step "[2/6] A verificar ficheiro .env..."

ENV_FILE="${FIBERDOC_DIR}/.env"

# Remover symlink quebrado
if [[ -L "${ENV_FILE}" ]] && [[ ! -e "${ENV_FILE}" ]]; then
  rm -f "${ENV_FILE}"
  log_warn "Symlink quebrado .env removido."
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  log_warn "Ficheiro .env não encontrado!"
  log_warn "A tentar recuperar DATABASE_URL do serviço systemd..."

  SERVICE_FILE="/etc/systemd/system/${FIBERDOC_SERVICE}.service"
  DB_URL=""

  if [[ -f "${SERVICE_FILE}" ]]; then
    DB_URL=$(grep -E 'DATABASE_URL=' "${SERVICE_FILE}" 2>/dev/null \
             | head -1 | sed 's/.*DATABASE_URL=//' | sed "s/'//g" | sed 's/"//g' | awk '{print $1}' || true)
  fi

  if [[ -n "${DB_URL}" ]]; then
    echo "DATABASE_URL=${DB_URL}" > "${ENV_FILE}"
    log_ok ".env recriado com DATABASE_URL do serviço systemd."
  else
    log_error "Não foi possível recuperar DATABASE_URL automaticamente."
    echo ""
    echo -e "  ${YELLOW}ACÇÃO NECESSÁRIA:${NC} Crie o ficheiro .env manualmente:"
    echo ""
    echo "    cat > ${ENV_FILE} << 'EOF'"
    echo "    DATABASE_URL=mysql://fiberdoc:SENHA@localhost:3306/fiberdoc"
    echo "    EOF"
    echo ""
    echo "  Substitua SENHA pela senha da base de dados."
    echo ""
    read -p "  Prima ENTER para continuar mesmo sem .env (o serviço pode não arrancar)..." || true
  fi
else
  # Verificar se tem DATABASE_URL
  if grep -q "DATABASE_URL=" "${ENV_FILE}" 2>/dev/null; then
    DB_URL_VAL=$(grep "DATABASE_URL=" "${ENV_FILE}" | head -1 | sed 's/DATABASE_URL=//')
    if [[ -n "${DB_URL_VAL}" ]]; then
      log_ok ".env encontrado com DATABASE_URL configurado."
    else
      log_warn ".env existe mas DATABASE_URL está vazio!"
    fi
  else
    log_warn ".env existe mas não tem DATABASE_URL!"
    echo ""
    echo "  Conteúdo actual do .env:"
    cat "${ENV_FILE}" | sed 's/PASSWORD=.*/PASSWORD=***/' | sed 's/:.*@/:***@/'
    echo ""
  fi
fi

# ── 3. Verificar dist/index.js ────────────────────────────────────────────────
log_step "[3/6] A verificar bundle de produção..."

if [[ ! -f "${FIBERDOC_DIR}/dist/index.js" ]]; then
  log_error "dist/index.js não encontrado!"
  echo "       O build de produção está em falta."
  echo "       Tente reinstalar com o script de actualização."
  exit 1
fi

DIST_SIZE=$(du -sh "${FIBERDOC_DIR}/dist/index.js" | cut -f1)
log_ok "dist/index.js encontrado (${DIST_SIZE})"

if [[ ! -d "${FIBERDOC_DIR}/dist/public" ]]; then
  log_warn "dist/public/ não encontrado — o frontend pode não ser servido."
else
  log_ok "dist/public/ encontrado."
fi

# ── 4. Verificar node_modules ─────────────────────────────────────────────────
log_step "[4/6] A verificar node_modules..."

if [[ ! -d "${FIBERDOC_DIR}/node_modules" ]]; then
  log_warn "node_modules não encontrado — a instalar dependências..."
  cd "${FIBERDOC_DIR}"
  if command -v pnpm &>/dev/null; then
    pnpm install --prod --no-frozen-lockfile 2>&1 | tail -5
  elif command -v npm &>/dev/null; then
    npm install --omit=dev 2>&1 | tail -5
  else
    log_error "pnpm/npm não encontrado. Instale Node.js primeiro."
    exit 1
  fi
  log_ok "Dependências instaladas."
else
  # Verificar se módulos críticos existem
  MISSING_MODS=()
  for mod in express drizzle-orm mysql2; do
    if [[ ! -d "${FIBERDOC_DIR}/node_modules/${mod}" ]] && \
       [[ ! -d "${FIBERDOC_DIR}/node_modules/.pnpm" ]]; then
      MISSING_MODS+=("${mod}")
    fi
  done

  if [[ ${#MISSING_MODS[@]} -gt 0 ]]; then
    log_warn "Módulos em falta: ${MISSING_MODS[*]}"
    log_warn "A reinstalar dependências..."
    cd "${FIBERDOC_DIR}"
    if command -v pnpm &>/dev/null; then
      pnpm install --prod --no-frozen-lockfile 2>&1 | tail -5
    fi
    log_ok "Dependências reinstaladas."
  else
    log_ok "node_modules presente."
  fi
fi

# ── 5. Reiniciar o serviço ────────────────────────────────────────────────────
log_step "[5/6] A reiniciar o serviço ${FIBERDOC_SERVICE}..."

systemctl daemon-reload

if ! systemctl list-unit-files "${FIBERDOC_SERVICE}.service" &>/dev/null; then
  log_warn "Serviço ${FIBERDOC_SERVICE} não encontrado no systemd."
  log_warn "Verifique se o serviço está configurado:"
  log_warn "  ls /etc/systemd/system/${FIBERDOC_SERVICE}.service"
else
  systemctl restart "${FIBERDOC_SERVICE}" || true
  sleep 4

  if systemctl is-active --quiet "${FIBERDOC_SERVICE}"; then
    log_ok "Serviço reiniciado com sucesso!"
  else
    log_error "Serviço não iniciou. A verificar logs..."
  fi
fi

# ── 6. Diagnóstico final ──────────────────────────────────────────────────────
log_step "[6/6] Diagnóstico final..."

echo ""
echo -e "${BOLD}Estado do serviço:${NC}"
systemctl status "${FIBERDOC_SERVICE}" --no-pager -l 2>/dev/null | head -20 || true

echo ""
echo -e "${BOLD}Últimos logs de erro:${NC}"
journalctl -u "${FIBERDOC_SERVICE}" -n 20 --no-pager 2>/dev/null | grep -iE "error|failed|cannot|ENOENT|ECONNREFUSED|MODULE" | tail -10 || true

echo ""
echo -e "${BOLD}============================================================${NC}"

if systemctl is-active --quiet "${FIBERDOC_SERVICE}" 2>/dev/null; then
  echo -e "${GREEN}${BOLD}  Serviço está ACTIVO!${NC}"
  echo ""
  echo -e "  Verifique o sistema em: http://$(hostname -I | awk '{print $1}'):3000"
  echo ""
  echo -e "  Se ainda aparecer 502, aguarde 10-15 segundos e tente novamente."
  echo -e "  O servidor pode estar a inicializar a ligação à base de dados."
else
  echo -e "${RED}${BOLD}  Serviço NÃO está activo!${NC}"
  echo ""
  echo -e "  Para ver logs completos:"
  echo -e "    journalctl -u ${FIBERDOC_SERVICE} -f"
  echo ""
  echo -e "  Para iniciar manualmente (debug):"
  echo -e "    cd ${FIBERDOC_DIR} && node dist/index.js"
  echo ""
  echo -e "  Causas comuns do 502:"
  echo -e "    1. .env sem DATABASE_URL (verifique: cat ${ENV_FILE})"
  echo -e "    2. node_modules em falta (execute: cd ${FIBERDOC_DIR} && pnpm install --prod)"
  echo -e "    3. Porta 3000 ocupada (verifique: ss -tlnp | grep 3000)"
  echo -e "    4. Erro no dist/index.js (execute: node ${FIBERDOC_DIR}/dist/index.js)"
fi

echo -e "${BOLD}============================================================${NC}"
echo ""
