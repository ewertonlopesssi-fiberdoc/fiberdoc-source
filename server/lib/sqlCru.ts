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
 *
 * NOTA sobre o estilo: este ficheiro evita `for...of` sobre `Map`, `Set` e
 * `matchAll`, e evita espalhá-los com `...`. O `tsconfig.json` não define
 * `target`, portanto o TypeScript assume ES5 e recusa essas formas com
 * TS2802 -- o mesmo tropeção que deu origem ao `25-fix-downleveliteration`.
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
  const reTabela = /export const \w+ = mysqlTable\(\s*"([\w]+)"\s*,\s*\{([\s\S]*?)\n\}\)/g;
  let t: RegExpExecArray | null;
  while ((t = reTabela.exec(fonteSchema)) !== null) {
    const tabela = t[1];
    const corpo = t[2];
    const mapa = new Map<string, string>();
    const reCampo = /^\s*(\w+)\s*:\s*\w+\(\s*"([\w]+)"/gm;
    let c: RegExpExecArray | null;
    while ((c = reCampo.exec(corpo)) !== null) {
      if (c[1] !== c[2]) mapa.set(c[1], c[2]);
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
  const re = /`([^`]*?)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fonte)) !== null) {
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
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    mapa.set(m[1], m[1]);
    if (m[2]) mapa.set(m[2], m[1]);
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

/** Quantas vezes `re` casa em `texto`. */
function contar(texto: string, re: RegExp): number {
  let n = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    n++;
    if (m.index === re.lastIndex) re.lastIndex++; // casamento vazio: não ficar preso
  }
  return n;
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

  const tabelas: string[] = [];
  alias.forEach((tabela) => {
    if (tabelas.indexOf(tabela) === -1) tabelas.push(tabela);
  });
  const tabelaUnica = tabelas.length === 1 ? tabelas[0] : null;

  alias.forEach((tabela, nome) => {
    const divs = divergencias.get(tabela);
    if (!divs) return;
    divs.forEach((coluna, prop) => {
      const vezes = contar(sql, new RegExp(`\\b${nome}\\.${prop}\\b`, "g"));
      for (let i = 0; i < vezes; i++) {
        achados.push({ linha, tabela, prop, coluna, trecho: `${nome}.${prop}` });
      }
    });
  });

  if (tabelaUnica) {
    const divs = divergencias.get(tabelaUnica);
    if (divs) {
      divs.forEach((coluna, prop) => {
        // Sem prefixo, sem `AS` antes, e a coluna certa não aparece na consulta.
        if (new RegExp(`\\b${coluna}\\b`).test(sql)) return;
        if (achados.some(a => a.prop === prop)) return;
        const vezes = contar(sql, new RegExp(`(?<![\\w.])(?<!AS\\s)${prop}\\b`, "gi"));
        if (vezes > 0) {
          achados.push({ linha, tabela: tabelaUnica, prop, coluna, trecho: prop });
        }
      });
    }
  }

  return achados;
}

/** Todos os achados de um ficheiro. */
export function analisarFonte(fonte: string, divergencias: Divergencias): Achado[] {
  const saida: Achado[] = [];
  extrairConsultas(fonte).forEach(c => {
    analisarConsulta(c, divergencias).forEach(a => saida.push(a));
  });
  return saida;
}
