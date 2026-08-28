/**
 * Une os dois mecanismos de fusão do FiberDoc numa lista só.
 *
 * Porque existem dois:
 *
 *   Mecanismo A — colunas na própria via (`ceo_vias.fusedToViaId`,
 *   `fusedToSplitterViaId`, e o equivalente em `cto_vias`). É o mais antigo e o
 *   único usado nas fusões tubo↔tubo. É gravado nos DOIS sentidos: se A funde
 *   com B, a linha de A aponta para B e a de B aponta para A.
 *
 *   Mecanismo B — a tabela `*_via_associations`, genérica, que aceita
 *   tubo↔tubo, tubo↔splitter e splitter↔splitter. É gravada uma vez só, num
 *   sentido.
 *
 * O `getOpticalDiagram` lia apenas o mecanismo B. Medido em produção a
 * 28/08/2026: 100% das fusões tubo↔tubo ficavam de fora — 686 vias no banco
 * principal e 222 no topnet, ou seja ~454 fusões que existiam no cadastro e o
 * diagrama não desenhava. Quem abrisse uma CEO via as ligações para splitter e
 * mais nada.
 *
 * Esta função repõe a verdade sem alterar nada no banco. Ela não decide qual
 * mecanismo é o certo — isso é trabalho da unificação, mais à frente. Aqui só
 * se junta o que existe, sem duplicar.
 *
 * Regras, todas com teste:
 *
 *   1. Uma fusão bidireccional do mecanismo A vira UMA aresta, não duas.
 *   2. Uma fusão que já existe como associação não é repetida.
 *   3. Uma fusão "meio aberta" (A aponta para B, B não aponta para A) conta na
 *      mesma. Ela existe no cadastro, e esconder metade seria repetir o defeito
 *      que esta função corrige.
 *   4. As arestas vindas das colunas recebem id NEGATIVO. Elas não são linhas
 *      de `*_via_associations`, e um id negativo torna impossível passá-las por
 *      engano a um endpoint que apaga associações por id.
 */

export type LadoFusao = "tube" | "splitter";

export interface FusaoUnida {
  id: number;
  sourceType: LadoFusao;
  sourceViaId: number;
  targetType: LadoFusao;
  targetViaId: number;
  notes: string | null;
  /** De onde veio. O cliente usa isto para não oferecer "apagar" no que não é linha. */
  origem: "associacao" | "coluna";
}

export interface AssociacaoEntrada {
  id: number;
  sourceType: string;
  sourceViaId: number;
  targetType: string;
  targetViaId: number;
  notes?: string | null;
}

export interface ViaEntrada {
  id: number;
  fusedToViaId?: number | null;
  fusedToSplitterViaId?: number | null;
}

/** Chave sem sentido: A—B e B—A dão a mesma string. */
function chaveNaoOrdenada(
  aType: LadoFusao, aId: number, bType: LadoFusao, bId: number
): string {
  const a = `${aType}:${aId}`;
  const b = `${bType}:${bId}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function normalizarLado(v: string): LadoFusao {
  return v === "splitter" ? "splitter" : "tube";
}

export function unirFusoes(
  associacoes: AssociacaoEntrada[],
  vias: ViaEntrada[]
): FusaoUnida[] {
  const saida: FusaoUnida[] = [];
  const vistas = new Set<string>();

  // As associações entram primeiro e ganham: são linhas reais, com id real.
  for (const a of associacoes) {
    const st = normalizarLado(a.sourceType);
    const tt = normalizarLado(a.targetType);
    const k = chaveNaoOrdenada(st, a.sourceViaId, tt, a.targetViaId);
    if (vistas.has(k)) continue;
    vistas.add(k);
    saida.push({
      id: a.id,
      sourceType: st, sourceViaId: a.sourceViaId,
      targetType: tt, targetViaId: a.targetViaId,
      notes: a.notes ?? null,
      origem: "associacao",
    });
  }

  // Depois as colunas, saltando o que já foi coberto.
  let idSintetico = -1;
  const acrescentar = (
    origemId: number, destinoTipo: LadoFusao, destinoId: number
  ) => {
    const k = chaveNaoOrdenada("tube", origemId, destinoTipo, destinoId);
    if (vistas.has(k)) return;
    vistas.add(k);
    saida.push({
      id: idSintetico--,
      sourceType: "tube", sourceViaId: origemId,
      targetType: destinoTipo, targetViaId: destinoId,
      notes: null,
      origem: "coluna",
    });
  };

  for (const v of vias) {
    if (v.fusedToViaId != null) acrescentar(v.id, "tube", v.fusedToViaId);
    if (v.fusedToSplitterViaId != null) acrescentar(v.id, "splitter", v.fusedToSplitterViaId);
  }

  return saida;
}
