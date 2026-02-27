import { and, desc, eq, gte, inArray, like, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  Connection,
  Equipment,
  EquipmentSlot,
  Fiber,
  InsertConnection,
  InsertEquipment,
  InsertEquipmentSlot,
  InsertFiber,
  InsertMaintenanceHistory,
  InsertPort,
  InsertRoom,
  InsertUser,
  MaintenanceHistory,
  Port,
  Room,
  connections,
  equipmentSlots,
  equipments,
  fibers,
  maintenanceHistory,
  ports,
  rooms,
  users,
  systemSettings,
  InsertSystemSetting,
  powerSources,
  PowerSource,
  InsertPowerSource,
  snmpAlerts,
  SnmpAlert,
  InsertSnmpAlert,
  tuyaDevices,
  TuyaDevice,
  InsertTuyaDevice,
  tuyaAccounts,
  TuyaAccount,
  InsertTuyaAccount,
  tuyaReadings,
  TuyaReading,
  InsertTuyaReading,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ───────────────────────────────────────────────────────────────────
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  textFields.forEach((field) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  });
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
  else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Rooms ───────────────────────────────────────────────────────────────────
export async function getRooms() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(rooms).orderBy(rooms.name);
}

export async function getRoomById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(rooms).where(eq(rooms.id, id)).limit(1);
  return result[0];
}

export async function createRoom(data: InsertRoom) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(rooms).values(data);
  return result[0];
}

export async function updateRoom(id: number, data: Partial<InsertRoom>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(rooms).set(data).where(eq(rooms.id, id));
}

export async function deleteRoom(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(rooms).where(eq(rooms.id, id));
}

// ─── Equipments ──────────────────────────────────────────────────────────────
export async function getEquipments(search?: string, type?: string, roomId?: number, status?: string, ipSearch?: string) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (search) conditions.push(or(
    like(equipments.name, `%${search}%`),
    like(equipments.model, `%${search}%`),
    like(equipments.manufacturer, `%${search}%`),
  ));
  if (ipSearch) conditions.push(or(
    like(equipments.ipAddress, `%${ipSearch}%`),
    like(equipments.interfaceIp, `%${ipSearch}%`),
    like(equipments.serviceDescription, `%${ipSearch}%`),
    sql`cast(${equipments.vlan} as char) like ${`%${ipSearch}%`}`,
  ));
  if (type) conditions.push(eq(equipments.type, type as Equipment["type"]));
  if (roomId) conditions.push(eq(equipments.roomId, roomId));
  if (status) conditions.push(eq(equipments.status, status as Equipment["status"]));
  const query = db.select({
    id: equipments.id, name: equipments.name, type: equipments.type, model: equipments.model,
    manufacturer: equipments.manufacturer, serialNumber: equipments.serialNumber,
    roomId: equipments.roomId, rack: equipments.rack, rackPosition: equipments.rackPosition,
    ipAddress: equipments.ipAddress, macAddress: equipments.macAddress, totalPorts: equipments.totalPorts,
    notes: equipments.notes, status: equipments.status, createdAt: equipments.createdAt, updatedAt: equipments.updatedAt,
    roomName: rooms.name, imageUrl: equipments.imageUrl,
    // Campos de rede
    vlan: equipments.vlan, interfaceIp: equipments.interfaceIp,
    ipBlockId: equipments.ipBlockId, serviceDescription: equipments.serviceDescription,
    // Campos de energia
    powerType: equipments.powerType, powerSource: equipments.powerSource, powerSourceLabel: equipments.powerSourceLabel,
  }).from(equipments).leftJoin(rooms, eq(equipments.roomId, rooms.id));
  const rows = conditions.length > 0
    ? await query.where(and(...conditions)).orderBy(equipments.name)
    : await query.orderBy(equipments.name);

  // Calcular ocupação de portas por equipamento
  const portCounts = await db
    .select({
      equipmentId: ports.equipmentId,
      total: sql<number>`count(*)`,
      occupied: sql<number>`sum(case when ${ports.status} = 'occupied' then 1 else 0 end)`,
    })
    .from(ports)
    .groupBy(ports.equipmentId);
  const occMap = new Map(portCounts.map(r => [r.equipmentId, r]));

  return rows.map(row => {
    const occ = occMap.get(row.id);
    const total = Number(occ?.total ?? 0);
    const occupied = Number(occ?.occupied ?? 0);
    return {
      ...row,
      portOccupancy: total > 0 ? { total, occupied, rate: Math.round((occupied / total) * 100) } : null,
    };
  });
}

export async function getEquipmentById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select({
    id: equipments.id, name: equipments.name, type: equipments.type, model: equipments.model,
    manufacturer: equipments.manufacturer, serialNumber: equipments.serialNumber,
    roomId: equipments.roomId, rack: equipments.rack, rackPosition: equipments.rackPosition,
    ipAddress: equipments.ipAddress, macAddress: equipments.macAddress, totalPorts: equipments.totalPorts,
    notes: equipments.notes, status: equipments.status, createdAt: equipments.createdAt, updatedAt: equipments.updatedAt,
    roomName: rooms.name,
  }).from(equipments).leftJoin(rooms, eq(equipments.roomId, rooms.id)).where(eq(equipments.id, id)).limit(1);
  return result[0];
}

export async function createEquipment(data: InsertEquipment) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(equipments).values(data);
  return result[0];
}

export async function updateEquipment(id: number, data: Partial<InsertEquipment>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(equipments).set(data).where(eq(equipments.id, id));
}

export async function deleteEquipment(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(equipments).where(eq(equipments.id, id));
}

// ─── Ports ───────────────────────────────────────────────────────────────────
export async function getPortsByEquipment(equipmentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(ports).where(eq(ports.equipmentId, equipmentId)).orderBy(ports.sortOrder, ports.portNumber);
}

export async function getPortById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(ports).where(eq(ports.id, id)).limit(1);
  return result[0];
}

export async function createPort(data: InsertPort) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(ports).values(data);
  return result[0];
}

export async function updatePort(id: number, data: Partial<InsertPort>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(ports).set(data).where(eq(ports.id, id));
}

export async function deletePort(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(ports).where(eq(ports.id, id));
}

export async function bulkCreatePorts(
  equipmentId: number,
  count: number,
  type: Port["type"],
  speed?: Port["speed"],
  slotId?: number,
  startIndex?: number,
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const base = startIndex ?? 1;
  const portData: InsertPort[] = Array.from({ length: count }, (_, i) => ({
    equipmentId,
    portNumber: String(base + i).padStart(2, "0"),
    type,
    speed: speed ?? null,
    slotId: slotId ?? null,
    status: "free" as const,
  }));
  await db.insert(ports).values(portData);
}

// ─── Equipment Slots ─────────────────────────────────────────────────────
export async function getSlotsByEquipment(equipmentId: number): Promise<EquipmentSlot[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(equipmentSlots).where(eq(equipmentSlots.equipmentId, equipmentId)).orderBy(equipmentSlots.slotNumber);
}

export async function getSlotById(id: number): Promise<EquipmentSlot | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(equipmentSlots).where(eq(equipmentSlots.id, id)).limit(1);
  return rows[0];
}

export async function createSlot(data: InsertEquipmentSlot): Promise<{ id: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(equipmentSlots).values(data);
  return { id: (result as any)[0]?.insertId ?? 0 };
}

export async function updateSlot(id: number, data: Partial<InsertEquipmentSlot>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(equipmentSlots).set({ ...data, updatedAt: new Date() }).where(eq(equipmentSlots.id, id));
}

export async function deleteSlot(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Desassociar portas do slot antes de remover
  await db.update(ports).set({ slotId: null }).where(eq(ports.slotId, id));
  await db.delete(equipmentSlots).where(eq(equipmentSlots.id, id));
}

export async function getPortsBySlot(slotId: number): Promise<Port[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(ports).where(eq(ports.slotId, slotId)).orderBy(ports.portNumber);
}

// ─── Fibers ──────────────────────────────────────────────────────────────────
export async function getFibers(search?: string, type?: string, status?: string) {
  const db = await getDb();
  if (!db) return [];
  const originEq = equipments;
  const destEq = { ...equipments };
  const conditions = [];
  if (search) conditions.push(or(like(fibers.name, `%${search}%`), like(fibers.cableId, `%${search}%`)));
  if (type) conditions.push(eq(fibers.type, type as Fiber["type"]));
  if (status) conditions.push(eq(fibers.status, status as Fiber["status"]));
  const query = db.select({
    id: fibers.id, name: fibers.name, originEquipmentId: fibers.originEquipmentId,
    originPortId: fibers.originPortId, destinationEquipmentId: fibers.destinationEquipmentId,
    destinationPortId: fibers.destinationPortId, color: fibers.color, type: fibers.type,
    lengthMeters: fibers.lengthMeters, cableId: fibers.cableId, tubeColor: fibers.tubeColor,
    attenuation: fibers.attenuation, status: fibers.status, notes: fibers.notes,
    createdAt: fibers.createdAt, updatedAt: fibers.updatedAt,
  }).from(fibers);
  if (conditions.length > 0) return query.where(and(...conditions)).orderBy(fibers.name);
  return query.orderBy(fibers.name);
}

export async function getFiberById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(fibers).where(eq(fibers.id, id)).limit(1);
  return result[0];
}

export async function createFiber(data: InsertFiber) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(fibers).values(data);
  return result[0];
}

export async function updateFiber(id: number, data: Partial<InsertFiber>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(fibers).set(data).where(eq(fibers.id, id));
}

export async function deleteFiber(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(fibers).where(eq(fibers.id, id));
}

// ─── Connections ─────────────────────────────────────────────────────────────
export async function getConnections() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(connections).orderBy(desc(connections.createdAt));
}

export async function getConnectionById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(connections).where(eq(connections.id, id)).limit(1);
  return result[0];
}

export async function createConnection(data: InsertConnection) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Mark ports as occupied
  await db.update(ports).set({ status: "occupied" }).where(eq(ports.id, data.sourcePortId));
  await db.update(ports).set({ status: "occupied" }).where(eq(ports.id, data.targetPortId));
  const result = await db.insert(connections).values(data);
  return result[0];
}

export async function updateConnection(id: number, data: Partial<InsertConnection>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(connections).set(data).where(eq(connections.id, id));
}

export async function deleteConnection(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const conn = await getConnectionById(id);
  if (conn) {
    await db.update(ports).set({ status: "free" }).where(eq(ports.id, conn.sourcePortId));
    await db.update(ports).set({ status: "free" }).where(eq(ports.id, conn.targetPortId));
  }
  await db.delete(connections).where(eq(connections.id, id));
}

// ─── Topology ────────────────────────────────────────────────────────────────
export async function getTopologyData() {
  const db = await getDb();
  if (!db) return { nodes: [], edges: [] };
  const allEquipments = await db.select({
    id: equipments.id, name: equipments.name, type: equipments.type,
    model: equipments.model, status: equipments.status, rack: equipments.rack,
    rackPosition: equipments.rackPosition, roomId: equipments.roomId,
    totalPorts: equipments.totalPorts, imageUrl: equipments.imageUrl,
    powerType: equipments.powerType, powerSource: equipments.powerSource, powerSourceLabel: equipments.powerSourceLabel,
    roomName: rooms.name,
  }).from(equipments).leftJoin(rooms, eq(equipments.roomId, rooms.id));

  const allConnections = await db.select({
    id: connections.id, name: connections.name, status: connections.status, type: connections.type,
    sourcePortId: connections.sourcePortId, targetPortId: connections.targetPortId,
  }).from(connections);

  const allPorts = await db.select().from(ports);

  const portMap = new Map(allPorts.map((p) => [p.id, p]));

  // Calcular ocupação de portas por equipamento
  const occupancyMap = new Map<number, { total: number; occupied: number; rate: number }>();
  for (const equip of allEquipments) {
    const equipPorts = allPorts.filter((p) => p.equipmentId === equip.id);
    const total = equipPorts.length;
    const occupied = equipPorts.filter((p) => p.status === "occupied").length;
    const rate = total > 0 ? Math.round((occupied / total) * 100) : 0;
    occupancyMap.set(equip.id, { total, occupied, rate });
  }

  const edges = allConnections.map((c) => {
    const srcPort = portMap.get(c.sourcePortId);
    const tgtPort = portMap.get(c.targetPortId);
    return {
      id: c.id, name: c.name, status: c.status, type: c.type,
      sourceEquipmentId: srcPort?.equipmentId, targetEquipmentId: tgtPort?.equipmentId,
      sourcePortId: c.sourcePortId, targetPortId: c.targetPortId,
    };
  });

  const nodes = allEquipments.map((e) => ({
    ...e,
    portOccupancy: occupancyMap.get(e.id) ?? { total: 0, occupied: 0, rate: 0 },
  }));

  return { nodes, edges };
}

// ─── Maintenance History ──────────────────────────────────────────────────────
export async function getMaintenanceHistory(entityType?: string, entityId?: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (entityType) conditions.push(eq(maintenanceHistory.entityType, entityType as MaintenanceHistory["entityType"]));
  if (entityId) conditions.push(eq(maintenanceHistory.entityId, entityId));
  const query = db.select().from(maintenanceHistory);
  if (conditions.length > 0) return query.where(and(...conditions)).orderBy(desc(maintenanceHistory.createdAt)).limit(limit);
  return query.orderBy(desc(maintenanceHistory.createdAt)).limit(limit);
}

export async function createMaintenanceRecord(data: InsertMaintenanceHistory) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(maintenanceHistory).values(data);
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────
export async function getDashboardStats() {
  const db = await getDb();
  if (!db) return null;

  const [equipmentCount] = await db.select({ count: sql<number>`count(*)` }).from(equipments);
  const [fiberCount] = await db.select({ count: sql<number>`count(*)` }).from(fibers);
  const [portCount] = await db.select({ count: sql<number>`count(*)` }).from(ports);
  const [connectionCount] = await db.select({ count: sql<number>`count(*)` }).from(connections);
  const [freePortCount] = await db.select({ count: sql<number>`count(*)` }).from(ports).where(eq(ports.status, "free"));
  const [occupiedPortCount] = await db.select({ count: sql<number>`count(*)` }).from(ports).where(eq(ports.status, "occupied"));
  const [activeEquipCount] = await db.select({ count: sql<number>`count(*)` }).from(equipments).where(eq(equipments.status, "active"));
  const [activeFiberCount] = await db.select({ count: sql<number>`count(*)` }).from(fibers).where(eq(fibers.status, "active"));
  const [roomCount] = await db.select({ count: sql<number>`count(*)` }).from(rooms);

  const equipByType = await db.select({
    type: equipments.type,
    count: sql<number>`count(*)`,
  }).from(equipments).groupBy(equipments.type);

  const recentHistory = await db.select().from(maintenanceHistory).orderBy(desc(maintenanceHistory.createdAt)).limit(5);

  // Alertas de capacidade: threshold configurável (padrão 80%)
  const settingsRows = await db.select().from(systemSettings);
  const settingsMap = Object.fromEntries(settingsRows.map((r) => [r.key, r.value ?? ""]));
  const alertThreshold = parseInt(settingsMap.capacityAlertThreshold ?? "80", 10) || 80;

  const allEquipments = await db.select({
    id: equipments.id,
    name: equipments.name,
    type: equipments.type,
    totalPorts: equipments.totalPorts,
  }).from(equipments).where(sql`${equipments.totalPorts} > 0`);

  const capacityAlerts: Array<{ id: number; name: string; type: string; totalPorts: number; occupiedPorts: number; occupancyRate: number }> = [];
  for (const equip of allEquipments) {
    if (!equip.totalPorts || equip.totalPorts === 0) continue;
    const [occ] = await db.select({ count: sql<number>`count(*)` }).from(ports)
      .where(and(eq(ports.equipmentId, equip.id), eq(ports.status, "occupied")));
    const occupiedCount = Number(occ?.count ?? 0);
    const rate = Math.round((occupiedCount / equip.totalPorts) * 100);
    if (rate >= alertThreshold) {
      capacityAlerts.push({
        id: equip.id,
        name: equip.name,
        type: equip.type,
        totalPorts: equip.totalPorts,
        occupiedPorts: occupiedCount,
        occupancyRate: rate,
      });
    }
  }
  capacityAlerts.sort((a, b) => b.occupancyRate - a.occupancyRate);

  return {
    totalEquipments: Number(equipmentCount?.count ?? 0),
    totalFibers: Number(fiberCount?.count ?? 0),
    totalPorts: Number(portCount?.count ?? 0),
    totalConnections: Number(connectionCount?.count ?? 0),
    freePorts: Number(freePortCount?.count ?? 0),
    occupiedPorts: Number(occupiedPortCount?.count ?? 0),
    activeEquipments: Number(activeEquipCount?.count ?? 0),
    activeFibers: Number(activeFiberCount?.count ?? 0),
    totalRooms: Number(roomCount?.count ?? 0),
    equipmentByType: equipByType.map((e) => ({ type: e.type, count: Number(e.count) })),
    recentHistory,
    capacityAlerts,
    alertThreshold,
  };
}

// ─── Bulk Import ──────────────────────────────────────────────────────────────
export type BulkEquipmentRow = {
  name: string;
  type: Equipment["type"];
  model?: string;
  manufacturer?: string;
  serialNumber?: string;
  rack?: string;
  rackPosition?: string;
  ipAddress?: string;
  macAddress?: string;
  totalPorts?: number;
  status?: Equipment["status"];
  notes?: string;
  roomName?: string;
};

export type BulkFiberRow = {
  name: string;
  type?: Fiber["type"];
  color?: Fiber["color"];
  lengthMeters?: number;
  cableId?: string;
  tubeColor?: string;
  attenuation?: number;
  status?: Fiber["status"];
  notes?: string;
};

export type BulkImportResult = {
  imported: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
};

export async function bulkImportEquipments(
  rows: BulkEquipmentRow[],
  userId: number,
  performedBy?: string
): Promise<BulkImportResult> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const result: BulkImportResult = { imported: 0, skipped: 0, errors: [] };

  // Pre-fetch rooms for name lookup
  const allRooms = await db.select({ id: rooms.id, name: rooms.name }).from(rooms);
  const roomMap = new Map(allRooms.map((r) => [r.name.toLowerCase().trim(), r.id]));

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const roomId = row.roomName ? roomMap.get(row.roomName.toLowerCase().trim()) : undefined;
      await db.insert(equipments).values({
        name: row.name,
        type: row.type,
        model: row.model || null,
        manufacturer: row.manufacturer || null,
        serialNumber: row.serialNumber || null,
        rack: row.rack || null,
        rackPosition: row.rackPosition || null,
        ipAddress: row.ipAddress || null,
        macAddress: row.macAddress || null,
        totalPorts: row.totalPorts ?? 0,
        status: row.status ?? "active",
        notes: row.notes || null,
        roomId: roomId ?? null,
      });
      result.imported++;
    } catch (err: any) {
      result.errors.push({ row: i + 2, message: err?.message ?? "Erro desconhecido" });
      result.skipped++;
    }
  }

  if (result.imported > 0) {
    await createMaintenanceRecord({
      entityType: "equipment",
      entityId: 0,
      action: "created",
      description: `Importação em massa: ${result.imported} equipamento(s) importado(s) via CSV`,
      performedBy,
      userId,
    });
  }

  return result;
}

export async function bulkImportFibers(
  rows: BulkFiberRow[],
  userId: number,
  performedBy?: string
): Promise<BulkImportResult> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const result: BulkImportResult = { imported: 0, skipped: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      await db.insert(fibers).values({
        name: row.name,
        type: row.type ?? "single_mode",
        color: row.color ?? null,
        lengthMeters: row.lengthMeters ?? null,
        cableId: row.cableId ?? null,
        tubeColor: row.tubeColor ?? null,
        attenuation: row.attenuation ?? null,
        status: row.status ?? "active",
        notes: row.notes ?? null,
      });
      result.imported++;
    } catch (err: any) {
      result.errors.push({ row: i + 2, message: err?.message ?? "Erro desconhecido" });
      result.skipped++;
    }
  }

  if (result.imported > 0) {
    await createMaintenanceRecord({
      entityType: "fiber",
      entityId: 0,
      action: "created",
      description: `Importação em massa: ${result.imported} fibra(s) importada(s) via CSV`,
      performedBy,
      userId,
    });
  }

  return result;
}

// ─── CEO Helpers ──────────────────────────────────────────────────────────────
import { ceos, ceoTubes, ceoVias, InsertCeo, InsertCeoTube, InsertCeoVia } from "../drizzle/schema";

export async function getCeos(filters?: { roomId?: number; status?: string }) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(ceos);
  let result = rows;
  if (filters?.roomId) result = result.filter(r => r.roomId === filters.roomId);
  if (filters?.status) result = result.filter(r => r.status === filters.status);
  return result.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export async function getCeoById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(ceos).where(eq(ceos.id, id)).limit(1);
  return rows[0];
}

export async function createCeo(data: Omit<InsertCeo, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(ceos).values(data);
}

export async function updateCeo(id: number, data: Partial<Omit<InsertCeo, "id" | "createdAt" | "updatedAt">>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(ceos).set(data).where(eq(ceos.id, id));
}

export async function deleteCeo(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Remove vias e tubos em cascata
  const tubes = await db.select().from(ceoTubes).where(eq(ceoTubes.ceoId, id));
  for (const tube of tubes) {
    await db.delete(ceoVias).where(eq(ceoVias.tubeId, tube.id));
  }
  await db.delete(ceoTubes).where(eq(ceoTubes.ceoId, id));
  await db.delete(ceos).where(eq(ceos.id, id));
}

// ─── CEO Tubes ────────────────────────────────────────────────────────────────
export async function getTubesByCeo(ceoId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(ceoTubes).where(eq(ceoTubes.ceoId, ceoId));
  return rows.sort((a, b) => a.identifier.localeCompare(b.identifier, "pt-BR", { numeric: true }));
}

export async function createCeoTube(data: Omit<InsertCeoTube, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(ceoTubes).values(data);
  const insertId = (result as any)[0]?.insertId ?? 0;
  // Criar as vias automaticamente
  const totalVias = data.totalVias ?? 0;
  if (totalVias > 0) {
    const viaRows: Omit<InsertCeoVia, "id" | "createdAt" | "updatedAt">[] = [];
    for (let i = 1; i <= totalVias; i++) {
      viaRows.push({ tubeId: insertId, ceoId: data.ceoId, viaNumber: i });
    }
    if (viaRows.length > 0) {
      await db.insert(ceoVias).values(viaRows);
    }
  }
  return insertId;
}

export async function updateCeoTube(id: number, data: Partial<Omit<InsertCeoTube, "id" | "createdAt" | "updatedAt">>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(ceoTubes).set(data).where(eq(ceoTubes.id, id));
}

export async function deleteCeoTube(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Limpar fusões que apontam para este tubo
  await db.update(ceoVias).set({ fusedToTubeId: null, fusedToViaId: null }).where(eq(ceoVias.fusedToTubeId, id));
  await db.delete(ceoVias).where(eq(ceoVias.tubeId, id));
  await db.delete(ceoTubes).where(eq(ceoTubes.id, id));
}

// ─── CEO Vias ─────────────────────────────────────────────────────────────────
export async function getViasByTube(tubeId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(ceoVias).where(eq(ceoVias.tubeId, tubeId));
  return rows.sort((a, b) => a.viaNumber - b.viaNumber);
}

export async function getViasByCeo(ceoId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(ceoVias).where(eq(ceoVias.ceoId, ceoId));
  return rows.sort((a, b) => a.viaNumber - b.viaNumber);
}

export async function setViaFusion(
  viaId: number,
  fusedToTubeId: number | null,
  fusedToViaId: number | null,
  notes?: string
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  // Buscar o tubo da via de origem para registrar a volta
  const originRows = await db.select().from(ceoVias).where(eq(ceoVias.id, viaId)).limit(1);
  const origin = originRows[0];
  if (!origin) throw new Error("Via de origem não encontrada");

  // Gravar: via origem aponta para via destino
  await db.update(ceoVias)
    .set({ fusedToTubeId, fusedToViaId, notes: notes ?? null })
    .where(eq(ceoVias.id, viaId));

  // Gravar: via destino aponta de volta para via origem (bidirecional)
  if (fusedToViaId !== null && fusedToTubeId !== null) {
    await db.update(ceoVias)
      .set({ fusedToTubeId: origin.tubeId, fusedToViaId: viaId })
      .where(eq(ceoVias.id, fusedToViaId));
  }
}

export async function clearViaFusion(viaId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  // Buscar a via para saber qual é a via destino (para limpar nos dois sentidos)
  const rows = await db.select().from(ceoVias).where(eq(ceoVias.id, viaId)).limit(1);
  const via = rows[0];

  // Limpar a via de origem
  await db.update(ceoVias)
    .set({ fusedToTubeId: null, fusedToViaId: null })
    .where(eq(ceoVias.id, viaId));

  // Limpar a via destino (bidirecional)
  if (via?.fusedToViaId) {
    await db.update(ceoVias)
      .set({ fusedToTubeId: null, fusedToViaId: null })
      .where(eq(ceoVias.id, via.fusedToViaId));
  }
}

export async function updateVia(id: number, data: { label?: string | null; notes?: string | null; fiberId?: number | null }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(ceoVias).set(data).where(eq(ceoVias.id, id));
}

export async function setViaFiber(viaId: number, fiberId: number | null) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(ceoVias).set({ fiberId }).where(eq(ceoVias.id, viaId));
}

// ─── Gerenciamento de Usuários ────────────────────────────────────────────────
export async function getAllUsers() {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db.select({
    id: users.id,
    openId: users.openId,
    name: users.name,
    email: users.email,
    role: users.role,
    loginMethod: users.loginMethod,
    createdAt: users.createdAt,
    lastSignedIn: users.lastSignedIn,
  }).from(users).orderBy(desc(users.createdAt));
}

export async function updateUserRole(userId: number, role: "admin" | "user") {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

export async function deleteUser(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(users).where(eq(users.id, userId));
}

// ─── Backup & Restauração ─────────────────────────────────────────────────────

export interface BackupData {
  version: string;
  generatedAt: string;
  counts: Record<string, number>;
  data: {
    rooms: Room[];
    equipments: Equipment[];
    equipmentSlots: EquipmentSlot[];
    ports: Port[];
    fibers: Fiber[];
    connections: Connection[];
    maintenanceHistory: MaintenanceHistory[];
    ceos: any[];
    ceoTubes: any[];
    ceoVias: any[];
  };
}

export async function exportFullBackup(): Promise<BackupData> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const [
    roomRows,
    equipmentRows,
    slotRows,
    portRows,
    fiberRows,
    connectionRows,
    historyRows,
    ceoRows,
    tubeRows,
    viaRows,
  ] = await Promise.all([
    db.select().from(rooms),
    db.select().from(equipments),
    db.select().from(equipmentSlots),
    db.select().from(ports),
    db.select().from(fibers),
    db.select().from(connections),
    db.select().from(maintenanceHistory),
    db.select().from(ceos),
    db.select().from(ceoTubes),
    db.select().from(ceoVias),
  ]);

  return {
    version: "1.0",
    generatedAt: new Date().toISOString(),
    counts: {
      rooms: roomRows.length,
      equipments: equipmentRows.length,
      equipmentSlots: slotRows.length,
      ports: portRows.length,
      fibers: fiberRows.length,
      connections: connectionRows.length,
      maintenanceHistory: historyRows.length,
      ceos: ceoRows.length,
      ceoTubes: tubeRows.length,
      ceoVias: viaRows.length,
    },
    data: {
      rooms: roomRows,
      equipments: equipmentRows,
      equipmentSlots: slotRows,
      ports: portRows,
      fibers: fiberRows,
      connections: connectionRows,
      maintenanceHistory: historyRows,
      ceos: ceoRows,
      ceoTubes: tubeRows,
      ceoVias: viaRows,
    },
  };
}

export interface RestoreResult {
  restored: Record<string, number>;
  skipped: Record<string, number>;
  errors: string[];
}

export async function restoreFromBackup(backup: BackupData): Promise<RestoreResult> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const result: RestoreResult = {
    restored: {},
    skipped: {},
    errors: [],
  };

  const dbInstance = db!;

  // Helper: upsert genérico por ID
  async function upsertRows<T extends { id: number }>(
    table: any,
    rows: T[],
    label: string
  ) {
    let restored = 0;
    let skipped = 0;
    for (const row of rows) {
      try {
        const { id, ...rest } = row as any;
        await dbInstance.insert(table).values(row).onDuplicateKeyUpdate({ set: rest });
        restored++;
      } catch (e: any) {
        skipped++;
        result.errors.push(`${label}#${(row as any).id}: ${e?.message ?? e}`);
      }
    }
    result.restored[label] = restored;
    result.skipped[label] = skipped;
  }

  // Ordem respeita dependências de FK
  await upsertRows(rooms, backup.data.rooms ?? [], "rooms");
  await upsertRows(equipments, backup.data.equipments ?? [], "equipments");
  await upsertRows(equipmentSlots, backup.data.equipmentSlots ?? [], "equipmentSlots");
  await upsertRows(ports, backup.data.ports ?? [], "ports");
  await upsertRows(fibers, backup.data.fibers ?? [], "fibers");
  await upsertRows(connections, backup.data.connections ?? [], "connections");
  await upsertRows(maintenanceHistory, backup.data.maintenanceHistory ?? [], "maintenanceHistory");
  await upsertRows(ceos, backup.data.ceos ?? [], "ceos");
  await upsertRows(ceoTubes, backup.data.ceoTubes ?? [], "ceoTubes");
  await upsertRows(ceoVias, backup.data.ceoVias ?? [], "ceoVias");

  return result;
}

// ─── Agendamento de Backup ────────────────────────────────────────────────────
import {
  BackupSchedule,
  InsertBackupSchedule,
  InsertBackupHistory,
  BackupHistoryEntry,
  backupSchedules,
  backupHistory,
} from "../drizzle/schema";

export async function getBackupSchedule(): Promise<BackupSchedule | null> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const rows = await db.select().from(backupSchedules).limit(1);
  return rows[0] ?? null;
}

export async function upsertBackupSchedule(
  data: Omit<InsertBackupSchedule, "id" | "createdAt" | "updatedAt">
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const existing = await db.select().from(backupSchedules).limit(1);
  if (existing.length > 0) {
    await db.update(backupSchedules).set(data).where(eq(backupSchedules.id, existing[0].id));
  } else {
    await db.insert(backupSchedules).values(data);
  }
}

export async function updateScheduleNextRun(id: number, nextRunAt: Date, lastRunAt: Date): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(backupSchedules).set({ nextRunAt, lastRunAt }).where(eq(backupSchedules.id, id));
}

export async function getBackupHistory(limit = 50): Promise<BackupHistoryEntry[]> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db.select().from(backupHistory).orderBy(desc(backupHistory.createdAt)).limit(limit);
}

export async function createBackupHistoryEntry(
  data: Omit<InsertBackupHistory, "id" | "createdAt">
): Promise<BackupHistoryEntry> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(backupHistory).values(data);
  const rows = await db.select().from(backupHistory).orderBy(desc(backupHistory.createdAt)).limit(1);
  return rows[0];
}

export async function deleteBackupHistoryEntry(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(backupHistory).where(eq(backupHistory.id, id));
}

export async function deleteOldBackupEntries(olderThanDays: number): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const old = await db.select().from(backupHistory).where(
    sql`${backupHistory.createdAt} < ${cutoff}`
  );
  for (const entry of old) {
    await db.delete(backupHistory).where(eq(backupHistory.id, entry.id));
  }
  return old.length;
}

// ─── Configurações do Sistema ────────────────────────────────────────────────
export async function getSystemSettings(): Promise<Record<string, string>> {
  const db = await getDb();
  if (!db) return {};
  const rows = await db.select().from(systemSettings);
  return Object.fromEntries(rows.map((r) => [r.key, r.value ?? ""]));
}

export async function setSystemSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .insert(systemSettings)
    .values({ key, value })
    .onDuplicateKeyUpdate({ set: { value } });
}

export async function setSystemSettings(settings: Record<string, string>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  for (const [key, value] of Object.entries(settings)) {
    await db
      .insert(systemSettings)
      .values({ key, value })
      .onDuplicateKeyUpdate({ set: { value } });
  }
}

// ─── Imagem de Equipamento ────────────────────────────────────────────────────
export async function updateEquipmentImage(id: number, imageUrl: string | null): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(equipments).set({ imageUrl }).where(eq(equipments.id, id));
}

// ─── Relatório de Ocupação ────────────────────────────────────────────────────
export type OccupancyReportRow = {
  equipmentId: number;
  equipmentName: string;
  equipmentType: string;
  roomId: number | null;
  roomName: string | null;
  totalPorts: number;
  freePorts: number;
  occupiedPorts: number;
  reservedPorts: number;
  faultyPorts: number;
  occupancyRate: number;
  ports: Array<{
    id: number;
    portNumber: string;
    label: string | null;
    type: string;
    speed: string | null;
    status: string;
    notes: string | null;
  }>;
};

export async function getOccupancyReport(filters?: {
  roomId?: number;
  equipmentId?: number;
}): Promise<OccupancyReportRow[]> {
  const db = await getDb();
  if (!db) return [];

  let equipQuery = db.select({
    id: equipments.id,
    name: equipments.name,
    type: equipments.type,
    roomId: equipments.roomId,
    totalPorts: equipments.totalPorts,
  }).from(equipments);

  const allEquips = await equipQuery;
  const allRooms = await db.select({ id: rooms.id, name: rooms.name }).from(rooms);
  const roomMap = new Map(allRooms.map((r) => [r.id, r.name]));

  const filtered = allEquips.filter((e) => {
    if (filters?.equipmentId && e.id !== filters.equipmentId) return false;
    if (filters?.roomId && e.roomId !== filters.roomId) return false;
    return true;
  });

  const result: OccupancyReportRow[] = [];
  for (const equip of filtered) {
    const portRows = await db.select().from(ports).where(eq(ports.equipmentId, equip.id)).orderBy(ports.portNumber);
    const total = portRows.length;
    const free = portRows.filter((p) => p.status === "free").length;
    const occupied = portRows.filter((p) => p.status === "occupied").length;
    const reserved = portRows.filter((p) => p.status === "reserved").length;
    const faulty = portRows.filter((p) => p.status === "faulty").length;
    const rate = total > 0 ? Math.round((occupied / total) * 100) : 0;
    result.push({
      equipmentId: equip.id,
      equipmentName: equip.name,
      equipmentType: equip.type,
      roomId: equip.roomId,
      roomName: equip.roomId ? (roomMap.get(equip.roomId) ?? null) : null,
      totalPorts: total,
      freePorts: free,
      occupiedPorts: occupied,
      reservedPorts: reserved,
      faultyPorts: faulty,
      occupancyRate: rate,
      ports: portRows.map((p) => ({
        id: p.id,
        portNumber: p.portNumber,
        label: p.label ?? null,
        type: String(p.type),
        speed: p.speed ? String(p.speed) : null,
        status: String(p.status),
        notes: p.notes ?? null,
      })),
    });
  }

  return result.sort((a, b) => a.equipmentName.localeCompare(b.equipmentName, "pt-BR"));
}

// ─── Login Mobile por Senha ───────────────────────────────────────────────────
export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return rows[0] ?? null;
}

export async function setUserPassword(userId: number, passwordHash: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listUsersForAdmin() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    role: users.role,
    hasPassword: sql<boolean>`${users.passwordHash} IS NOT NULL`,
    mustChangePassword: users.mustChangePassword,
    createdAt: users.createdAt,
    lastSignedIn: users.lastSignedIn,
  }).from(users).orderBy(users.name);
}

// ─── Relatório por Sala (QR Code) ─────────────────────────────────────────────
export interface RoomReportEquipment {
  id: number;
  name: string;
  type: string;
  model: string | null;
  manufacturer: string | null;
  rack: string | null;
  rackPosition: string | null;
  status: string;
  powerType: "ac" | "dc" | null;
  powerSource: "rectifier" | "inverter" | "ups" | "grid" | "other" | null;
  powerSourceLabel: string | null;
  totalPorts: number;
  freePorts: number;
  occupiedPorts: number;
  reservedPorts: number;
  faultyPorts: number;
  occupancyRate: number;
  ports: {
    id: number;
    portNumber: string;
    label: string | null;
    type: string;
    speed: string | null;
    status: string;
    notes: string | null;
  }[];
}

export interface RoomReportData {
  roomId: number;
  roomName: string;
  roomLocation: string | null;
  roomNotes: string | null;
  totalEquipments: number;
  totalPorts: number;
  freePorts: number;
  occupiedPorts: number;
  occupancyRate: number;
  equipments: RoomReportEquipment[];
  generatedAt: Date;
}

export async function getRoomReport(roomId: number): Promise<RoomReportData | null> {
  const db = await getDb();
  if (!db) return null;

  // Buscar dados da sala
  const roomRows = await db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
  if (!roomRows.length) return null;
  const room = roomRows[0];

  // Buscar equipamentos da sala com campos de energia
  const equipRows = await db.select({
    id: equipments.id,
    name: equipments.name,
    type: equipments.type,
    model: equipments.model,
    manufacturer: equipments.manufacturer,
    rack: equipments.rack,
    rackPosition: equipments.rackPosition,
    status: equipments.status,
    totalPorts: equipments.totalPorts,
    powerType: equipments.powerType,
    powerSource: equipments.powerSource,
    powerSourceLabel: equipments.powerSourceLabel,
  }).from(equipments).where(eq(equipments.roomId, roomId)).orderBy(equipments.rack, equipments.rackPosition, equipments.name);

  const reportEquipments: RoomReportEquipment[] = [];
  let totalPortsAll = 0;
  let freePortsAll = 0;
  let occupiedPortsAll = 0;

  for (const equip of equipRows) {
    const portRows = await db.select().from(ports).where(eq(ports.equipmentId, equip.id)).orderBy(ports.portNumber);
    const total = portRows.length;
    const free = portRows.filter((p) => p.status === "free").length;
    const occupied = portRows.filter((p) => p.status === "occupied").length;
    const reserved = portRows.filter((p) => p.status === "reserved").length;
    const faulty = portRows.filter((p) => p.status === "faulty").length;
    const rate = total > 0 ? Math.round((occupied / total) * 100) : 0;

    totalPortsAll += total;
    freePortsAll += free;
    occupiedPortsAll += occupied;

    reportEquipments.push({
      id: equip.id,
      name: equip.name,
      type: equip.type,
      model: equip.model ?? null,
      manufacturer: equip.manufacturer ?? null,
      rack: equip.rack ?? null,
      rackPosition: equip.rackPosition ?? null,
      status: equip.status ?? "active",
      powerType: equip.powerType ?? null,
      powerSource: equip.powerSource ?? null,
      powerSourceLabel: equip.powerSourceLabel ?? null,
      totalPorts: total,
      freePorts: free,
      occupiedPorts: occupied,
      reservedPorts: reserved,
      faultyPorts: faulty,
      occupancyRate: rate,
      ports: portRows.map((p) => ({
        id: p.id,
        portNumber: p.portNumber,
        label: p.label ?? null,
        type: String(p.type),
        speed: p.speed ? String(p.speed) : null,
        status: String(p.status),
        notes: p.notes ?? null,
      })),
    });
  }

  const globalRate = totalPortsAll > 0 ? Math.round((occupiedPortsAll / totalPortsAll) * 100) : 0;

  return {
    roomId: room.id,
    roomName: room.name,
    roomLocation: (room as any).location ?? null,
    roomNotes: (room as any).notes ?? null,
    totalEquipments: equipRows.length,
    totalPorts: totalPortsAll,
    freePorts: freePortsAll,
    occupiedPorts: occupiedPortsAll,
    occupancyRate: globalRate,
    equipments: reportEquipments,
    generatedAt: new Date(),
  };
}

// ─── Fontes de Energia (Power Sources) ───────────────────────────────────────
export async function getPowerSources(): Promise<PowerSource[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(powerSources).orderBy(powerSources.name);
}

export async function getPowerSourceById(id: number): Promise<PowerSource | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(powerSources).where(eq(powerSources.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createPowerSource(data: Omit<InsertPowerSource, "id" | "createdAt" | "updatedAt">): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(powerSources).values(data as InsertPowerSource);
  return (result[0] as any).insertId;
}

export async function updatePowerSource(id: number, data: Partial<InsertPowerSource>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(powerSources).set(data).where(eq(powerSources.id, id));
}

export async function deletePowerSource(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Desvincula equipamentos antes de excluir
  await db.update(equipments).set({ powerSourceId: null } as any).where(eq((equipments as any).powerSourceId, id));
  await db.delete(powerSources).where(eq(powerSources.id, id));
}

export async function updatePowerSourceSnmpData(id: number, data: {
  lastPollAt: Date;
  lastVoltage?: number | null;
  lastCurrent?: number | null;
  lastTemperature?: number | null;
  lastAlarmStatus?: string | null;
  lastBatteryLevel?: number | null;
  lastLoadPercent?: number | null;
  lastPollError?: string | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(powerSources).set(data as any).where(eq(powerSources.id, id));
}

// ─── Alertas SNMP ─────────────────────────────────────────────────────────────
export async function getSnmpAlerts(opts?: {
  powerSourceId?: number;
  onlyActive?: boolean;
  limit?: number;
}): Promise<SnmpAlert[]> {
  const db = await getDb();
  if (!db) return [];
  let q = db.select().from(snmpAlerts).$dynamic();
  const conds = [];
  if (opts?.powerSourceId) conds.push(eq(snmpAlerts.powerSourceId, opts.powerSourceId));
  if (opts?.onlyActive) conds.push(sql`${snmpAlerts.resolvedAt} IS NULL`);
  if (conds.length) q = q.where(and(...conds)) as any;
  q = q.orderBy(desc(snmpAlerts.createdAt)) as any;
  if (opts?.limit) q = q.limit(opts.limit) as any;
  return q;
}

export async function countActiveSnmpAlerts(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(snmpAlerts)
    .where(sql`${snmpAlerts.resolvedAt} IS NULL`);
  return Number(rows[0]?.count ?? 0);
}

export async function createSnmpAlert(data: Omit<InsertSnmpAlert, "id" | "createdAt" | "updatedAt">): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(snmpAlerts).values(data as InsertSnmpAlert);
  return (result[0] as any).insertId;
}

export async function acknowledgeSnmpAlert(id: number, acknowledgedBy: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(snmpAlerts)
    .set({ acknowledgedAt: new Date(), acknowledgedBy })
    .where(eq(snmpAlerts.id, id));
}

export async function resolveSnmpAlert(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(snmpAlerts)
    .set({ resolvedAt: new Date() })
    .where(eq(snmpAlerts.id, id));
}

export async function resolveAlertsByTypeAndSource(powerSourceId: number, alertType: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(snmpAlerts)
    .set({ resolvedAt: new Date() })
    .where(and(
      eq(snmpAlerts.powerSourceId, powerSourceId),
      eq(snmpAlerts.alertType as any, alertType),
      sql`${snmpAlerts.resolvedAt} IS NULL`
    ));
}

export async function hasActiveAlertOfType(powerSourceId: number, alertType: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const rows = await db
    .select({ id: snmpAlerts.id })
    .from(snmpAlerts)
    .where(and(
      eq(snmpAlerts.powerSourceId, powerSourceId),
      eq(snmpAlerts.alertType as any, alertType),
      sql`${snmpAlerts.resolvedAt} IS NULL`
    ))
    .limit(1);
  return rows.length > 0;
}

// ─── Dispositivos Tuya IoT ─────────────────────────────────────────────────────
export async function getTuyaDevices(): Promise<TuyaDevice[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tuyaDevices).orderBy(tuyaDevices.name);
}

export async function getTuyaDeviceById(id: number): Promise<TuyaDevice | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(tuyaDevices).where(eq(tuyaDevices.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createTuyaDevice(data: Omit<InsertTuyaDevice, "id" | "createdAt" | "updatedAt">): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.insert(tuyaDevices).values(data as InsertTuyaDevice);
  return (result as any)[0]?.insertId ?? 0;
}

export async function updateTuyaDevice(id: number, data: Partial<InsertTuyaDevice>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(tuyaDevices).set(data as any).where(eq(tuyaDevices.id, id));
}

export async function deleteTuyaDevice(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(tuyaDevices).where(eq(tuyaDevices.id, id));
}

export async function updateTuyaDeviceStatus(id: number, data: {
  status: "online" | "offline" | "unknown";
  lastPolledAt?: Date;
  lastPollError?: string | null;
  lastTemperature?: number | null;
  lastHumidity?: number | null;
  lastCo2?: number | null;
  lastPower?: number | null;
  lastVoltage?: number | null;
  lastCurrent?: number | null;
  lastRawData?: string | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(tuyaDevices).set(data as any).where(eq(tuyaDevices.id, id));
}

// ─── Contas Tuya IoT ──────────────────────────────────────────────────────────
export async function getTuyaAccounts(): Promise<TuyaAccount[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tuyaAccounts).orderBy(tuyaAccounts.name);
}

export async function getTuyaAccountById(id: number): Promise<TuyaAccount | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(tuyaAccounts).where(eq(tuyaAccounts.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createTuyaAccount(data: Omit<InsertTuyaAccount, "id" | "createdAt" | "updatedAt">): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.insert(tuyaAccounts).values(data as InsertTuyaAccount);
  return (result as any)[0]?.insertId ?? 0;
}

export async function updateTuyaAccount(id: number, data: Partial<InsertTuyaAccount>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(tuyaAccounts).set(data as any).where(eq(tuyaAccounts.id, id));
}

export async function deleteTuyaAccount(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(tuyaAccounts).where(eq(tuyaAccounts.id, id));
}

// ─── Tuya Readings (histórico de leituras) ────────────────────────────────────
export async function createTuyaReading(data: Omit<InsertTuyaReading, "id" | "collectedAt">): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(tuyaReadings).values(data as InsertTuyaReading);
  // Manter apenas as últimas 2880 leituras por dispositivo (~24h com polling de 30s ou ~10 dias com 5min)
  const countRows = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(tuyaReadings)
    .where(eq(tuyaReadings.deviceId, data.deviceId as number));
  const count = Number(countRows[0]?.count ?? 0);
  if (count > 2880) {
    // Deletar as mais antigas além do limite
    const oldest = await db
      .select({ id: tuyaReadings.id })
      .from(tuyaReadings)
      .where(eq(tuyaReadings.deviceId, data.deviceId as number))
      .orderBy(tuyaReadings.collectedAt)
      .limit(count - 2880);
    if (oldest.length > 0) {
      const ids = oldest.map((r) => r.id);
      await db.delete(tuyaReadings).where(inArray(tuyaReadings.id, ids));
    }
  }
}

export async function getTuyaReadingsByDevice(deviceId: number, hours = 24): Promise<TuyaReading[]> {
  const db = await getDb();
  if (!db) return [];
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  return db
    .select()
    .from(tuyaReadings)
    .where(and(eq(tuyaReadings.deviceId, deviceId), gte(tuyaReadings.collectedAt, since)))
    .orderBy(tuyaReadings.collectedAt);
}

export async function getLatestTuyaReadings(): Promise<Array<TuyaDevice & { latestReading: TuyaReading | null }>> {
  const db = await getDb();
  if (!db) return [];
  const devices = await db
    .select()
    .from(tuyaDevices)
    .where(eq(tuyaDevices.status, "online"))
    .orderBy(tuyaDevices.name);
  // Para cada dispositivo, buscar a leitura mais recente
  const result = await Promise.all(
    devices.map(async (device) => {
      const readings = await db
        .select()
        .from(tuyaReadings)
        .where(eq(tuyaReadings.deviceId, device.id))
        .orderBy(desc(tuyaReadings.collectedAt))
        .limit(1);
      return { ...device, latestReading: readings[0] ?? null };
    })
  );
  return result;
}
