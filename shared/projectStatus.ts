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
