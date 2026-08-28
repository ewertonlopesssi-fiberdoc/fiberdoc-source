import { describe, it, expect } from "vitest";
import { perdaDoSplitter, saidasDoSplitter, PERDA_SPLITTER_DB } from "@shared/optica/perdas";

describe("perda do splitter", () => {
  it("1:4 é 7,0 dB — a decisão do Ewerton, 28/08/2026", () => {
    // Havia duas tabelas: a da criação dizia 7,2 e a do balanço 7,0. O mesmo
    // componente dava contas diferentes conforme a caixa onde estava.
    expect(perdaDoSplitter("1:4")).toEqual({ db: 7.0, origem: "tabela" });
  });

  it("as relações usadas na rede estão todas na tabela", () => {
    for (const r of ["1:2", "1:4", "1:8", "1:16", "1:32", "1:64"]) {
      expect(perdaDoSplitter(r).origem).toBe("tabela");
    }
  });

  it("um 1:64 NÃO devolve a perda de um 1:2", () => {
    // O defeito: a tabela da criação não tinha 1:64 e caía em `?? 3.5`.
    // Como o balanço lê o lossDb gravado antes da constante, esse 3,5 vencia
    // os 20,5 reais — 17 dB de erro, que fazem um enlace inviável parecer bom.
    const r = perdaDoSplitter("1:64");
    expect(r.db).toBe(20.5);
    expect(r.db).not.toBe(3.5);
  });

  describe("normalização do rótulo, como aparece no cadastro", () => {
    it("aceita barra em vez de dois pontos", () => {
      expect(perdaDoSplitter("1/8").db).toBe(10.5);
    });

    it("aceita o nome comercial à volta", () => {
      // É assim que o rótulo aparece no canvas: "1:8 AC APC".
      expect(perdaDoSplitter("1:8 AC APC").db).toBe(10.5);
      expect(perdaDoSplitter("SPLITTER 1:16").db).toBe(13.5);
      expect(perdaDoSplitter("  1:32  ").db).toBe(17.0);
    });

    it("aceita só o denominador", () => {
      expect(perdaDoSplitter("8").db).toBe(10.5);
    });
  });

  describe("o que fazer com o que não se reconhece", () => {
    it("calcula 10·log10(N) para uma relação fora da tabela, e diz que calculou", () => {
      // 1:128 não está na tabela. 10·log10(128) ≈ 21,1 dB.
      const r = perdaDoSplitter("1:128");
      expect(r.origem).toBe("calculada");
      expect(r.db).toBeCloseTo(21.1, 1);
    });

    it("devolve zero e marca desconhecida quando não há relação nenhuma", () => {
      // Antes devolvia 3,5 — a perda de um 1:2 — assumida em silêncio.
      for (const lixo of ["", "abc", "splitter", null, undefined]) {
        expect(perdaDoSplitter(lixo)).toEqual({ db: 0, origem: "desconhecida" });
      }
    });

    it("a perda calculada é sempre crescente com o número de saídas", () => {
      // Uma tabela ou fórmula que não respeite isto está errada por construção.
      const rs = [2, 4, 8, 16, 32, 64, 128, 256].map(n => perdaDoSplitter(`1:${n}`).db);
      for (let i = 1; i < rs.length; i++) expect(rs[i]).toBeGreaterThan(rs[i - 1]);
    });
  });

  describe("saidasDoSplitter", () => {
    it("lê o número de saídas dos mesmos formatos", () => {
      expect(saidasDoSplitter("1:8")).toBe(8);
      expect(saidasDoSplitter("1/16")).toBe(16);
      expect(saidasDoSplitter("1:8 AC APC")).toBe(8);
      expect(saidasDoSplitter("32")).toBe(32);
    });

    it("devolve null em vez de inventar", () => {
      for (const lixo of ["", "abc", "1:1", "1:0", null, undefined]) {
        expect(saidasDoSplitter(lixo)).toBeNull();
      }
    });

    it("concorda com a tabela de perdas", () => {
      // Se as duas lerem o rótulo de maneiras diferentes, um splitter nasce
      // com N saídas e a perda de outro. Foi por lerem de sítios diferentes
      // que as duas tabelas divergiram.
      for (const chave of Object.keys(PERDA_SPLITTER_DB)) {
        expect(saidasDoSplitter(chave)).toBe(Number(chave.split(":")[1]));
      }
    });
  });
});
