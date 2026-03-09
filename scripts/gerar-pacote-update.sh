#!/usr/bin/env bash
# =============================================================================
#  FiberDoc — Script de Geração de Pacote de Actualização
#  Versão: 1.0
#
#  Uso:
#    bash gerar-pacote-update.sh [VERSAO] [PASTA_SAIDA]
#
#  Exemplos:
#    bash gerar-pacote-update.sh                        # versão do package.json
#    bash gerar-pacote-update.sh 6.5.4                  # versão manual
#    bash gerar-pacote-update.sh 6.5.4 /tmp/releases    # pasta de saída
#
#  O que este script faz:
#    1. Lê a versão do package.json (ou usa a versão fornecida)
#    2. Executa pnpm build (vite + esbuild)
#    3. Concatena todos os ficheiros SQL de migração num migrate.sql único
#    4. Empacota dist/, package.json, pnpm-lock.yaml, migrate.sql e scripts/
#       num ZIP nomeado: fiberdoc-vX.Y.Z-YYYYMMDD.zip
#    5. Gera um ficheiro de manifesto com hash SHA256 e metadados
#
#  Pré-requisitos:
#    - Node.js + pnpm instalados
#    - zip instalado (apt-get install -y zip)
#    - sha256sum instalado (coreutils)
# =============================================================================
set -euo pipefail

# ── Directório raiz do projecto (onde está este script) ───────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ── Parâmetros ────────────────────────────────────────────────────────────────
VERSION_ARG="${1:-}"
OUTPUT_DIR="${2:-${PROJECT_DIR}/releases}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATE_SHORT=$(date +%Y%m%d)

# ── Cores ─────────────────────────────────────────────────────────────────────
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

# ── Limpeza ao sair em caso de erro ──────────────────────────────────────────
TMP_STAGE=""
cleanup() {
  if [[ -n "${TMP_STAGE}" ]] && [[ -d "${TMP_STAGE}" ]]; then
    rm -rf "${TMP_STAGE}"
  fi
}
trap cleanup EXIT

# ── Banner ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}============================================================${NC}"
echo -e "${BOLD}  FiberDoc — Gerador de Pacote de Actualização${NC}"
echo -e "${BOLD}  Projecto: ${PROJECT_DIR}${NC}"
echo -e "${BOLD}  Data/Hora: $(date '+%d/%m/%Y %H:%M:%S')${NC}"
echo -e "${BOLD}============================================================${NC}"
echo ""

# ── 0. Verificações iniciais ──────────────────────────────────────────────────
log_step "[0/6] Verificações iniciais..."

cd "${PROJECT_DIR}"

# Verificar Node.js
if ! command -v node &>/dev/null; then
  log_error "Node.js não encontrado. Instale em: https://nodejs.org"
  exit 1
fi
NODE_VER=$(node --version)
log_ok "Node.js ${NODE_VER}"

# Verificar pnpm ou npm
BUILD_CMD=""
if command -v pnpm &>/dev/null; then
  BUILD_CMD="pnpm"
  log_ok "pnpm $(pnpm --version)"
elif command -v npm &>/dev/null; then
  BUILD_CMD="npm"
  log_ok "npm $(npm --version)"
else
  log_error "pnpm/npm não encontrado."
  exit 1
fi

# Verificar zip
if ! command -v zip &>/dev/null; then
  log_error "zip não encontrado. Instale com: apt-get install -y zip"
  exit 1
fi
log_ok "zip $(zip --version | head -1 | awk '{print $NF}')"

# Verificar sha256sum
if command -v sha256sum &>/dev/null; then
  SHA_CMD="sha256sum"
elif command -v shasum &>/dev/null; then
  SHA_CMD="shasum -a 256"
else
  log_warn "sha256sum não encontrado — hash não será calculado."
  SHA_CMD=""
fi

# Verificar package.json
if [[ ! -f "${PROJECT_DIR}/package.json" ]]; then
  log_error "package.json não encontrado em ${PROJECT_DIR}"
  exit 1
fi

# ── Determinar versão ─────────────────────────────────────────────────────────
if [[ -n "${VERSION_ARG}" ]]; then
  VERSION="${VERSION_ARG}"
  log_info "Versão fornecida manualmente: ${VERSION}"
else
  VERSION=$(node -e "const p=require('./package.json'); console.log(p.version);" 2>/dev/null \
            || python3 -c "import json; print(json.load(open('package.json'))['version'])")
  log_info "Versão lida do package.json: ${VERSION}"
fi

if [[ -z "${VERSION}" ]]; then
  log_error "Não foi possível determinar a versão."
  exit 1
fi

PACKAGE_NAME="fiberdoc-v${VERSION}-${DATE_SHORT}"
ZIP_FILE="${OUTPUT_DIR}/${PACKAGE_NAME}.zip"
MANIFEST_FILE="${OUTPUT_DIR}/${PACKAGE_NAME}.manifest.json"

log_ok "Nome do pacote: ${PACKAGE_NAME}.zip"
log_ok "Pasta de saída: ${OUTPUT_DIR}"

# Criar pasta de saída
mkdir -p "${OUTPUT_DIR}"

# Verificar se o pacote já existe
if [[ -f "${ZIP_FILE}" ]]; then
  log_warn "Pacote já existe: ${ZIP_FILE}"
  echo -e "  Substituir? (s/N): \c"
  read -r CONFIRM
  if [[ ! "${CONFIRM}" =~ ^[sS]$ ]]; then
    log_error "Operação cancelada."
    exit 1
  fi
  rm -f "${ZIP_FILE}" "${MANIFEST_FILE}"
fi

# ── 1. Executar build ─────────────────────────────────────────────────────────
log_step "[1/6] A compilar o projecto (${BUILD_CMD} build)..."

# Limpar dist anterior
if [[ -d "${PROJECT_DIR}/dist" ]]; then
  log_info "A limpar dist/ anterior..."
  rm -rf "${PROJECT_DIR}/dist"
fi

# Executar build
if [[ "${BUILD_CMD}" == "pnpm" ]]; then
  pnpm build 2>&1
else
  npm run build 2>&1
fi

# Verificar resultado do build
if [[ ! -f "${PROJECT_DIR}/dist/index.js" ]]; then
  log_error "Build falhou: dist/index.js não encontrado."
  exit 1
fi
if [[ ! -d "${PROJECT_DIR}/dist/public" ]]; then
  log_error "Build falhou: dist/public/ não encontrado."
  exit 1
fi

DIST_SIZE=$(du -sh "${PROJECT_DIR}/dist" | cut -f1)
log_ok "Build concluído. Tamanho de dist/: ${DIST_SIZE}"

# ── 2. Gerar migrate.sql consolidado ─────────────────────────────────────────
log_step "[2/6] A gerar ficheiro de migração SQL consolidado..."

DRIZZLE_DIR="${PROJECT_DIR}/drizzle"
MIGRATE_OUT="${PROJECT_DIR}/dist/migrate.sql"

# Cabeçalho do ficheiro SQL
cat > "${MIGRATE_OUT}" << SQL_HEADER
-- =============================================================================
--  FiberDoc v${VERSION} — Migração SQL Consolidada
--  Gerado em: $(date '+%Y-%m-%d %H:%M:%S')
--  Contém todas as migrações desde a v1 até à versão actual.
--  Seguro para executar em instalações existentes (usa IF NOT EXISTS / IF EXISTS).
-- =============================================================================

SQL_HEADER

# Concatenar todos os ficheiros SQL do Drizzle em ordem numérica
SQL_COUNT=0
if [[ -d "${DRIZZLE_DIR}" ]]; then
  for sql_file in $(ls "${DRIZZLE_DIR}"/*.sql 2>/dev/null | sort -V); do
    FNAME=$(basename "${sql_file}")
    echo "-- ── Migração: ${FNAME} ──────────────────────────────────────────" >> "${MIGRATE_OUT}"
    cat "${sql_file}" >> "${MIGRATE_OUT}"
    echo "" >> "${MIGRATE_OUT}"
    SQL_COUNT=$((SQL_COUNT + 1))
  done
fi

# Incluir também o migrate-v6.sql se existir e não for do Drizzle
if [[ -f "${PROJECT_DIR}/migrate-v6.sql" ]]; then
  echo "-- ── Migração Legacy: migrate-v6.sql ─────────────────────────────" >> "${MIGRATE_OUT}"
  cat "${PROJECT_DIR}/migrate-v6.sql" >> "${MIGRATE_OUT}"
  echo "" >> "${MIGRATE_OUT}"
  SQL_COUNT=$((SQL_COUNT + 1))
fi

if [[ ${SQL_COUNT} -eq 0 ]]; then
  log_warn "Nenhum ficheiro SQL de migração encontrado — migrate.sql ficará vazio."
  echo "-- Nenhuma migração disponível para esta versão." >> "${MIGRATE_OUT}"
else
  log_ok "${SQL_COUNT} ficheiro(s) SQL consolidado(s) em dist/migrate.sql"
fi

# ── 3. Preparar staging area ──────────────────────────────────────────────────
log_step "[3/6] A preparar staging area..."

TMP_STAGE=$(mktemp -d /tmp/fiberdoc-stage-XXXXXX)
STAGE_ROOT="${TMP_STAGE}/${PACKAGE_NAME}"
mkdir -p "${STAGE_ROOT}"

# Copiar dist/ completo
cp -r "${PROJECT_DIR}/dist" "${STAGE_ROOT}/dist"
log_ok "dist/ copiado."

# Copiar ficheiros de runtime essenciais
for f in package.json pnpm-lock.yaml; do
  if [[ -f "${PROJECT_DIR}/${f}" ]]; then
    cp "${PROJECT_DIR}/${f}" "${STAGE_ROOT}/${f}"
    log_ok "${f} incluído."
  fi
done

# Copiar scripts de deploy/actualização (excluindo este próprio script)
if [[ -d "${PROJECT_DIR}/scripts" ]]; then
  mkdir -p "${STAGE_ROOT}/scripts"
  for script in "${PROJECT_DIR}/scripts"/*.sh; do
    [[ -f "${script}" ]] || continue
    cp "${script}" "${STAGE_ROOT}/scripts/"
  done
  log_ok "scripts/ incluído."
fi

# Copiar deploy.sh se existir
if [[ -f "${PROJECT_DIR}/deploy.sh" ]]; then
  cp "${PROJECT_DIR}/deploy.sh" "${STAGE_ROOT}/deploy.sh"
  log_ok "deploy.sh incluído."
fi

# Copiar ficheiros de migração SQL incremental (migrate-vN.sql)
for migrate_file in "${PROJECT_DIR}"/migrate-v*.sql; do
  [[ -f "${migrate_file}" ]] || continue
  cp "${migrate_file}" "${STAGE_ROOT}/$(basename ${migrate_file})"
  log_ok "$(basename ${migrate_file}) incluído."
done

# Criar ficheiro de versão
cat > "${STAGE_ROOT}/VERSION" << VERSION_EOF
${VERSION}
Gerado em: $(date '+%Y-%m-%d %H:%M:%S')
Build: ${PACKAGE_NAME}
VERSION_EOF
log_ok "VERSION criado."

# Criar README de actualização
cat > "${STAGE_ROOT}/LEIAME-ACTUALIZACAO.txt" << README_EOF
============================================================
  FiberDoc v${VERSION} — Pacote de Actualização
  Gerado em: $(date '+%d/%m/%Y %H:%M:%S')
============================================================

CONTEÚDO DESTE PACOTE:
  dist/           — Aplicação compilada (servidor + frontend)
  dist/migrate.sql — Migrações SQL consolidadas
  package.json    — Dependências Node.js
  pnpm-lock.yaml  — Lockfile de dependências
  scripts/        — Scripts de deploy e actualização
  deploy.sh       — Script de instalação completa
  VERSION         — Versão deste pacote

COMO ACTUALIZAR (método automático via wget):
  sudo bash scripts/fiberdoc-wget-update.sh <URL_DESTE_ZIP>

  Exemplo:
  sudo bash fiberdoc-wget-update.sh https://releases.exemplo.com/${PACKAGE_NAME}.zip

COMO ACTUALIZAR (método manual):
  1. Faça backup: tar -czf backup-\$(date +%Y%m%d).tar.gz /opt/fiberdoc/
  2. Pare o serviço: systemctl stop fiberdoc
  3. Copie dist/ para /opt/fiberdoc/dist/
  4. Copie package.json para /opt/fiberdoc/
  5. Instale dependências: cd /opt/fiberdoc && pnpm install --prod
  6. Aplique a migração SQL:
     mysql -h HOST -P PORTA -u USER -pSENHA DBNAME < dist/migrate.sql
  7. Reinicie: systemctl start fiberdoc

VERIFICAR ESTADO APÓS ACTUALIZAÇÃO:
  systemctl status fiberdoc
  journalctl -u fiberdoc -f

SUPORTE:
  Em caso de problemas, restaure o backup e contacte o suporte.
============================================================
README_EOF
log_ok "LEIAME-ACTUALIZACAO.txt criado."

# ── 4. Criar o ZIP ────────────────────────────────────────────────────────────
log_step "[4/6] A criar o pacote ZIP..."

cd "${TMP_STAGE}"
zip -r "${ZIP_FILE}" "${PACKAGE_NAME}/" -x "*.DS_Store" -x "__MACOSX/*" 2>&1 | tail -3

if [[ ! -f "${ZIP_FILE}" ]]; then
  log_error "Falha ao criar o ZIP."
  exit 1
fi

ZIP_SIZE=$(du -sh "${ZIP_FILE}" | cut -f1)
log_ok "ZIP criado: ${ZIP_FILE} (${ZIP_SIZE})"

# ── 5. Gerar manifesto com hash SHA256 ────────────────────────────────────────
log_step "[5/6] A gerar manifesto..."

SHA256=""
if [[ -n "${SHA_CMD}" ]]; then
  SHA256=$(${SHA_CMD} "${ZIP_FILE}" | awk '{print $1}')
  log_ok "SHA256: ${SHA256}"
fi

# Contar ficheiros no ZIP
FILE_COUNT=$(unzip -l "${ZIP_FILE}" | tail -1 | awk '{print $2}')

cat > "${MANIFEST_FILE}" << MANIFEST_EOF
{
  "name": "FiberDoc",
  "version": "${VERSION}",
  "package": "${PACKAGE_NAME}.zip",
  "generated_at": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
  "size_bytes": $(stat -c%s "${ZIP_FILE}" 2>/dev/null || stat -f%z "${ZIP_FILE}" 2>/dev/null || echo 0),
  "size_human": "${ZIP_SIZE}",
  "sha256": "${SHA256}",
  "file_count": ${FILE_COUNT},
  "includes": {
    "dist": true,
    "migrate_sql": true,
    "package_json": true,
    "scripts": true,
    "deploy_sh": $([ -f "${STAGE_ROOT}/deploy.sh" ] && echo "true" || echo "false")
  },
  "node_version_used": "${NODE_VER}",
  "build_command": "${BUILD_CMD} build"
}
MANIFEST_EOF

log_ok "Manifesto criado: ${MANIFEST_FILE}"

# ── 6. Verificação final ──────────────────────────────────────────────────────
log_step "[6/6] Verificação final do pacote..."

# Verificar conteúdo mínimo
REQUIRED=("dist/index.js" "dist/public/index.html" "package.json")
ALL_OK=true
for f in "${REQUIRED[@]}"; do
  if unzip -l "${ZIP_FILE}" | grep -q "${f}"; then
    log_ok "  ✓ ${f}"
  else
    log_warn "  ✗ ${f} — não encontrado no ZIP"
    ALL_OK=false
  fi
done

if [[ "${ALL_OK}" == "false" ]]; then
  log_warn "Alguns ficheiros esperados estão em falta. Verifique o pacote antes de distribuir."
fi

# Limpar dist/migrate.sql temporário (estava em dist/ apenas para o ZIP)
rm -f "${PROJECT_DIR}/dist/migrate.sql"

# ── Resumo final ──────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}============================================================${NC}"
echo -e "${GREEN}${BOLD}  Pacote gerado com sucesso!${NC}"
echo ""
echo -e "  Ficheiro:  ${ZIP_FILE}"
echo -e "  Tamanho:   ${ZIP_SIZE}"
if [[ -n "${SHA256}" ]]; then
  echo -e "  SHA256:    ${SHA256}"
fi
echo -e "  Manifesto: ${MANIFEST_FILE}"
echo ""
echo -e "  Para distribuir, copie o ZIP para o seu servidor de releases"
echo -e "  e use o script de actualização:"
echo ""
echo -e "  ${CYAN}sudo bash scripts/fiberdoc-wget-update.sh <URL_DO_ZIP>${NC}"
echo ""
echo -e "  Exemplo com servidor HTTP local:"
echo -e "  ${CYAN}python3 -m http.server 8080 --directory ${OUTPUT_DIR}${NC}"
echo -e "  ${CYAN}sudo bash scripts/fiberdoc-wget-update.sh http://SEU_IP:8080/${PACKAGE_NAME}.zip${NC}"
echo -e "${BOLD}============================================================${NC}"
echo ""
