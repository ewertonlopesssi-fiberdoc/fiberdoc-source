import { describe, it, expect } from "vitest";
import { perdaDoPasso, acumularPercurso, type PassoDoPercurso } from "@shared/optica/percurso";

const P = { atenuacaoDbPorKm: 0.35, perdaPorFusaoDb: 0.1 };

/** O percurso que estava no ecrã a 28/08/2026, na CTO TESTE01. */
const fitaReal: PassoDoPercurso[] = [
  { type: "olt", label: "D.I.O — Porta 7", lossDb: 0 },
  { type: "cable", label: "cabo A", lossDb: 0, distKm: 1.479 },
  { type: "ceo", label: "CEO", lossDb: 0 },
  { type: "fusion", label: "Fusão", lossDb: 0 },
  { type: "splitter", label: "1:8", lossDb: 10.5 },
  { type: "fusion", label: "Fusão", lossDb: 0 },
  { type: "cable", label: "cabo B", lossDb: 0, distKm: 0.211 },
  { type: "fusion", label: "Fusão", lossDb: 0 },
  { type: "splitter", label: "1:8", lossDb: 10.5 },
  { type: "cto", label: "TESTE01", lossDb: 0 },
];

describe("percurso do sinal", () => {
  describe("a fita tem de fechar com a caixa", () => {
    it("a potência no fim do percurso é a potência RX", () => {
      // O defeito: a fita acabava em -16,0 e a caixa dizia -16,8 dBm. A
      // diferença, 0,8 dB, era exactamente Cabo 0,5 + Fusões 0,3 — passos que
      // existiam no total e não no percurso. Quem lia a fita concluía que
      // chegava mais luz do que chega.
      const r = acumularPercurso(fitaReal, 5.0, P);
      expect(r.potenciaFinalDbm).toBeCloseTo(5.0 - r.perdaSomada, 10);
    });

    it("soma cabo, fusões e splitters — não só os splitters", () => {
      const r = acumularPercurso(fitaReal, 5.0, P);
      expect(r.perdaSomada).toBeCloseTo(1.69 * 0.35 + 21.0 + 0.3, 9);
      // 21,0 seria só os splitters: o número que a fita dava antes.
      expect(r.perdaSomada).not.toBeCloseTo(21.0, 1);
    });

    it("a potência nunca sobe ao longo do percurso", () => {
      // Uma fibra não amplifica. Se algum passo somasse potência, seria sinal
      // de perda negativa vinda de dados corrompidos.
      const r = acumularPercurso(fitaReal, 5.0, P);
      for (let i = 1; i < r.passos.length; i++) {
        expect(r.passos[i].cumulativePowerDbm)
          .toBeLessThanOrEqual(r.passos[i - 1].cumulativePowerDbm);
      }
    });
  });

  describe("cada passo leva a perda que lhe pertence", () => {
    it("o cabo perde pela distância, não pelo lossDb gravado", () => {
      // Os passos de cabo eram criados com lossDb: 0 e a distância à parte.
      expect(perdaDoPasso({ type: "cable", lossDb: 0, distKm: 1 }, P)).toBeCloseTo(0.35, 10);
      expect(perdaDoPasso({ type: "cable", lossDb: 99, distKm: 1 }, P)).toBeCloseTo(0.35, 10);
    });

    it("a fusão perde o parâmetro configurado", () => {
      expect(perdaDoPasso({ type: "fusion", lossDb: 0 }, P)).toBe(0.1);
      expect(perdaDoPasso({ type: "fusion", lossDb: 99 }, P)).toBe(0.1);
    });

    it("o splitter mantém a perda que traz", () => {
      // Essa vem da tabela de perdas ou do lossDb da via — já foi resolvida.
      expect(perdaDoPasso({ type: "splitter", lossDb: 13.5 }, P)).toBe(13.5);
    });

    it("os nós que não perdem nada continuam a não perder", () => {
      for (const t of ["olt", "ceo", "cto"] as const) {
        expect(perdaDoPasso({ type: t, lossDb: 0 }, P)).toBe(0);
      }
    });

    it("respeita a atenuação configurada", () => {
      const r = acumularPercurso(
        [{ type: "cable", label: "c", lossDb: 0, distKm: 10 }], 0,
        { atenuacaoDbPorKm: 0.28, perdaPorFusaoDb: 0.1 },
      );
      expect(r.perdaSomada).toBeCloseTo(2.8, 9);
    });
  });

  describe("dados estragados não viram perdas absurdas", () => {
    it("cabo sem distância, com zero, ou negativa, não perde nada", () => {
      expect(perdaDoPasso({ type: "cable", lossDb: 0 }, P)).toBe(0);
      expect(perdaDoPasso({ type: "cable", lossDb: 0, distKm: 0 }, P)).toBe(0);
      expect(perdaDoPasso({ type: "cable", lossDb: 0, distKm: -5 }, P)).toBe(0);
    });

    it("NaN não se propaga até ao ecrã", () => {
      // Um path corrompido dava NaN, e o NaN chegava ao ecrã como "NaN dBm".
      expect(perdaDoPasso({ type: "cable", lossDb: 0, distKm: NaN }, P)).toBe(0);
      expect(perdaDoPasso({ type: "splitter", lossDb: NaN }, P)).toBe(0);
      const r = acumularPercurso(
        [{ type: "splitter", label: "?", lossDb: NaN }], 5, P);
      expect(Number.isFinite(r.potenciaFinalDbm)).toBe(true);
    });

    it("uma fita vazia devolve a potência de partida", () => {
      const r = acumularPercurso([], 5, P);
      expect(r.perdaSomada).toBe(0);
      expect(r.potenciaFinalDbm).toBe(5);
    });
  });

  it("não altera a lista que recebe", () => {
    // O `db.ts` usa a mesma lista para contar e para mostrar.
    const orig: PassoDoPercurso[] = [{ type: "cable", label: "c", lossDb: 0, distKm: 1 }];
    acumularPercurso(orig, 0, P);
    expect(orig[0].lossDb).toBe(0);
  });
});
