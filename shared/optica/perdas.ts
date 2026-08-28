/**
 * A perda de inserção de um splitter, numa tabela só.
 *
 * Estavam duas, escritas à mão, em sítios diferentes do `db.ts`:
 *
 *   BALANCED_LOSS_DB   usada ao CRIAR o splitter, para gravar `lossDb` em
 *                      cada saída. Dizia 1:4 = 7,2. Não tinha 1:64.
 *   SPLITTER_LOSS_DB   usada ao CALCULAR o balanço. Dizia 1:4 = 7,0.
 *
 * Duas consequências, ambas medidas a 28/08/2026:
 *
 * 1. Um 1:4 numa CEO era calculado com 7,2 e um 1:4 numa CTO com 7,0. O
 *    balanço lê `ceo_splitter_vias.lossDb` antes da constante (`db.ts:4578`),
 *    e a CTO não tem essa coluna. O mesmo componente dava contas diferentes
 *    conforme a caixa onde estava.
 *
 * 2. A criação caía em `?? 3.5` para qualquer ratio fora da tabela. Um 1:64
 *    numa CEO gravava **3,5 dB** em cada saída — o valor de um 1:2 — e como o
 *    `lossDb` gravado vence a constante, esse 3,5 ganhava aos 20,5 reais. Um
 *    erro de 17 dB, que faz um enlace inviável parecer óptimo. Não havia
 *    nenhum 1:64 nos dados; era defeito à espera.
 *
 * O valor do 1:4 é 7,0 por decisão do Ewerton (28/08/2026).
 *
 * A queda deixa de ser um número inventado: um ratio desconhecido calcula
 * 10·log10(N), que é a perda teórica de divisão, e diz que foi calculada. Um
 * valor aproximado assumido é melhor que o valor de outro componente, e saber
 * qual dos dois se está a ver é melhor que ambos.
 */

/** Perda de inserção típica, em dB, por relação de divisão. */
export const PERDA_SPLITTER_DB: Readonly<Record<string, number>> = {
  "1:2": 3.5,
  "1:4": 7.0,
  "1:8": 10.5,
  "1:16": 13.5,
  "1:32": 17.0,
  "1:64": 20.5,
};

export interface PerdaDoSplitter {
  db: number;
  /**
   * "tabela"    — a relação foi reconhecida e o valor veio de PERDA_SPLITTER_DB.
   * "calculada" — a relação não está na tabela; o valor é 10·log10(N).
   * "desconhecida" — não se extraiu relação nenhuma do rótulo. Devolve 0 para
   *                  não inventar perda: uma perda a mais é tão errada como
   *                  uma a menos, e o zero é visível no resultado.
   */
  origem: "tabela" | "calculada" | "desconhecida";
}

/**
 * Extrai a relação de um rótulo e devolve a perda.
 *
 * Aceita o que aparece no cadastro real: "1:8", "1/8", "SPLITTER 1:8",
 * "1:8 AC APC", "8". A normalização é a que já existia no `getSplitterLoss`,
 * preservada caso a caso para não mudar nenhum resultado que hoje funciona.
 */
export function perdaDoSplitter(rotulo: string | null | undefined): PerdaDoSplitter {
  if (!rotulo) return { db: 0, origem: "desconhecida" };
  const texto = rotulo.replace("/", ":").trim();

  if (PERDA_SPLITTER_DB[texto] !== undefined) {
    return { db: PERDA_SPLITTER_DB[texto], origem: "tabela" };
  }

  // "SPLITTER 1:8 AC APC" → "1:8"
  const comPrefixo = texto.match(/\b(1[:/]\d+)\b/);
  if (comPrefixo) {
    const extraido = comPrefixo[1].replace("/", ":");
    if (PERDA_SPLITTER_DB[extraido] !== undefined) {
      return { db: PERDA_SPLITTER_DB[extraido], origem: "tabela" };
    }
  }

  // Só o denominador: "1:128" ou "128"
  const comDenominador = texto.match(/1[:/](\d+)/) ?? texto.match(/^(\d+)$/);
  if (comDenominador) {
    const n = parseInt(comDenominador[1], 10);
    if (Number.isFinite(n) && n > 1) {
      const chave = `1:${n}`;
      if (PERDA_SPLITTER_DB[chave] !== undefined) {
        return { db: PERDA_SPLITTER_DB[chave], origem: "tabela" };
      }
      // Perda teórica de divisão. Não inclui a perda de excesso do componente
      // real, portanto é optimista -- mas é da ordem certa, ao contrário de
      // assumir o valor de outro splitter.
      return { db: parseFloat((10 * Math.log10(n)).toFixed(1)), origem: "calculada" };
    }
  }

  return { db: 0, origem: "desconhecida" };
}

/** Quantas saídas tem esta relação. Devolve null se não se souber. */
export function saidasDoSplitter(rotulo: string | null | undefined): number | null {
  if (!rotulo) return null;
  const texto = rotulo.replace("/", ":").trim();
  const m = texto.match(/1[:/](\d+)/) ?? texto.match(/^(\d+)$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 1 ? n : null;
}
