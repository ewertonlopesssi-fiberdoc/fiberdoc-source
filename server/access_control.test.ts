import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createCtx(role: "admin" | "user"): TrpcContext {
  const user: AuthenticatedUser = {
    id: role === "admin" ? 1 : 2,
    openId: role === "admin" ? "admin-open-id" : "viewer-open-id",
    email: `${role}@example.com`,
    name: role === "admin" ? "Admin User" : "Viewer User",
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

describe("access_control", () => {
  it("admin can access users.list", async () => {
    const caller = appRouter.createCaller(createCtx("admin"));
    // Should not throw FORBIDDEN — may throw DB error in test env, that's OK
    try {
      const result = await caller.users.list();
      expect(result).toBeDefined();
    } catch (e: any) {
      // DB not available in test env is acceptable; FORBIDDEN is not
      expect(e?.code).not.toBe("FORBIDDEN");
    }
  });

  it("viewer cannot access users.list (FORBIDDEN)", async () => {
    const caller = appRouter.createCaller(createCtx("user"));
    await expect(caller.users.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("viewer cannot call users.updateRole (FORBIDDEN)", async () => {
    const caller = appRouter.createCaller(createCtx("user"));
    await expect(
      caller.users.updateRole({ userId: 99, role: "admin" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("viewer cannot call users.remove (FORBIDDEN)", async () => {
    const caller = appRouter.createCaller(createCtx("user"));
    await expect(
      caller.users.remove({ userId: 99 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("admin cannot change their own role", async () => {
    const caller = appRouter.createCaller(createCtx("admin"));
    await expect(
      caller.users.updateRole({ userId: 1, role: "user" })
    ).rejects.toThrow("Você não pode alterar seu próprio papel.");
  });

  it("admin cannot remove themselves", async () => {
    const caller = appRouter.createCaller(createCtx("admin"));
    await expect(
      caller.users.remove({ userId: 1 })
    ).rejects.toThrow("Você não pode remover sua própria conta.");
  });

  it("unauthenticated user cannot access users.list", async () => {
    const ctx: TrpcContext = {
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: () => {} } as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    await expect(caller.users.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
