#!/usr/bin/env bash
# =============================================================================
#  FiberDoc — Correção: Drag da extremidade do cabo (endpoint)
#  Problema: ao tentar arrastar a extremidade livre de um cabo desvinculado,
#            o ícone verde do elemento era selecionado em vez de mover o cabo.
#  Solução:  Desabilitar pointer-events nos marcadores durante edição de traçado
#            e bloquear clicks nos handlers via ref editingRouteIdRef.
#
#  Uso: sudo bash scripts/fix-cable-drag-endpoint.sh [FIBERDOC_DIR]
#  Padrão: /opt/fiberdoc
# =============================================================================
set -euo pipefail

FIBERDOC_DIR="${1:-${FIBERDOC_DIR:-/opt/fiberdoc}}"
JS_FILE="${FIBERDOC_DIR}/dist/public/assets/index-BkgnTmsT.js"
BACKUP_DIR="${FIBERDOC_DIR}/backups/fix-cable-drag-$(date +%Y%m%d-%H%M%S)"
FIBERDOC_SERVICE="${FIBERDOC_SERVICE:-fiberdoc}"

# ── Cores ─────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'
BOLD='\033[1m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()      { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[AVISO]${NC} $*"; }
error()   { echo -e "${RED}[ERRO]${NC}  $*"; exit 1; }

echo ""
echo -e "${BOLD}${CYAN}============================================================${NC}"
echo -e "${BOLD}${CYAN}  FiberDoc — Fix: Drag de Extremidade de Cabo${NC}"
echo -e "${BOLD}${CYAN}============================================================${NC}"
echo ""

# ── 1. Verificar privilégios ──────────────────────────────────────────────────
[[ $EUID -ne 0 ]] && error "Execute como root: sudo bash $0"

# ── 2. Verificar diretório de instalação ─────────────────────────────────────
[[ ! -d "${FIBERDOC_DIR}" ]] && error "Diretório não encontrado: ${FIBERDOC_DIR}\nUso: sudo bash $0 /caminho/para/fiberdoc"
[[ ! -f "${FIBERDOC_DIR}/dist/index.js" ]] && error "Instalação do FiberDoc não encontrada em: ${FIBERDOC_DIR}"

# ── 3. Localizar o arquivo JS correto ────────────────────────────────────────
info "Localizando arquivo JavaScript do frontend..."
JS_FILE=$(find "${FIBERDOC_DIR}/dist/public/assets/" -name "index-*.js" 2>/dev/null | head -1)
if [[ -z "${JS_FILE}" ]]; then
  error "Arquivo JS do frontend não encontrado em ${FIBERDOC_DIR}/dist/public/assets/"
fi
ok "Arquivo encontrado: $(basename ${JS_FILE})"

# ── 4. Verificar se a correção já foi aplicada ────────────────────────────────
info "Verificando se a correção já foi aplicada..."
if grep -q "editingRouteIdRef" "${JS_FILE}" 2>/dev/null; then
  warn "A correção já parece estar aplicada neste arquivo."
  warn "Se o problema persistir, aplique o pacote completo de atualização."
  echo ""
  echo -e "  Pacote completo:"
  echo -e "  ${CYAN}sudo bash scripts/fiberdoc-wget-update.sh \\"
  echo -e "    https://files.manuscdn.com/user_upload_by_module/session_file/310519663440460843/pwVAZCAuvwKfTeUh.zip${NC}"
  echo ""
  exit 0
fi

# ── 5. Criar backup ───────────────────────────────────────────────────────────
info "Criando backup em ${BACKUP_DIR}..."
mkdir -p "${BACKUP_DIR}"
cp "${JS_FILE}" "${BACKUP_DIR}/$(basename ${JS_FILE}).bak"
# Backup do CSS também (pode ser necessário)
CSS_FILE=$(find "${FIBERDOC_DIR}/dist/public/assets/" -name "index-*.css" 2>/dev/null | head -1)
[[ -n "${CSS_FILE}" ]] && cp "${CSS_FILE}" "${BACKUP_DIR}/$(basename ${CSS_FILE}).bak"
ok "Backup criado em: ${BACKUP_DIR}"

# ── 6. Aplicar a correção via patch no JS minificado ─────────────────────────
# NOTA: Esta correção aplica o pacote completo pré-compilado que contém a fix.
# O JS minificado não é editável diretamente de forma confiável.
# A forma correta é substituir o dist/ completo pelo pacote corrigido.

info "Baixando pacote corrigido..."
TMP_DIR=$(mktemp -d)
PACKAGE_URL="https://files.manuscdn.com/user_upload_by_module/session_file/310519663440460843/pwVAZCAuvwKfTeUh.zip"
PACKAGE_FILE="${TMP_DIR}/fiberdoc-fix.zip"

if command -v wget >/dev/null 2>&1; then
  wget -q --show-progress -O "${PACKAGE_FILE}" "${PACKAGE_URL}" || error "Falha ao baixar o pacote. Verifique a conexão."
elif command -v curl >/dev/null 2>&1; then
  curl -L --progress-bar -o "${PACKAGE_FILE}" "${PACKAGE_URL}" || error "Falha ao baixar o pacote. Verifique a conexão."
else
  error "wget ou curl não encontrado. Instale um deles e tente novamente."
fi
ok "Pacote baixado: $(du -sh ${PACKAGE_FILE} | cut -f1)"

# ── 7. Extrair e aplicar apenas o dist/public ─────────────────────────────────
info "Extraindo pacote..."
unzip -q "${PACKAGE_FILE}" -d "${TMP_DIR}/"

# Encontrar o diretório extraído
EXTRACTED_DIR=$(find "${TMP_DIR}" -maxdepth 1 -type d -name "fiberdoc-*" | head -1)
[[ -z "${EXTRACTED_DIR}" ]] && EXTRACTED_DIR="${TMP_DIR}"

# Verificar se o dist/public existe no pacote
if [[ ! -d "${EXTRACTED_DIR}/dist/public" ]]; then
  error "Estrutura do pacote inválida. dist/public não encontrado."
fi

# ── 8. Parar o serviço ────────────────────────────────────────────────────────
info "Parando serviço ${FIBERDOC_SERVICE}..."
SERVICE_WAS_RUNNING=false
if systemctl is-active --quiet "${FIBERDOC_SERVICE}" 2>/dev/null; then
  systemctl stop "${FIBERDOC_SERVICE}"
  SERVICE_WAS_RUNNING=true
  ok "Serviço parado."
else
  warn "Serviço '${FIBERDOC_SERVICE}' não estava ativo."
fi

# ── 9. Substituir apenas o frontend (dist/public) ────────────────────────────
info "Aplicando correção no frontend..."
# Backup do public atual
cp -r "${FIBERDOC_DIR}/dist/public" "${BACKUP_DIR}/public_backup" 2>/dev/null || true
# Substituir
rsync -a --delete "${EXTRACTED_DIR}/dist/public/" "${FIBERDOC_DIR}/dist/public/" 2>/dev/null || \
  cp -rf "${EXTRACTED_DIR}/dist/public/." "${FIBERDOC_DIR}/dist/public/"
ok "Frontend atualizado."

# ── 10. Reiniciar o serviço ───────────────────────────────────────────────────
info "Reiniciando serviço ${FIBERDOC_SERVICE}..."
systemctl daemon-reload
if [[ "${SERVICE_WAS_RUNNING}" == "true" ]] || systemctl is-enabled --quiet "${FIBERDOC_SERVICE}" 2>/dev/null; then
  systemctl start "${FIBERDOC_SERVICE}" || true
  sleep 3
  if systemctl is-active --quiet "${FIBERDOC_SERVICE}"; then
    ok "Serviço reiniciado com sucesso!"
  else
    warn "Serviço não iniciou automaticamente."
    warn "Inicie manualmente: systemctl start ${FIBERDOC_SERVICE}"
    warn "Verifique logs: journalctl -u ${FIBERDOC_SERVICE} -n 30 --no-pager"
  fi
else
  warn "Serviço não estava habilitado. Inicie manualmente se necessário."
fi

# ── 11. Limpeza ───────────────────────────────────────────────────────────────
rm -rf "${TMP_DIR}"

echo ""
echo -e "${BOLD}${GREEN}============================================================${NC}"
echo -e "${BOLD}${GREEN}  Correção aplicada com sucesso!${NC}"
echo -e "${BOLD}${GREEN}============================================================${NC}"
echo ""
echo -e "  ${BOLD}O que foi corrigido:${NC}"
echo -e "  • Ao editar traçado de cabo, os ícones de elementos"
echo -e "    (CEO/CTO/OLT/DGO/poste) ficam transparentes a eventos,"
echo -e "    permitindo arrastar a extremidade do cabo livremente."
echo ""
echo -e "  ${BOLD}Backup salvo em:${NC} ${BACKUP_DIR}"
echo -e "  ${BOLD}Data:${NC} $(date '+%d/%m/%Y %H:%M:%S')"
echo ""
echo -e "  Estado:  ${CYAN}systemctl status ${FIBERDOC_SERVICE}${NC}"
echo -e "  Logs:    ${CYAN}journalctl -u ${FIBERDOC_SERVICE} -f${NC}"
echo -e "  Reverter: ${CYAN}cp ${BACKUP_DIR}/public_backup/* ${FIBERDOC_DIR}/dist/public/${NC}"
echo ""
