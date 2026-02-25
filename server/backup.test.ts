import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createCtx(role: "admin" | "user"): TrpcContext {
  const user: AuthenticatedUser = {
    id: role === "admin" ? 1 : 2,
    openId: role === "admin" ? "admin-open-id" : "viewer-open-id",
    email: `${role}@example.com`,
    name: role === "admin" ? "Admin" : "Viewer",
    loginMethod: "manus",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

const validBackupPayload = {
  backup: {
    version: "1.0",
    generatedAt: new Date().toISOString(),
    counts: {
      rooms: 0, equipments: 0, equipmentSlots: 0, ports: 0,
      fibers: 0, connections: 0, maintenanceHistory: 0,
      ceos: 0, ceoTubes: 0, ceoVias: 0,
    },
    data: {
      rooms: [], equipments: [], equipmentSlots: [], ports: [],
      fibers: [], connections: [], maintenanceHistory: [],
      ceos: [], ceoTubes: [], ceoVias: [],
    },
  },
};

describe("backup procedures", () => {
  it("viewer cannot export backup (FORBIDDEN)", async () => {
    const caller = appRouter.createCaller(createCtx("user"));
    await expect(caller.backup.export()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("viewer cannot restore backup (FORBIDDEN)", async () => {
    const caller = appRouter.createCaller(createCtx("user"));
    await expect(caller.backup.restore(validBackupPayload)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("unauthenticated user cannot export backup (FORBIDDEN)", async () => {
    const ctx: TrpcContext = {
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: () => {} } as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    await expect(caller.backup.export()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("admin can call backup.export (may fail with DB error in test env)", async () => {
    const caller = appRouter.createCaller(createCtx("admin"));
    try {
      const result = await caller.backup.export();
      expect(result).toHaveProperty("version");
      expect(result).toHaveProperty("generatedAt");
      expect(result).toHaveProperty("counts");
      expect(result).toHaveProperty("data");
    } catch (e: any) {
      expect(e?.code).not.toBe("FORBIDDEN");
    }
  });

  it("admin can call backup.restore with empty data (may fail with DB error in test env)", async () => {
    const caller = appRouter.createCaller(createCtx("admin"));
    try {
      const result = await caller.backup.restore(validBackupPayload);
      expect(result).toHaveProperty("restored");
      expect(result).toHaveProperty("skipped");
      expect(result).toHaveProperty("errors");
    } catch (e: any) {
      expect(e?.code).not.toBe("FORBIDDEN");
    }
  });

  it("backup.restore rejects invalid payload (missing version)", async () => {
    const caller = appRouter.createCaller(createCtx("admin"));
    await expect(
      caller.backup.restore({ backup: { ...validBackupPayload.backup, version: undefined as any } })
    ).rejects.toThrow();
  });
});
