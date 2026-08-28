/**
 * Splitters desbalanceados: quem é a Saída 1, e quanto perde cada porta.
 *
 * Um splitter desbalanceado não divide a luz ao meio. Um 90/10 manda 90% por
 * uma porta e 10% pela outra, e as perdas são muito diferentes: 0,5 dB numa e
 * 10 dB na outra. Isso quer dizer que a perda NÃO se pode deduzir só da relação
 * -- depende de qual das saídas se está a olhar. É por isso que
 * `ceo_splitter_vias.lossDb` existe e não é redundante com a tabela de
 * `perdas.ts`: para os balanceados é, para estes não.
 *
 * Havia duas implementações disto no `db.ts`, com convenções INVERTIDAS uma da
 * outra. Medido a 28/08/2026, correndo as duas lado a lado:
 *
 *     1:2_90/10   criação (db.ts:3054)   via1=0.5   via2=10
 *     1:2_90/10   rastreio (db.ts:4008)  via1=10    via2=0.46
 *
 * 9,5 dB de diferença em cada porta, com as portas trocadas. O mesmo splitter,
 * a mesma via, duas respostas conforme quem perguntava. Nenhuma das duas era
 * "a certa" por si: qual das saídas é a de 90% é convenção de cadastro, não
 * física. A física diz apenas que a porta de p% perde -10·log10(p/100).
 *
 * A CONVENÇÃO, decidida pelo Ewerton a 28/08/2026:
 *
 *     Saída 1 = maior percentagem = MENOR perda
 *     Saída 2 = menor percentagem = MAIOR perda
 *
 * É a que a criação já usava, portanto os dados gravados ficam válidos e quem
 * muda é o rastreio. E como a escolha em campo é feita "pela referência da
 * percentagem", o rótulo da via passa a dizê-la: "Saída 1 (90%)". A convenção
 * deixa de viver em dois comentários que se contradiziam e passa a estar
 * escrita na própria linha que o utilizador lê.
 */

/** As relações oferecidas no cadastro. Uma lista só, para o CEO e para a CTO. */
export const RATIOS_DESBALANCEADOS = [
  "1:2_99/1",
  "1:2_95/5",
  "1:2_90/10",
  "1:2_80/20",
  "1:2_70/30",
  "1:2_60/40",
  "1:2_50/50",
] as const;

/**
 * Lê as duas percentagens de um rótulo, já ordenadas [maior, menor].
 *
 * Aceita o que está gravado (`1:2_90/10`) e o que alguém escreveu no nome
 * (`S/P 5/95`, `SPLINTER 90/10`). Devolve null se não for desbalanceado.
 *
 * As duas condições são o que separa "90/10" de "1/8":
 *   - as duas percentagens somam ~100 (uma divisão reparte a luz toda);
 *   - nenhuma é zero.
 *
 * O código antigo exigia também que a MENOR fosse > 1, e isso fazia um `1/99`
 * -- que existe na rede da topnet -- não ser reconhecido de todo.
 */
export function percentagensDoRatio(rotulo: string | null | undefined): [number, number] | null {
  if (!rotulo) return null;
  const m = rotulo.match(/(\d+)\s*\/\s*(\d+)/);
  if (!m) return null;
  const a = parseInt(m[1], 10);
  const b = parseInt(m[2], 10);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (a < 1 || b < 1) return null;
  if (Math.abs(a + b - 100) > 5) return null;
  return [Math.max(a, b), Math.min(a, b)];
}

/**
 * Perda de uma porta que leva `pct` por cento da luz.
 *
 * Uma casa decimal. As duas implementações antigas discordavam também aqui
 * (uma arredondava a 1, a outra a 2), e todos os valores já gravados em
 * produção têm uma casa. 0,04 dB está muito abaixo do que qualquer OTDR
 * distingue; ter os dados todos no mesmo formato vale mais.
 */
export function perdaDaPercentagem(pct: number): number {
  return parseFloat((-10 * Math.log10(pct / 100)).toFixed(1));
}

export interface SaidaDesbalanceada {
  viaNumber: number;
  pct: number;
  db: number;
  rotulo: string;
}

export interface SplitterDesbalanceado {
  entradaDb: number;
  saidas: SaidaDesbalanceada[];
}

/**
 * As saídas de um splitter desbalanceado, na ordem da convenção:
 * a Saída 1 é a de maior percentagem e menor perda.
 */
export function perdasDesbalanceadas(rotulo: string | null | undefined): SplitterDesbalanceado | null {
  const pcts = percentagensDoRatio(rotulo);
  if (!pcts) return null;
  return {
    entradaDb: 0,
    saidas: pcts.map((pct, i) => ({
      viaNumber: i + 1,
      pct,
      db: perdaDaPercentagem(pct),
      rotulo: `Saída ${i + 1} (${pct}%)`,
    })),
  };
}

/**
 * Quanto perde ESTA saída. Devolve null se o rótulo não for desbalanceado --
 * quem chama usa isso para cair na tabela dos balanceados.
 *
 * `viaNumber` é o número da via como está gravado. A via 0 é a entrada e não
 * tem perda de divisão; qualquer número acima do que o splitter tem devolve
 * null em vez de inventar.
 */
export function perdaDaSaidaDesbalanceada(
  rotulo: string | null | undefined,
  viaNumber: number,
): number | null {
  const s = perdasDesbalanceadas(rotulo);
  if (!s) return null;
  const saida = s.saidas.find(x => x.viaNumber === viaNumber);
  return saida ? saida.db : null;
}
