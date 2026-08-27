#!/usr/bin/env node
/**
 * Lista, a partir de drizzle/schema.ts, os pares tabela<TAB>coluna que o
 * Drizzle espera encontrar no banco.
 *
 * Porquê: o drizzle-kit batiza o tipo ENUM com "tabela_coluna" e, em algumas
 * definições, esse nome acabou escrito como nome da COLUNA. Quando a tabela
 * nasceu de uma migração SQL escrita à mão — onde a coluna tem o nome curto —
 * o modelo e o banco divergem. Nada acusa: o SQL cru continua a funcionar e só
 * quem passar pelo Drizzle recebe "Unknown column". Foi assim que
 * route_extra_tubes.side ficou anos partido no caminho do Drizzle sem que
 * ninguém desse por isso.
 *
 * Isto não lê o banco. Imprime o esperado; comparar é do shell:
 *
 *   node scripts/conferir-schema.mjs | sort > /tmp/esperado.txt
 *   mysql -N -B -e "SELECT TABLE_NAME FROM information_schema.TABLES \
 *     WHERE TABLE_SCHEMA='fiberdoc'" | sort > /tmp/tabelas.txt
 *   mysql -N -B -e "SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS \
 *     WHERE TABLE_SCHEMA='fiberdoc'" | sort > /tmp/real.txt
 *   awk -F'\t' 'NR==FNR{t[$1]=1;next} t[$1]' /tmp/tabelas.txt /tmp/esperado.txt \
 *     | comm -23 - /tmp/real.txt
 *
 * A última linha imprime as colunas que o Drizzle espera e o banco não tem,
 * ignorando tabelas que ainda não existem naquele banco. Saída vazia = tudo
 * alinhado.
 *
 * É uma leitura de texto, não um parser de TypeScript: se a forma de declarar
 * uma coluna mudar, isto passa a ver menos do que existe. Por isso imprime no
 * fim, em stderr, quantas tabelas e colunas encontrou — um número que despenca
 * é o aviso de que o reconhecimento deixou de funcionar.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const texto = readFileSync(resolve(raiz, "drizzle/schema.ts"), "utf8");
const linhas = texto.split("\n");

// Enums declarados à parte e reutilizados: guarda o nome da coluna que cada um
// carrega, para resolver "type: equipmentTypeEnum" mais abaixo.
const enumsSoltos = new Map();
for (const l of linhas) {
  const m = l.match(/^export const (\w+) = mysqlEnum\(\s*"([^"]+)"/);
  if (m) enumsSoltos.set(m[1], m[2]);
}

const pares = [];
const tabelas = new Set();
let tabelaAtual = null;

for (const l of linhas) {
  if (tabelaAtual === null) {
    const m = l.match(/=\s*mysqlTable\(\s*"([^"]+)"/);
    if (m) { tabelaAtual = m[1]; tabelas.add(m[1]); }
    continue;
  }
  // Fecha no primeiro "}" em coluna zero — cobre tanto "});" como o
  // "}, (table) => ({" das tabelas que declaram índices.
  if (/^\}/.test(l)) { tabelaAtual = null; continue; }

  // campo: tipo("nome_da_coluna", ...)
  const direto = l.match(/^\s*(\w+)\s*:\s*\w+\(\s*"([^"]+)"/);
  if (direto) { pares.push([tabelaAtual, direto[2]]); continue; }

  // campo: algumCoisaEnum...
  const porEnum = l.match(/^\s*(\w+)\s*:\s*(\w+)\b/);
  if (porEnum && enumsSoltos.has(porEnum[2])) {
    pares.push([tabelaAtual, enumsSoltos.get(porEnum[2])]);
  }
}

for (const [t, c] of pares) process.stdout.write(`${t}\t${c}\n`);
process.stderr.write(`${tabelas.size} tabelas, ${pares.length} colunas reconhecidas\n`);
