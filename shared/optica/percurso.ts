/**
 * O percurso do sinal: quanto perde cada passo, e quanta luz resta ali.
 *
 * A fita de badges do ecrã ("PERCURSO DO SINAL") mostrava só as perdas dos
 * splitters. Os passos de cabo eram criados com `lossDb: 0` -- levavam a
 * distância e não a perda -- e os passos de fusão nunca chegaram a existir:
 * `type: "fusion"` estava no tipo e não havia uma única ocorrência a ser
 * empurrada para o percurso.
 *
 * Visto no ecrã a 28/08/2026, numa CTO real: a fita acabava em **-16,0** e a
 * caixa ao lado dizia **-16,8 dBm**. A diferença, 0,8 dB, era exactamente
 * `Cabo 0,5 + Fusões 0,3`. Quem lesse a fita concluía que chegava mais luz do
 * que chega -- optimista, como todos os defeitos deste dia.
 *
 * Estas duas funções são puras de propósito: a parte que se pode testar sem
 * banco fica aqui, e o `db.ts` fica com o rastreio.
 */

import type { ParametrosOpticos } from "./parametros";

export interface PassoDoPercurso {
  type: "olt" | "cable" | "splitter" | "fusion" | "ceo" | "cto";
  label: string;
  lossDb: number;
  distKm?: number;
}

export interface PassoComPotencia extends PassoDoPercurso {
  cumulativePowerDbm: number;
}

/**
 * A perda deste passo.
 *
 * Cabo e fusão não a sabem quando são criados -- a atenuação por km e a perda
 * por fusão só ficam resolvidas no fim, depois de se saber se o percurso chegou
 * a uma OLT com valores próprios. São por isso empurrados com zero e o valor é
 * preenchido aqui, num sítio só.
 */
export function perdaDoPasso(
  passo: Pick<PassoDoPercurso, "type" | "lossDb" | "distKm">,
  p: Pick<ParametrosOpticos, "atenuacaoDbPorKm" | "perdaPorFusaoDb">,
): number {
  if (passo.type === "cable") {
    const km = passo.distKm;
    return Number.isFinite(km) && (km as number) > 0 ? (km as number) * p.atenuacaoDbPorKm : 0;
  }
  if (passo.type === "fusion") return p.perdaPorFusaoDb;
  return Number.isFinite(passo.lossDb) ? passo.lossDb : 0;
}

export interface PercursoAcumulado {
  passos: PassoComPotencia[];
  /** A soma das perdas de todos os passos. */
  perdaSomada: number;
  /** A potência no fim da fita. */
  potenciaFinalDbm: number;
}

/**
 * Percorre a fita do princípio ao fim, descontando cada perda.
 *
 * O que sai daqui tem de fechar com o cabeçalho: a `perdaSomada` é a mesma
 * `totalLossDb`, e a `potenciaFinalDbm` é a mesma `rxPowerDbm`. Quando não
 * fecha, é porque há troço contado no total que não deixou passo -- e isso é
 * para dizer, não para esconder.
 */
export function acumularPercurso(
  passos: PassoDoPercurso[],
  potenciaTxDbm: number,
  p: Pick<ParametrosOpticos, "atenuacaoDbPorKm" | "perdaPorFusaoDb">,
): PercursoAcumulado {
  let potencia = potenciaTxDbm;
  let perdaSomada = 0;
  const saida: PassoComPotencia[] = passos.map(passo => {
    const perda = perdaDoPasso(passo, p);
    perdaSomada += perda;
    potencia -= perda;
    return { ...passo, lossDb: perda, cumulativePowerDbm: potencia };
  });
  return { passos: saida, perdaSomada, potenciaFinalDbm: potencia };
}
