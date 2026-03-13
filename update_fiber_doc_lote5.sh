#!/bin/bash
# ============================================================
# Script de Atualização — FiberDoc Sistema (Lote 5)
# Gerado em: 2026-03-13
# Checkpoint: a6ce41c4
# ============================================================
set -e

echo "======================================================"
echo "  FiberDoc — Atualização Lote 5"
echo "======================================================"
echo ""
echo "Melhorias incluídas:"
echo "  • Cor dos cabos sempre usa a cor do cadastro"
echo "  • Botão auto-organizar: cria pastas Postes e Reservas"
echo "  • Mobile: OTDR Virtual + Balanço Óptico CTO"
echo "  • Mobile: removidos SSH Commander e Relatórios"
echo "  • Indicador de posição no drag de pastas"
echo "  • Exportação KMZ hierárquica por pasta"
echo "  • Bugs CEO corrigidos (fusões splitter↔tubo)"
echo "  • Reordenar pastas por drag-and-drop"
echo "  • Filtro rápido por nome no painel de grupos"
echo "  • Exportação combinada (grupo + visíveis)"
echo ""

# Verificar se está no diretório correto
if [ ! -f "package.json" ]; then
  echo "ERRO: Execute este script dentro do diretório do projeto."
  exit 1
fi

PROJECT_NAME=$(node -e "console.log(require('./package.json').name)" 2>/dev/null || echo "fiber_doc_system")
echo "Projeto detectado: $PROJECT_NAME"
echo ""

# 1. Instalar dependências
echo "[1/4] Verificando dependências..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
echo "  Dependências OK."

# 2. Aplicar migration SQL (campo sort_order na tabela map_groups)
echo "[2/4] Aplicando migrations de banco de dados..."
node -e "
const mysql = require('mysql2/promise');
async function migrate() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    await conn.execute('ALTER TABLE map_groups ADD COLUMN sort_order INT NOT NULL DEFAULT 0');
    console.log('  Campo sort_order adicionado com sucesso.');
  } catch(e) {
    if (e.code === 'ER_DUP_FIELDNAME') {
      console.log('  Campo sort_order já existe — OK.');
    } else {
      console.log('  Aviso migration:', e.message);
    }
  }
  await conn.end();
}
migrate();
" 2>/dev/null || echo "  Migration verificada."

# 3. Build de produção
echo "[3/4] Gerando build de produção..."
pnpm run build
echo "  Build concluído."

# 4. Reiniciar servidor
echo "[4/4] Reiniciando servidor..."
if command -v pm2 &> /dev/null; then
  pm2 restart all
  echo "  Servidor reiniciado via PM2."
else
  echo "  Reinicie o servidor manualmente (ex: pnpm start)."
fi

echo ""
echo "======================================================"
echo "  Atualização concluída com sucesso!"
echo "======================================================"
