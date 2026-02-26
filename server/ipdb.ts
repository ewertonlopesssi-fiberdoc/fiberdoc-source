import { eq, and, sql, inArray } from "drizzle-orm";
import { getDb } from "./db";
import { ipBlocks, ipAddresses, equipments } from "../drizzle/schema";

// ─── Utilitários de CIDR ─────────────────────────────────────────────────────

export function parseCidr(cidr: string): {
  networkAddress: string;
  broadcastAddress: string;
  totalHosts: number;
  firstUsable: string;
  lastUsable: string;
  prefixLength: number;
} {
  const [baseIp, prefixStr] = cidr.split("/");
  const prefix = parseInt(prefixStr, 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 32) {
    throw new Error(`Prefixo inválido: ${prefixStr}`);
  }

  const ipToNum = (ip: string): number => {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
      throw new Error(`IP inválido: ${ip}`);
    }
    return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
  };

  const numToIp = (num: number): string =>
    [(num >>> 24) & 255, (num >>> 16) & 255, (num >>> 8) & 255, num & 255].join(".");

  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (ipToNum(baseIp) & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const totalHosts = prefix >= 31 ? Math.pow(2, 32 - prefix) : Math.max(0, broadcast - network - 1);

  return {
    networkAddress: numToIp(network),
    broadcastAddress: numToIp(broadcast),
    totalHosts,
    firstUsable: prefix >= 31 ? numToIp(network) : numToIp(network + 1),
    lastUsable: prefix >= 31 ? numToIp(broadcast) : numToIp(broadcast - 1),
    prefixLength: prefix,
  };
}

// ─── Blocos IP ───────────────────────────────────────────────────────────────

export async function getIpBlocks(filters?: { type?: string; status?: string; roomId?: number }) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(ipBlocks).orderBy(ipBlocks.name);
  let result = rows;
  if (filters?.type) result = result.filter((r) => r.type === (filters.type as typeof r.type));
  if (filters?.status) result = result.filter((r) => r.status === (filters.status as typeof r.status));
  if (filters?.roomId) result = result.filter((r) => r.roomId === filters.roomId);
  return result;
}

export async function getIpBlockById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(ipBlocks).where(eq(ipBlocks.id, id));
  return row ?? null;
}

export async function createIpBlock(data: {
  name: string;
  cidr: string;
  gateway?: string | null;
  dns1?: string | null;
  dns2?: string | null;
  vlan?: number | null;
  type?: string;
  status?: string;
  description?: string | null;
  roomId?: number | null;
  notes?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const parsed = parseCidr(data.cidr);
  const [result] = await db.insert(ipBlocks).values({
    name: data.name,
    cidr: data.cidr,
    networkAddress: parsed.networkAddress,
    broadcastAddress: parsed.broadcastAddress,
    totalHosts: parsed.totalHosts,
    gateway: data.gateway ?? null,
    dns1: data.dns1 ?? null,
    dns2: data.dns2 ?? null,
    vlan: data.vlan ?? null,
    type: (data.type ?? "other") as "other",
    status: (data.status ?? "active") as "active",
    description: data.description ?? null,
    roomId: data.roomId ?? null,
    notes: data.notes ?? null,
  });
  return (result as any).insertId as number;
}

export async function updateIpBlock(id: number, data: {
  name?: string;
  gateway?: string | null;
  dns1?: string | null;
  dns2?: string | null;
  vlan?: number | null;
  type?: string;
  status?: string;
  description?: string | null;
  roomId?: number | null;
  notes?: string | null;
}) {
  const db = await getDb();
  if (!db) return;
  await db.update(ipBlocks).set(data as any).where(eq(ipBlocks.id, id));
}

export async function deleteIpBlock(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(ipBlocks).where(eq(ipBlocks.id, id));
}

// ─── Endereços IP ────────────────────────────────────────────────────────────

export async function getIpAddressesByBlock(blockId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: ipAddresses.id,
      blockId: ipAddresses.blockId,
      address: ipAddresses.address,
      status: ipAddresses.status,
      hostname: ipAddresses.hostname,
      description: ipAddresses.description,
      equipmentId: ipAddresses.equipmentId,
      macAddress: ipAddresses.macAddress,
      owner: ipAddresses.owner,
      lastSeen: ipAddresses.lastSeen,
      notes: ipAddresses.notes,
      createdAt: ipAddresses.createdAt,
      updatedAt: ipAddresses.updatedAt,
      equipmentName: equipments.name,
    })
    .from(ipAddresses)
    .leftJoin(equipments, eq(ipAddresses.equipmentId, equipments.id))
    .where(eq(ipAddresses.blockId, blockId))
    .orderBy(ipAddresses.address);
}

export async function allocateIpAddress(data: {
  blockId: number;
  address: string;
  status?: string;
  hostname?: string | null;
  description?: string | null;
  equipmentId?: number | null;
  macAddress?: string | null;
  owner?: string | null;
  notes?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const [existing] = await db
    .select()
    .from(ipAddresses)
    .where(and(eq(ipAddresses.blockId, data.blockId), eq(ipAddresses.address, data.address)));

  if (existing) {
    await db.update(ipAddresses).set({
      status: (data.status ?? "allocated") as "allocated",
      hostname: data.hostname ?? null,
      description: data.description ?? null,
      equipmentId: data.equipmentId ?? null,
      macAddress: data.macAddress ?? null,
      owner: data.owner ?? null,
      notes: data.notes ?? null,
    }).where(eq(ipAddresses.id, existing.id));
    return existing.id;
  } else {
    const [result] = await db.insert(ipAddresses).values({
      blockId: data.blockId,
      address: data.address,
      status: (data.status ?? "allocated") as "allocated",
      hostname: data.hostname ?? null,
      description: data.description ?? null,
      equipmentId: data.equipmentId ?? null,
      macAddress: data.macAddress ?? null,
      owner: data.owner ?? null,
      notes: data.notes ?? null,
    });
    return (result as any).insertId as number;
  }
}

export async function releaseIpAddress(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(ipAddresses).set({
    status: "free" as const,
    hostname: null,
    description: null,
    equipmentId: null,
    macAddress: null,
    owner: null,
  }).where(eq(ipAddresses.id, id));
}

export async function updateIpAddress(id: number, data: {
  status?: string;
  hostname?: string | null;
  description?: string | null;
  equipmentId?: number | null;
  macAddress?: string | null;
  owner?: string | null;
  notes?: string | null;
}) {
  const db = await getDb();
  if (!db) return;
  await db.update(ipAddresses).set(data as any).where(eq(ipAddresses.id, id));
}

export async function deleteIpAddress(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(ipAddresses).where(eq(ipAddresses.id, id));
}

// ─── Estatísticas ─────────────────────────────────────────────────────────────

export async function getIpBlockStats(blockId: number) {
  const db = await getDb();
  if (!db) return { free: 0, allocated: 0, reserved: 0, dhcp: 0 };
  const rows = await db
    .select({ status: ipAddresses.status, count: sql<number>`count(*)` })
    .from(ipAddresses)
    .where(eq(ipAddresses.blockId, blockId))
    .groupBy(ipAddresses.status);

  const stats: Record<string, number> = { free: 0, allocated: 0, reserved: 0, dhcp: 0 };
  for (const row of rows) stats[row.status] = Number(row.count);
  return stats;
}

export async function getIpDashboardSummary() {
  const db = await getDb();
  if (!db) return {
    totalBlocks: 0, totalHosts: 0, totalAllocated: 0, totalReserved: 0,
    totalFree: 0, utilizationPct: 0, blocks: [],
  };

  const blocks = await db.select().from(ipBlocks);
  const addresses = await db
    .select({ blockId: ipAddresses.blockId, status: ipAddresses.status, count: sql<number>`count(*)` })
    .from(ipAddresses)
    .groupBy(ipAddresses.blockId, ipAddresses.status);

  const statsMap: Record<number, Record<string, number>> = {};
  for (const row of addresses) {
    if (!statsMap[row.blockId]) statsMap[row.blockId] = { free: 0, allocated: 0, reserved: 0, dhcp: 0 };
    statsMap[row.blockId][row.status] = Number(row.count);
  }

  const blocksWithStats = blocks.map((b) => {
    const s = statsMap[b.id] ?? { free: 0, allocated: 0, reserved: 0, dhcp: 0 };
    const used = s.allocated + s.reserved + s.dhcp;
    const utilizationPct = b.totalHosts > 0 ? Math.round((used / b.totalHosts) * 100) : 0;
    return { ...b, stats: s, used, utilizationPct };
  });

  const totalBlocks = blocks.length;
  const totalHosts = blocks.reduce((acc: number, b) => acc + b.totalHosts, 0);
  const totalAllocated = addresses
    .filter((a) => a.status === "allocated")
    .reduce((acc: number, a) => acc + Number(a.count), 0);
  const totalReserved = addresses
    .filter((a) => a.status === "reserved")
    .reduce((acc: number, a) => acc + Number(a.count), 0);
  const totalFree = totalHosts - totalAllocated - totalReserved;

  return {
    totalBlocks,
    totalHosts,
    totalAllocated,
    totalReserved,
    totalFree,
    utilizationPct: totalHosts > 0 ? Math.round(((totalAllocated + totalReserved) / totalHosts) * 100) : 0,
    blocks: blocksWithStats,
  };
}

// ─── IP Principal por Equipamento ────────────────────────────────────────────

export async function getPrimaryIpByEquipment(equipmentId: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select({
      id: ipAddresses.id,
      address: ipAddresses.address,
      blockId: ipAddresses.blockId,
      status: ipAddresses.status,
      hostname: ipAddresses.hostname,
    })
    .from(ipAddresses)
    .where(and(eq(ipAddresses.equipmentId, equipmentId), eq(ipAddresses.status, "allocated")))
    .limit(1);
  return row ?? null;
}

export async function getPrimaryIpsByEquipments(equipmentIds: number[]) {
  if (equipmentIds.length === 0) return {};
  const db = await getDb();
  if (!db) return {};
  const rows = await db
    .select({
      id: ipAddresses.id,
      address: ipAddresses.address,
      blockId: ipAddresses.blockId,
      status: ipAddresses.status,
      hostname: ipAddresses.hostname,
      equipmentId: ipAddresses.equipmentId,
    })
    .from(ipAddresses)
    .where(and(inArray(ipAddresses.equipmentId, equipmentIds), eq(ipAddresses.status, "allocated")));

  // Retorna um mapa equipmentId -> primeiro IP alocado
  const map: Record<number, { id: number; address: string; blockId: number; hostname: string | null }> = {};
  for (const row of rows) {
    if (row.equipmentId && !map[row.equipmentId]) {
      map[row.equipmentId] = {
        id: row.id,
        address: row.address,
        blockId: row.blockId,
        hostname: row.hostname,
      };
    }
  }
  return map;
}
