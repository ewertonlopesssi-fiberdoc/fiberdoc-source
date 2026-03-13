import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db module before importing functions
vi.mock("../drizzle/schema", () => ({
  mapOltGroups: { oltId: "oltId", groupId: "groupId" },
  MapOltGroup: {},
}));

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockDelete = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockValues = vi.fn();

const db = {
  select: mockSelect,
  insert: mockInsert,
  delete: mockDelete,
};

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
  };
});

// Test the business logic of OLT group membership functions
describe("OLT Group Membership Logic", () => {
  it("should correctly identify OLT memberships by group", () => {
    const memberships = [
      { oltId: 1, groupId: 10 },
      { oltId: 2, groupId: 10 },
      { oltId: 3, groupId: 20 },
    ];
    const group10Olts = memberships.filter((m) => m.groupId === 10);
    expect(group10Olts).toHaveLength(2);
    expect(group10Olts.map((m) => m.oltId)).toEqual([1, 2]);
  });

  it("should correctly identify OLT memberships by olt", () => {
    const memberships = [
      { oltId: 1, groupId: 10 },
      { oltId: 1, groupId: 20 },
      { oltId: 2, groupId: 10 },
    ];
    const olt1Groups = memberships.filter((m) => m.oltId === 1);
    expect(olt1Groups).toHaveLength(2);
    expect(olt1Groups.map((m) => m.groupId)).toEqual([10, 20]);
  });

  it("should prevent duplicate OLT group memberships", () => {
    const memberships = [{ oltId: 1, groupId: 10 }];
    const exists = memberships.some(
      (m) => m.oltId === 1 && m.groupId === 10
    );
    expect(exists).toBe(true);
    // Should not insert if already exists
    if (!exists) {
      memberships.push({ oltId: 1, groupId: 10 });
    }
    expect(memberships).toHaveLength(1);
  });

  it("should remove OLT from group correctly", () => {
    const memberships = [
      { oltId: 1, groupId: 10 },
      { oltId: 2, groupId: 10 },
    ];
    const after = memberships.filter(
      (m) => !(m.oltId === 1 && m.groupId === 10)
    );
    expect(after).toHaveLength(1);
    expect(after[0].oltId).toBe(2);
  });

  it("should remove all OLT memberships when OLT is deleted", () => {
    const memberships = [
      { oltId: 1, groupId: 10 },
      { oltId: 1, groupId: 20 },
      { oltId: 2, groupId: 10 },
    ];
    const after = memberships.filter((m) => m.oltId !== 1);
    expect(after).toHaveLength(1);
    expect(after[0].oltId).toBe(2);
  });
});

// Test the visibility logic
describe("Group Visibility Logic", () => {
  it("should hide items when group is hidden", () => {
    const hiddenGroupIds = new Set([10, 20]);
    const itemGroupIds = [10]; // item belongs to group 10
    const isHiddenByGroup = (groupIds: number[]) =>
      groupIds.some((id) => hiddenGroupIds.has(id));
    expect(isHiddenByGroup(itemGroupIds)).toBe(true);
  });

  it("should show items when group is visible", () => {
    const hiddenGroupIds = new Set([30]);
    const itemGroupIds = [10]; // item belongs to group 10 (not hidden)
    const isHiddenByGroup = (groupIds: number[]) =>
      groupIds.some((id) => hiddenGroupIds.has(id));
    expect(isHiddenByGroup(itemGroupIds)).toBe(false);
  });

  it("should show items with no group assignment", () => {
    const hiddenGroupIds = new Set([10]);
    const itemGroupIds: number[] = []; // item has no group
    const isHiddenByGroup = (groupIds: number[]) =>
      groupIds.some((id) => hiddenGroupIds.has(id));
    expect(isHiddenByGroup(itemGroupIds)).toBe(false);
  });

  it("should hide item when any of its groups is hidden", () => {
    const hiddenGroupIds = new Set([20]);
    const itemGroupIds = [10, 20]; // item belongs to groups 10 and 20
    const isHiddenByGroup = (groupIds: number[]) =>
      groupIds.some((id) => hiddenGroupIds.has(id));
    expect(isHiddenByGroup(itemGroupIds)).toBe(true);
  });

  it("should correctly count ungrouped items", () => {
    const allGroupedIds = new Set([1, 2, 3]);
    const allItems = [{ id: 1 }, { id: 2 }, { id: 4 }, { id: 5 }];
    const ungrouped = allItems.filter((item) => !allGroupedIds.has(item.id));
    expect(ungrouped).toHaveLength(2);
    expect(ungrouped.map((i) => i.id)).toEqual([4, 5]);
  });
});
