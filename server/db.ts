import { and, desc, eq, like, or, sql } from "drizzle-orm";
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
export async function getEquipments(search?: string, type?: string, roomId?: number, status?: string) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (search) conditions.push(or(like(equipments.name, `%${search}%`), like(equipments.model, `%${search}%`), like(equipments.manufacturer, `%${search}%`)));
  if (type) conditions.push(eq(equipments.type, type as Equipment["type"]));
  if (roomId) conditions.push(eq(equipments.roomId, roomId));
  if (status) conditions.push(eq(equipments.status, status as Equipment["status"]));
  const query = db.select({
    id: equipments.id, name: equipments.name, type: equipments.type, model: equipments.model,
    manufacturer: equipments.manufacturer, serialNumber: equipments.serialNumber,
    roomId: equipments.roomId, rack: equipments.rack, rackPosition: equipments.rackPosition,
    ipAddress: equipments.ipAddress, macAddress: equipments.macAddress, totalPorts: equipments.totalPorts,
    notes: equipments.notes, status: equipments.status, createdAt: equipments.createdAt, updatedAt: equipments.updatedAt,
    roomName: rooms.name,
  }).from(equipments).leftJoin(rooms, eq(equipments.roomId, rooms.id));
  if (conditions.length > 0) return query.where(and(...conditions)).orderBy(equipments.name);
  return query.orderBy(equipments.name);
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
  return db.select().from(ports).where(eq(ports.equipmentId, equipmentId)).orderBy(ports.portNumber);
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
    roomName: rooms.name,
  }).from(equipments).leftJoin(rooms, eq(equipments.roomId, rooms.id));

  const allConnections = await db.select({
    id: connections.id, name: connections.name, status: connections.status, type: connections.type,
    sourcePortId: connections.sourcePortId, targetPortId: connections.targetPortId,
  }).from(connections);

  const allPorts = await db.select().from(ports);

  const portMap = new Map(allPorts.map((p) => [p.id, p]));

  const edges = allConnections.map((c) => {
    const srcPort = portMap.get(c.sourcePortId);
    const tgtPort = portMap.get(c.targetPortId);
    return {
      id: c.id, name: c.name, status: c.status, type: c.type,
      sourceEquipmentId: srcPort?.equipmentId, targetEquipmentId: tgtPort?.equipmentId,
      sourcePortId: c.sourcePortId, targetPortId: c.targetPortId,
    };
  });

  return { nodes: allEquipments, edges };
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
