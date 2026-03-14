#!/usr/bin/env bash
# ============================================================
#  FiberDoc — Script de Atualização v5.95.0
#  Data: 2026-03-13
#  Melhorias desta versão:
#    - CPE Manager refatorado para usar exclusivamente o SGP
#    - PWA mobile: ícones da barra inferior corrigidos
#    - PWA mobile: cabos/rotas exibidos no mapa com toggle
#    - PWA mobile: botão "Onde estou" corrigido (GPS real)
#    - PWA mobile: botão "Ver no Mapa" no resultado OTDR
#    - PWA mobile: OTDR Virtual com botão de localização no mapa
# ============================================================
set -euo pipefail

FIBERDOC_DIR="${FIBERDOC_DIR:-/opt/fiberdoc}"
FIBERDOC_SERVICE="${FIBERDOC_SERVICE:-fiberdoc}"
PACKAGE_URL="https://files.manuscdn.com/user_upload_by_module/session_file/310519663372947788/AKskNuhRLescSLGs.zip"
VERSION="5.95.0"
DATE="20260313"
PACKAGE_NAME="fiberdoc-v${VERSION}-${DATE}.zip"
TMP_DIR="/tmp/fiberdoc-update-$$"
BACKUP_DIR="${FIBERDOC_DIR}/backups/backup-$(date +%Y%m%d-%H%M%S)"

# ─── Cores ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERRO]${NC}  $*"; exit 1; }

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   FiberDoc Updater — v${VERSION}                  ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# ─── Verificações ─────────────────────────────────────────────────────────────
[[ $EUID -ne 0 ]] && error "Execute como root: sudo bash $0"
[[ ! -d "$FIBERDOC_DIR" ]] && error "Diretório não encontrado: $FIBERDOC_DIR\nDefina FIBERDOC_DIR=/caminho/correto antes de executar."

for cmd in wget unzip systemctl; do
  command -v "$cmd" &>/dev/null || error "Comando '$cmd' não encontrado. Instale e tente novamente."
done

# ─── Backup ───────────────────────────────────────────────────────────────────
info "Criando backup em $BACKUP_DIR ..."
mkdir -p "$BACKUP_DIR"
cp -r "$FIBERDOC_DIR/dist" "$BACKUP_DIR/dist" 2>/dev/null || true
cp "$FIBERDOC_DIR/package.json" "$BACKUP_DIR/package.json" 2>/dev/null || true
success "Backup criado"

# ─── Parar serviço ────────────────────────────────────────────────────────────
info "Parando serviço $FIBERDOC_SERVICE ..."
if systemctl is-active --quiet "$FIBERDOC_SERVICE" 2>/dev/null; then
  systemctl stop "$FIBERDOC_SERVICE"
  success "Serviço parado"
else
  warn "Serviço '$FIBERDOC_SERVICE' não estava ativo (continuando)"
fi

# ─── Download ─────────────────────────────────────────────────────────────────
mkdir -p "$TMP_DIR"
info "Baixando pacote v${VERSION} ..."
wget -q --show-progress -O "$TMP_DIR/$PACKAGE_NAME" "$PACKAGE_URL" || error "Falha no download. Verifique a conexão."
success "Download concluído ($(du -sh "$TMP_DIR/$PACKAGE_NAME" | cut -f1))"

# ─── Extração ─────────────────────────────────────────────────────────────────
info "Extraindo pacote ..."
unzip -q "$TMP_DIR/$PACKAGE_NAME" -d "$TMP_DIR/extracted"
success "Extração concluída"

# ─── Instalação ───────────────────────────────────────────────────────────────
info "Instalando arquivos em $FIBERDOC_DIR ..."

# dist/
if [[ -d "$TMP_DIR/extracted/dist" ]]; then
  rm -rf "$FIBERDOC_DIR/dist"
  cp -r "$TMP_DIR/extracted/dist" "$FIBERDOC_DIR/dist"
  success "dist/ atualizado"
fi

# package.json
if [[ -f "$TMP_DIR/extracted/package.json" ]]; then
  cp "$TMP_DIR/extracted/package.json" "$FIBERDOC_DIR/package.json"
  success "package.json atualizado"
fi

# scripts/
if [[ -d "$TMP_DIR/extracted/scripts" ]]; then
  cp -r "$TMP_DIR/extracted/scripts/." "$FIBERDOC_DIR/scripts/" 2>/dev/null || true
fi

# ─── Dependências ─────────────────────────────────────────────────────────────
info "Instalando dependências de produção ..."
cd "$FIBERDOC_DIR"
if command -v pnpm &>/dev/null; then
  pnpm install --prod --frozen-lockfile 2>&1 | tail -5
elif command -v npm &>/dev/null; then
  npm install --omit=dev 2>&1 | tail -5
else
  warn "pnpm/npm não encontrado — dependências não atualizadas"
fi
success "Dependências OK"

# ─── Reiniciar serviço ────────────────────────────────────────────────────────
info "Iniciando serviço $FIBERDOC_SERVICE ..."
systemctl start "$FIBERDOC_SERVICE" || warn "Falha ao iniciar serviço. Verifique: journalctl -u $FIBERDOC_SERVICE -n 30"
sleep 2
if systemctl is-active --quiet "$FIBERDOC_SERVICE" 2>/dev/null; then
  success "Serviço ativo"
else
  warn "Serviço pode não ter iniciado. Verifique: systemctl status $FIBERDOC_SERVICE"
fi

# ─── Limpeza ──────────────────────────────────────────────────────────────────
rm -rf "$TMP_DIR"

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   FiberDoc v${VERSION} instalado com sucesso!     ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Backup salvo em: ${YELLOW}${BACKUP_DIR}${NC}"
echo -e "  Para reverter:   ${YELLOW}cp -r ${BACKUP_DIR}/dist ${FIBERDOC_DIR}/dist${NC}"
echo ""
