import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the db module to avoid real DB connections in unit tests
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getOccupancyReport: vi.fn(),
    getDashboardStats: vi.fn(),
  };
});

import { getOccupancyReport } from "./db";

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("reports.occupancy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when no data", async () => {
    vi.mocked(getOccupancyReport).mockResolvedValue([]);
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.reports.occupancy({});
    expect(result).toEqual([]);
    expect(getOccupancyReport).toHaveBeenCalledWith({});
  });

  it("passes roomId filter to getOccupancyReport", async () => {
    vi.mocked(getOccupancyReport).mockResolvedValue([]);
    const caller = appRouter.createCaller(createPublicContext());
    await caller.reports.occupancy({ roomId: 5 });
    expect(getOccupancyReport).toHaveBeenCalledWith({ roomId: 5 });
  });

  it("passes equipmentId filter to getOccupancyReport", async () => {
    vi.mocked(getOccupancyReport).mockResolvedValue([]);
    const caller = appRouter.createCaller(createPublicContext());
    await caller.reports.occupancy({ equipmentId: 10 });
    expect(getOccupancyReport).toHaveBeenCalledWith({ equipmentId: 10 });
  });

  it("returns occupancy data with correct structure", async () => {
    const mockData = [
      {
        equipmentId: 1,
        equipmentName: "Switch Core",
        equipmentType: "switch",
        roomId: 1,
        roomName: "Sala NOC",
        totalPorts: 48,
        freePorts: 10,
        occupiedPorts: 38,
        reservedPorts: 0,
        faultyPorts: 0,
        occupancyRate: 79,
        ports: [
          { id: 1, portNumber: "1", label: null, type: "rj45", speed: "1g", status: "occupied", notes: null },
        ],
      },
    ];
    vi.mocked(getOccupancyReport).mockResolvedValue(mockData);
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.reports.occupancy({});
    expect(result).toHaveLength(1);
    expect(result[0]?.equipmentName).toBe("Switch Core");
    expect(result[0]?.occupancyRate).toBe(79);
    expect(result[0]?.ports).toHaveLength(1);
  });

  it("rejects invalid input (non-number roomId)", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await expect(
      caller.reports.occupancy({ roomId: "abc" as unknown as number })
    ).rejects.toThrow();
  });
});
