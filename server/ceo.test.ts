import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock do db.ts para isolar os testes
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getCeos: vi.fn().mockResolvedValue([
      { id: 1, name: "CEO-01", location: "Poste 123", roomId: null, notes: null, status: "active", createdAt: new Date(), updatedAt: new Date() },
    ]),
    getCeoById: vi.fn().mockResolvedValue(
      { id: 1, name: "CEO-01", location: "Poste 123", roomId: null, notes: null, status: "active", createdAt: new Date(), updatedAt: new Date() }
    ),
    createCeo: vi.fn().mockResolvedValue(undefined),
    updateCeo: vi.fn().mockResolvedValue(undefined),
    deleteCeo: vi.fn().mockResolvedValue(undefined),
    getTubesByCeo: vi.fn().mockResolvedValue([
      { id: 1, ceoId: 1, type: "tube", identifier: "TUBO 1", totalVias: 12, color: "azul", notes: null, createdAt: new Date(), updatedAt: new Date() },
      { id: 2, ceoId: 1, type: "splitter", identifier: "SPLITTER 1*8", totalVias: 8, color: null, notes: null, createdAt: new Date(), updatedAt: new Date() },
    ]),
    createCeoTube: vi.fn().mockResolvedValue(1),
    updateCeoTube: vi.fn().mockResolvedValue(undefined),
    deleteCeoTube: vi.fn().mockResolvedValue(undefined),
    getViasByTube: vi.fn().mockResolvedValue([
      { id: 1, tubeId: 1, ceoId: 1, viaNumber: 1, label: null, fusedToViaId: null, fusedToTubeId: null, notes: null, createdAt: new Date(), updatedAt: new Date() },
      { id: 2, tubeId: 1, ceoId: 1, viaNumber: 2, label: null, fusedToViaId: 5, fusedToTubeId: 2, notes: null, createdAt: new Date(), updatedAt: new Date() },
    ]),
    getViasByCeo: vi.fn().mockResolvedValue([
      { id: 1, tubeId: 1, ceoId: 1, viaNumber: 1, label: null, fusedToViaId: null, fusedToTubeId: null, notes: null, createdAt: new Date(), updatedAt: new Date() },
      { id: 5, tubeId: 2, ceoId: 1, viaNumber: 1, label: null, fusedToViaId: null, fusedToTubeId: null, notes: null, createdAt: new Date(), updatedAt: new Date() },
    ]),
    setViaFusion: vi.fn().mockResolvedValue(undefined),
    clearViaFusion: vi.fn().mockResolvedValue(undefined),
    updateVia: vi.fn().mockResolvedValue(undefined),
  };
});

function makeCtx(): TrpcContext {
  return {
    user: {
      id: 1, openId: "test-user", name: "Test", email: "test@test.com",
      loginMethod: "manus", role: "admin",
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("ceos router", () => {
  it("lista CEOs", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.ceos.list({});
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toMatchObject({ name: "CEO-01" });
  });

  it("busca CEO por ID", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.ceos.byId({ id: 1 });
    expect(result).toMatchObject({ id: 1, name: "CEO-01" });
  });

  it("cria uma CEO", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.ceos.create({ name: "CEO-02", location: "Poste 456" })).resolves.not.toThrow();
  });

  it("atualiza uma CEO", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.ceos.update({ id: 1, name: "CEO-01 Atualizada" })).resolves.not.toThrow();
  });

  it("remove uma CEO", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.ceos.delete({ id: 1 })).resolves.not.toThrow();
  });
});

describe("ceoTubes router", () => {
  it("lista tubos de uma CEO", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.ceoTubes.byCeo({ ceoId: 1 });
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ identifier: "TUBO 1", type: "tube", totalVias: 12 });
    expect(result[1]).toMatchObject({ identifier: "SPLITTER 1*8", type: "splitter", totalVias: 8 });
  });

  it("cria um tubo com 12 vias", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.ceoTubes.create({
      ceoId: 1, type: "tube", identifier: "TUBO 2", totalVias: 12,
    });
    expect(result).toBe(1);
  });

  it("cria um splitter 1*8", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.ceoTubes.create({
      ceoId: 1, type: "splitter", identifier: "SPLITTER 1*8", totalVias: 8,
    });
    expect(result).toBe(1);
  });

  it("atualiza identificação do tubo", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.ceoTubes.update({ id: 1, identifier: "TUBO 1 — Azul" })).resolves.not.toThrow();
  });

  it("remove um tubo", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.ceoTubes.delete({ id: 1 })).resolves.not.toThrow();
  });
});

describe("ceoVias router", () => {
  it("lista vias de um tubo", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.ceoVias.byTube({ tubeId: 1 });
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toMatchObject({ viaNumber: 1, fusedToViaId: null });
    expect(result[1]).toMatchObject({ viaNumber: 2, fusedToViaId: 5 });
  });

  it("lista todas as vias de uma CEO", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.ceoVias.byCeo({ ceoId: 1 });
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
  });

  it("define uma fusão entre vias", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.ceoVias.setFusion({
      viaId: 1, fusedToTubeId: 2, fusedToViaId: 5,
    })).resolves.not.toThrow();
  });

  it("remove uma fusão", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.ceoVias.clearFusion({ viaId: 2 })).resolves.not.toThrow();
  });

  it("atualiza etiqueta de uma via", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.ceoVias.updateLabel({ id: 1, label: "Fibra 01" })).resolves.not.toThrow();
  });
});
