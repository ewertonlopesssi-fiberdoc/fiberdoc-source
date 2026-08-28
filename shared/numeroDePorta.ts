/**
 * Comparar números de porta.
 *
 * `ports.portNumber` é `varchar(32)`, não inteiro: guarda o que o instalador
 * escreveu. No D.I.O do fiberdoc as portas estão gravadas com zero à esquerda
 * -- `"01"`, `"02"`, ..., `"12"` -- e o rastreio comparava assim:
 *
 *     String(p.portNumber) === String(portNumber)      // "07" === "7" → false
 *
 * A porta 07 da BANDEJA A existe, chama-se `A9-A7` e está ligada à
 * `OLT HUAWEI VIANA` (7 dBm). O rastreio não a encontrava, caía no valor por
 * omissão de 5 dBm, e escrevia no ecrã que estava a usar a potência do
 * equipamento. Todos os balanços por aquele troço saíam **2 dB abaixo do real**.
 *
 * O alcance não era uma porta: `"10"`, `"11"` e `"12"` casavam, `"01"` a `"09"`
 * não. **Nove em cada doze portas de cada bandeja eram invisíveis** -- e são as
 * de número baixo, as que se usam primeiro. Medido a 28/08/2026.
 *
 * A comparação passa a ser pelo valor quando os dois lados são números, e por
 * texto quando não são -- porque `"A7"` e `"SFP-3"` também aparecem no cadastro
 * e aí o texto é a única identidade que existe.
 */

/** Só dígitos, com ou sem espaços à volta. */
function comoNumero(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  const t = String(v).trim();
  if (!/^\d+$/.test(t)) return null;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * As duas designações apontam para a mesma porta?
 *
 * `"07"` e `7` sim. `"A7"` e `"7"` não -- são etiquetas diferentes, e adivinhar
 * que `A7` é a porta 7 seria inventar uma regra que o cadastro não tem.
 */
export function mesmaPorta(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
): boolean {
  if (a == null || b == null) return false;

  const na = comoNumero(a);
  const nb = comoNumero(b);
  if (na !== null && nb !== null) return na === nb;

  // Um é número e o outro não: são etiquetas diferentes.
  if (na !== null || nb !== null) return false;

  const ta = String(a).trim();
  const tb = String(b).trim();
  if (ta === "" || tb === "") return false;
  return ta.localeCompare(tb, undefined, { sensitivity: "accent" }) === 0;
}
