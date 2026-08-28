import {
  type OpticalEndpoint, chaveEndpoint, chaveLigacao, mesmoEndpoint, podeLigar,
} from "./endpoint";

/**
 * Quando é que uma fusão pode ser criada.
 *
 * A regra de negócio é uma só e o Ewerton confirmou-a: **uma via liga a
 * exactamente uma outra via**. Não é uma restrição do banco, é física — uma
 * fibra fundida a duas seria duas fibras.
 *
 * Isto estava dentro do `createViaAssociation`, como quatro SELECT seguidos de
 * um INSERT, e tinha dois defeitos:
 *
 *   1. Os quatro SELECT comparavam apenas o ID, sem o tipo. Como `ceo_vias` e
 *      `ceo_splitter_vias` são numerações independentes que se sobrepõem, a
 *      via 7 de um tubo e a via 7 de um splitter contavam como a mesma. O
 *      sistema recusava fusões perfeitamente válidas, dizendo que a via já
 *      estava ocupada quando estava livre.
 *
 *   2. Sem transação, duas chamadas simultâneas passavam as duas na validação
 *      e inseriam as duas.
 *
 * A regra vive aqui, fora do banco, porque é a parte que se pode testar. O
 * `db.ts` fica com o que só o banco sabe fazer: ler dentro de uma transação e
 * escrever atomicamente.
 */

export interface LigacaoExistente {
  id: number;
  sourceType: string;
  sourceViaId: number;
  targetType: string;
  targetViaId: number;
}

/**
 * Onde vive a caixa. Muda a leitura do `sourceType`/`targetType` gravado.
 *
 * No CEO, `type='splitter'` significa que o id aponta para `ceo_splitter_vias`
 * -- outro espaço de numeração. Na CTO significa apenas que aquele tubo é um
 * splitter: o id continua a apontar para `cto_vias`, o mesmo espaço de todas as
 * outras. Tratar os dois casos igual foi o que fez as fusões da CTO sumirem do
 * diagrama, e é o que faria esta validação recusar errado.
 */
export type FamiliaCaixa = "ceo" | "cto";

function normalizar(l: LigacaoExistente, familia: FamiliaCaixa): [OpticalEndpoint, OpticalEndpoint] {
  if (familia === "cto") {
    return [
      { tipo: "ctoVia", id: l.sourceViaId },
      { tipo: "ctoVia", id: l.targetViaId },
    ];
  }
  return [
    { tipo: l.sourceType === "splitter" ? "ceoSplitterVia" : "ceoVia", id: l.sourceViaId },
    { tipo: l.targetType === "splitter" ? "ceoSplitterVia" : "ceoVia", id: l.targetViaId },
  ];
}

/**
 * Esta via já está ligada a alguma coisa?
 *
 * Compara o par (tipo, id). Comparar só o id é exactamente o defeito que
 * esta função corrige.
 */
export function jaTemLigacao(
  existentes: LigacaoExistente[],
  ponto: OpticalEndpoint,
  familia: FamiliaCaixa = "ceo",
): LigacaoExistente | null {
  for (const l of existentes) {
    const [a, b] = normalizar(l, familia);
    if (mesmoEndpoint(a, ponto) || mesmoEndpoint(b, ponto)) return l;
  }
  return null;
}

export type ResultadoValidacao =
  /** O par já existe tal e qual. Devolver o id que já lá está, sem inserir. */
  | { tipo: "jaExiste"; id: number }
  /** Pode inserir. */
  | { tipo: "ok" }
  /** Não pode, e a razão é para mostrar ao utilizador. */
  | { tipo: "recusado"; motivo: string; ocupadaPor?: number };

/**
 * Pode ligar A a B, dadas as ligações que já existem nesta caixa?
 *
 * `existentes` são as ligações da MESMA caixa — quem chama filtra por `ceoId`
 * antes. Passar as de outra caixa daria recusas fantasma.
 */
export function validarNovaLigacao(
  existentes: LigacaoExistente[],
  a: OpticalEndpoint,
  b: OpticalEndpoint,
  familia: FamiliaCaixa = "ceo",
): ResultadoValidacao {
  if (mesmoEndpoint(a, b)) {
    return { tipo: "recusado", motivo: "Uma via não se liga a si própria." };
  }
  if (!podeLigar(a, b)) {
    return {
      tipo: "recusado",
      motivo: "Estas duas pontas não vivem na mesma caixa — o que as ligaria é um cabo.",
    };
  }

  // O par exacto já existe? Então isto é uma repetição do mesmo pedido, e a
  // resposta certa é o id que já lá está — não um erro.
  const alvo = chaveLigacao(a, b);
  for (const l of existentes) {
    const [x, y] = normalizar(l, familia);
    if (chaveLigacao(x, y) === alvo) return { tipo: "jaExiste", id: l.id };
  }

  const ocupadaA = jaTemLigacao(existentes, a, familia);
  if (ocupadaA) {
    return {
      tipo: "recusado",
      motivo: `A via ${chaveEndpoint(a)} já está fundida. Desfaça a fusão antes de criar outra.`,
      ocupadaPor: ocupadaA.id,
    };
  }
  const ocupadaB = jaTemLigacao(existentes, b, familia);
  if (ocupadaB) {
    return {
      tipo: "recusado",
      motivo: `A via ${chaveEndpoint(b)} já está fundida. Desfaça a fusão antes de criar outra.`,
      ocupadaPor: ocupadaB.id,
    };
  }

  return { tipo: "ok" };
}

/**
 * A mesma regra, para a fusão gravada nas COLUNAS (`ceo_vias.fusedTo*`).
 *
 * Este caminho -- o das fusões tubo↔tubo, que são 100% das que existem em
 * produção -- nunca passou por validação nenhuma. Escrevia por cima. Com A já
 * fundida a C, fundir A com B deixava C a apontar para A sem que A apontasse
 * de volta: uma fusão meio aberta criada em uso normal.
 *
 * Encontrado a 28/08/2026, pelo roteiro manual, depois de 309 testes verdes.
 * Nenhum teste automático o teria apanhado — o defeito estava no que o código
 * não fazia.
 */
export interface EstadoVia {
  id: number;
  viaNumber: number;
  ceoId: number;
  fusedToViaId?: number | null;
  fusedToSplitterViaId?: number | null;
}

function viaOcupada(v: EstadoVia): boolean {
  return v.fusedToViaId != null || v.fusedToSplitterViaId != null;
}

export function validarFusaoDirecta(origem: EstadoVia, destino: EstadoVia): ResultadoValidacao {
  if (origem.id === destino.id) {
    return { tipo: "recusado", motivo: "Uma via não se funde a si própria." };
  }
  if (origem.ceoId !== destino.ceoId) {
    return { tipo: "recusado", motivo: "As duas vias não estão na mesma CEO." };
  }

  // Refazer a MESMA fusão é idempotente, não um erro.
  if (origem.fusedToViaId === destino.id && destino.fusedToViaId === origem.id) {
    return { tipo: "jaExiste", id: origem.id };
  }

  if (viaOcupada(origem) && origem.fusedToViaId !== destino.id) {
    return {
      tipo: "recusado",
      motivo: `A via ${origem.viaNumber} já está fundida. Desfaça a fusão antes de criar outra.`,
    };
  }
  if (viaOcupada(destino) && destino.fusedToViaId !== origem.id) {
    return {
      tipo: "recusado",
      motivo: `A via ${destino.viaNumber} já está fundida. Desfaça a fusão antes de criar outra.`,
    };
  }
  return { tipo: "ok" };
}

/**
 * Que ligações desaparecem ao apagar um tubo ou um splitter.
 *
 * O `deleteCeoSplitter` apagava as associações filtrando só pelo `ceoId`, e
 * levava a CEO inteira. A primeira correcção que escrevi filtrava só pelo id,
 * e levaria a ligação de uma via de tubo com o mesmo número. É preciso o par
 * (tipo, id) — excepto na CTO, onde o splitter é um tubo e o id é o id.
 *
 * Ver `rastreio-optico.md` no projecto para os números medidos.
 */
export function ligacoesQueTocamAsVias(
  existentes: LigacaoExistente[],
  tipoDoLado: "tube" | "splitter",
  idsDasVias: number[],
  familia: FamiliaCaixa = "ceo",
): LigacaoExistente[] {
  if (idsDasVias.length === 0) return [];
  const alvo = new Set(idsDasVias);
  const ladoDe = (t: string) => (t === "splitter" ? "splitter" : "tube");
  return existentes.filter(l =>
    familia === "cto"
      ? alvo.has(l.sourceViaId) || alvo.has(l.targetViaId)
      : (ladoDe(l.sourceType) === tipoDoLado && alvo.has(l.sourceViaId))
        || (ladoDe(l.targetType) === tipoDoLado && alvo.has(l.targetViaId)));
}
