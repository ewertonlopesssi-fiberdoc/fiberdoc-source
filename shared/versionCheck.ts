/**
 * Comparação entre o build que a aba carregou e o que o servidor serve agora.
 *
 * Motivo de existir: a falha que mais custa tempo aqui não está no código —
 * é a aba que ficou aberta durante um deploy. O bundle em memória continua
 * sendo o antigo, o servidor já é outro, e o que a pessoa vê é um erro que
 * parece bug de programação. Foi exatamente o que aconteceu na v5.96.55, e
 * levou horas de investigação até a recarga da página resolver sozinha.
 *
 * A regra é conservadora de propósito: na dúvida, não incomoda. Só avisa
 * quando os dois lados são conhecidos e realmente diferentes.
 */

/** Valor usado quando o build não carimbou versão (dev, por exemplo). */
export const VERSAO_DESCONHECIDA = "desconhecida";

function limpa(v: string | null | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Devolve true quando vale a pena pedir recarga ao usuário.
 *
 * Compara por igualdade textual, não por ordem semântica: um rollback para
 * uma versão anterior também precisa de recarga, porque o bundle da aba
 * deixou de existir no servidor do mesmo jeito.
 */
export function precisaRecarregar(
  local: string | null | undefined,
  remoto: string | null | undefined
): boolean {
  const a = limpa(local);
  const b = limpa(remoto);
  if (!a || !b) return false;
  if (a === VERSAO_DESCONHECIDA || b === VERSAO_DESCONHECIDA) return false;
  return a !== b;
}
