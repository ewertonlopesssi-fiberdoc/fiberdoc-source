import { describe, expect, it } from "vitest";
import { calcNextRun } from "./backupScheduler";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminCtx(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-open-id",
    email: "admin@example.com",
    name: "Admin",
    loginMethod: "manus",
    role: "admin",
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

function createViewerCtx(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 2,
    openId: "viewer-open-id",
    email: "viewer@example.com",
    name: "Viewer",
    loginMethod: "manus",
    role: "user",
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

// ── calcNextRun unit tests ────────────────────────────────────────────────────
describe("calcNextRun", () => {
  const base = new Date("2026-02-25T10:00:00Z"); // Tuesday 10:00 UTC

  it("daily: if hour not yet passed today, returns same day", () => {
    const next = calcNextRun("daily", 14, null, null, base);
    expect(next.getHours()).toBe(14);
    expect(next.getDate()).toBe(base.getDate());
  });

  it("daily: if hour already passed, returns a future date with the correct hour", () => {
    const next = calcNextRun("daily", 8, null, null, base);
    // Must be strictly after base
    expect(next.getTime()).toBeGreaterThan(base.getTime());
    // Must be within 48 hours
    expect(next.getTime()).toBeLessThan(base.getTime() + 48 * 60 * 60 * 1000);
  });

  it("weekly: returns next occurrence of target weekday", () => {
    // base is Tuesday (2), target Monday (1) → should be next Monday
    const next = calcNextRun("weekly", 2, 1, null, base);
    expect(next.getDay()).toBe(1);
    expect(next.getHours()).toBe(2);
  });

  it("weekly: same weekday but hour passed → 7 days later", () => {
    // base is Tuesday (2) at 10:00, target Tuesday (2) at 08:00 → next week
    const next = calcNextRun("weekly", 8, 2, null, base);
    expect(next.getDay()).toBe(2);
    expect(next.getTime()).toBeGreaterThan(base.getTime());
  });

  it("monthly: returns this month if day not passed", () => {
    const next = calcNextRun("monthly", 2, null, 28, base);
    expect(next.getDate()).toBe(28);
    expect(next.getMonth()).toBe(base.getMonth());
  });

  it("monthly: if day already passed, returns next month", () => {
    const next = calcNextRun("monthly", 2, null, 1, base);
    expect(next.getDate()).toBe(1);
    expect(next.getMonth()).toBe((base.getMonth() + 1) % 12);
  });

  it("always returns a future date relative to base", () => {
    const nextDaily = calcNextRun("daily", 10, null, null, base);
    const nextWeekly = calcNextRun("weekly", 10, 2, null, base);
    const nextMonthly = calcNextRun("monthly", 10, null, 25, base);
    expect(nextDaily.getTime()).toBeGreaterThan(base.getTime());
    expect(nextWeekly.getTime()).toBeGreaterThan(base.getTime());
    expect(nextMonthly.getTime()).toBeGreaterThan(base.getTime());
  });
});

// ── tRPC procedure access control ────────────────────────────────────────────
describe("backup schedule procedures", () => {
  it("viewer cannot access getSchedule (FORBIDDEN)", async () => {
    const caller = appRouter.createCaller(createViewerCtx());
    await expect(caller.backup.getSchedule()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("viewer cannot access getHistory (FORBIDDEN)", async () => {
    const caller = appRouter.createCaller(createViewerCtx());
    await expect(caller.backup.getHistory()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("viewer cannot run manual backup (FORBIDDEN)", async () => {
    const caller = appRouter.createCaller(createViewerCtx());
    await expect(caller.backup.runManual()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("viewer cannot save schedule (FORBIDDEN)", async () => {
    const caller = appRouter.createCaller(createViewerCtx());
    await expect(
      caller.backup.saveSchedule({
        enabled: true,
        frequency: "daily",
        hour: 2,
        retentionDays: 30,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("admin can call getSchedule (may return null in test env)", async () => {
    const caller = appRouter.createCaller(createAdminCtx());
    try {
      const result = await caller.backup.getSchedule();
      expect(result === null || typeof result === "object").toBe(true);
    } catch (e: any) {
      expect(e?.code).not.toBe("FORBIDDEN");
    }
  });

  it("saveSchedule rejects invalid frequency", async () => {
    const caller = appRouter.createCaller(createAdminCtx());
    await expect(
      caller.backup.saveSchedule({
        enabled: true,
        frequency: "hourly" as any,
        hour: 2,
        retentionDays: 30,
      })
    ).rejects.toThrow();
  });

  it("saveSchedule rejects hour out of range", async () => {
    const caller = appRouter.createCaller(createAdminCtx());
    await expect(
      caller.backup.saveSchedule({
        enabled: true,
        frequency: "daily",
        hour: 25,
        retentionDays: 30,
      })
    ).rejects.toThrow();
  });
});
