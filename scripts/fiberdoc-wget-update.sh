#!/bin/bash
# fiberdoc-wget-update.sh v1.5
# Compativel com bash 3.x, 4.x e 5.x (Debian, Ubuntu, CentOS)
# Aceita URL remota OU caminho local para o ficheiro ZIP

set -euo pipefail

FIBERDOC_DIR="${FIBERDOC_DIR:-/opt/fiberdoc}"
FIBERDOC_SERVICE="${FIBERDOC_SERVICE:-fiberdoc}"
BACKUP_DIR="${FIBERDOC_DIR}/backups"
TMP_DIR="/tmp/fiberdoc-update-$$"
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
UPDATE_URL="${1:-${FIBERDOC_UPDATE_URL:-}}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log_step()  { echo -e "\n${CYAN}${BOLD}> $1${NC}"; }
log_ok()    { echo -e "  ${GREEN}OK${NC} $1"; }
log_warn()  { echo -e "  ${YELLOW}AVISO${NC} $1"; }
log_error() { echo -e "  ${RED}ERRO${NC} $1" >&2; }
log_info()  { echo -e "  ${CYAN}INFO${NC} $1"; }

echo ""
echo -e "${BOLD}============================================================${NC}"
echo -e "${CYAN}${BOLD}  FiberDoc -- Script de Actualizacao v1.4${NC}"
echo -e "${BOLD}============================================================${NC}"
echo ""

if [ "$(id -u)" -ne 0 ]; then
  log_error "Este script deve ser executado como root."
  exit 1
fi

if [ -z "${UPDATE_URL}" ]; then
  log_error "URL ou caminho do pacote nao fornecido."
  echo "  Uso: bash fiberdoc-wget-update.sh <URL_OU_CAMINHO_DO_ZIP>"
  echo "  Ex:  bash fiberdoc-wget-update.sh /tmp/fiberdoc-update.zip"
  echo "  Ex:  bash fiberdoc-wget-update.sh https://exemplo.com/fiberdoc.zip"
  exit 1
fi

DOWNLOADER=""
if command -v wget >/dev/null 2>&1; then
  DOWNLOADER="wget"; log_ok "wget encontrado."
elif command -v curl >/dev/null 2>&1; then
  DOWNLOADER="curl"; log_ok "curl encontrado."
else
  log_warn "Nem wget nem curl encontrados (apenas necessario para URL remota)."
fi

if ! command -v unzip >/dev/null 2>&1; then
  log_error "unzip nao esta instalado. Instale: apt-get install -y unzip"; exit 1
fi
log_ok "unzip encontrado."

mkdir -p "${FIBERDOC_DIR}" "${BACKUP_DIR}" "${TMP_DIR}"
log_ok "Verificacoes concluidas."

# -- 1. Obter o pacote (URL remota ou ficheiro local) ---------------------------
log_step "[1/7] A obter o pacote..."
log_info "Origem: ${UPDATE_URL}"
ZIP_FILE="${TMP_DIR}/fiberdoc-update.zip"

if [ -f "${UPDATE_URL}" ]; then
  log_info "Ficheiro local detectado -- a copiar..."
  cp "${UPDATE_URL}" "${ZIP_FILE}" \
    || { log_error "Falha ao copiar ficheiro local."; exit 1; }
elif grep -qE '^https?://' <<< "${UPDATE_URL}"; then
  log_info "URL remota detectada -- a fazer download..."
  if [ -z "${DOWNLOADER}" ]; then
    log_error "Nem wget nem curl estao instalados. Instale um deles."; exit 1
  fi
  if [ "${DOWNLOADER}" = "wget" ]; then
    wget --progress=bar:force --timeout=120 --tries=3 \
      --output-document="${ZIP_FILE}" "${UPDATE_URL}" 2>&1 \
      || { log_error "Falha no download."; exit 1; }
  else
    curl --location --progress-bar --connect-timeout 30 --max-time 300 --retry 3 \
      --output "${ZIP_FILE}" "${UPDATE_URL}" \
      || { log_error "Falha no download."; exit 1; }
  fi
else
  log_error "Argumento nao reconhecido como URL nem como ficheiro local: ${UPDATE_URL}"
  log_error "Verifique se o caminho esta correcto e o ficheiro existe."
  exit 1
fi

if [ ! -f "${ZIP_FILE}" ] || [ ! -s "${ZIP_FILE}" ]; then
  log_error "Ficheiro ZIP vazio ou inexistente."; exit 1
fi
ZIP_SIZE=$(du -sh "${ZIP_FILE}" | cut -f1)
log_ok "Pacote obtido. Tamanho: ${ZIP_SIZE}"

# -- 2. Validar ZIP -------------------------------------------------------------
log_step "[2/7] A validar o pacote..."
if ! unzip -t "${ZIP_FILE}" >/dev/null 2>&1; then
  log_error "Ficheiro nao e um ZIP valido."; exit 1
fi
# A listagem e lida UMA vez para uma variavel, em vez de `unzip -l | grep -q`.
# Aquele encadeamento tem um falso negativo real: o `grep -q` sai no primeiro
# casamento, o `unzip` continua a escrever e apanha SIGPIPE (141), e com o
# `set -o pipefail` do topo deste script o `if` ve o estado do unzip morto em
# vez do sucesso do grep. O resultado era este aviso a disparar em pacotes
# perfeitamente bons -- e como ele PEDE CONFIRMACAO, ensinava a teclar "s" por
# cima da unica validacao que existe antes de substituir a aplicacao em
# producao. No dia em que o pacote estivesse mesmo incompleto, o "s" sairia
# por habito. (O mesmo defeito estava no passo 6 do gerar-pacote-update.sh.)
ZIP_LISTA=$(unzip -l "${ZIP_FILE}" 2>/dev/null || true)
if ! grep -qE "dist/index\.js$" <<< "${ZIP_LISTA}"; then
  log_warn "dist/index.js nao encontrado no ZIP."
  log_warn "Continuar? Digite s para continuar:"
  read -r CONFIRM
  if [ "${CONFIRM}" != "s" ] && [ "${CONFIRM}" != "S" ]; then
    log_error "Actualizacao cancelada."; exit 1
  fi
fi
log_ok "Pacote ZIP valido."

# -- 3. Backup ------------------------------------------------------------------
log_step "[3/7] A criar backup..."
BACKUP_FILE=""
if [ -f "${FIBERDOC_DIR}/dist/index.js" ]; then
  BACKUP_FILE="${BACKUP_DIR}/fiberdoc_backup_${TIMESTAMP}.tar.gz"
  tar -czf "${BACKUP_FILE}" -C "${FIBERDOC_DIR}" \
    --exclude="backups" --exclude="node_modules" --exclude="*.log" \
    . 2>/dev/null || true
  BACKUP_SIZE=$(du -sh "${BACKUP_FILE}" | cut -f1)
  log_ok "Backup criado: ${BACKUP_FILE} (${BACKUP_SIZE})"
else
  log_info "Nenhuma instalacao anterior -- backup ignorado."
fi

# Guardar DATABASE_URL antes de qualquer operacao
DB_URL_SAVED=""
if [ -n "${DATABASE_URL:-}" ]; then
  DB_URL_SAVED="${DATABASE_URL}"; log_info "DATABASE_URL guardada do ambiente."
fi
ENV_FILE="${FIBERDOC_DIR}/.env"
if [ -z "${DB_URL_SAVED}" ] && [ -f "${ENV_FILE}" ]; then
  DB_URL_SAVED=$(grep '^DATABASE_URL=' "${ENV_FILE}" 2>/dev/null \
                 | head -1 | sed 's/^DATABASE_URL=//' | tr -d '"' || true)
  [ -n "${DB_URL_SAVED}" ] && log_info "DATABASE_URL guardada do ficheiro de configuracao."
fi
if [ -z "${DB_URL_SAVED}" ]; then
  SVC_FILE="/etc/systemd/system/${FIBERDOC_SERVICE}.service"
  if [ -f "${SVC_FILE}" ]; then
    DB_URL_SAVED=$(grep '^Environment=DATABASE_URL=' "${SVC_FILE}" 2>/dev/null \
                   | head -1 | sed 's/^Environment=DATABASE_URL=//' || true)
    [ -n "${DB_URL_SAVED}" ] && log_info "DATABASE_URL guardada do systemd."
  fi
fi

# -- 4. Parar servico -----------------------------------------------------------
log_step "[4/7] A parar o servico ${FIBERDOC_SERVICE}..."
SERVICE_WAS_RUNNING=false
if systemctl is-active --quiet "${FIBERDOC_SERVICE}" 2>/dev/null; then
  systemctl stop "${FIBERDOC_SERVICE}"; SERVICE_WAS_RUNNING=true; log_ok "Servico parado."
else
  log_info "Servico nao estava em execucao."
fi

# -- 5. Extrair e aplicar -------------------------------------------------------
log_step "[5/7] A extrair e aplicar o pacote..."
EXTRACT_DIR="${TMP_DIR}/extracted"
mkdir -p "${EXTRACT_DIR}"
unzip -q "${ZIP_FILE}" -d "${EXTRACT_DIR}"

INNER_DIR=$(find "${EXTRACT_DIR}" -maxdepth 1 -mindepth 1 -type d | head -1)
SOURCE_DIR=""
if [ -n "${INNER_DIR}" ] && [ -f "${INNER_DIR}/dist/index.js" ]; then
  SOURCE_DIR="${INNER_DIR}"; log_info "Pasta raiz: $(basename "${INNER_DIR}")"
elif [ -f "${EXTRACT_DIR}/dist/index.js" ]; then
  SOURCE_DIR="${EXTRACT_DIR}"
else
  log_error "Estrutura do ZIP nao reconhecida."; exit 1
fi

ENV_BACKUP="${TMP_DIR}/env_backup"
mkdir -p "${ENV_BACKUP}"

ENV_DEST="${FIBERDOC_DIR}/.env"
if [ -L "${ENV_DEST}" ] && [ ! -e "${ENV_DEST}" ]; then
  rm -f "${ENV_DEST}"; log_info "Symlink quebrado removido."
fi
if [ -f "${ENV_DEST}" ]; then
  cp "${ENV_DEST}" "${ENV_BACKUP}/dotenv"; log_info "Ficheiro de configuracao guardado."
fi
if [ -d "${FIBERDOC_DIR}/local-uploads" ]; then
  cp -r "${FIBERDOC_DIR}/local-uploads" "${ENV_BACKUP}/local-uploads" 2>/dev/null || true
fi

rsync -a --delete \
  --exclude=".env" --exclude="backups/" --exclude="node_modules/" \
  --exclude="*.log" --exclude="local-uploads/" --exclude="local-backups/" \
  --exclude=".manus-logs/" --exclude="fiberdoc-v*/" \
  --filter="protect fiberdoc-v*/" --filter="protect .manus-logs/" \
  "${SOURCE_DIR}/" "${FIBERDOC_DIR}/" 2>&1 | grep -v 'cannot delete' || true

if [ -f "${ENV_BACKUP}/dotenv" ]; then
  [ -L "${ENV_DEST}" ] && rm -f "${ENV_DEST}"
  cp "${ENV_BACKUP}/dotenv" "${ENV_DEST}"; log_ok "Ficheiro de configuracao restaurado."
elif [ -n "${DB_URL_SAVED}" ]; then
  printf 'DATABASE_URL=%s\n' "${DB_URL_SAVED}" > "${ENV_DEST}"
  log_ok "Ficheiro de configuracao recriado com DATABASE_URL."
fi
if [ -d "${ENV_BACKUP}/local-uploads" ]; then
  cp -r "${ENV_BACKUP}/local-uploads" "${FIBERDOC_DIR}/" 2>/dev/null || true
fi
log_ok "Ficheiros aplicados em ${FIBERDOC_DIR}."


# -- Verificar variaveis obrigatorias no ficheiro de configuracao --
if [ -f "${ENV_DEST}" ]; then
  JWT_VAL=$(grep '^JWT_SECRET=' "${ENV_DEST}" 2>/dev/null | head -1 | sed 's/^JWT_SECRET=//' | tr -d '"' || true)
  if [ -z "${JWT_VAL}" ]; then
    JWT_GENERATED=$(tr -dc 'A-Za-z0-9' < /dev/urandom 2>/dev/null | head -c 48 || date +%s | sha256sum | head -c 48)
    printf 'JWT_SECRET=%s\n' "${JWT_GENERATED}" >> "${ENV_DEST}"
    log_ok "JWT_SECRET gerado automaticamente e adicionado ao ficheiro de configuracao."
  else
    log_info "JWT_SECRET ja presente no ficheiro de configuracao."
  fi
fi

## -- 6. Instalar dependencias ---------------------------------------------------
log_step "[6/7] A instalar dependencias..."
cd "${FIBERDOC_DIR}"
INSTALL_OK=false

# Localizar pnpm em varios caminhos possiveis (nvm, npm global, etc.)
PNPM_BIN=""
for _p in pnpm \
  /usr/local/bin/pnpm \
  /usr/bin/pnpm \
  "$(npm bin -g 2>/dev/null)/pnpm" \
  "${HOME}/.local/share/pnpm/pnpm" \
  "${NVM_BIN:-}/pnpm"; do
  if [ -x "${_p}" ] 2>/dev/null || command -v "${_p}" >/dev/null 2>&1; then
    PNPM_BIN="${_p}"; break
  fi
done

# Se pnpm nao encontrado, instalar globalmente via npm
if [ -z "${PNPM_BIN}" ] && command -v npm >/dev/null 2>&1; then
  log_info "pnpm nao encontrado. A instalar pnpm globalmente..."
  npm install -g pnpm --quiet 2>&1 | tail -3 || true
  PNPM_BIN="$(command -v pnpm 2>/dev/null || true)"
fi

# Tentar pnpm
if [ -n "${PNPM_BIN}" ]; then
  log_info "A instalar com pnpm (${PNPM_BIN})..."
  if "${PNPM_BIN}" install --prod --no-frozen-lockfile --ignore-scripts 2>&1; then
    log_ok "Dependencias instaladas com pnpm."; INSTALL_OK=true
  else
    log_warn "pnpm install falhou. A tentar npm..."
  fi
fi

# Fallback: npm
if [ "${INSTALL_OK}" = "false" ] && command -v npm >/dev/null 2>&1; then
  log_info "A instalar com npm..."
  if npm install --omit=dev --ignore-scripts 2>&1; then
    log_ok "Dependencias instaladas com npm."; INSTALL_OK=true
  else
    log_warn "npm install tambem falhou."
  fi
fi

if [ "${INSTALL_OK}" = "false" ]; then
  log_warn "Nao foi possivel instalar dependencias automaticamente."
  log_warn "Execute manualmente: cd ${FIBERDOC_DIR} && npm install --omit=dev"
fi

# -- 6b. Migracao SQL -----------------------------------------------------------
#
# O FiberDoc e multi-tenant: cada provedor tem o seu proprio banco. Ate a v23
# as migracoes corriam SO no banco principal, e o resultado foi seis provedores
# com o mapa quebrado durante um dia inteiro -- descoberto por acaso, numa
# conferencia manual. Agora o script percorre o banco principal mais todos os
# bancos listados na tabela `tenants`.
#
# A lista vem da tabela `tenants`, e nao de `SHOW DATABASES LIKE 'fiberdoc%'`:
# bancos orfaos, de provedores ja removidos, nao devem receber migracao. Havia
# um assim (fiberdoc_netteste) e ele so poluia toda conferencia.

MIGRATE_SQL=""
for candidate in \
  "${FIBERDOC_DIR}/migrate.sql" "${FIBERDOC_DIR}/migrate-latest.sql" \
  "${SOURCE_DIR}/migrate.sql" "${SOURCE_DIR}/migrate-latest.sql"; do
  if [ -f "${candidate}" ]; then MIGRATE_SQL="${candidate}"; break; fi
done

# Parsing da DATABASE_URL, uma vez so. Antes estava duplicado nos dois blocos
# de migracao, com uma terceira copia na seccao 6.5 -- tres lugares para
# divergirem.
DB_URL="${DB_URL_SAVED:-}"
if [ -z "${DB_URL}" ] && [ -f "${ENV_DEST}" ]; then
  DB_URL=$(grep '^DATABASE_URL=' "${ENV_DEST}" 2>/dev/null \
           | head -1 | sed 's/^DATABASE_URL=//' | tr -d '"' || true)
fi

DB_USER=""; DB_PASS=""; DB_HOST=""; DB_PORT=""; DB_NAME=""; SSL_OPT=""
if [ -n "${DB_URL}" ]; then
  DB_CLEAN=$(echo "${DB_URL}" | sed 's|mysql://||' | sed 's|?.*||')
  DB_USER=$(echo "${DB_CLEAN}" | sed 's|:.*||')
  DB_REST=$(echo "${DB_CLEAN}" | sed "s|${DB_USER}:||")
  DB_PASS=$(echo "${DB_REST}" | sed 's|@.*||')
  DB_HOSTPORT=$(echo "${DB_REST}" | sed "s|${DB_PASS}@||" | sed 's|/.*||')
  DB_NAME=$(echo "${DB_REST}" | sed "s|${DB_PASS}@${DB_HOSTPORT}/||")
  DB_HOST=$(echo "${DB_HOSTPORT}" | cut -d: -f1)
  DB_PORT=$(echo "${DB_HOSTPORT}" | cut -d: -f2)
  DB_PORT="${DB_PORT:-3306}"
  if [ "${DB_PORT}" = "4000" ] || grep -qi "tidb\|cloud\|aws\|azure\|gcp" <<< "${DB_HOST}"; then
    SSL_OPT="--ssl-mode=REQUIRED"
  fi
  # MYSQL_PWD em vez de -p: a senha deixa de aparecer na lista de processos.
  export MYSQL_PWD="${DB_PASS}"
fi

# Aplica um ficheiro SQL a um banco. Usa --force de proposito: um tenant
# incompleto pode nao ter alguma tabela (ha provedores sem map_poles), e parar
# no primeiro erro deixaria o resto da migracao daquele banco por fazer -- foi
# exactamente assim que a v22 nao chegou aos tenants. Os erros nao somem: sao
# contados e mostrados.
aplicar_migracao() {
  am_ficheiro="$1"
  am_banco="$2"
  am_saida=$(mysql -h "${DB_HOST}" -P "${DB_PORT}" -u "${DB_USER}" \
                   ${SSL_OPT} --force "${am_banco}" < "${am_ficheiro}" 2>&1 || true)
  am_erros=$(echo "${am_saida}" | grep -c '^ERROR' || true)
  if [ "${am_erros}" -eq 0 ]; then
    log_ok "  ${am_banco}"
    return 0
  fi
  log_warn "  ${am_banco} -- ${am_erros} erro(s):"
  echo "${am_saida}" | grep '^ERROR' | head -5 | sed 's/^/        /'
  return 1
}

if [ -z "${DB_URL}" ]; then
  log_warn "DATABASE_URL nao configurada -- migracoes ignoradas."
elif ! command -v mysql >/dev/null 2>&1; then
  log_warn "mysql-client nao encontrado -- migracoes ignoradas."
else
  # Banco principal primeiro; depois os provedores registados.
  DBS_ALVO="${DB_NAME}"
  TENANT_DBS=$(mysql -h "${DB_HOST}" -P "${DB_PORT}" -u "${DB_USER}" ${SSL_OPT} \
                 -N -B -e "SELECT dbName FROM tenants" "${DB_NAME}" 2>/dev/null || true)
  for t in ${TENANT_DBS}; do
    [ "${t}" = "${DB_NAME}" ] && continue
    DBS_ALVO="${DBS_ALVO} ${t}"
  done
  N_BANCOS=$(echo "${DBS_ALVO}" | wc -w)
  log_info "Bancos a migrar (${N_BANCOS}): ${DBS_ALVO}"

  # Aviso: ficheiros .sql que este laco NAO vai aplicar.
  #
  # migration_olt_groups.sql passou anos assim -- criava uma tabela que so
  # existe no banco principal, aplicada a mao, porque o nome nao casa com
  # migrate-v*.sql e ninguem reparou. O silencio foi o problema; a partir de
  # agora um ficheiro ignorado aparece no ecra.
  for sql_solto in "${SOURCE_DIR}"/*.sql; do
    [ -f "${sql_solto}" ] || continue
    nome_sql=$(basename "${sql_solto}")
    case "${nome_sql}" in
      migrate-v*.sql|schema-base.sql|migrate.sql|migrate-latest.sql) continue ;;
    esac
    log_info "AVISO: ${nome_sql} nao sera aplicado -- so migrate-v*.sql entram no laco dos tenants."
  done

  # Incrementais em ordem numerica, depois a consolidada.
  for migrate_inc in $(ls "${SOURCE_DIR}"/migrate-v*.sql 2>/dev/null | sort -V); do
    [ -f "${migrate_inc}" ] || continue
    log_info "Migracao incremental: $(basename ${migrate_inc})"
    for banco in ${DBS_ALVO}; do
      aplicar_migracao "${migrate_inc}" "${banco}" || true
    done
  done

  if [ -n "${MIGRATE_SQL}" ]; then
    log_info "Migracao consolidada: $(basename ${MIGRATE_SQL})"
    for banco in ${DBS_ALVO}; do
      aplicar_migracao "${MIGRATE_SQL}" "${banco}" || true
    done
  else
    log_info "Nenhum ficheiro de migracao consolidada encontrado."
  fi

  # Relatorio: colunas que o modelo espera e o banco nao tem.
  #
  # Este e o passo que faltava. Tres defeitos deste tipo estiveram anos em
  # producao sem sintoma -- o SQL cru funcionava, o Drizzle e que falhava, e
  # onde havia try/catch a falha nem aparecia. Depois de migrar, vale um minuto
  # a perguntar ao banco se ele ficou como o modelo diz.
  #
  # So imprime. Nunca falha o update: um relatorio que interrompe a instalacao
  # seria pior do que nao ter relatorio.
  # A ausencia de qualquer das duas condicoes E DITA. Uma verificacao que se
  # salta em silencio nao e uma verificacao -- foi assim que ela propria falhou
  # na primeira vez, porque o gerador de pacotes so copiava *.sh e o .mjs nunca
  # chegou ao servidor.
  if [ ! -f "${SOURCE_DIR}/schema-esperado.txt" ]; then
    log_warn "[6c] schema-esperado.txt nao veio no pacote -- conferencia dos bancos nao corre."
  else
    log_step "[6c] A conferir o modelo contra os bancos..."
    ESPERADO="${SOURCE_DIR}/schema-esperado.txt"
    if [ -s "${ESPERADO}" ]; then
      for banco in ${DBS_ALVO}; do
        TABELAS="${TMP_DIR}/tab-${banco}.txt"
        REAL="${TMP_DIR}/real-${banco}.txt"
        mysql -h "${DB_HOST}" -P "${DB_PORT}" -u "${DB_USER}" ${SSL_OPT} -N -B \
          -e "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='${banco}'" \
          2>/dev/null | sort > "${TABELAS}" || continue
        mysql -h "${DB_HOST}" -P "${DB_PORT}" -u "${DB_USER}" ${SSL_OPT} -N -B \
          -e "SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='${banco}'" \
          2>/dev/null | sort > "${REAL}" || continue
        DIVERG=$(awk -F'\t' 'NR==FNR{t[$1]=1;next} t[$1]' "${TABELAS}" "${ESPERADO}" \
                 | comm -23 - "${REAL}" | head -20)
        if [ -n "${DIVERG}" ]; then
          log_info "AVISO: ${banco} diverge do modelo:"
          printf '%s\n' "${DIVERG}" | while IFS= read -r l; do log_info "    ${l}"; done
        else
          log_ok "${banco}: alinhado com o modelo."
        fi
      done
    else
      log_warn "[6c] schema-esperado.txt esta vazio; a seguir sem conferencia."
    fi
  fi

  unset MYSQL_PWD
fi

# -- 6.5 Ajustar max_connections do MySQL se necessário -----------------------
if command -v mysql >/dev/null 2>&1 && [ -n "${DB_URL:-}" ]; then
  DB_CLEAN2=$(echo "${DB_URL}" | sed 's|mysql://||' | sed 's|?.*||')
  DB_USER2=$(echo "${DB_CLEAN2}" | cut -d: -f1)
  DB_REST2=$(echo "${DB_CLEAN2}" | cut -d: -f2-)
  DB_PASS2=$(echo "${DB_REST2}" | cut -d@ -f1)
  DB_HOSTPORT2=$(echo "${DB_REST2}" | cut -d@ -f2 | cut -d/ -f1)
  DB_HOST2=$(echo "${DB_HOSTPORT2}" | cut -d: -f1)
  DB_PORT2=$(echo "${DB_HOSTPORT2}" | cut -d: -f2)
  DB_PORT2=${DB_PORT2:-3306}
  CURRENT_MAX=$(mysql -h "${DB_HOST2}" -P "${DB_PORT2}" -u "${DB_USER2}" "-p${DB_PASS2}" \
    --batch --skip-column-names -e "SELECT @@max_connections;" 2>/dev/null || echo "0")
  if [ "${CURRENT_MAX}" -lt 300 ] 2>/dev/null; then
    mysql -h "${DB_HOST2}" -P "${DB_PORT2}" -u "${DB_USER2}" "-p${DB_PASS2}" \
      -e "SET GLOBAL max_connections = 300;" 2>/dev/null && \
      log_ok "max_connections ajustado para 300 (era ${CURRENT_MAX})." || \
      log_warn "Nao foi possivel ajustar max_connections (sem privilegio SUPER). Ajuste manualmente."
    # Persistir no my.cnf para sobreviver a reinicializações
    MYCNF="/etc/mysql/mysql.conf.d/mysqld.cnf"
    [ -f "${MYCNF}" ] || MYCNF="/etc/mysql/my.cnf"
    if [ -f "${MYCNF}" ] && ! grep -q "max_connections" "${MYCNF}"; then
      echo -e "\n[mysqld]\nmax_connections = 300" >> "${MYCNF}" 2>/dev/null && \
        log_ok "max_connections=300 persistido em ${MYCNF}." || true
    fi
  else
    log_ok "max_connections ja esta em ${CURRENT_MAX} (>= 300)."
  fi
fi

# -- 7. Reiniciar servico -------------------------------------------------------
log_step "[7/7] A reiniciar o servico ${FIBERDOC_SERVICE}..."
systemctl daemon-reload

SERVICE_FILE="/etc/systemd/system/${FIBERDOC_SERVICE}.service"
if [ -f "${SERVICE_FILE}" ]; then
  systemctl restart "${FIBERDOC_SERVICE}" || true
  sleep 5
  if systemctl is-active --quiet "${FIBERDOC_SERVICE}"; then
    log_ok "Servico reiniciado com sucesso!"
  else
    log_warn "Servico nao iniciou. Verifique:"
    log_warn "  journalctl -u ${FIBERDOC_SERVICE} -n 30 --no-pager"
    log_warn "Se aparecer 502: bash ${FIBERDOC_DIR}/scripts/fiberdoc-fix-502.sh"
  fi
else
  log_warn "Ficheiro systemd nao encontrado: ${SERVICE_FILE}"
  if [ "${SERVICE_WAS_RUNNING}" = "true" ]; then
    log_warn "Inicie: systemctl start ${FIBERDOC_SERVICE}"
  fi
fi

rm -rf "${TMP_DIR}" 2>/dev/null || true

echo ""
echo -e "${BOLD}============================================================${NC}"
if systemctl is-active --quiet "${FIBERDOC_SERVICE}" 2>/dev/null; then
  echo -e "${GREEN}${BOLD}  FiberDoc actualizado com sucesso!${NC}"
else
  echo -e "${YELLOW}${BOLD}  FiberDoc actualizado -- verifique o servico${NC}"
  echo -e "  Se 502: ${CYAN}bash ${FIBERDOC_DIR}/scripts/fiberdoc-fix-502.sh${NC}"
fi
echo ""
[ -n "${BACKUP_FILE}" ] && echo -e "  Backup: ${BACKUP_FILE}"
echo -e "  Dir:    ${FIBERDOC_DIR}"
echo -e "  Data:   $(date '+%d/%m/%Y %H:%M:%S')"
echo ""
echo -e "  Estado: systemctl status ${FIBERDOC_SERVICE}"
echo -e "  Logs:   journalctl -u ${FIBERDOC_SERVICE} -f"
echo -e "${BOLD}============================================================${NC}"
echo ""
