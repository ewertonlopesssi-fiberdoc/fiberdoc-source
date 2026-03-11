#!/usr/bin/env bash
# =============================================================================
#  FiberDoc — Script de Implantação v5.93.30
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
echo "  FiberDoc — Implantação v5.93.30"
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
  echo "[1/7] Criando backup em ${BACKUP_DIR}/fiberdoc_backup_${TIMESTAMP}.tar.gz ..."
  tar -czf "${BACKUP_DIR}/fiberdoc_backup_${TIMESTAMP}.tar.gz" \
    -C "${FIBERDOC_DIR}" \
    --exclude="backups" \
    --exclude="node_modules" \
    . 2>/dev/null || true
  echo "      Backup criado com sucesso."
else
  echo "[1/7] Nenhuma instalação anterior encontrada — pulando backup."
fi

# ── 4. Parar o serviço ────────────────────────────────────────────────────────
echo "[2/7] Parando o serviço ${FIBERDOC_SERVICE} ..."
if systemctl is-active --quiet "${FIBERDOC_SERVICE}" 2>/dev/null; then
  systemctl stop "${FIBERDOC_SERVICE}"
  echo "      Serviço parado."
else
  echo "      Serviço não estava em execução."
fi

# ── 5. Copiar artefactos compilados ──────────────────────────────────────────
echo "[3/7] Copiando artefactos para ${FIBERDOC_DIR} ..."
rsync -a --delete "${SCRIPT_DIR}/dist/" "${FIBERDOC_DIR}/dist/"
[[ -f "${SCRIPT_DIR}/package.json" ]]    && cp "${SCRIPT_DIR}/package.json"    "${FIBERDOC_DIR}/package.json"    || true
[[ -f "${SCRIPT_DIR}/pnpm-lock.yaml" ]]  && cp "${SCRIPT_DIR}/pnpm-lock.yaml"  "${FIBERDOC_DIR}/pnpm-lock.yaml"  || true
[[ -f "${SCRIPT_DIR}/migrate-v7.sql" ]]  && cp "${SCRIPT_DIR}/migrate-v7.sql"  "${FIBERDOC_DIR}/migrate-v7.sql"  || true
[[ -f "${SCRIPT_DIR}/migrate-v8.sql" ]]  && cp "${SCRIPT_DIR}/migrate-v8.sql"  "${FIBERDOC_DIR}/migrate-v8.sql"  || true
[[ -f "${SCRIPT_DIR}/migrate-v9.sql" ]]  && cp "${SCRIPT_DIR}/migrate-v9.sql"  "${FIBERDOC_DIR}/migrate-v9.sql"  || true
[[ -f "${SCRIPT_DIR}/migrate-v10.sql" ]] && cp "${SCRIPT_DIR}/migrate-v10.sql" "${FIBERDOC_DIR}/migrate-v10.sql" || true
[[ -f "${SCRIPT_DIR}/migrate-v11.sql" ]] && cp "${SCRIPT_DIR}/migrate-v11.sql" "${FIBERDOC_DIR}/migrate-v11.sql" || true
echo "      Artefactos copiados."

# ── 6. Instalar dependências ─────────────────────────────────────────────────
echo "[4/7] Instalando dependências ..."
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
echo "[5/7] Configurando serviço systemd ..."
SERVICE_FILE="/etc/systemd/system/${FIBERDOC_SERVICE}.service"

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
  if ! id fiberdoc &>/dev/null; then
    useradd --system --no-create-home --shell /bin/false fiberdoc
    echo "      Usuário de sistema 'fiberdoc' criado."
  fi
  chown -R fiberdoc:fiberdoc "${FIBERDOC_DIR}"
fi

systemctl daemon-reload
systemctl enable "${FIBERDOC_SERVICE}" 2>/dev/null || true

# ── 8. Aplicar migrações SQL ──────────────────────────────────────────────────
echo "[6/7] Aplicando migrações de base de dados ..."

# Extrair DATABASE_URL do arquivo de serviço systemd (linha activa, sem #)
DB_URL=$(grep -E '^Environment=DATABASE_URL=' "${SERVICE_FILE}" 2>/dev/null \
         | head -1 | sed 's/^Environment=DATABASE_URL=//' || true)

# Se não encontrou no systemd, tentar o ficheiro .env do directorio de instalação
if [[ -z "${DB_URL}" ]]; then
  ENV_FILE="${FIBERDOC_DIR}/.env"
  if [[ -f "${ENV_FILE}" ]]; then
    DB_URL=$(grep -E '^DATABASE_URL=' "${ENV_FILE}" 2>/dev/null \
             | head -1 | sed 's/^DATABASE_URL=//' | tr -d '"' || true)
  fi
fi

# Se ainda não encontrou, tentar variável de ambiente do processo actual
if [[ -z "${DB_URL}" ]]; then
  DB_URL="${DATABASE_URL:-}"
fi

if [[ -z "${DB_URL}" ]]; then
  echo "  [AVISO] DATABASE_URL não configurada — migrações SQL ignoradas."
  echo "          Após configurar, execute manualmente:"
  echo "          mysql -h HOST -P PORTA -u USER -pSENHA DBNAME < ${FIBERDOC_DIR}/migrate-v7.sql"
  echo "          mysql -h HOST -P PORTA -u USER -pSENHA DBNAME < ${FIBERDOC_DIR}/migrate-v8.sql"
  echo "          mysql -h HOST -P PORTA -u USER -pSENHA DBNAME < ${FIBERDOC_DIR}/migrate-v9.sql"
  echo "          mysql -h HOST -P PORTA -u USER -pSENHA DBNAME < ${FIBERDOC_DIR}/migrate-v10.sql"
  echo "          mysql -h HOST -P PORTA -u USER -pSENHA DBNAME < ${FIBERDOC_DIR}/migrate-v11.sql"
else
  # Parsear a URL: mysql://user:pass@host:port/dbname?...
  # Remover prefixo mysql:// e parâmetros após ?
  DB_CLEAN=$(echo "${DB_URL}" | sed 's|mysql://||' | sed 's|?.*||')
  DB_USER=$(echo "${DB_CLEAN}" | sed 's|:.*||')
  DB_REST=$(echo "${DB_CLEAN}" | sed "s|${DB_USER}:||")
  DB_PASS=$(echo "${DB_REST}" | sed 's|@.*||')
  DB_HOSTPORT=$(echo "${DB_REST}" | sed "s|${DB_PASS}@||" | sed 's|/.*||')
  DB_NAME=$(echo "${DB_REST}" | sed "s|${DB_PASS}@${DB_HOSTPORT}/||")
  DB_HOST=$(echo "${DB_HOSTPORT}" | cut -d: -f1)
  DB_PORT=$(echo "${DB_HOSTPORT}" | cut -d: -f2)
  DB_PORT="${DB_PORT:-3306}"

  # Detectar se é TiDB Cloud / conexão SSL (porta 4000 ou host contém tidb/cloud)
  SSL_OPT=""
  if [[ "${DB_PORT}" == "4000" ]] || echo "${DB_HOST}" | grep -qiE "tidb|cloud|aws|azure|gcp"; then
    SSL_OPT="--ssl-mode=REQUIRED"
  fi

  # Aplicar cada ficheiro de migração em ordem
  for MIGRATE_VER in "migrate-v7.sql" "migrate-v8.sql" "migrate-v9.sql" "migrate-v10.sql" "migrate-v11.sql"; do
    MIGRATE_SQL="${FIBERDOC_DIR}/${MIGRATE_VER}"
    if [[ ! -f "${MIGRATE_SQL}" ]]; then
      MIGRATE_SQL="${SCRIPT_DIR}/${MIGRATE_VER}"
    fi
    if [[ -f "${MIGRATE_SQL}" ]]; then
      if command -v mysql &>/dev/null; then
        echo "      Aplicando ${MIGRATE_VER} em ${DB_HOST}:${DB_PORT} / ${DB_NAME} ..."
        if mysql -h "${DB_HOST}" -P "${DB_PORT}" -u "${DB_USER}" "-p${DB_PASS}" \
                 ${SSL_OPT} "${DB_NAME}" < "${MIGRATE_SQL}" 2>&1; then
          echo "      ${MIGRATE_VER} aplicado com sucesso."
        else
          echo "  [AVISO] Falha ao aplicar ${MIGRATE_VER}. Tente manualmente:"
          echo "          mysql -h ${DB_HOST} -P ${DB_PORT} -u ${DB_USER} -pSENHA ${DB_NAME} < ${MIGRATE_SQL}"
        fi
      else
        echo "  [AVISO] Cliente mysql não encontrado. Instale com: apt-get install -y mysql-client"
        echo "          Depois execute: mysql -h ${DB_HOST} -P ${DB_PORT} -u ${DB_USER} -pSENHA ${DB_NAME} < ${MIGRATE_SQL}"
      fi
    else
      echo "  [INFO] ${MIGRATE_VER} não encontrado — ignorado."
    fi
  done
fi

# ── 9. Iniciar o serviço ──────────────────────────────────────────────────────
echo "[7/7] Iniciando o serviço ${FIBERDOC_SERVICE} ..."

if grep -q '^#Environment=DATABASE_URL' "${SERVICE_FILE}" 2>/dev/null; then
  echo ""
  echo "  [AVISO] DATABASE_URL ainda não configurada no arquivo de serviço."
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
echo "  FiberDoc v5.93.30 implantado com sucesso!"
echo "  Backup anterior: ${BACKUP_DIR}/fiberdoc_backup_${TIMESTAMP}.tar.gz"
echo "============================================================"
