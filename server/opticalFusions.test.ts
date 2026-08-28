import { describe, it, expect } from "vitest";
import { unirFusoes } from "@shared/opticalFusions";

/**
 * As regras aqui são as que decidem se o diagrama mente ou não. Cada uma
 * corresponde a um caso que existe em produção — os números vieram da medição
 * de 28/08/2026, não de imaginação.
 */
describe("unirFusoes", () => {
  it("uma fusão bidirecional das colunas vira UMA aresta, não duas", () => {
    // Como setViaFusion grava: a linha de A aponta para B e a de B aponta para A.
    const r = unirFusoes([], [
      { id: 10, fusedToViaId: 20 },
      { id: 20, fusedToViaId: 10 },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].origem).toBe("coluna");
  });

  it("não repete uma fusão que já existe como associação", () => {
    const r = unirFusoes(
      [{ id: 5, sourceType: "tube", sourceViaId: 10, targetType: "tube", targetViaId: 20 }],
      [{ id: 10, fusedToViaId: 20 }, { id: 20, fusedToViaId: 10 }],
    );
    expect(r).toHaveLength(1);
    // A associação ganha: tem id real, e é ela que se pode apagar.
    expect(r[0].id).toBe(5);
    expect(r[0].origem).toBe("associacao");
  });

  it("deduplica mesmo com a associação gravada no sentido contrário", () => {
    const r = unirFusoes(
      [{ id: 5, sourceType: "tube", sourceViaId: 20, targetType: "tube", targetViaId: 10 }],
      [{ id: 10, fusedToViaId: 20 }],
    );
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe(5);
  });

  it("conta a fusão meio aberta — esconder metade repetiria o defeito", () => {
    // Sem transação, setViaFusion pode falhar no segundo UPDATE e deixar isto.
    const r = unirFusoes([], [{ id: 10, fusedToViaId: 20 }]);
    expect(r).toHaveLength(1);
    expect(r[0].sourceViaId).toBe(10);
    expect(r[0].targetViaId).toBe(20);
  });

  it("trata tubo→splitter, que vive noutra coluna e noutro espaço de ids", () => {
    const r = unirFusoes([], [{ id: 10, fusedToSplitterViaId: 7 }]);
    expect(r).toHaveLength(1);
    expect(r[0].targetType).toBe("splitter");
    expect(r[0].targetViaId).toBe(7);
  });

  it("não confunde via 7 de tubo com via 7 de splitter", () => {
    // A MESMA via apontando para o id 7 nos dois espaços. Estado possível:
    // não há transação, e setViaFusionToSplitter não limpa fusedToViaId.
    // Se a chave de deduplicação ignorasse o tipo, as duas arestas colidiriam
    // e uma desaparecia em silêncio. Provado com controlo negativo: retirar o
    // tipo da chave faz este teste falhar.
    const r = unirFusoes([], [{ id: 10, fusedToViaId: 7, fusedToSplitterViaId: 7 }]);
    expect(r).toHaveLength(2);
    expect(r.map(f => f.targetType).sort()).toEqual(["splitter", "tube"]);
  });

  it("dá id negativo ao que vem das colunas, e ids distintos entre si", () => {
    const r = unirFusoes([], [
      { id: 1, fusedToViaId: 2 },
      { id: 3, fusedToViaId: 4 },
      { id: 5, fusedToViaId: 6 },
    ]);
    expect(r).toHaveLength(3);
    expect(r.every(f => f.id < 0)).toBe(true);
    expect(new Set(r.map(f => f.id)).size).toBe(3);
  });

  it("ids negativos não colidem com ids de associação", () => {
    const r = unirFusoes(
      [{ id: 1, sourceType: "tube", sourceViaId: 100, targetType: "tube", targetViaId: 200 }],
      [{ id: 10, fusedToViaId: 20 }],
    );
    expect(new Set(r.map(f => f.id)).size).toBe(2);
    expect(r.find(f => f.origem === "coluna")!.id).toBeLessThan(0);
  });

  it("aguenta o caso real do banco principal: 264 assoc + 686 vias fundidas", () => {
    // 343 fusões bidirecionais, nenhuma coberta por associação — foi exactamente
    // o que a medição encontrou no banco `fiberdoc`.
    const vias: Array<{ id: number; fusedToViaId: number }> = [];
    for (let i = 0; i < 343; i++) {
      const a = 1000 + i * 2, b = a + 1;
      vias.push({ id: a, fusedToViaId: b }, { id: b, fusedToViaId: a });
    }
    const assoc = Array.from({ length: 264 }, (_, i) => ({
      id: i + 1,
      sourceType: "tube", sourceViaId: 500000 + i * 2,
      targetType: "splitter", targetViaId: 900000 + i,
    }));
    const r = unirFusoes(assoc, vias);
    expect(r).toHaveLength(264 + 343);
  });

  it("lista vazia dos dois lados devolve vazio, não rebenta", () => {
    expect(unirFusoes([], [])).toEqual([]);
  });

  it("ignora vias sem fusão nenhuma", () => {
    const r = unirFusoes([], [
      { id: 1, fusedToViaId: null },
      { id: 2 },
      { id: 3, fusedToViaId: undefined, fusedToSplitterViaId: null },
    ]);
    expect(r).toEqual([]);
  });
});
