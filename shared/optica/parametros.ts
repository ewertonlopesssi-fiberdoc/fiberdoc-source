/**
 * Os parâmetros ópticos: atenuação da fibra, perda por fusão, perda por
 * conector, potência TX por omissão.
 *
 * Onde estavam antes, medido a 28/08/2026:
 *
 *   `map_olt_elements.fiberAttenuationDbPerKm` e `.fusionLossDb` — configuráveis
 *   por OLT, com ecrã para as editar (`OltMapComponents.tsx`). **Nunca lidas.**
 *   O único ramo que as lê exige `foundOlt`, e `foundOlt` só é atribuído quando
 *   existe uma linha em `olt_port_fiber_links` (`db.ts:4484`) -- tabela com zero
 *   linhas nos seis bancos. As duas OLTs cadastradas têm tx = 7 dBm gravado por
 *   alguém que foi lá de propósito, e esse 7 não entra em conta nenhuma.
 *
 *   `0.35` e `0.1`, literais, nos outros dois ramos (`db.ts:4726`, `4750`).
 *   **Todos os balanços que funcionam hoje passam por um destes**, porque o
 *   ecrã chama `calculateOpticalBalanceFromDgo`, que por sua vez chama o
 *   balanço com `overrideTxPowerDbm`.
 *
 * Ou seja: o valor só existia como literal, e o sítio onde a interface deixava
 * mexer nele não era lido por ninguém. Passa a haver um valor global, e o
 * override por OLT continua a valer quando existir -- troços com fibra
 * diferente são reais, e a coluna já lá está.
 *
 * A perda por conector fica definida mas ainda NÃO é somada em lado nenhum. O
 * conector pertence a uma porta de saída concreta e só conta se existir mesmo
 * ali -- esse dado por porta não existe no modelo. Somá-lo por estimativa seria
 * inventar perda onde talvez não haja.
 */

export interface ParametrosOpticos {
  /** Atenuação da fibra, dB por km. */
  atenuacaoDbPorKm: number;
  /** Perda de cada fusão, dB. */
  perdaPorFusaoDb: number;
  /** Perda de cada conector, dB. Definido, ainda não somado -- ver acima. */
  perdaPorConectorDb: number;
  /** Potência TX usada quando o equipamento não tem nenhuma cadastrada, dBm. */
  potenciaTxPadraoDbm: number;
}

/**
 * Os valores por omissão são exactamente os literais que estavam no `db.ts`,
 * para que activar isto não mude nenhum número já apresentado. Quem quiser
 * outros põe-nos na configuração; quem não mexer fica onde estava.
 */
export const PARAMETROS_PADRAO: Readonly<ParametrosOpticos> = {
  atenuacaoDbPorKm: 0.35,
  perdaPorFusaoDb: 0.1,
  perdaPorConectorDb: 0.3,
  potenciaTxPadraoDbm: 5.0,
};

/** A chave em `app_settings`. */
export const CHAVE_PARAMETROS = "optica_parametros";

/**
 * Faixas plausíveis. Não são gosto: um valor fora daqui não é uma escolha, é um
 * erro de digitação, e o efeito no resultado é grande.
 *
 * O caso concreto que isto apanha: escrever `35` em vez de `0.35` faz cada km
 * custar 35 dB e transforma qualquer enlace num enlace morto. Escrever `0,35`
 * com vírgula não é JSON válido para um número e cai no mesmo sítio.
 */
export const LIMITES: Readonly<Record<keyof ParametrosOpticos, readonly [number, number]>> = {
  atenuacaoDbPorKm: [0.1, 1.0],
  perdaPorFusaoDb: [0, 1.0],
  perdaPorConectorDb: [0, 2.0],
  potenciaTxPadraoDbm: [-10, 20],
};

export interface LeituraParametros {
  valores: ParametrosOpticos;
  /** O que foi recusado e porquê. Vazio quando está tudo bem. */
  avisos: string[];
}

function dentroDosLimites(chave: keyof ParametrosOpticos, v: unknown): v is number {
  if (typeof v !== "number" || !Number.isFinite(v)) return false;
  const [min, max] = LIMITES[chave];
  return v >= min && v <= max;
}

/**
 * Lê o JSON guardado em `app_settings`. Nunca falha: o que não se entender
 * fica no valor por omissão e aparece em `avisos`.
 *
 * Recusar em silêncio seria repetir o defeito que encontrámos no
 * `contarPorGrupo` -- um `try/catch` que engolia o erro esperado engolia
 * também o inesperado, e três divergências de esquema viveram anos assim.
 */
export function lerParametros(json: string | null | undefined): LeituraParametros {
  const valores: ParametrosOpticos = { ...PARAMETROS_PADRAO };
  const avisos: string[] = [];

  if (json == null || json.trim() === "") return { valores, avisos };

  let bruto: unknown;
  try {
    bruto = JSON.parse(json);
  } catch {
    avisos.push("Parâmetros ópticos: configuração ilegível, a usar os valores por omissão.");
    return { valores, avisos };
  }
  if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) {
    avisos.push("Parâmetros ópticos: configuração ilegível, a usar os valores por omissão.");
    return { valores, avisos };
  }

  const obj = bruto as Record<string, unknown>;
  for (const chave of Object.keys(PARAMETROS_PADRAO) as (keyof ParametrosOpticos)[]) {
    if (!(chave in obj)) continue;
    const v = obj[chave];
    if (dentroDosLimites(chave, v)) {
      valores[chave] = v;
    } else {
      const [min, max] = LIMITES[chave];
      avisos.push(
        `Parâmetros ópticos: "${chave}" com valor ${JSON.stringify(v)} fora do intervalo ` +
        `[${min}, ${max}] — a usar ${PARAMETROS_PADRAO[chave]}.`
      );
    }
  }
  return { valores, avisos };
}

/**
 * O valor a usar, dada a configuração global e o que a OLT tiver.
 *
 * A OLT ganha quando tem valor próprio: são troços de fibra diferentes e a
 * coluna existe para isso. Quando não tem, vale o global.
 */
export function resolverParametro(
  global: number,
  daOlt: number | null | undefined,
  chave: keyof ParametrosOpticos,
): number {
  return dentroDosLimites(chave, daOlt) ? (daOlt as number) : global;
}
