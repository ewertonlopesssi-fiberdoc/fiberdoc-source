/**
 * Ciclo de vida de projeto de um elemento de rede.
 *
 * Não confundir com o campo `status` das mesmas tabelas, que é OPERACIONAL —
 * diz se o elemento está funcionando (active / inactive / maintenance). São
 * duas dimensões independentes: uma CTO pode estar `deployed` + `maintenance`
 * (existe em campo, com defeito) ou `planned` + `active` (ainda não existe,
 * mas nasce prevista para operar).
 *
 * Compartilhado entre servidor e cliente para que os dois falem a mesma língua.
 */

export const PROJECT_STATUSES = ["planned", "pending", "deployed", "certified"] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_DEFAULT: ProjectStatus = "deployed";

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planned: "Em projeto",
  pending: "Não implantado",
  deployed: "Implantado",
  certified: "Certificado",
};

/**
 * Cor de cada estado no mapa. A progressão vai do frio ao quente conforme o
 * elemento sai do papel e chega ao campo: violeta para o que só existe no
 * projeto, âmbar para o aprovado que aguarda execução, verde para implantado e
 * ciano para certificado.
 *
 * Deliberadamente distintas das cores de status operacional (verde/amarelo/
 * vermelho), para as duas informações não se confundirem no mesmo mapa.
 */
export const PROJECT_STATUS_COLOR: Record<ProjectStatus, string> = {
  planned: "#a855f7",
  pending: "#f59e0b",
  deployed: "#22c55e",
  certified: "#06b6d4",
};

/** Estados que contam como executado, para o cálculo de percentual implantado. */
export const PROJECT_STATUS_DONE: ProjectStatus[] = ["deployed", "certified"];

/**
 * Tipos de item que têm ciclo de vida de projeto.
 *
 * POIs e OLTs ficam de fora de propósito: não receberam a coluna na v22, e não
 * fazem sentido nesta conta. Um POI é uma anotação no mapa, e uma OLT não é
 * implantada por projeto de expansão — ela já está no PoP antes de o projeto
 * começar. Incluí-los só diluiria o percentual.
 *
 * A ordem é a de leitura no painel, não alfabética: primeiro o que a pessoa
 * conta primeiro num projeto FTTH.
 */
export const PROJECT_TIPOS = ["cto", "ceo", "cabo", "poste", "reserva"] as const;

export type ProjectTipo = (typeof PROJECT_TIPOS)[number];

/** Rótulo no plural, que é como aparece na contagem ("8/12 CTOs"). */
export const PROJECT_TIPO_LABEL: Record<ProjectTipo, string> = {
  cto: "CTOs",
  ceo: "CEOs",
  cabo: "cabos",
  poste: "postes",
  reserva: "reservas",
};

/** Converte um valor vindo do banco num ProjectStatus válido. */
export function normalizeProjectStatus(valor: unknown): ProjectStatus {
  return PROJECT_STATUSES.includes(valor as ProjectStatus)
    ? (valor as ProjectStatus)
    : PROJECT_STATUS_DEFAULT;
}

/**
 * Percentual implantado de um conjunto de elementos.
 * Devolve 0 para conjunto vazio — não 100, que sugeriria projeto concluído.
 */
export function percentualImplantado(estados: Array<string | null | undefined>): number {
  if (estados.length === 0) return 0;
  const feitos = estados.filter(e => PROJECT_STATUS_DONE.includes(normalizeProjectStatus(e))).length;
  return Math.round((feitos / estados.length) * 100);
}
