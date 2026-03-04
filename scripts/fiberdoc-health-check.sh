#!/bin/bash
# fiberdoc-health-check.sh v1.0
# Verifica se todos os modulos criticos do FiberDoc estao a funcionar
# Uso: bash fiberdoc-health-check.sh [--verbose] [--rollback-on-fail]

FIBERDOC_DIR="${FIBERDOC_DIR:-/opt/fiberdoc}"
FIBERDOC_SERVICE="${FIBERDOC_SERVICE:-fiberdoc}"
BASE_URL="http://localhost:3000"
VERBOSE=0
ROLLBACK_ON_FAIL=0
FAILED=0
PASSED=0

for arg in "$@"; do
  case "$arg" in
    --verbose) VERBOSE=1 ;;
    --rollback-on-fail) ROLLBACK_ON_FAIL=1 ;;
  esac
done

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

echo ""
echo -e "${BOLD}============================================================${NC}"
echo -e "${CYAN}${BOLD}  FiberDoc Health Check v1.0${NC}"
echo -e "${BOLD}============================================================${NC}"
echo ""

# --- 1. Verificar servico systemd ---
echo -e "${CYAN}> [1/5] Servico systemd${NC}"
if systemctl is-active --quiet "${FIBERDOC_SERVICE}" 2>/dev/null; then
  echo -e "  ${GREEN}OK${NC} Servico ${FIBERDOC_SERVICE} activo"
  PASSED=$((PASSED+1))
else
  echo -e "  ${RED}ERRO${NC} Servico ${FIBERDOC_SERVICE} nao esta activo"
  FAILED=$((FAILED+1))
fi

# --- 2. Verificar porta 3000 ---
echo -e "${CYAN}> [2/5] Porta 3000${NC}"
if curl -s --max-time 5 -o /dev/null -w "%{http_code}" "${BASE_URL}/" 2>/dev/null | grep -qE "^[23]"; then
  echo -e "  ${GREEN}OK${NC} Servidor HTTP a responder em ${BASE_URL}"
  PASSED=$((PASSED+1))
else
  echo -e "  ${RED}ERRO${NC} Servidor HTTP nao responde em ${BASE_URL}"
  FAILED=$((FAILED+1))
fi

# --- 3. Verificar API tRPC ---
echo -e "${CYAN}> [3/5] API tRPC${NC}"
TRPC_STATUS=$(curl -s --max-time 5 -o /dev/null -w "%{http_code}" "${BASE_URL}/api/trpc/auth.me" 2>/dev/null)
if echo "$TRPC_STATUS" | grep -qE "^[234]"; then
  echo -e "  ${GREEN}OK${NC} API tRPC a responder (HTTP ${TRPC_STATUS})"
  PASSED=$((PASSED+1))
else
  echo -e "  ${RED}ERRO${NC} API tRPC nao responde (HTTP ${TRPC_STATUS})"
  FAILED=$((FAILED+1))
fi

# --- 4. Verificar autenticacao local ---
echo -e "${CYAN}> [4/5] Autenticacao local${NC}"
LOCAL_AUTH_STATUS=$(curl -s --max-time 5 -o /dev/null -w "%{http_code}" "${BASE_URL}/api/local-auth/info" 2>/dev/null)
if echo "$LOCAL_AUTH_STATUS" | grep -qE "^[234]"; then
  echo -e "  ${GREEN}OK${NC} Auth local a responder (HTTP ${LOCAL_AUTH_STATUS})"
  PASSED=$((PASSED+1))
else
  echo -e "  ${RED}ERRO${NC} Auth local nao responde (HTTP ${LOCAL_AUTH_STATUS})"
  FAILED=$((FAILED+1))
fi

# --- 5. Verificar base de dados (via logs) ---
echo -e "${CYAN}> [5/5] Base de dados${NC}"
DB_ERRORS=$(journalctl -u "${FIBERDOC_SERVICE}" -n 20 --no-pager 2>/dev/null | grep -c "Access denied\|ECONNREFUSED\|ER_ACCESS_DENIED" || true)
if [ "${DB_ERRORS}" -eq 0 ]; then
  echo -e "  ${GREEN}OK${NC} Sem erros de base de dados nos logs recentes"
  PASSED=$((PASSED+1))
else
  echo -e "  ${RED}ERRO${NC} Erros de base de dados detectados nos logs (${DB_ERRORS} ocorrencias)"
  echo -e "  ${YELLOW}AVISO${NC} Verifique: cat ${FIBERDOC_DIR}/.env"
  FAILED=$((FAILED+1))
fi

# --- Resultado ---
echo ""
echo -e "${BOLD}------------------------------------------------------------${NC}"
echo -e "  Resultado: ${PASSED} OK, ${FAILED} ERRO(S)"
echo ""

if [ "${FAILED}" -eq 0 ]; then
  echo -e "  ${GREEN}${BOLD}SISTEMA SAUDAVEL -- todos os modulos OK${NC}"
  echo -e "${BOLD}============================================================${NC}"
  echo ""
  exit 0
else
  echo -e "  ${RED}${BOLD}FALHA DETECTADA -- ${FAILED} modulo(s) com problema${NC}"
  echo ""

  # Encontrar backup mais recente
  LATEST_BACKUP=$(ls -t "${FIBERDOC_DIR}/backups/"*.tar.gz 2>/dev/null | head -1)
  if [ -n "${LATEST_BACKUP}" ]; then
    echo -e "  ${YELLOW}Backup disponivel:${NC} ${LATEST_BACKUP}"
    echo ""
    if [ "${ROLLBACK_ON_FAIL}" = "1" ]; then
      echo -e "  ${YELLOW}A fazer rollback automatico...${NC}"
      systemctl stop "${FIBERDOC_SERVICE}" 2>/dev/null || true
      tar -xzf "${LATEST_BACKUP}" -C "${FIBERDOC_DIR}" 2>/dev/null && \
        systemctl start "${FIBERDOC_SERVICE}" && \
        echo -e "  ${GREEN}OK${NC} Rollback concluido" || \
        echo -e "  ${RED}ERRO${NC} Rollback falhou -- intervencao manual necessaria"
    else
      echo -e "  Para rollback manual:"
      echo -e "  ${CYAN}tar -xzf ${LATEST_BACKUP} -C ${FIBERDOC_DIR}${NC}"
      echo -e "  ${CYAN}systemctl restart ${FIBERDOC_SERVICE}${NC}"
    fi
  else
    echo -e "  ${YELLOW}AVISO${NC} Nenhum backup encontrado em ${FIBERDOC_DIR}/backups/"
  fi

  echo ""
  echo -e "  Diagnostico adicional:"
  echo -e "  ${CYAN}journalctl -u ${FIBERDOC_SERVICE} -n 50 --no-pager${NC}"
  echo -e "  ${CYAN}cat ${FIBERDOC_DIR}/.env${NC}"
  echo -e "${BOLD}============================================================${NC}"
  echo ""
  exit 1
fi
