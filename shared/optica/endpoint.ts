/**
 * Ponto conectável da topologia óptica, com identidade própria.
 *
 * O §3 da especificação pede que todo ponto ligável tenha um id. Ele já tem —
 * o que faltava era um nome comum. Hoje a identidade está espalhada por quatro
 * tabelas com espaços de ids independentes:
 *
 *   ceo_vias.id            uma fibra dentro de um tubo de CEO
 *   ceo_splitter_vias.id   uma porta de splitter de CEO (via 0 = entrada)
 *   cto_vias.id            uma fibra de CTO -- e também as portas do splitter
 *                          da CTO, porque lá o splitter É um tubo
 *   ports.id               uma porta física de equipamento (DIO, OLT/PON)
 *
 * Quatro espaços separados significa que o id 7 existe quatro vezes e são
 * quatro coisas diferentes. Por isso o par (tipo, id) é a identidade, e nunca
 * o id sozinho. Já apanhámos este erro em produção: a associação da CTO grava
 * `type='splitter'` mas o id aponta para `cto_vias`, e o cliente procurava a
 * âncora no espaço errado — a fusão desaparecia sem erro nenhum.
 *
 * Não há tabela nova aqui, e não vai haver. Isto é vocabulário partilhado
 * entre o servidor e o editor, não uma camada de persistência.
 */

export const TIPOS_ENDPOINT = [
  "ceoVia",
  "ceoSplitterVia",
  "ctoVia",
  "port",
] as const;

export type TipoEndpoint = (typeof TIPOS_ENDPOINT)[number];

export interface OpticalEndpoint {
  tipo: TipoEndpoint;
  id: number;
}

/**
 * Chave textual, para usar em Set, Map e atributos do SVG.
 *
 * O formato `tipo:id` é o mesmo que o `DiagramaOptico` já usa nas âncoras e o
 * `MapaBeta` na selecção — mudá-lo agora só criaria uma segunda convenção.
 */
export function chaveEndpoint(e: OpticalEndpoint): string {
  return `${e.tipo}:${e.id}`;
}

/** O inverso. Devolve null em vez de lançar: chaves vêm do DOM e da rede. */
export function lerChaveEndpoint(chave: string): OpticalEndpoint | null {
  const corte = chave.indexOf(":");
  if (corte <= 0) return null;
  const tipo = chave.slice(0, corte);
  const id = Number(chave.slice(corte + 1));
  if (!TIPOS_ENDPOINT.includes(tipo as TipoEndpoint)) return null;
  if (!Number.isInteger(id) || id <= 0) return null;
  return { tipo: tipo as TipoEndpoint, id };
}

export function mesmoEndpoint(a: OpticalEndpoint, b: OpticalEndpoint): boolean {
  return a.tipo === b.tipo && a.id === b.id;
}

/**
 * Chave de uma LIGAÇÃO, sem sentido: A—B e B—A dão a mesma string.
 *
 * Uma fibra liga a exactamente uma outra fibra, e a ligação não tem direcção
 * própria — o sentido do sinal vem da topologia, não de qual das pontas foi
 * gravada primeiro. Guardar as duas ordens como coisas diferentes foi
 * exactamente o que fez as fusões bidirecionais aparecerem a dobrar.
 */
export function chaveLigacao(a: OpticalEndpoint, b: OpticalEndpoint): string {
  const ka = chaveEndpoint(a);
  const kb = chaveEndpoint(b);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

/**
 * Onde é que este endpoint vive — CEO, CTO ou equipamento.
 *
 * Serve para escolher a tabela de associações certa sem espalhar `if` pelo
 * código. As portas de equipamento não têm caixa: elas SÃO o equipamento.
 */
export function familiaDoEndpoint(tipo: TipoEndpoint): "ceo" | "cto" | "equipamento" {
  switch (tipo) {
    case "ceoVia":
    case "ceoSplitterVia":
      return "ceo";
    case "ctoVia":
      return "cto";
    case "port":
      return "equipamento";
  }
}

/**
 * Uma ligação só existe entre endpoints da mesma caixa.
 *
 * Fibra de CEO não funde com fibra de CTO dentro de uma caixa: o que as liga é
 * um cabo, que é outra coisa. Esta é a validação mínima do §53 (snap), feita
 * onde pode ser testada sem DOM.
 */
export function podeLigar(a: OpticalEndpoint, b: OpticalEndpoint): boolean {
  if (mesmoEndpoint(a, b)) return false;
  return familiaDoEndpoint(a.tipo) === familiaDoEndpoint(b.tipo);
}
