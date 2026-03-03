#!/usr/bin/env bash
# =============================================================================
#  FiberDoc — Script de Implantação v6.0
#  Uso: bash deploy.sh [FIBERDOC_DIR] [FIBERDOC_SERVICE]
#  Padrões: /opt/fiberdoc  e  fiberdoc
# =============================================================================
set -euo pipefail

FIBERDOC_DIR="${1:-${FIBERDOC_DIR:-/opt/fiberdoc}}"
FIBERDOC_SERVICE="${2:-${FIBERDOC_SERVICE:-fiberdoc}}"
BACKUP_DIR="${FIBERDOC_DIR}/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "============================================================"
echo "  FiberDoc — Implantação v6.0"
echo "  Diretório: ${FIBERDOC_DIR}"
echo "  Serviço:   ${FIBERDOC_SERVICE}"
echo "  Data/Hora: $(date '+%d/%m/%Y %H:%M:%S')"
echo "============================================================"

# ── 1. Verificar privilégios ──────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  echo "[ERRO] Este script deve ser executado como root (sudo bash deploy.sh)"
  exit 1
fi

# ── 2. Criar diretório de destino se não existir ──────────────────────────────
mkdir -p "${FIBERDOC_DIR}" "${BACKUP_DIR}"

# ── 3. Fazer backup da instalação atual ──────────────────────────────────────
if [[ -f "${FIBERDOC_DIR}/dist/index.js" ]]; then
  echo "[1/6] Criando backup em ${BACKUP_DIR}/fiberdoc_backup_${TIMESTAMP}.tar.gz ..."
  tar -czf "${BACKUP_DIR}/fiberdoc_backup_${TIMESTAMP}.tar.gz" \
    -C "${FIBERDOC_DIR}" \
    --exclude="backups" \
    --exclude="node_modules" \
    . 2>/dev/null || true
  echo "      Backup criado com sucesso."
else
  echo "[1/6] Nenhuma instalação anterior encontrada — pulando backup."
fi

# ── 4. Parar o serviço ────────────────────────────────────────────────────────
echo "[2/6] Parando o serviço ${FIBERDOC_SERVICE} ..."
if systemctl is-active --quiet "${FIBERDOC_SERVICE}" 2>/dev/null; then
  systemctl stop "${FIBERDOC_SERVICE}"
  echo "      Serviço parado."
else
  echo "      Serviço não estava em execução."
fi

# ── 5. Copiar artefactos compilados ──────────────────────────────────────────
echo "[3/6] Copiando artefactos para ${FIBERDOC_DIR} ..."
# dist/
rsync -a --delete "${SCRIPT_DIR}/dist/" "${FIBERDOC_DIR}/dist/"
# package.json e pnpm-lock.yaml (para referência — opcionais no pacote de actualização)
[[ -f "${SCRIPT_DIR}/package.json" ]] && cp "${SCRIPT_DIR}/package.json" "${FIBERDOC_DIR}/package.json" || true
[[ -f "${SCRIPT_DIR}/pnpm-lock.yaml" ]] && cp "${SCRIPT_DIR}/pnpm-lock.yaml" "${FIBERDOC_DIR}/pnpm-lock.yaml" || true
echo "      Artefactos copiados."

# ── 6. Instalar dependências ─────────────────────────────────────────────────
# NOTA: o dist/index.js importa 'vite' no topo mesmo em produção (bundle esbuild),
# por isso é necessário instalar TODAS as dependências (incluindo devDependencies).
echo "[4/6] Instalando dependências ..."
cd "${FIBERDOC_DIR}"
if command -v pnpm &>/dev/null; then
  pnpm install --no-frozen-lockfile 2>&1 | tail -5
elif command -v npm &>/dev/null; then
  npm install 2>&1 | tail -5
else
  echo "[AVISO] pnpm/npm não encontrado — node_modules pode estar desatualizado."
fi
echo "      Dependências instaladas."

# ── 7. Criar/atualizar arquivo de serviço systemd ────────────────────────────
echo "[5/6] Configurando serviço systemd ..."
SERVICE_FILE="/etc/systemd/system/${FIBERDOC_SERVICE}.service"

# Preservar variáveis de ambiente existentes se o arquivo já existir
if [[ -f "${SERVICE_FILE}" ]]; then
  echo "      Serviço já configurado — preservando variáveis de ambiente existentes."
else
  cat > "${SERVICE_FILE}" <<EOF
[Unit]
Description=FiberDoc — Sistema de Documentação de Fibras Ópticas
After=network.target mysql.service mariadb.service
Wants=mysql.service mariadb.service

[Service]
Type=simple
User=fiberdoc
WorkingDirectory=${FIBERDOC_DIR}
ExecStart=/usr/bin/node ${FIBERDOC_DIR}/dist/index.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${FIBERDOC_SERVICE}

# ── Variáveis de ambiente ──────────────────────────────────────────────────
# OBRIGATÓRIO: configure estas variáveis antes de iniciar o serviço
# Edite este arquivo em: ${SERVICE_FILE}
Environment=NODE_ENV=production
Environment=PORT=3000
#Environment=DATABASE_URL=mysql://user:password@localhost:3306/fiberdoc
#Environment=JWT_SECRET=seu_segredo_jwt_aqui
#Environment=VITE_APP_ID=seu_app_id
#Environment=OAUTH_SERVER_URL=https://api.manus.im
#Environment=VITE_OAUTH_PORTAL_URL=https://manus.im
#Environment=OWNER_OPEN_ID=seu_open_id
#Environment=OWNER_NAME=seu_nome

[Install]
WantedBy=multi-user.target
EOF
  echo "      Arquivo de serviço criado em ${SERVICE_FILE}"
  echo ""
  echo "  ┌─────────────────────────────────────────────────────────────────┐"
  echo "  │  ATENÇÃO: Configure as variáveis de ambiente antes de iniciar!  │"
  echo "  │  Edite: ${SERVICE_FILE}"
  echo "  │  Descomente e preencha as linhas #Environment=...               │"
  echo "  └─────────────────────────────────────────────────────────────────┘"
  echo ""
  # Criar usuário de sistema se não existir
  if ! id fiberdoc &>/dev/null; then
    useradd --system --no-create-home --shell /bin/false fiberdoc
    echo "      Usuário de sistema 'fiberdoc' criado."
  fi
  chown -R fiberdoc:fiberdoc "${FIBERDOC_DIR}"
fi

systemctl daemon-reload
systemctl enable "${FIBERDOC_SERVICE}" 2>/dev/null || true

# ── 8. Iniciar o serviço ──────────────────────────────────────────────────────
echo "[6/6] Iniciando o serviço ${FIBERDOC_SERVICE} ..."

# Verificar se as variáveis obrigatórias estão configuradas
if grep -q '^#Environment=DATABASE_URL' "${SERVICE_FILE}" 2>/dev/null; then
  echo ""
  echo "  [AVISO] DATABASE_URL ainda não configurado no arquivo de serviço."
  echo "  O serviço NÃO será iniciado automaticamente."
  echo ""
  echo "  Para concluir a instalação:"
  echo "    1. Edite ${SERVICE_FILE}"
  echo "    2. Descomente e preencha as variáveis Environment="
  echo "    3. Execute: systemctl daemon-reload && systemctl start ${FIBERDOC_SERVICE}"
  echo ""
else
  systemctl start "${FIBERDOC_SERVICE}"
  sleep 2
  if systemctl is-active --quiet "${FIBERDOC_SERVICE}"; then
    echo "      Serviço iniciado com sucesso!"
    echo ""
    echo "  Status: $(systemctl is-active ${FIBERDOC_SERVICE})"
    echo "  Logs:   journalctl -u ${FIBERDOC_SERVICE} -f"
  else
    echo "  [ERRO] Falha ao iniciar o serviço. Verifique os logs:"
    journalctl -u "${FIBERDOC_SERVICE}" -n 20 --no-pager
    exit 1
  fi
fi

echo ""
echo "============================================================"
echo "  FiberDoc v6.0 implantado com sucesso!"
echo "  Backup anterior: ${BACKUP_DIR}/fiberdoc_backup_${TIMESTAMP}.tar.gz"
echo "============================================================"
