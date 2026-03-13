/**
 * Testes para a função getRoutesOccupancy otimizada.
 * Usa vi.mock para substituir o pool MySQL e verificar que:
 * - A lógica de batch queries está correta
 * - O cálculo de pct está correto
 * - O número de queries é limitado (sem N+1)
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock do execute compartilhado
const mockExecute = vi.fn();

vi.mock("mysql2", () => ({
  default: {
    createPool: () => ({
      promise: () => ({ execute: mockExecute }),
      on: vi.fn(),
    }),
  },
  createPool: () => ({
    promise: () => ({ execute: mockExecute }),
    on: vi.fn(),
  }),
}));

// Importar após o mock
import { getRoutesOccupancy } from "./db";

describe("getRoutesOccupancy (batch otimizado)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DATABASE_URL = "mysql://test:test@localhost/test";
  });

  it("retorna array vazio quando não há rotas", async () => {
    // SELECT map_routes → sem linhas
    mockExecute.mockResolvedValueOnce([[], []]);

    const result = await getRoutesOccupancy();
    expect(result).toEqual([]);
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("calcula pct=0 para rota sem elemento vinculado", async () => {
    // map_routes: 1 rota sem fromElementId e sem fromTubeId
    mockExecute.mockResolvedValueOnce([[{ id: 1, fiberCount: 12, fromElementId: null, fromTubeId: null }], []]);
    // fromElementIds vazio → não chama map_elements
    // fallbackElementIds vazio → não chama mais nada

    const result = await getRoutesOccupancy();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ routeId: 1, fiberCount: 12, fusedCount: 0, pct: 0, tubeLabel: null });
    // Apenas 1 query (map_routes)
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("calcula pct correto para rota com fromTubeId CEO (50%)", async () => {
    // map_routes
    mockExecute.mockResolvedValueOnce([[{ id: 5, fiberCount: 12, fromElementId: 10, fromTubeId: 20 }], []]);
    // map_elements
    mockExecute.mockResolvedValueOnce([[{ id: 10, type: "ceo", referenceId: 100 }], []]);
    // ceo_tubes WHERE id IN (20)
    mockExecute.mockResolvedValueOnce([[{ id: 20, identifier: "TUBO 1", totalVias: 12 }], []]);
    // ceo_vias COUNT
    mockExecute.mockResolvedValueOnce([[{ tubeId: 20, cnt: 6 }], []]);

    const result = await getRoutesOccupancy();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      routeId: 5,
      fiberCount: 12,
      fusedCount: 6,
      pct: 50,
      tubeLabel: "TUBO 1",
    });
    // 4 queries: map_routes + map_elements + ceo_tubes + ceo_vias
    expect(mockExecute).toHaveBeenCalledTimes(4);
  });

  it("usa queries em batch para N rotas CEO (não N+1)", async () => {
    // 3 rotas com fromTubeId CEO distintos
    mockExecute.mockResolvedValueOnce([[
      { id: 1, fiberCount: 12, fromElementId: 10, fromTubeId: 20 },
      { id: 2, fiberCount: 12, fromElementId: 11, fromTubeId: 21 },
      { id: 3, fiberCount: 12, fromElementId: 12, fromTubeId: 22 },
    ], []]);
    // map_elements (1 query para todos)
    mockExecute.mockResolvedValueOnce([[
      { id: 10, type: "ceo", referenceId: 100 },
      { id: 11, type: "ceo", referenceId: 101 },
      { id: 12, type: "ceo", referenceId: 102 },
    ], []]);
    // ceo_tubes (1 query para todos)
    mockExecute.mockResolvedValueOnce([[
      { id: 20, identifier: "T1", totalVias: 12 },
      { id: 21, identifier: "T2", totalVias: 12 },
      { id: 22, identifier: "T3", totalVias: 12 },
    ], []]);
    // ceo_vias COUNT (1 query para todos)
    mockExecute.mockResolvedValueOnce([[
      { tubeId: 20, cnt: 3 },
      { tubeId: 21, cnt: 6 },
      { tubeId: 22, cnt: 12 },
    ], []]);

    const result = await getRoutesOccupancy();
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ routeId: 1, fusedCount: 3, pct: 25 });
    expect(result[1]).toMatchObject({ routeId: 2, fusedCount: 6, pct: 50 });
    expect(result[2]).toMatchObject({ routeId: 3, fusedCount: 12, pct: 100 });
    // Apenas 4 queries fixas independente do número de rotas (sem N+1)
    expect(mockExecute).toHaveBeenCalledTimes(4);
  });

  it("calcula pct=100 para rota saturada e limita a 100%", async () => {
    mockExecute.mockResolvedValueOnce([[{ id: 9, fiberCount: 8, fromElementId: 1, fromTubeId: 5 }], []]);
    mockExecute.mockResolvedValueOnce([[{ id: 1, type: "cto", referenceId: 50 }], []]);
    // cto_tubes
    mockExecute.mockResolvedValueOnce([[{ id: 5, identifier: "TUBO A", totalVias: 8 }], []]);
    // cto_vias COUNT (mais fusões que fibras → deve limitar a 100)
    mockExecute.mockResolvedValueOnce([[{ tubeId: 5, cnt: 10 }], []]);

    const result = await getRoutesOccupancy();
    expect(result[0]).toMatchObject({ routeId: 9, fusedCount: 10, pct: 100 });
  });
});
