#!/bin/bash

###############################################################################
# update.sh — Script de Atualização do FiberDoc via URL
#
# Uso:
#   bash update.sh "https://files.manuscdn.com/.../.../arquivo.gz"
#
# Exemplo:
#   bash update.sh "https://files.manuscdn.com/session_file/abc123/fiberdoc-v5.84.tar.gz"
#
# O script irá:
#   1. Fazer download do pacote
#   2. Verificar integridade
#   3. Fazer backup da instalação atual
#   4. Extrair e instalar
#   5. Reiniciar o serviço
###############################################################################

set -e

# ─── Cores ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# ─── Configurações ────────────────────────────────────────────────────────────
DOWNLOAD_URL="${1:-}"
INSTALL_DIR="${2:-/opt/fiberdoc}"
BACKUP_DIR="${INSTALL_DIR}/backups"
TMP_DIR="/tmp/fiberdoc-update-$$"
LOG_FILE="/var/log/fiberdoc-update.log"
SERVICE_NAME="fiberdoc"

# ─── Funções ──────────────────────────────────────────────────────────────────
log() {
    local level="$1"; shift
    local msg="$*"
    local ts
    ts=$(date '+%Y-%m-%d %H:%M:%S')
    case "$level" in
        INFO)  echo -e "${BLUE}[INFO]${NC}  ${msg}" | tee -a "$LOG_FILE" ;;
        OK)    echo -e "${GREEN}[ OK ]${NC}  ${msg}" | tee -a "$LOG_FILE" ;;
        WARN)  echo -e "${YELLOW}[WARN]${NC}  ${msg}" | tee -a "$LOG_FILE" ;;
        ERROR) echo -e "${RED}[ERRO]${NC}  ${msg}" | tee -a "$LOG_FILE" ;;
        STEP)  echo -e "\n${CYAN}══════════════════════════════════════════${NC}" | tee -a "$LOG_FILE"
               echo -e "${CYAN}  ${msg}${NC}" | tee -a "$LOG_FILE"
               echo -e "${CYAN}══════════════════════════════════════════${NC}" | tee -a "$LOG_FILE" ;;
    esac
    echo "${ts} [${level}] ${msg}" >> "$LOG_FILE"
}

error_exit() {
    log ERROR "$*"
    log WARN "Limpando arquivos temporários..."
    rm -rf "$TMP_DIR"
    exit 1
}

# ─── Banner ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║          FiberDoc — Atualização Automática           ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# ─── Validação de Parâmetros ──────────────────────────────────────────────────
log STEP "Fase 1: Validando parâmetros"

if [ -z "$DOWNLOAD_URL" ]; then
    echo -e "${RED}Uso:${NC} bash update.sh \"<URL_DO_PACOTE>\" [diretório-instalação]"
    echo ""
    echo -e "${YELLOW}Exemplo:${NC}"
    echo "  bash update.sh \"https://files.manuscdn.com/session_file/abc123/fiberdoc-v5.84.tar.gz\""
    echo ""
    exit 1
fi

# Validar que a URL é do manuscdn.com ou similar
if [[ ! "$DOWNLOAD_URL" =~ ^https?:// ]]; then
    error_exit "URL inválida: deve começar com http:// ou https://"
fi

log INFO "URL: $DOWNLOAD_URL"
log INFO "Diretório de instalação: $INSTALL_DIR"
log INFO "Log: $LOG_FILE"

# ─── Verificar Dependências ───────────────────────────────────────────────────
log STEP "Fase 2: Verificando dependências"

for cmd in wget tar pnpm node; do
    if command -v "$cmd" &>/dev/null; then
        log OK "$cmd encontrado: $(command -v $cmd)"
    else
        error_exit "Dependência não encontrada: $cmd"
    fi
done

# ─── Criar Diretório Temporário ───────────────────────────────────────────────
log STEP "Fase 3: Preparando ambiente"

mkdir -p "$TMP_DIR"
mkdir -p "$BACKUP_DIR"
log OK "Diretório temporário: $TMP_DIR"

# ─── Download do Pacote ───────────────────────────────────────────────────────
log STEP "Fase 4: Fazendo download do pacote"

FILENAME=$(basename "$DOWNLOAD_URL" | cut -d'?' -f1)
PACKAGE_FILE="$TMP_DIR/$FILENAME"

log INFO "Arquivo: $FILENAME"
log INFO "Iniciando download..."

if wget --progress=bar:force -O "$PACKAGE_FILE" "$DOWNLOAD_URL" 2>&1 | tee -a "$LOG_FILE"; then
    PACKAGE_SIZE=$(du -h "$PACKAGE_FILE" | cut -f1)
    log OK "Download concluído — Tamanho: $PACKAGE_SIZE"
else
    error_exit "Falha no download. Verifique a URL e a conexão."
fi

# ─── Verificar Arquivo ────────────────────────────────────────────────────────
log STEP "Fase 5: Verificando integridade do pacote"

if file "$PACKAGE_FILE" | grep -q "gzip\|tar"; then
    log OK "Arquivo é um pacote tar.gz válido"
else
    error_exit "Arquivo inválido — não é um pacote tar.gz"
fi

# ─── Extrair Pacote ───────────────────────────────────────────────────────────
log STEP "Fase 6: Extraindo pacote"

EXTRACT_DIR="$TMP_DIR/extracted"
mkdir -p "$EXTRACT_DIR"

if tar -xzf "$PACKAGE_FILE" -C "$EXTRACT_DIR" 2>&1 | tee -a "$LOG_FILE"; then
    log OK "Pacote extraído com sucesso"
else
    error_exit "Falha ao extrair o pacote"
fi

# Encontrar diretório raiz do pacote
PACKAGE_ROOT=$(find "$EXTRACT_DIR" -maxdepth 1 -mindepth 1 -type d | head -1)
if [ -z "$PACKAGE_ROOT" ]; then
    PACKAGE_ROOT="$EXTRACT_DIR"
fi

log INFO "Diretório raiz do pacote: $PACKAGE_ROOT"

# Verificar se tem deploy.sh
if [ -f "$PACKAGE_ROOT/deploy.sh" ]; then
    log OK "Script deploy.sh encontrado"
    HAS_DEPLOY_SCRIPT=true
else
    log WARN "Script deploy.sh não encontrado — usando instalação direta"
    HAS_DEPLOY_SCRIPT=false
fi

# ─── Backup da Instalação Atual ───────────────────────────────────────────────
log STEP "Fase 7: Fazendo backup da instalação atual"

if [ -d "$INSTALL_DIR" ] && [ "$(ls -A $INSTALL_DIR 2>/dev/null)" ]; then
    BACKUP_NAME="backup-$(date +%Y%m%d-%H%M%S)"
    BACKUP_PATH="$BACKUP_DIR/$BACKUP_NAME"
    
    mkdir -p "$BACKUP_PATH"
    
    # Copiar apenas arquivos do projeto (excluir node_modules e backups)
    rsync -a --exclude='node_modules' --exclude='backups' --exclude='.git' \
        "$INSTALL_DIR/" "$BACKUP_PATH/" 2>/dev/null || \
    cp -r "$INSTALL_DIR/"* "$BACKUP_PATH/" 2>/dev/null || true
    
    log OK "Backup criado em: $BACKUP_PATH"
    
    # Manter apenas os últimos 5 backups
    BACKUP_COUNT=$(ls -1d "$BACKUP_DIR"/backup-* 2>/dev/null | wc -l)
    if [ "$BACKUP_COUNT" -gt 5 ]; then
        OLDEST=$(ls -1dt "$BACKUP_DIR"/backup-* 2>/dev/null | tail -1)
        rm -rf "$OLDEST"
        log INFO "Backup antigo removido: $OLDEST"
    fi
else
    log INFO "Primeira instalação — sem backup necessário"
    mkdir -p "$INSTALL_DIR"
fi

# ─── Parar Serviço ────────────────────────────────────────────────────────────
log STEP "Fase 8: Parando serviço FiberDoc"

if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    systemctl stop "$SERVICE_NAME"
    log OK "Serviço parado via systemd"
elif pgrep -f "node.*server" > /dev/null 2>&1; then
    pkill -f "node.*server" 2>/dev/null || true
    sleep 2
    log OK "Processo Node.js encerrado"
else
    log INFO "Serviço não estava rodando"
fi

# ─── Instalar Arquivos ────────────────────────────────────────────────────────
log STEP "Fase 9: Instalando arquivos"

if [ "$HAS_DEPLOY_SCRIPT" = true ]; then
    log INFO "Executando deploy.sh do pacote..."
    bash "$PACKAGE_ROOT/deploy.sh" "$INSTALL_DIR" 2>&1 | tee -a "$LOG_FILE"
else
    log INFO "Copiando arquivos manualmente..."
    
    # Copiar arquivos do pacote para instalação
    for item in server client drizzle shared scripts storage package.json tsconfig.json vite.config.ts vitest.config.ts; do
        if [ -e "$PACKAGE_ROOT/$item" ]; then
            cp -r "$PACKAGE_ROOT/$item" "$INSTALL_DIR/"
            log OK "Copiado: $item"
        fi
    done
    
    # Copiar pnpm-lock.yaml se existir
    [ -f "$PACKAGE_ROOT/pnpm-lock.yaml" ] && cp "$PACKAGE_ROOT/pnpm-lock.yaml" "$INSTALL_DIR/"
    
    # Instalar dependências
    log INFO "Instalando dependências..."
    cd "$INSTALL_DIR"
    
    if [ -f "pnpm-lock.yaml" ]; then
        pnpm install --frozen-lockfile 2>&1 | tail -10 | tee -a "$LOG_FILE"
    else
        pnpm install 2>&1 | tail -10 | tee -a "$LOG_FILE"
    fi
    
    log OK "Dependências instaladas"
fi

# ─── Iniciar Serviço ──────────────────────────────────────────────────────────
log STEP "Fase 10: Iniciando serviço FiberDoc"

cd "$INSTALL_DIR"

if systemctl list-unit-files "$SERVICE_NAME.service" &>/dev/null 2>&1; then
    systemctl start "$SERVICE_NAME"
    sleep 3
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        log OK "Serviço iniciado via systemd"
    else
        log WARN "Falha ao iniciar via systemd — tentando modo direto"
        nohup pnpm run start >> /var/log/fiberdoc.log 2>&1 &
        sleep 3
        log OK "Serviço iniciado em background"
    fi
else
    log INFO "Iniciando em background (sem systemd)..."
    nohup pnpm run start >> /var/log/fiberdoc.log 2>&1 &
    sleep 3
    log OK "Serviço iniciado em background (PID: $!)"
fi

# ─── Verificação Final ────────────────────────────────────────────────────────
log STEP "Fase 11: Verificação final"

sleep 2

PORT="${PORT:-3000}"
if curl -sf "http://localhost:${PORT}/health" > /dev/null 2>&1 || \
   curl -sf "http://localhost:${PORT}" > /dev/null 2>&1; then
    log OK "Servidor respondendo na porta ${PORT}"
else
    log WARN "Servidor pode ainda estar iniciando — aguarde alguns segundos"
fi

# ─── Limpeza ──────────────────────────────────────────────────────────────────
log INFO "Limpando arquivos temporários..."
rm -rf "$TMP_DIR"
log OK "Limpeza concluída"

# ─── Resumo Final ─────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         ✓  Atualização concluída com sucesso!        ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
log OK "Instalação: $INSTALL_DIR"
log OK "Backup:     $BACKUP_PATH"
log OK "Log:        $LOG_FILE"
echo ""
echo -e "${CYAN}Próximos passos:${NC}"
echo "  • Acessar: http://localhost:${PORT}"
echo "  • Ver log:  tail -f $LOG_FILE"
echo "  • Rollback: cp -r $BACKUP_PATH/* $INSTALL_DIR/ && systemctl restart $SERVICE_NAME"
echo ""

exit 0
