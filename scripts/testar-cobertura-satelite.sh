#!/bin/bash
###############################################################################
# testar-cobertura-satelite.sh — Descobrir o zoom máximo real da Esri
#
# A Esri World Imagery não devolve 404 quando falta cobertura: devolve um PNG
# válido escrito "Map data not yet available". Como é HTTP 200 com imagem
# legítima, o Leaflet não detecta o placeholder e o mapa fica coberto de
# placas cinzas.
#
# Esses placeholders são muito menores que uma foto de satélite de verdade
# (poucos KB contra dezenas), então o tamanho do tile distingue os dois.
#
# Uso:
#   bash testar-cobertura-satelite.sh <latitude> <longitude>
#
# Ex:  bash testar-cobertura-satelite.sh -23.5505 -46.6333
#
# Pegue a coordenada do centro da sua área de projeto no próprio mapa do
# FiberDoc (o painel lateral de qualquer elemento mostra lat/lng).
###############################################################################

set -e

LAT="${1:-}"
LON="${2:-}"

if [ -z "${LAT}" ] || [ -z "${LON}" ]; then
  echo "Uso: bash testar-cobertura-satelite.sh <latitude> <longitude>"
  echo "Ex:  bash testar-cobertura-satelite.sh -23.5505 -46.6333"
  exit 1
fi

BASE="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile"
LIMIAR=8000   # bytes: abaixo disso é quase certamente placeholder

echo "============================================================"
echo "  Cobertura Esri World Imagery"
echo "  Ponto: ${LAT}, ${LON}"
echo "============================================================"
echo ""
printf "  %-6s %-10s %-12s %s\n" "ZOOM" "HTTP" "TAMANHO" "AVALIACAO"
printf "  %-6s %-10s %-12s %s\n" "----" "----" "-------" "---------"

MAIOR_OK=0

for Z in 16 17 18 19 20 21 22; do
  # Converte lat/lon para índice de tile (Web Mercator)
  read -r X Y <<<"$(python3 -c "
import math
lat, lon, z = ${LAT}, ${LON}, ${Z}
n = 2 ** z
x = int((lon + 180.0) / 360.0 * n)
y = int((1.0 - math.log(math.tan(math.radians(lat)) + 1/math.cos(math.radians(lat))) / math.pi) / 2.0 * n)
print(x, y)
")"

  URL="${BASE}/${Z}/${Y}/${X}"
  TMP="$(mktemp)"
  CODE=$(curl -s -o "${TMP}" -w "%{http_code}" --max-time 20 "${URL}" || echo "000")
  SIZE=$(stat -c%s "${TMP}" 2>/dev/null || echo 0)
  rm -f "${TMP}"

  if [ "${CODE}" != "200" ]; then
    AVAL="sem resposta"
  elif [ "${SIZE}" -lt "${LIMIAR}" ]; then
    AVAL="PLACEHOLDER (sem cobertura)"
  else
    AVAL="imagem real"
    MAIOR_OK="${Z}"
  fi

  printf "  %-6s %-10s %-12s %s\n" "z${Z}" "${CODE}" "${SIZE}" "${AVAL}"
done

echo ""
echo "============================================================"
if [ "${MAIOR_OK}" -gt 0 ]; then
  echo "  Maior zoom com imagem real: z${MAIOR_OK}"
  echo ""
  echo "  Ajuste em client/src/pages/InfrastructureMap.tsx e"
  echo "  client/src/mobile/screens/MobileMap.tsx:"
  echo ""
  echo "    const SATELLITE_MAX_NATIVE_ZOOM = ${MAIOR_OK};"
  echo "    const SATELLITE_MAX_ZOOM = $((MAIOR_OK + 3));"
  echo ""
  echo "  O MAX_ZOOM maior permite ampliacao digital para posicionar"
  echo "  elementos com precisao. Nao deixa mais nitido, mas nao trava."
else
  echo "  Nenhum zoom retornou imagem real. Verifique a conectividade"
  echo "  com server.arcgisonline.com a partir deste servidor."
fi
echo "============================================================"
echo ""
echo "  Teste mais de um ponto: a cobertura varia dentro da mesma"
echo "  cidade. Use o menor resultado entre os pontos testados."
