/**
 * O terceiro sítio onde o esquema se desalinha.
 *
 * Já tínhamos dois guardas:
 *
 *   `pnpm check`          modelo contra código TypeScript
 *   `conferir-schema.mjs` modelo contra banco, em cada actualização
 *
 * Falta o terceiro par, e foi por ali que passaram dois defeitos a 28/08/2026:
 * **SQL escrito à mão contra o modelo**.
 *
 * No Drizzle, `side: mysqlEnum("dgo_link_side", [...])` declara uma propriedade
 * chamada `side` numa coluna chamada `dgo_link_side` -- o primeiro argumento é
 * o nome da coluna. As consultas Drizzle funcionam porque ele traduz. O SQL
 * escrito à mão não passa por essa tradução, e `SELECT dscl.side` pede uma
 * coluna que não existe.
 *
 * Duas consultas cruas faziam isso, e as duas funções que as usavam
 * (`calculateOpticalBalanceFromDgo` e `getDgoSlotCtoBalances`) **rebentavam em
 * todos os tenants desde sempre**. Nenhum dos dois guardas o via: o modelo e o
 * banco concordavam perfeitamente um com o outro.
 *
 * Há 42 tabelas onde o nome da propriedade difere do nome da coluna, e 25
 * blocos de SQL cru no `db.ts`. Verificar isto à mão uma vez não é verificar.
 */

export type Divergencias = Map<string, Map<string, string>>;

/**
 * Lê do `drizzle/schema.ts` as propriedades cujo nome não é o da coluna.
 *
 * Formato: `propriedade: tipo("nomeDaColuna", ...)`. Quando os dois nomes
 * coincidem não há divergência e não interessa.
 */
export function lerDivergencias(fonteSchema: string): Divergencias {
  const fora: Divergencias = new Map();
  const tabelas = fonteSchema.matchAll(
    /export const \w+ = mysqlTable\(\s*"([\w]+)"\s*,\s*\{([\s\S]*?)\n\}\)/g,
  );
  for (const t of tabelas) {
    const [, tabela, corpo] = t;
    const mapa = new Map<string, string>();
    for (const c of corpo.matchAll(/^\s*(\w+)\s*:\s*\w+\(\s*"([\w]+)"/gm)) {
      const [, prop, coluna] = c;
      if (prop !== coluna) mapa.set(prop, coluna);
    }
    if (mapa.size > 0) fora.set(tabela, mapa);
  }
  return fora;
}

export interface Consulta {
  sql: string;
  linha: number;
}

/** Os template literals que contêm SQL. */
export function extrairConsultas(fonte: string): Consulta[] {
  const saida: Consulta[] = [];
  for (const m of fonte.matchAll(/`([^`]*?)`/g)) {
    const sql = m[1];
    if (!/\b(SELECT|UPDATE|INSERT\s+INTO|DELETE\s+FROM)\b/i.test(sql)) continue;
    saida.push({ sql, linha: fonte.slice(0, m.index).split("\n").length });
  }
  return saida;
}

/**
 * Que tabela está por trás de cada nome usável como prefixo.
 *
 * `FROM dgo_slot_cable_links dscl` dá tanto `dscl` como
 * `dgo_slot_cable_links`. Sem isto não se distingue `eq.type` (equipments, que
 * não diverge) de `p.type` (ports, que diverge) na mesma consulta.
 */
export function aliasesDeTabelas(sql: string): Map<string, string> {
  const mapa = new Map<string, string>();
  const re = /\b(?:FROM|JOIN|UPDATE|INSERT\s+INTO)\s+`?(\w+)`?(?:\s+(?:AS\s+)?(?!ON\b|SET\b|WHERE\b|VALUES\b|LEFT\b|RIGHT\b|INNER\b|JOIN\b|GROUP\b|ORDER\b|LIMIT\b|USING\b)(\w+))?/gi;
  for (const m of sql.matchAll(re)) {
    const tabela = m[1];
    mapa.set(tabela, tabela);
    if (m[2]) mapa.set(m[2], tabela);
  }
  return mapa;
}

export interface Achado {
  linha: number;
  tabela: string;
  prop: string;
  coluna: string;
  trecho: string;
}

/**
 * Referências no SQL que usam o nome da propriedade onde devia estar o da
 * coluna.
 *
 * Só se acusa o que se consegue atribuir a uma tabela: referência qualificada
 * (`alias.prop`), ou não qualificada numa consulta de uma tabela só. Um
 * `AS prop` no fim é rótulo de saída, não coluna, e é deixado em paz -- é
 * assim que se escreve a correcção (`dscl.dgo_link_side AS side`), e acusá-la
 * seria acusar o próprio remédio.
 */
export function analisarConsulta(consulta: Consulta, divergencias: Divergencias): Achado[] {
  const { sql, linha } = consulta;
  const alias = aliasesDeTabelas(sql);
  const achados: Achado[] = [];

  const tabelasNaConsulta = new Set(alias.values());
  const tabelaUnica = tabelasNaConsulta.size === 1 ? [...tabelasNaConsulta][0] : null;

  for (const [nome, tabela] of alias) {
    const divs = divergencias.get(tabela);
    if (!divs) continue;
    for (const [prop, coluna] of divs) {
      const re = new RegExp(`\\b${nome}\\.${prop}\\b`, "g");
      for (const m of sql.matchAll(re)) {
        achados.push({ linha, tabela, prop, coluna, trecho: m[0] });
      }
    }
  }

  if (tabelaUnica) {
    const divs = divergencias.get(tabelaUnica);
    if (divs) {
      for (const [prop, coluna] of divs) {
        // Sem prefixo, sem `AS` antes, e a coluna certa não aparece na consulta.
        const re = new RegExp(`(?<![\\w.])(?<!AS\\s)${prop}\\b`, "gi");
        const temColunaCerta = new RegExp(`\\b${coluna}\\b`).test(sql);
        if (temColunaCerta) continue;
        for (const m of sql.matchAll(re)) {
          if (achados.some(a => a.prop === prop)) continue;
          achados.push({ linha, tabela: tabelaUnica, prop, coluna, trecho: m[0] });
        }
      }
    }
  }

  return achados;
}

/** Todos os achados de um ficheiro. */
export function analisarFonte(fonte: string, divergencias: Divergencias): Achado[] {
  return extrairConsultas(fonte).flatMap(c => analisarConsulta(c, divergencias));
}
