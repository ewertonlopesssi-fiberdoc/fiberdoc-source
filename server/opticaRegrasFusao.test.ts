import { describe, it, expect } from "vitest";
import {
  jaTemLigacao, validarNovaLigacao, validarFusaoDirecta,
  type LigacaoExistente, type EstadoVia,
} from "@shared/optica/regrasFusao";

const tubo = (id: number) => ({ tipo: "ceoVia" as const, id });
const spl = (id: number) => ({ tipo: "ceoSplitterVia" as const, id });

const lig = (
  id: number, st: string, sv: number, tt: string, tv: number,
): LigacaoExistente => ({ id, sourceType: st, sourceViaId: sv, targetType: tt, targetViaId: tv });

describe("regras de fusão", () => {
  describe("jaTemLigacao", () => {
    it("acha a via em qualquer das pontas", () => {
      const e = [lig(1, "tube", 10, "tube", 20)];
      expect(jaTemLigacao(e, tubo(10))?.id).toBe(1);
      expect(jaTemLigacao(e, tubo(20))?.id).toBe(1);
      expect(jaTemLigacao(e, tubo(30))).toBeNull();
    });

    it("NÃO confunde a via 7 de tubo com a via 7 de splitter", () => {
      // O defeito que esta função corrige. `ceo_vias` e `ceo_splitter_vias` são
      // numerações independentes: o id 7 existe nas duas e são vias diferentes.
      // O código antigo comparava só o id e recusava fundir a via de tubo.
      const e = [lig(1, "tube", 99, "splitter", 7)];
      expect(jaTemLigacao(e, spl(7))?.id).toBe(1);
      expect(jaTemLigacao(e, tubo(7))).toBeNull();
    });

    it("lista vazia não acha nada", () => {
      expect(jaTemLigacao([], tubo(1))).toBeNull();
    });
  });

  describe("validarNovaLigacao", () => {
    it("aceita duas vias livres", () => {
      expect(validarNovaLigacao([], tubo(1), tubo(2))).toEqual({ tipo: "ok" });
    });

    it("aceita tubo para splitter", () => {
      expect(validarNovaLigacao([], tubo(1), spl(1))).toEqual({ tipo: "ok" });
    });

    it("recusa uma via ligada a si própria", () => {
      const r = validarNovaLigacao([], tubo(1), tubo(1));
      expect(r.tipo).toBe("recusado");
    });

    it("recusa pontas de caixas diferentes", () => {
      const r = validarNovaLigacao([], tubo(1), { tipo: "ctoVia", id: 2 });
      expect(r.tipo).toBe("recusado");
      if (r.tipo === "recusado") expect(r.motivo).toContain("cabo");
    });

    it("o par exacto já existente devolve o id, não um erro", () => {
      // Repetir o mesmo pedido é idempotente. Devolver erro faria a interface
      // mostrar falha numa acção que já tinha resultado.
      const e = [lig(42, "tube", 10, "tube", 20)];
      expect(validarNovaLigacao(e, tubo(10), tubo(20))).toEqual({ tipo: "jaExiste", id: 42 });
    });

    it("reconhece o par mesmo gravado ao contrário", () => {
      const e = [lig(42, "tube", 20, "tube", 10)];
      expect(validarNovaLigacao(e, tubo(10), tubo(20))).toEqual({ tipo: "jaExiste", id: 42 });
    });

    it("recusa quando a primeira via já está fundida com outra", () => {
      const e = [lig(1, "tube", 10, "tube", 99)];
      const r = validarNovaLigacao(e, tubo(10), tubo(20));
      expect(r.tipo).toBe("recusado");
      if (r.tipo === "recusado") expect(r.ocupadaPor).toBe(1);
    });

    it("recusa quando a segunda via já está fundida com outra", () => {
      const e = [lig(1, "tube", 99, "tube", 20)];
      const r = validarNovaLigacao(e, tubo(10), tubo(20));
      expect(r.tipo).toBe("recusado");
      if (r.tipo === "recusado") expect(r.ocupadaPor).toBe(1);
    });

    it("ACEITA a via de tubo quando quem está ocupada é a via de splitter do mesmo id", () => {
      // O caso concreto do defeito em produção: existe uma fusão para a via 7
      // de um splitter, e o utilizador tenta fundir a via 7 de um tubo. Ela
      // está livre. O código antigo recusava.
      const e = [lig(1, "tube", 99, "splitter", 7)];
      expect(validarNovaLigacao(e, tubo(7), tubo(8))).toEqual({ tipo: "ok" });
    });

    it("continua a recusar quando é mesmo a mesma via de splitter", () => {
      const e = [lig(1, "tube", 99, "splitter", 7)];
      const r = validarNovaLigacao(e, tubo(8), spl(7));
      expect(r.tipo).toBe("recusado");
    });

    it("na CTO, type='splitter' NÃO muda de espaço de ids", () => {
      // Na CTO o splitter é um tubo: as suas vias vivem em cto_vias, o mesmo
      // espaço das outras. Aqui a via 7 é MESMO a via 7, e tem de recusar.
      const cto = (id: number) => ({ tipo: "ctoVia" as const, id });
      const e = [lig(1, "tube", 99, "splitter", 7)];
      expect(validarNovaLigacao(e, cto(7), cto(8), "cto").tipo).toBe("recusado");
    });

    it("na CTO aceita normalmente uma via livre", () => {
      const cto = (id: number) => ({ tipo: "ctoVia" as const, id });
      const e = [lig(1, "tube", 99, "splitter", 7)];
      expect(validarNovaLigacao(e, cto(10), cto(11), "cto")).toEqual({ tipo: "ok" });
    });

    it("uma via com uma fusão continua a ter uma só, por muitas que tentem", () => {
      let existentes = [lig(1, "tube", 10, "tube", 20)];
      for (const alvo of [30, 40, 50]) {
        expect(validarNovaLigacao(existentes, tubo(10), tubo(alvo)).tipo).toBe("recusado");
      }
      expect(existentes).toHaveLength(1);
    });
  });

  describe("validarFusaoDirecta — o caminho das colunas, que nunca validou", () => {
    const via = (id: number, extra: Partial<EstadoVia> = {}): EstadoVia =>
      ({ id, viaNumber: id, ceoId: 1, ...extra });

    it("aceita duas vias livres", () => {
      expect(validarFusaoDirecta(via(10), via(20))).toEqual({ tipo: "ok" });
    });

    it("RECUSA fundir uma via que já está fundida com outra", () => {
      // O defeito encontrado a 28/08/2026 no roteiro manual: isto era aceite,
      // escrevia por cima, e deixava o parceiro antigo a apontar para o nada.
      const r = validarFusaoDirecta(via(10, { fusedToViaId: 99 }), via(20));
      expect(r.tipo).toBe("recusado");
      if (r.tipo === "recusado") expect(r.motivo).toContain("já está fundida");
    });

    it("recusa quando é o DESTINO que já está fundido", () => {
      expect(validarFusaoDirecta(via(10), via(20, { fusedToViaId: 99 })).tipo).toBe("recusado");
    });

    it("recusa uma via que está fundida a um splitter", () => {
      // Ocupada é ocupada, venha a fusão de que coluna vier.
      expect(validarFusaoDirecta(via(10, { fusedToSplitterViaId: 3 }), via(20)).tipo).toBe("recusado");
    });

    it("refazer a MESMA fusão é idempotente, não erro", () => {
      const a = via(10, { fusedToViaId: 20 });
      const b = via(20, { fusedToViaId: 10 });
      expect(validarFusaoDirecta(a, b).tipo).toBe("jaExiste");
    });

    it("uma fusão meio aberta NÃO conta como já existente", () => {
      // A aponta para B mas B não aponta de volta. Reescrever isto tem de ser
      // permitido: é assim que se repara o estrago que o defeito deixou.
      const a = via(10, { fusedToViaId: 20 });
      const b = via(20);
      expect(validarFusaoDirecta(a, b)).toEqual({ tipo: "ok" });
    });

    it("recusa uma via ligada a si própria", () => {
      expect(validarFusaoDirecta(via(10), via(10)).tipo).toBe("recusado");
    });

    it("recusa vias de CEOs diferentes", () => {
      const r = validarFusaoDirecta(via(10), { id: 20, viaNumber: 20, ceoId: 2 });
      expect(r.tipo).toBe("recusado");
      if (r.tipo === "recusado") expect(r.motivo).toContain("mesma CEO");
    });
  });
});
