#!/usr/bin/env bash
# =============================================================================
# FiberDoc — Script de Actualização Automática de Vínculos CTO ↔ SGP
# =============================================================================
# Uso:
#   ./sync-sgp-links.sh [OPÇÕES]
#
# Opções:
#   -u URL       URL base do FiberDoc (ex: https://meuservidor.manus.space)
#   -e EMAIL     Email do utilizador admin
#   -p SENHA     Senha do utilizador admin
#   -m MODO      Modo de operação: list | suggest | bulk | unlink
#   -c CTO_ID    ID da CTO local (necessário para link/unlink individual)
#   -s SGP_ID    ID da CTO no SGP (necessário para link individual)
#   -h           Mostrar esta ajuda
#
# Exemplos:
#   # Listar todos os vínculos actuais
#   ./sync-sgp-links.sh -u https://meuservidor.manus.space -e admin@empresa.com -p senha123 -m list
#
#   # Ver sugestões automáticas de vínculo
#   ./sync-sgp-links.sh -u https://meuservidor.manus.space -e admin@empresa.com -p senha123 -m suggest
#
#   # Vincular CTO local #5 à CTO SGP #42
#   ./sync-sgp-links.sh -u https://meuservidor.manus.space -e admin@empresa.com -p senha123 -m link -c 5 -s 42
#
#   # Remover vínculo da CTO local #5
#   ./sync-sgp-links.sh -u https://meuservidor.manus.space -e admin@empresa.com -p senha123 -m unlink -c 5
# =============================================================================

set -euo pipefail

# ─── Cores ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

# ─── Defaults ─────────────────────────────────────────────────────────────────
BASE_URL=""
EMAIL=""
PASSWORD=""
MODE="list"
CTO_ID=""
SGP_ID=""

# ─── Ajuda ────────────────────────────────────────────────────────────────────
usage() {
  sed -n '/^# Uso:/,/^# =====/p' "$0" | grep "^#" | sed 's/^# \?//'
  exit 0
}

# ─── Argumentos ───────────────────────────────────────────────────────────────
while getopts "u:e:p:m:c:s:h" opt; do
  case $opt in
    u) BASE_URL="${OPTARG%/}" ;;
    e) EMAIL="$OPTARG" ;;
    p) PASSWORD="$OPTARG" ;;
    m) MODE="$OPTARG" ;;
    c) CTO_ID="$OPTARG" ;;
    s) SGP_ID="$OPTARG" ;;
    h) usage ;;
    *) echo -e "${RED}Opção inválida: -$OPTARG${RESET}" >&2; exit 1 ;;
  esac
done

# ─── Validações básicas ───────────────────────────────────────────────────────
if [[ -z "$BASE_URL" || -z "$EMAIL" || -z "$PASSWORD" ]]; then
  echo -e "${RED}Erro: -u URL, -e EMAIL e -p SENHA são obrigatórios.${RESET}" >&2
  echo "Use -h para ver a ajuda." >&2
  exit 1
fi

# ─── Verificar dependências ───────────────────────────────────────────────────
for cmd in curl jq; do
  if ! command -v "$cmd" &>/dev/null; then
    echo -e "${RED}Erro: '$cmd' não está instalado. Instale-o e tente novamente.${RESET}" >&2
    exit 1
  fi
done

# ─── Autenticação (obter token JWT) ───────────────────────────────────────────
echo -e "${CYAN}${BOLD}FiberDoc — Sincronização SGP${RESET}"
echo -e "${CYAN}Servidor: ${BASE_URL}${RESET}"
echo -e "${CYAN}A autenticar como ${EMAIL}...${RESET}"

LOGIN_RESPONSE=$(curl -s -X POST \
  "${BASE_URL}/api/trpc/mobileAuth.login" \
  -H "Content-Type: application/json" \
  -d "{\"json\":{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}}" \
  --max-time 15)

# Extrair token da resposta tRPC
TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.result.data.json.token // empty' 2>/dev/null)

if [[ -z "$TOKEN" ]]; then
  ERROR=$(echo "$LOGIN_RESPONSE" | jq -r '.error.message // .error.json.message // "Falha na autenticação"' 2>/dev/null)
  echo -e "${RED}Erro de autenticação: ${ERROR}${RESET}" >&2
  exit 1
fi

echo -e "${GREEN}✓ Autenticado com sucesso${RESET}"
echo ""

# ─── Função auxiliar: chamada tRPC ────────────────────────────────────────────
trpc_query() {
  local procedure="$1"
  local input="${2:-null}"
  curl -s \
    "${BASE_URL}/api/trpc/${procedure}?input=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "{\"json\":${input}}")" \
    -H "Authorization: Bearer ${TOKEN}" \
    --max-time 30
}

trpc_mutation() {
  local procedure="$1"
  local body="$2"
  curl -s -X POST \
    "${BASE_URL}/api/trpc/${procedure}" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${TOKEN}" \
    -d "{\"json\":${body}}" \
    --max-time 30
}

# ─── Modos de operação ────────────────────────────────────────────────────────
case "$MODE" in

  # ── Listar todos os vínculos ─────────────────────────────────────────────────
  list)
    echo -e "${BOLD}Vínculos CTO ↔ SGP actuais:${RESET}"
    RESPONSE=$(curl -s \
      "${BASE_URL}/api/cto/sgp-links" \
      -H "Authorization: Bearer ${TOKEN}" \
      --max-time 15)
    COUNT=$(echo "$RESPONSE" | jq '.links | length' 2>/dev/null || echo 0)
    if [[ "$COUNT" == "0" ]]; then
      echo -e "${YELLOW}Nenhuma CTO vinculada ao SGP.${RESET}"
    else
      echo -e "${GREEN}${COUNT} vínculo(s) encontrado(s):${RESET}"
      echo ""
      echo "$RESPONSE" | jq -r '.links[] | "  CTO #\(.ctoId) \(.ctoName) → SGP #\(.sgpId)"'
    fi
    ;;

  # ── Ver sugestões automáticas ────────────────────────────────────────────────
  suggest)
    echo -e "${BOLD}A analisar CTOs para sugestões de vínculo...${RESET}"
    RESPONSE=$(trpc_query "sgp.suggestLinks")
    ERROR=$(echo "$RESPONSE" | jq -r '.result.data.json.error // empty' 2>/dev/null)
    if [[ -n "$ERROR" ]]; then
      echo -e "${RED}Erro: ${ERROR}${RESET}" >&2
      exit 1
    fi
    SUGGESTIONS=$(echo "$RESPONSE" | jq '.result.data.json.suggestions // []' 2>/dev/null)
    COUNT=$(echo "$SUGGESTIONS" | jq 'length')
    if [[ "$COUNT" == "0" ]]; then
      echo -e "${GREEN}✓ Todas as CTOs já estão vinculadas ou não há correspondências.${RESET}"
    else
      echo -e "${YELLOW}${COUNT} sugestão(ões) encontrada(s):${RESET}"
      echo ""
      echo "$SUGGESTIONS" | jq -r '.[] | "  [\(.score)%] CTO #\(.localCtoId) \"\(.localCtoName)\" → SGP #\(.sgpId) \"\(.sgpName)\""'
      echo ""
      echo -e "${CYAN}Para vincular automaticamente todas as sugestões com confiança ≥ 80%:${RESET}"
      echo -e "  ${BOLD}./sync-sgp-links.sh -u ${BASE_URL} -e ${EMAIL} -p *** -m bulk${RESET}"
    fi
    ;;

  # ── Vincular automaticamente todas as sugestões com score ≥ 80% ─────────────
  bulk)
    THRESHOLD="${THRESHOLD:-80}"
    echo -e "${BOLD}A obter sugestões (threshold: ${THRESHOLD}%)...${RESET}"
    RESPONSE=$(trpc_query "sgp.suggestLinks")
    ERROR=$(echo "$RESPONSE" | jq -r '.result.data.json.error // empty' 2>/dev/null)
    if [[ -n "$ERROR" ]]; then
      echo -e "${RED}Erro: ${ERROR}${RESET}" >&2
      exit 1
    fi
    LINKS=$(echo "$RESPONSE" | jq "[.result.data.json.suggestions[] | select(.score >= ${THRESHOLD}) | {ctoId: .localCtoId, sgpId: .sgpId}]")
    COUNT=$(echo "$LINKS" | jq 'length')
    if [[ "$COUNT" == "0" ]]; then
      echo -e "${YELLOW}Nenhuma sugestão com confiança ≥ ${THRESHOLD}%.${RESET}"
      exit 0
    fi
    echo -e "${YELLOW}A vincular ${COUNT} CTO(s)...${RESET}"
    BULK_RESPONSE=$(trpc_mutation "sgp.bulkLink" "{\"links\":${LINKS}}")
    LINKED=$(echo "$BULK_RESPONSE" | jq -r '.result.data.json.linked // 0' 2>/dev/null)
    echo -e "${GREEN}✓ ${LINKED} CTO(s) vinculada(s) com sucesso.${RESET}"
    ;;

  # ── Vincular CTO individual ──────────────────────────────────────────────────
  link)
    if [[ -z "$CTO_ID" || -z "$SGP_ID" ]]; then
      echo -e "${RED}Erro: -c CTO_ID e -s SGP_ID são obrigatórios para o modo 'link'.${RESET}" >&2
      exit 1
    fi
    echo -e "${BOLD}A vincular CTO #${CTO_ID} → SGP #${SGP_ID}...${RESET}"
    RESPONSE=$(curl -s -X POST \
      "${BASE_URL}/api/cto/${CTO_ID}/link-sgp" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${TOKEN}" \
      -d "{\"sgpId\":${SGP_ID}}" \
      --max-time 15)
    OK=$(echo "$RESPONSE" | jq -r '.ok // false' 2>/dev/null)
    if [[ "$OK" == "true" ]]; then
      echo -e "${GREEN}✓ CTO #${CTO_ID} vinculada à CTO SGP #${SGP_ID} com sucesso.${RESET}"
    else
      ERROR=$(echo "$RESPONSE" | jq -r '.error // "Erro desconhecido"' 2>/dev/null)
      echo -e "${RED}Erro: ${ERROR}${RESET}" >&2
      exit 1
    fi
    ;;

  # ── Remover vínculo ──────────────────────────────────────────────────────────
  unlink)
    if [[ -z "$CTO_ID" ]]; then
      echo -e "${RED}Erro: -c CTO_ID é obrigatório para o modo 'unlink'.${RESET}" >&2
      exit 1
    fi
    echo -e "${BOLD}A remover vínculo SGP da CTO #${CTO_ID}...${RESET}"
    RESPONSE=$(curl -s -X DELETE \
      "${BASE_URL}/api/cto/${CTO_ID}/link-sgp" \
      -H "Authorization: Bearer ${TOKEN}" \
      --max-time 15)
    OK=$(echo "$RESPONSE" | jq -r '.ok // false' 2>/dev/null)
    if [[ "$OK" == "true" ]]; then
      echo -e "${GREEN}✓ Vínculo SGP removido da CTO #${CTO_ID} com sucesso.${RESET}"
    else
      ERROR=$(echo "$RESPONSE" | jq -r '.error // "Erro desconhecido"' 2>/dev/null)
      echo -e "${RED}Erro: ${ERROR}${RESET}" >&2
      exit 1
    fi
    ;;

  *)
    echo -e "${RED}Modo inválido: '${MODE}'. Use: list | suggest | bulk | link | unlink${RESET}" >&2
    exit 1
    ;;
esac

echo ""
echo -e "${CYAN}Concluído.${RESET}"
