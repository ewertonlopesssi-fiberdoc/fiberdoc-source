import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock Context ─────────────────────────────────────────────────────────────
function createMockContext(role: "user" | "admin" = "user"): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user-openid",
      email: "test@fiberdoc.com",
      name: "Técnico Teste",
      loginMethod: "manus",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

// ─── Auth Tests ───────────────────────────────────────────────────────────────
describe("auth.logout", () => {
  it("clears session cookie and returns success", async () => {
    const clearedCookies: string[] = [];
    const ctx: TrpcContext = {
      ...createMockContext(),
      res: {
        clearCookie: (name: string) => { clearedCookies.push(name); },
      } as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
  });

  it("returns null user for unauthenticated request", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const user = await caller.auth.me();
    expect(user).toBeNull();
  });

  it("returns user object for authenticated request", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const user = await caller.auth.me();
    expect(user).not.toBeNull();
    expect(user?.email).toBe("test@fiberdoc.com");
    expect(user?.name).toBe("Técnico Teste");
  });
});

// ─── Router Structure Tests ───────────────────────────────────────────────────
describe("appRouter structure", () => {
  it("has rooms router", () => {
    expect(appRouter._def.procedures["rooms.list"]).toBeDefined();
    expect(appRouter._def.procedures["rooms.create"]).toBeDefined();
    expect(appRouter._def.procedures["rooms.update"]).toBeDefined();
    expect(appRouter._def.procedures["rooms.delete"]).toBeDefined();
  });

  it("has equipments router", () => {
    expect(appRouter._def.procedures["equipments.list"]).toBeDefined();
    expect(appRouter._def.procedures["equipments.create"]).toBeDefined();
    expect(appRouter._def.procedures["equipments.update"]).toBeDefined();
    expect(appRouter._def.procedures["equipments.delete"]).toBeDefined();
    expect(appRouter._def.procedures["equipments.byId"]).toBeDefined();
  });

  it("has fibers router", () => {
    expect(appRouter._def.procedures["fibers.list"]).toBeDefined();
    expect(appRouter._def.procedures["fibers.create"]).toBeDefined();
    expect(appRouter._def.procedures["fibers.update"]).toBeDefined();
    expect(appRouter._def.procedures["fibers.delete"]).toBeDefined();
  });

  it("has ports router", () => {
    expect(appRouter._def.procedures["ports.byEquipment"]).toBeDefined();
    expect(appRouter._def.procedures["ports.create"]).toBeDefined();
    expect(appRouter._def.procedures["ports.update"]).toBeDefined();
    expect(appRouter._def.procedures["ports.delete"]).toBeDefined();
    expect(appRouter._def.procedures["ports.bulkCreate"]).toBeDefined();
  });

  it("has connections router", () => {
    expect(appRouter._def.procedures["connections.list"]).toBeDefined();
    expect(appRouter._def.procedures["connections.create"]).toBeDefined();
    expect(appRouter._def.procedures["connections.update"]).toBeDefined();
    expect(appRouter._def.procedures["connections.delete"]).toBeDefined();
  });

  it("has history router", () => {
    expect(appRouter._def.procedures["history.list"]).toBeDefined();
    expect(appRouter._def.procedures["history.create"]).toBeDefined();
  });

  it("has dashboard router", () => {
    expect(appRouter._def.procedures["dashboard.stats"]).toBeDefined();
  });

  it("has topology router", () => {
    expect(appRouter._def.procedures["topology.data"]).toBeDefined();
  });
});

// ─── Protected Procedure Tests ────────────────────────────────────────────────
describe("protected procedures", () => {
  it("rooms.create requires authentication", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.rooms.create({ name: "Test Room" })
    ).rejects.toThrow();
  });

  it("equipments.create requires authentication", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.equipments.create({ name: "Test Equipment", type: "switch" })
    ).rejects.toThrow();
  });

  it("fibers.create requires authentication", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.fibers.create({ name: "Test Fiber" })
    ).rejects.toThrow();
  });

  it("connections.create requires authentication", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.connections.create({ sourcePortId: 1, targetPortId: 2 })
    ).rejects.toThrow();
  });

  it("history.create requires authentication", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.history.create({
        entityType: "equipment",
        entityId: 1,
        action: "maintenance",
        description: "Test maintenance",
      })
    ).rejects.toThrow();
  });
});

// ─── Input Validation Tests ───────────────────────────────────────────────────
describe("input validation", () => {
  it("rooms.create rejects empty name", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.rooms.create({ name: "" })
    ).rejects.toThrow();
  });

  it("equipments.create rejects invalid type", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.equipments.create({ name: "Test", type: "invalid_type" as any })
    ).rejects.toThrow();
  });

  it("ports.bulkCreate rejects count less than 1", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.ports.bulkCreate({ equipmentId: 1, count: 0, type: "lc" })
    ).rejects.toThrow();
  });

  it("ports.bulkCreate rejects count greater than 256", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.ports.bulkCreate({ equipmentId: 1, count: 300, type: "lc" })
    ).rejects.toThrow();
  });

  it("fibers.create rejects invalid fiber type", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.fibers.create({ name: "Test Fiber", type: "invalid" as any })
    ).rejects.toThrow();
  });
});
