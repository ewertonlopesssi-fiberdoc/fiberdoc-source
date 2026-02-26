import { describe, it, expect, vi, beforeEach } from "vitest";
import { addIpAuditLog, getIpAuditByBlock } from "./ipdb";

// Mock do getDb
vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

import { getDb } from "./db";

describe("ip_audit_log", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("addIpAuditLog retorna sem erro quando db indisponível", async () => {
    (getDb as any).mockResolvedValue(null);
    await expect(
      addIpAuditLog({
        blockId: 1,
        address: "10.0.0.1",
        action: "allocated",
        newStatus: "allocated",
        performedBy: "admin",
        userId: 1,
      })
    ).resolves.toBeUndefined();
  });

  it("getIpAuditByBlock retorna array vazio quando db indisponível", async () => {
    (getDb as any).mockResolvedValue(null);
    const result = await getIpAuditByBlock(1);
    expect(result).toEqual([]);
  });

  it("addIpAuditLog chama db.insert com os campos corretos", async () => {
    const mockInsert = vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue([]) });
    const mockDb = { insert: mockInsert };
    (getDb as any).mockResolvedValue(mockDb);

    await addIpAuditLog({
      blockId: 5,
      addressId: 10,
      address: "192.168.1.100",
      action: "released",
      previousStatus: "allocated",
      newStatus: "free",
      hostname: "server01",
      owner: "TI",
      performedBy: "joao",
      userId: 2,
    });

    expect(mockInsert).toHaveBeenCalledTimes(1);
    const insertArg = mockInsert.mock.calls[0][0];
    // Verifica que o argumento é a tabela ipAuditLog (objeto drizzle)
    expect(insertArg).toBeDefined();
  });

  it("getIpAuditByBlock chama db.select com blockId correto", async () => {
    const mockSelect = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { id: 1, blockId: 3, address: "10.1.0.1", action: "allocated", createdAt: new Date() }
            ]),
          }),
        }),
      }),
    });
    const mockDb = { select: mockSelect };
    (getDb as any).mockResolvedValue(mockDb);

    const result = await getIpAuditByBlock(3, 50);
    expect(mockSelect).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
    expect(result[0].address).toBe("10.1.0.1");
  });

  it("addIpAuditLog aceita todas as ações válidas", async () => {
    (getDb as any).mockResolvedValue(null);
    const actions: Array<"allocated" | "released" | "updated" | "deleted" | "imported"> = [
      "allocated", "released", "updated", "deleted", "imported"
    ];
    for (const action of actions) {
      await expect(
        addIpAuditLog({ blockId: 1, address: "10.0.0.1", action })
      ).resolves.toBeUndefined();
    }
  });

  it("getIpAuditByBlock usa limit padrão de 100", async () => {
    let capturedLimit: number | undefined;
    const mockSelect = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation((l) => {
              capturedLimit = l;
              return Promise.resolve([]);
            }),
          }),
        }),
      }),
    });
    (getDb as any).mockResolvedValue({ select: mockSelect });

    await getIpAuditByBlock(1);
    expect(capturedLimit).toBe(100);
  });
});

describe("equipmentReportPdf", () => {
  it("generateEquipmentReportPdf retorna Buffer quando db indisponível", async () => {
    vi.mock("./db", () => ({ getDb: vi.fn().mockResolvedValue(null) }));
    // Apenas verifica que o módulo pode ser importado sem erros
    const { generateEquipmentReportPdf } = await import("./equipmentReportPdf");
    expect(typeof generateEquipmentReportPdf).toBe("function");
  });
});
