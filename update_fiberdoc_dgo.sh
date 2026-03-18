#!/usr/bin/env bash
# ============================================================
#  FiberDoc — Script de Atualização DGO (Distribuidor Geral Óptico)
#  Data: 2026-03-16
#  Melhorias desta versão:
#    - Sistema DGO no mapa (criar, visualizar, mover, remover)
#    - Vinculação de bandejas DGO a cabos (entrada/saída)
#    - Painel de detalhes DGO com bandeja visual de 12 vias
#    - Integração bidirecional com módulo de Equipamentos
#    - Suporte a grupos/pastas para DGOs no mapa
# ============================================================
set -euo pipefail
FIBERDOC_DIR="${FIBERDOC_DIR:-/opt/fiberdoc}"
FIBERDOC_SERVICE="${FIBERDOC_SERVICE:-fiberdoc}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERRO]${NC}  $*"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   FiberDoc — Atualização DGO                     ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
echo ""

[[ $EUID -ne 0 ]] && error "Execute como root: sudo bash $0"
[[ ! -d "$FIBERDOC_DIR" ]] && error "Diretório não encontrado: $FIBERDOC_DIR"

# ─── Backup ───────────────────────────────────────────────────────────────────
BACKUP_DIR="${FIBERDOC_DIR}/backups/backup-dgo-$(date +%Y%m%d-%H%M%S)"
info "Criando backup em $BACKUP_DIR ..."
mkdir -p "$BACKUP_DIR"
cp -r "$FIBERDOC_DIR/dist" "$BACKUP_DIR/dist" 2>/dev/null || true
success "Backup criado"

# ─── Parar serviço ────────────────────────────────────────────────────────────
info "Parando serviço $FIBERDOC_SERVICE ..."
if systemctl is-active --quiet "$FIBERDOC_SERVICE" 2>/dev/null; then
  systemctl stop "$FIBERDOC_SERVICE"
  success "Serviço parado"
else
  warn "Serviço não estava ativo (continuando)"
fi

# ─── Instalar arquivos compilados ─────────────────────────────────────────────
info "Instalando arquivos compilados ..."
if [[ -d "$SCRIPT_DIR/dist" ]]; then
  rm -rf "$FIBERDOC_DIR/dist"
  cp -r "$SCRIPT_DIR/dist" "$FIBERDOC_DIR/dist"
  success "dist/ atualizado"
else
  error "Pasta dist/ não encontrada em $SCRIPT_DIR"
fi

# ─── Aplicar migração do banco de dados ───────────────────────────────────────
info "Aplicando migração v14 (tabelas DGO) ..."

# Extrair DATABASE_URL
DB_URL=$(grep -E '^Environment=DATABASE_URL=' "/etc/systemd/system/${FIBERDOC_SERVICE}.service" 2>/dev/null \
         | head -1 | sed 's/^Environment=DATABASE_URL=//' || true)
if [[ -z "${DB_URL}" ]]; then
  DB_URL=$(grep -E '^DATABASE_URL=' "${FIBERDOC_DIR}/.env" 2>/dev/null \
           | head -1 | sed 's/^DATABASE_URL=//' | tr -d '"' || true)
fi
if [[ -z "${DB_URL}" ]]; then
  DB_URL="${DATABASE_URL:-}"
fi

if [[ -z "${DB_URL}" ]]; then
  warn "DATABASE_URL não configurada — execute manualmente:"
  echo "  mysql -h HOST -P PORTA -u USER -pSENHA DBNAME < ${SCRIPT_DIR}/migrate-v14.sql"
else
  DB_CLEAN=$(echo "${DB_URL}" | sed 's|mysql://||' | sed 's|?.*||')
  DB_USER=$(echo "${DB_CLEAN}" | sed 's|:.*||')
  DB_REST=$(echo "${DB_CLEAN}" | sed "s|${DB_USER}:||")
  DB_PASS=$(echo "${DB_REST}" | sed 's|@.*||')
  DB_HOSTPORT=$(echo "${DB_REST}" | sed "s|${DB_PASS}@||" | sed 's|/.*||')
  DB_NAME=$(echo "${DB_REST}" | sed "s|${DB_PASS}@${DB_HOSTPORT}/||")
  DB_HOST=$(echo "${DB_HOSTPORT}" | cut -d: -f1)
  DB_PORT=$(echo "${DB_HOSTPORT}" | cut -d: -f2)
  DB_PORT="${DB_PORT:-3306}"

  MIGRATE_SQL="${SCRIPT_DIR}/migrate-v14.sql"
  if [[ -f "${MIGRATE_SQL}" ]]; then
    if command -v mysql &>/dev/null; then
      if mysql -h "${DB_HOST}" -P "${DB_PORT}" -u "${DB_USER}" "-p${DB_PASS}" "${DB_NAME}" < "${MIGRATE_SQL}" 2>&1; then
        success "migrate-v14.sql aplicado com sucesso"
        cp "${MIGRATE_SQL}" "${FIBERDOC_DIR}/migrate-v14.sql" 2>/dev/null || true
      else
        warn "Falha ao aplicar migrate-v14.sql. Execute manualmente:"
        echo "  mysql -h ${DB_HOST} -P ${DB_PORT} -u ${DB_USER} -pSENHA ${DB_NAME} < ${MIGRATE_SQL}"
      fi
    else
      warn "Cliente mysql não encontrado. Execute manualmente:"
      echo "  mysql -h ${DB_HOST} -P ${DB_PORT} -u ${DB_USER} -pSENHA ${DB_NAME} < ${MIGRATE_SQL}"
    fi
  else
    warn "migrate-v14.sql não encontrado em ${SCRIPT_DIR}"
  fi
fi

# ─── Reiniciar serviço ────────────────────────────────────────────────────────
info "Iniciando serviço $FIBERDOC_SERVICE ..."
systemctl daemon-reload
systemctl start "$FIBERDOC_SERVICE" || warn "Falha ao iniciar. Verifique: journalctl -u $FIBERDOC_SERVICE -n 30"
sleep 2
if systemctl is-active --quiet "$FIBERDOC_SERVICE" 2>/dev/null; then
  success "Serviço ativo"
else
  warn "Verifique: systemctl status $FIBERDOC_SERVICE"
fi

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   FiberDoc DGO instalado com sucesso!            ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
echo ""
