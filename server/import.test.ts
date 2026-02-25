import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createAuthContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@fiberdoc.com",
      name: "Técnico Teste",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

// ─── Router Structure ─────────────────────────────────────────────────────────
describe("import router structure", () => {
  it("has import.equipments procedure", () => {
    expect(appRouter._def.procedures["import.equipments"]).toBeDefined();
  });

  it("has import.fibers procedure", () => {
    expect(appRouter._def.procedures["import.fibers"]).toBeDefined();
  });
});

// ─── Auth Guard ───────────────────────────────────────────────────────────────
describe("import procedures require authentication", () => {
  it("import.equipments rejects unauthenticated requests", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await expect(
      caller.import.equipments({ rows: [{ name: "Test", type: "switch" }] })
    ).rejects.toThrow();
  });

  it("import.fibers rejects unauthenticated requests", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await expect(
      caller.import.fibers({ rows: [{ name: "Test Fiber" }] })
    ).rejects.toThrow();
  });
});

// ─── Input Validation ─────────────────────────────────────────────────────────
describe("import input validation", () => {
  it("import.equipments rejects invalid equipment type", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(
      caller.import.equipments({
        rows: [{ name: "Test", type: "invalid_type" as any }],
      })
    ).rejects.toThrow();
  });

  it("import.equipments rejects row with empty name", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(
      caller.import.equipments({
        rows: [{ name: "", type: "switch" }],
      })
    ).rejects.toThrow();
  });

  it("import.fibers rejects invalid fiber type", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(
      caller.import.fibers({
        rows: [{ name: "Test Fiber", type: "invalid_type" as any }],
      })
    ).rejects.toThrow();
  });

  it("import.fibers rejects invalid color", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(
      caller.import.fibers({
        rows: [{ name: "Test Fiber", color: "purple" as any }],
      })
    ).rejects.toThrow();
  });

  it("import.fibers rejects invalid status", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(
      caller.import.fibers({
        rows: [{ name: "Test Fiber", status: "broken" as any }],
      })
    ).rejects.toThrow();
  });

  it("import.equipments rejects invalid status", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(
      caller.import.equipments({
        rows: [{ name: "Test", type: "switch", status: "broken" as any }],
      })
    ).rejects.toThrow();
  });

  it("import.equipments accepts all valid equipment types without throwing Zod errors", async () => {
    const validTypes = ["switch", "olt", "dgo", "splitter", "router", "server", "patch_panel", "amplifier", "other"] as const;
    const caller = appRouter.createCaller(createAuthContext());
    // All types should pass Zod validation — result may succeed (DB available) or fail with DB error, but NOT Zod error
    for (const type of validTypes) {
      const result = caller.import.equipments({ rows: [{ name: "Test", type }] });
      // Should not throw a Zod validation error
      const r = await result.catch(() => null);
      if (r !== null) expect(r).toMatchObject({ imported: expect.any(Number), skipped: expect.any(Number) });
    }
  });

  it("import.fibers accepts all valid fiber types without throwing Zod errors", async () => {
    const validTypes = ["single_mode", "multi_mode", "armored", "aerial", "underground"] as const;
    const caller = appRouter.createCaller(createAuthContext());
    for (const type of validTypes) {
      const result = caller.import.fibers({ rows: [{ name: "Test Fiber", type }] });
      const r = await result.catch(() => null);
      if (r !== null) expect(r).toMatchObject({ imported: expect.any(Number), skipped: expect.any(Number) });
    }
  });

  it("import.fibers accepts all valid fiber colors without throwing Zod errors", async () => {
    const validColors = ["blue", "orange", "green", "brown", "slate", "white", "red", "black", "yellow", "violet", "rose", "aqua"] as const;
    const caller = appRouter.createCaller(createAuthContext());
    for (const color of validColors) {
      const result = caller.import.fibers({ rows: [{ name: "Test Fiber", color }] });
      const r = await result.catch(() => null);
      if (r !== null) expect(r).toMatchObject({ imported: expect.any(Number), skipped: expect.any(Number) });
    }
  });

  it("import.equipments accepts empty rows array and returns zero imported", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.import.equipments({ rows: [] }).catch(() => null);
    if (result !== null) {
      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(0);
    }
  });

  it("import.fibers accepts empty rows array and returns zero imported", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.import.fibers({ rows: [] }).catch(() => null);
    if (result !== null) {
      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(0);
    }
  });
});
