/**
 * Testes do ciclo de vida de projeto.
 *
 * Cobrem duas coisas distintas:
 *  - a aritmética pura de shared/projectStatus.ts, que não toca no banco;
 *  - as funções de db.ts, com o pool MySQL mockado, verificando a SQL emitida.
 *
 * O ponto mais sensível é o nome da tabela entrar na SQL por interpolação.
 * Ele vem de um mapa fechado no código, nunca da entrada do usuário, e há
 * teste explícito para isso não regredir.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  PROJECT_STATUSES,
  PROJECT_STATUS_DEFAULT,
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_COLOR,
  normalizeProjectStatus,
  percentualImplantado,
} from "../shared/projectStatus";

const mockExecute = vi.fn();

vi.mock("mysql2", () => ({
  default: {
    createPool: () => ({ promise: () => ({ execute: mockExecute }), on: vi.fn() }),
  },
  createPool: () => ({ promise: () => ({ execute: mockExecute }), on: vi.fn() }),
}));

import { setProjectStatus, setProjectStatusEmLote, getProjectStatusSummary } from "./db";

describe("shared/projectStatus — aritmética pura", () => {
  it("tem rótulo e cor para todos os estados", () => {
    for (const s of PROJECT_STATUSES) {
      expect(PROJECT_STATUS_LABEL[s]).toBeTruthy();
      expect(PROJECT_STATUS_COLOR[s]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("normaliza valor desconhecido para o padrão", () => {
    expect(normalizeProjectStatus("implantado")).toBe(PROJECT_STATUS_DEFAULT);
    expect(normalizeProjectStatus(null)).toBe(PROJECT_STATUS_DEFAULT);
    expect(normalizeProjectStatus(undefined)).toBe(PROJECT_STATUS_DEFAULT);
    expect(normalizeProjectStatus(42)).toBe(PROJECT_STATUS_DEFAULT);
  });

  it("preserva valor válido", () => {
    expect(normalizeProjectStatus("planned")).toBe("planned");
    expect(normalizeProjectStatus("certified")).toBe("certified");
  });

  it("conta deployed e certified como executados", () => {
    expect(percentualImplantado(["deployed", "certified"])).toBe(100);
    expect(percentualImplantado(["planned", "pending"])).toBe(0);
    expect(percentualImplantado(["deployed", "planned"])).toBe(50);
    expect(percentualImplantado(["deployed", "planned", "pending", "certified"])).toBe(50);
  });

  it("devolve 0 para conjunto vazio, não 100", () => {
    // 100 sugeriria projeto concluído; vazio significa que não há o que medir.
    expect(percentualImplantado([])).toBe(0);
  });

  it("arredonda o percentual", () => {
    expect(percentualImplantado(["deployed", "planned", "planned"])).toBe(33);
    expect(percentualImplantado(["deployed", "deployed", "planned"])).toBe(67);
  });

  it("trata valores nulos vindos do banco como o padrão", () => {
    // Linhas anteriores à migração podem vir com null.
    expect(percentualImplantado([null, undefined])).toBe(100);
  });
});

describe("db — setProjectStatus", () => {
  beforeEach(() => {
    mockExecute.mockReset();
    mockExecute.mockResolvedValue([{ affectedRows: 1 }]);
  });

  it("atualiza a tabela correta para cada tipo", async () => {
    const casos: Array<[any, string]> = [
      ["ceo", "ceos"],
      ["cto", "ctos"],
      ["cabo", "map_routes"],
      ["poste", "map_poles"],
      ["reserva", "map_technical_reserves"],
    ];
    for (const [tipo, tabela] of casos) {
      mockExecute.mockClear();
      await setProjectStatus(tipo, 7, "planned");
      const [sql, params] = mockExecute.mock.calls[0];
      expect(sql).toContain(`\`${tabela}\``);
      expect(sql).toContain("SET projectStatus = ?");
      expect(params).toEqual(["planned", 7]);
    }
  });

  it("passa status e id como parâmetros, nunca interpolados na SQL", async () => {
    await setProjectStatus("cto", 99, "certified");
    const [sql, params] = mockExecute.mock.calls[0];
    expect(sql).not.toContain("certified");
    expect(sql).not.toContain("99");
    expect(params).toEqual(["certified", 99]);
  });

  it("recusa tipo fora do mapa fechado", async () => {
    await expect(setProjectStatus("usuarios" as any, 1, "planned")).rejects.toThrow();
    expect(mockExecute).not.toHaveBeenCalled();
  });
});

describe("db — setProjectStatusEmLote", () => {
  beforeEach(() => {
    mockExecute.mockReset();
    mockExecute.mockResolvedValue([{ affectedRows: 3 }]);
  });

  it("gera um marcador por id e devolve o número de linhas alteradas", async () => {
    const alterados = await setProjectStatusEmLote("poste", [1, 2, 3], "deployed");
    const [sql, params] = mockExecute.mock.calls[0];
    expect(sql).toContain("IN (?,?,?)");
    expect(params).toEqual(["deployed", 1, 2, 3]);
    expect(alterados).toBe(3);
  });

  it("não consulta o banco com lista vazia", async () => {
    const alterados = await setProjectStatusEmLote("poste", [], "deployed");
    expect(alterados).toBe(0);
    expect(mockExecute).not.toHaveBeenCalled();
  });
});

describe("db — getProjectStatusSummary", () => {
  beforeEach(() => {
    mockExecute.mockReset();
    mockExecute.mockResolvedValue([[
      { projectStatus: "deployed", total: 10 },
      { projectStatus: "planned", total: 4 },
    ]]);
  });

  it("agrupa por estado para cada um dos cinco tipos", async () => {
    const resumo = await getProjectStatusSummary();
    expect(mockExecute).toHaveBeenCalledTimes(5);
    expect(Object.keys(resumo).sort()).toEqual(["cabo", "ceo", "cto", "poste", "reserva"]);
    expect(resumo.cto).toEqual({ deployed: 10, planned: 4 });
  });

  it("trata projectStatus nulo como o padrão", async () => {
    mockExecute.mockResolvedValue([[{ projectStatus: null, total: 5 }]]);
    const resumo = await getProjectStatusSummary();
    expect(resumo.ceo).toEqual({ deployed: 5 });
  });
});
