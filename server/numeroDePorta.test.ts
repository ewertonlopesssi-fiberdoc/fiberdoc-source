import { describe, it, expect } from "vitest";
import { mesmaPorta } from "@shared/numeroDePorta";

describe("número de porta", () => {
  describe("o zero à esquerda — o defeito de 28/08/2026", () => {
    it('"07" é a porta 7', () => {
      // `ports.portNumber` é varchar. No D.I.O do fiberdoc as portas estão
      // gravadas "01".."12", e o rastreio comparava com String(a) === String(b):
      // "07" === "7" dá falso. A porta 07 da BANDEJA A existe, chama-se A9-A7 e
      // está ligada à OLT HUAWEI VIANA (7 dBm). O rastreio não a via, caía nos
      // 5 dBm por omissão, e o balanço saía 2 dB abaixo do real.
      expect(mesmaPorta("07", 7)).toBe(true);
      expect(mesmaPorta("07", "7")).toBe(true);
    });

    it("as nove portas que ficavam invisíveis em cada bandeja", () => {
      // "10", "11" e "12" casavam por acaso — têm o mesmo texto dos dois lados.
      // "01" a "09" não, e são as que se usam primeiro.
      for (let n = 1; n <= 9; n++) {
        expect(mesmaPorta(`0${n}`, n), `porta 0${n}`).toBe(true);
      }
      for (const n of [10, 11, 12]) {
        expect(mesmaPorta(String(n), n)).toBe(true);
      }
    });

    it("zeros a mais também", () => {
      expect(mesmaPorta("0007", 7)).toBe(true);
    });

    it("espaços à volta não fazem porta diferente", () => {
      expect(mesmaPorta(" 7 ", 7)).toBe(true);
    });
  });

  describe("não juntar portas que são mesmo diferentes", () => {
    it("7 não é 8, nem 70, nem 10", () => {
      expect(mesmaPorta("07", 8)).toBe(false);
      expect(mesmaPorta("07", 70)).toBe(false);
      expect(mesmaPorta("1", 10)).toBe(false);
    });

    it("uma etiqueta com letra não vira número", () => {
      // Adivinhar que "A7" é a porta 7 seria inventar uma regra que o cadastro
      // não tem — e ligaria o balanço à porta errada, o que é pior que não ligar.
      expect(mesmaPorta("A7", 7)).toBe(false);
      expect(mesmaPorta("A7", "B7")).toBe(false);
    });
  });

  describe("etiquetas que não são números", () => {
    it("comparam-se por texto", () => {
      expect(mesmaPorta("A7", "A7")).toBe(true);
      expect(mesmaPorta("SFP-3", "SFP-3")).toBe(true);
    });

    it("a caixa das letras não conta", () => {
      expect(mesmaPorta("a7", "A7")).toBe(true);
    });
  });

  describe("ausência não casa com nada", () => {
    it("null, undefined e vazio", () => {
      expect(mesmaPorta(null, 7)).toBe(false);
      expect(mesmaPorta(undefined, 7)).toBe(false);
      expect(mesmaPorta(null, null)).toBe(false);
      expect(mesmaPorta("", "")).toBe(false);
      expect(mesmaPorta("", 7)).toBe(false);
      expect(mesmaPorta("   ", 7)).toBe(false);
    });
  });
});
