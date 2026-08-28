import { describe, it, expect } from "vitest";
import {
  percentagensDoRatio, perdasDesbalanceadas, perdaDaSaidaDesbalanceada,
  perdaDaPercentagem, RATIOS_DESBALANCEADOS,
} from "@shared/optica/desbalanceado";

describe("splitter desbalanceado", () => {
  describe("a convenção — Ewerton, 28/08/2026", () => {
    it("Saída 1 é a de maior percentagem e MENOR perda", () => {
      // Havia duas implementações invertidas uma da outra. A criação gravava
      // 0,5 dB na via 1; o rastreio da CTO cobrava-lhe 10 dB. O mesmo splitter,
      // a mesma via, duas respostas conforme quem perguntava.
      expect(perdaDaSaidaDesbalanceada("1:2_90/10", 1)).toBe(0.5);
      expect(perdaDaSaidaDesbalanceada("1:2_90/10", 2)).toBe(10);
    });

    it("vale para toda a lista oferecida no cadastro", () => {
      for (const r of RATIOS_DESBALANCEADOS) {
        const s = perdasDesbalanceadas(r);
        expect(s, r).not.toBeNull();
        expect(s!.saidas[0].db, r).toBeLessThanOrEqual(s!.saidas[1].db);
      }
    });

    it("os valores já gravados em produção continuam a bater certo", () => {
      // ceo_splitter_vias em fiberdoc/topnet a 28/08/2026. Se um destes mudar,
      // os dados existentes deixaram de concordar com o código que os escreveu.
      expect(perdasDesbalanceadas("1:2_90/10")!.saidas.map(s => s.db)).toEqual([0.5, 10]);
      expect(perdasDesbalanceadas("1:2_80/20")!.saidas.map(s => s.db)).toEqual([1, 7]);
      expect(perdasDesbalanceadas("1:2_50/50")!.saidas.map(s => s.db)).toEqual([3, 3]);
    });

    it("o rótulo da via diz a percentagem", () => {
      // A escolha em campo é feita pela referência da percentagem. Um
      // "Saída 1" sozinho obriga a saber de cor qual é qual — e era
      // exactamente esse saber de cor que as duas implementações
      // contradiziam.
      expect(perdasDesbalanceadas("1:2_90/10")!.saidas.map(s => s.rotulo))
        .toEqual(["Saída 1 (90%)", "Saída 2 (10%)"]);
    });
  });

  describe("o 1/99 que o código antigo não reconhecia", () => {
    it("lê as percentagens de um 1/99", () => {
      // O antigo exigia que AMBAS fossem > 1, portanto devolvia null aqui e o
      // splitter caía no ramo dos balanceados. Existem três destes na topnet.
      expect(percentagensDoRatio("S/P 1/99")).toEqual([99, 1]);
    });

    it("a porta de derivação de um 1/99 perde 20 dB, não 10", () => {
      // Estavam gravados como 90/10: 10 dB na porta de 1%. Metade da perda
      // real, e para o lado optimista — um enlace inviável a parecer bom.
      expect(perdaDaSaidaDesbalanceada("1:2_99/1", 2)).toBe(20);
      expect(perdaDaSaidaDesbalanceada("1:2_95/5", 2)).toBe(13);
    });

    it("lê as percentagens escritas no nome, não só no ratio", () => {
      expect(percentagensDoRatio("SPLINTER 90/10")).toEqual([90, 10]);
      expect(percentagensDoRatio("S/P 5/95 DESBALANCIADO")).toEqual([95, 5]);
      expect(percentagensDoRatio("1:2_80/20")).toEqual([80, 20]);
    });
  });

  describe("o que NÃO é desbalanceado", () => {
    it("um splitter balanceado devolve null, em qualquer escrita", () => {
      // Se algum destes passasse a ser lido como desbalanceado, um 1:8 passava
      // a ter duas saídas em vez de oito.
      for (const r of ["1:2", "1:4", "1:8", "1/8", "1:16", "1/16", "1:32", "1:8 AC APC", "SPLITTER 1:16"]) {
        expect(percentagensDoRatio(r), r).toBeNull();
      }
    });

    it("duas percentagens que não somam ~100 não são uma divisão", () => {
      expect(percentagensDoRatio("30/30")).toBeNull();
      expect(percentagensDoRatio("10/10")).toBeNull();
    });

    it("uma percentagem a zero não é uma porta", () => {
      expect(percentagensDoRatio("0/100")).toBeNull();
    });

    it("lixo e vazio devolvem null em vez de inventar", () => {
      for (const lixo of ["", "abc", "splitter", null, undefined]) {
        expect(percentagensDoRatio(lixo)).toBeNull();
        expect(perdaDaSaidaDesbalanceada(lixo, 1)).toBeNull();
      }
    });
  });

  describe("perdaDaSaidaDesbalanceada", () => {
    it("a via 0 é a entrada e não tem perda de divisão", () => {
      expect(perdaDaSaidaDesbalanceada("1:2_90/10", 0)).toBeNull();
    });

    it("uma via que o splitter não tem devolve null, não um valor", () => {
      expect(perdaDaSaidaDesbalanceada("1:2_90/10", 3)).toBeNull();
      expect(perdaDaSaidaDesbalanceada("1:2_90/10", -1)).toBeNull();
    });
  });

  describe("perdaDaPercentagem", () => {
    it("é -10·log10(p/100), a uma casa", () => {
      expect(perdaDaPercentagem(100)).toBe(0);
      expect(perdaDaPercentagem(50)).toBe(3);
      expect(perdaDaPercentagem(10)).toBe(10);
      expect(perdaDaPercentagem(1)).toBe(20);
    });

    it("quanto menos luz a porta leva, mais ela perde", () => {
      const ps = [99, 90, 70, 50, 30, 10, 5, 1];
      const ds = ps.map(perdaDaPercentagem);
      for (let i = 1; i < ds.length; i++) expect(ds[i]).toBeGreaterThan(ds[i - 1]);
    });
  });
});
