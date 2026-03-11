import { and, desc, eq, gte, inArray, isNotNull, isNull, like, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2";
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
  topologyLayouts,
  TopologyLayout,
  snmpReadings,
  SnmpReading,
  InsertSnmpReading,
  racks,
  Rack,
  InsertRack,
  mapGroups,
  MapGroup,
  InsertMapGroup,
  mapElementGroups,
  MapElementGroup,
  mapRouteGroups,
  MapRouteGroup,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _pool: mysql.Pool | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

function createPool(): mysql.Pool {
  const pool = mysql.createPool({
    uri: process.env.DATABASE_URL!,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 30000,
    connectTimeout: 10000,
    // Sem timezone forçado — usar timezone do servidor MySQL (consistente com timestamps guardados)
  });
  // Reconectar automaticamente em caso de ECONNRESET ou PROTOCOL_CONNECTION_LOST
  pool.on('connection', (conn: any) => {
    conn.on('error', (err: any) => {
      if (err.code === 'ECONNRESET' || err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ENOTFOUND') {
        console.warn('[Database] Connection lost, pool will reconnect automatically:', err.code);
        _db = null;
        _pool = null;
      }
    });
  });
  return pool;
}

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      if (!_pool) {
        _pool = createPool();
      }
      // Use promise pool for drizzle compatibility
      _db = drizzle(_pool.promise() as any);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
      _pool = null;
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
    powerSourceId: equipments.powerSourceId,
    // Altura em rack
    rackUnits: equipments.rackUnits,
    // Campos SSH
    sshUser: equipments.sshUser,
    sshPort: equipments.sshPort,
    // Nota: sshPasswordEnc não é retornado na listagem por segurança
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
  const rows = await db
    .select({
      // Todos os campos da porta
      id: ports.id,
      equipmentId: ports.equipmentId,
      slotId: ports.slotId,
      portNumber: ports.portNumber,
      label: ports.label,
      type: ports.type,
      speed: ports.speed,
      status: ports.status,
      notes: ports.notes,
      sortOrder: ports.sortOrder,
      connectedToEquipmentId: ports.connectedToEquipmentId,
      connectedToPortId: ports.connectedToPortId,
      createdAt: ports.createdAt,
      // Campos do equipamento vinculado (via LEFT JOIN)
      connectedEquipmentName: equipments.name,
      connectedPortNumber: sql<string | null>`connected_port.portNumber`,
      connectedPortLabel: sql<string | null>`connected_port.label`,
      // Campos do slot (via LEFT JOIN)
      slotNumber: sql<string | null>`es.slotNumber`,
      slotLabel: sql<string | null>`es.label`,
    })
    .from(ports)
    .leftJoin(equipments, eq(ports.connectedToEquipmentId, equipments.id))
    .leftJoin(
      sql`${ports} AS connected_port`,
      sql`connected_port.id = ${ports.connectedToPortId}`
    )
    .leftJoin(
      sql`equipment_slots AS es`,
      sql`es.id = ${ports.slotId}`
    )
    .where(eq(ports.equipmentId, equipmentId))
    .orderBy(sql`es.slotNumber`, ports.sortOrder, ports.portNumber);
  return rows;
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

// Busca de porta por etiqueta ou descrição (cross-equipment)
export async function searchPorts(query: string, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  const q = `%${query}%`;
  const rows = await db
    .select({
      id: ports.id,
      equipmentId: ports.equipmentId,
      equipmentName: equipments.name,
      portNumber: ports.portNumber,
      label: ports.label,
      type: ports.type,
      speed: ports.speed,
      status: ports.status,
      notes: ports.notes,
      connectedToEquipmentId: ports.connectedToEquipmentId,
      connectedToPortId: ports.connectedToPortId,
    })
    .from(ports)
    .leftJoin(equipments, eq(ports.equipmentId, equipments.id))
    .where(
      or(
        like(ports.label, q),
        like(ports.notes, q),
        like(ports.portNumber, q),
        like(equipments.name, q),
      )
    )
    .orderBy(ports.status, equipments.name, ports.portNumber)
    .limit(limit);
  return rows;
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
  // CTOs stats
  const ctosAll = await db.select({ status: ctos.status, capacity: ctos.capacity, usedPorts: ctos.usedPorts }).from(ctos);
  const ctoTotal = ctosAll.length;
  const ctoActive = ctosAll.filter(c => c.status === "active").length;
  const ctoMaintenance = ctosAll.filter(c => c.status === "maintenance").length;
  const ctoInactive = ctosAll.filter(c => c.status === "inactive").length;
  const ctoTotalCapacity = ctosAll.reduce((s, c) => s + (Number(c.capacity) || 0), 0);
  const ctoTotalUsed = ctosAll.reduce((s, c) => s + (Number(c.usedPorts) || 0), 0);
  const ctoOccupancyRate = ctoTotalCapacity > 0 ? Math.round((ctoTotalUsed / ctoTotalCapacity) * 100) : 0;

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

  // Comprimento total da rede (soma dos traçados de cabos)
  const allRoutes = await db.execute(sql`SELECT path FROM map_routes`) as any;
  const haversineKm = (a: {lat:number;lng:number}, b: {lat:number;lng:number}) => {
    const R = 6371;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const s = Math.sin(dLat/2)**2 + Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1-s));
  };
  let totalNetworkKm = 0;
  const routeRows: any[] = Array.isArray(allRoutes[0]) ? allRoutes[0] : (allRoutes.rows ?? allRoutes);
  const totalRoutes = routeRows.length;
  for (const r of routeRows) {
    try {
      if (!r.path) continue;
      const pts: {lat:number;lng:number}[] = JSON.parse(r.path);
      for (let i = 1; i < pts.length; i++) totalNetworkKm += haversineKm(pts[i-1], pts[i]);
    } catch {}
  }

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
    ctoStats: { total: ctoTotal, active: ctoActive, maintenance: ctoMaintenance, inactive: ctoInactive, totalCapacity: ctoTotalCapacity, totalUsed: ctoTotalUsed, occupancyRate: ctoOccupancyRate },
    equipmentByType: equipByType.map((e) => ({ type: e.type, count: Number(e.count) })),
    recentHistory,
    capacityAlerts,
    alertThreshold,
    totalNetworkKm: Math.round(totalNetworkKm * 10) / 10,
    totalRoutes,
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
import { ceos, ceoTubes, ceoVias, InsertCeo, InsertCeoTube, InsertCeoVia, ceoBandejas, InsertCeoBandeja, ceoSplitters, InsertCeoSplitter, ceoSplitterVias, InsertCeoSplitterVia, ceoViaAssociations, InsertCeoViaAssociation, ctoTubes, ctoVias, InsertCtoTube, InsertCtoVia, ctoViaAssociations, InsertCtoViaAssociation } from "../drizzle/schema";

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

export async function createCeo(data: Omit<InsertCeo, "id" | "createdAt" | "updatedAt">): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(ceos).values(data);
  return (result[0] as any).insertId;
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
  // Remove o marcador do mapa vinculado a este CEO (se existir)
  await db.delete(mapElements).where(and(eq(mapElements.type, "ceo"), eq(mapElements.referenceId, id)));
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
  // Garantir que color sempre tenha valor válido; omitir notes quando vazio para compatibilidade com NOT NULL
  const colorVal = (data.color && data.color.trim() !== "") ? data.color.trim() : "blue";
  const notesVal = (data.notes && data.notes.trim() !== "") ? data.notes.trim() : undefined;
  const insertData: any = {
    ceoId: data.ceoId,
    bandejaId: (data as any).bandejaId ?? null,
    type: data.type ?? "tube",
    identifier: data.identifier,
    totalVias: data.totalVias ?? 12,
    color: colorVal,
  };
  if (notesVal !== undefined) insertData.notes = notesVal;
  const result = await db.insert(ceoTubes).values(insertData);
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
  // Propagar label à via fundida (sincronização bidirecional)
  if (data.label !== undefined) {
    const [via] = await db.select({ fusedToViaId: ceoVias.fusedToViaId }).from(ceoVias).where(eq(ceoVias.id, id));
    if (via?.fusedToViaId) {
      await db.update(ceoVias).set({ label: data.label }).where(eq(ceoVias.id, via.fusedToViaId));
    }
  }
}

export async function setViaFiber(viaId: number, fiberId: number | null) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(ceoVias).set({ fiberId }).where(eq(ceoVias.id, viaId));
}

// ─── CTO Tubes ──────────────────────────────────────────────────────────────────
export async function getTubesByCto(ctoId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(ctoTubes).where(eq(ctoTubes.ctoId, ctoId));
  return rows.sort((a, b) => a.identifier.localeCompare(b.identifier, "pt-BR", { numeric: true }));
}
export async function createCtoTube(data: Omit<InsertCtoTube, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Garantir que color sempre tenha valor válido; omitir notes quando vazio para compatibilidade com NOT NULL
  const colorVal = (data.color && data.color.trim() !== "") ? data.color.trim() : "blue";
  const notesVal = (data.notes && data.notes.trim() !== "") ? data.notes.trim() : undefined;
  const insertData: any = {
    ctoId: data.ctoId,
    type: data.type ?? "tube",
    identifier: data.identifier,
    totalVias: data.totalVias ?? 12,
    color: colorVal,
  };
  if (notesVal !== undefined) insertData.notes = notesVal;
  const result = await db.insert(ctoTubes).values(insertData);
  const insertId = (result as any)[0]?.insertId ?? 0;
  const totalVias = data.totalVias ?? 0;
  if (totalVias > 0) {
    const viaRows: Omit<InsertCtoVia, "id" | "createdAt" | "updatedAt">[] = [];
    const isSplitter = (data.type ?? "tube") === "splitter";
    // Para splitters: criar via de Entrada (viaNumber=0) + saídas (1..N), igual ao CEO
    if (isSplitter) {
      viaRows.push({ tubeId: insertId, ctoId: data.ctoId, viaNumber: 0, label: "ENT" });
    }
    for (let i = 1; i <= totalVias; i++) {
      viaRows.push({ tubeId: insertId, ctoId: data.ctoId, viaNumber: i });
    }
    if (viaRows.length > 0) await db.insert(ctoVias).values(viaRows);
  }
  return insertId;
}
export async function updateCtoTube(id: number, data: Partial<Omit<InsertCtoTube, "id" | "createdAt" | "updatedAt">>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(ctoTubes).set(data).where(eq(ctoTubes.id, id));
}
export async function deleteCtoTube(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(ctoVias).set({ fusedToTubeId: null, fusedToViaId: null }).where(eq(ctoVias.fusedToTubeId, id));
  await db.delete(ctoVias).where(eq(ctoVias.tubeId, id));
  await db.delete(ctoTubes).where(eq(ctoTubes.id, id));
}
// ─── CTO Vias ─────────────────────────────────────────────────────────────────
export async function getViasByCtotube(tubeId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(ctoVias).where(eq(ctoVias.tubeId, tubeId));
  return rows.sort((a, b) => a.viaNumber - b.viaNumber);
}
export async function getViasByCto(ctoId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(ctoVias).where(eq(ctoVias.ctoId, ctoId));
  return rows.sort((a, b) => a.viaNumber - b.viaNumber);
}
export async function setCtoViaFusion(
  viaId: number,
  fusedToTubeId: number | null,
  fusedToViaId: number | null,
  notes?: string
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const originRows = await db.select().from(ctoVias).where(eq(ctoVias.id, viaId)).limit(1);
  const origin = originRows[0];
  if (!origin) throw new Error("Via de origem não encontrada");
  await db.update(ctoVias).set({ fusedToTubeId, fusedToViaId, notes: notes ?? null }).where(eq(ctoVias.id, viaId));
  if (fusedToViaId !== null && fusedToTubeId !== null) {
    await db.update(ctoVias).set({ fusedToTubeId: origin.tubeId, fusedToViaId: viaId }).where(eq(ctoVias.id, fusedToViaId));
  }
}
export async function clearCtoViaFusion(viaId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const rows = await db.select().from(ctoVias).where(eq(ctoVias.id, viaId)).limit(1);
  const via = rows[0];
  await db.update(ctoVias).set({ fusedToTubeId: null, fusedToViaId: null }).where(eq(ctoVias.id, viaId));
  if (via?.fusedToViaId) {
    await db.update(ctoVias).set({ fusedToTubeId: null, fusedToViaId: null }).where(eq(ctoVias.id, via.fusedToViaId));
  }
}
export async function updateCtoVia(id: number, data: { label?: string | null; notes?: string | null; fiberId?: number | null }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(ctoVias).set(data).where(eq(ctoVias.id, id));
  // Propagar label à via fundida (sincronização bidirecional)
  if (data.label !== undefined) {
    const [via] = await db.select({ fusedToViaId: ctoVias.fusedToViaId }).from(ctoVias).where(eq(ctoVias.id, id));
    if (via?.fusedToViaId) {
      await db.update(ctoVias).set({ label: data.label }).where(eq(ctoVias.id, via.fusedToViaId));
    }
  }
}
export async function setCtoViaFiber(viaId: number, fiberId: number | null) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(ctoVias).set({ fiberId }).where(eq(ctoVias.id, viaId));
}
// ─── Gerenciamento de Usuários ────────────────────────────────────────────────
export async function getAllUsers(): Promise<Array<{
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  role: "admin" | "user" | "operator";
  loginMethod: string | null;
  createdAt: Date;
  lastSignedIn: Date;
}>> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const rows = await db.select({
    id: users.id,
    openId: users.openId,
    name: users.name,
    email: users.email,
    role: users.role,
    loginMethod: users.loginMethod,
    createdAt: users.createdAt,
    lastSignedIn: users.lastSignedIn,
  }).from(users).orderBy(desc(users.createdAt));
  return rows as Array<{
    id: number;
    openId: string;
    name: string | null;
    email: string | null;
    role: "admin" | "user" | "operator";
    loginMethod: string | null;
    createdAt: Date;
    lastSignedIn: Date;
  }>;
}

export async function updateUserRole(userId: number, role: "admin" | "operator" | "user") {
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

/** Retorna todos os vínculos de portas entre equipamentos (para o mapa de conexões).
 *  Cada linha representa uma conexão única (porta A → porta B, onde equipA.id < equipB.id
 *  para evitar duplicatas). */
export async function getAllPortLinks() {
  const db = await getDb();
  if (!db) return [];
  // Busca todas as portas que têm vínculo definido
  const rows = await db
    .select({
      portId: ports.id,
      portNumber: ports.portNumber,
      portLabel: ports.label,
      equipmentId: ports.equipmentId,
      equipmentName: equipments.name,
      equipmentRack: equipments.rack,
      equipmentRackPosition: equipments.rackPosition,
      connectedToEquipmentId: ports.connectedToEquipmentId,
      connectedToPortId: ports.connectedToPortId,
    })
    .from(ports)
    .innerJoin(equipments, eq(ports.equipmentId, equipments.id))
    .where(sql`${ports.connectedToEquipmentId} IS NOT NULL AND ${ports.connectedToPortId} IS NOT NULL`);

  // Desduplicar: manter apenas pares onde equipmentId < connectedToEquipmentId
  const seen = new Set<string>();
  const links: Array<{
    portId: number;
    portNumber: string;
    portLabel: string | null;
    equipmentId: number;
    equipmentName: string;
    equipmentRack: string | null;
    equipmentRackPosition: string | null;
    connectedToEquipmentId: number;
    connectedToPortId: number;
  }> = [];

  for (const row of rows) {
    if (!row.connectedToEquipmentId || !row.connectedToPortId) continue;
    const key = [
      Math.min(row.equipmentId, row.connectedToEquipmentId),
      Math.max(row.equipmentId, row.connectedToEquipmentId),
      Math.min(row.portId, row.connectedToPortId),
      Math.max(row.portId, row.connectedToPortId),
    ].join('-');
    if (!seen.has(key)) {
      seen.add(key);
      links.push({
        portId: row.portId,
        portNumber: row.portNumber,
        portLabel: row.portLabel,
        equipmentId: row.equipmentId,
        equipmentName: row.equipmentName,
        equipmentRack: row.equipmentRack,
        equipmentRackPosition: row.equipmentRackPosition,
        connectedToEquipmentId: row.connectedToEquipmentId,
        connectedToPortId: row.connectedToPortId,
      });
    }
  }
  return links;
}

// ─── Topology Layout ──────────────────────────────────────────────────────────
export async function getTopologyLayout(userId: number, roomFilter: string): Promise<TopologyLayout | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(topologyLayouts)
    .where(and(eq(topologyLayouts.userId, userId), eq(topologyLayouts.roomFilter, roomFilter)))
    .limit(1);
  return rows[0] ?? null;
}

export async function saveTopologyLayout(
  userId: number,
  roomFilter: string,
  nodePositions: Record<string, { x: number; y: number }>,
  ctrlPoints: Record<string, { x: number; y: number }>,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await getTopologyLayout(userId, roomFilter);
  const nodeJson = JSON.stringify(nodePositions);
  const ctrlJson = JSON.stringify(ctrlPoints);
  if (existing) {
    await db
      .update(topologyLayouts)
      .set({ nodePositions: nodeJson, ctrlPoints: ctrlJson })
      .where(eq(topologyLayouts.id, existing.id));
  } else {
    await db.insert(topologyLayouts).values({
      userId,
      roomFilter,
      nodePositions: nodeJson,
      ctrlPoints: ctrlJson,
    });
  }
}

// ─── Histórico de Leituras SNMP ───────────────────────────────────────────────
export async function saveSnmpReading(
  powerSourceId: number,
  data: {
    voltage?: number | null;
    current?: number | null;
    temperature?: number | null;
    batteryLevel?: number | null;
    loadPercent?: number | null;
    alarmStatus?: string | null;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Só salva se houver pelo menos um valor
  const hasData = Object.values(data).some((v) => v != null);
  if (!hasData) return;
  await db.insert(snmpReadings).values({
    powerSourceId,
    voltage: data.voltage ?? undefined,
    current: data.current ?? undefined,
    temperature: data.temperature ?? undefined,
    batteryLevel: data.batteryLevel ?? undefined,
    loadPercent: data.loadPercent ?? undefined,
    alarmStatus: data.alarmStatus ?? undefined,
  });
  // Manter apenas as últimas 2000 leituras por fonte (limpeza automática)
  const db2 = await getDb();
  if (!db2) return;
  const oldest = await db2
    .select({ id: snmpReadings.id })
    .from(snmpReadings)
    .where(eq(snmpReadings.powerSourceId, powerSourceId))
    .orderBy(desc(snmpReadings.collectedAt))
    .offset(2000)
    .limit(1);
  if (oldest.length > 0) {
    await db2
      .delete(snmpReadings)
      .where(
        and(
          eq(snmpReadings.powerSourceId, powerSourceId),
          sql`${snmpReadings.collectedAt} < (SELECT collectedAt FROM snmp_readings WHERE powerSourceId = ${powerSourceId} ORDER BY collectedAt DESC LIMIT 1 OFFSET 1999)`
        )
      );
  }
}

export async function getSnmpReadings(
  powerSourceId: number,
  hours: number = 24
): Promise<SnmpReading[]> {
  const db = await getDb();
  if (!db) return [];
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  return db
    .select()
    .from(snmpReadings)
    .where(
      and(
        eq(snmpReadings.powerSourceId, powerSourceId),
        gte(snmpReadings.collectedAt, since)
      )
    )
    .orderBy(snmpReadings.collectedAt)
    .limit(500);
}

// ─── Racks ────────────────────────────────────────────────────────────────────
export async function getRacks(roomId?: number): Promise<Rack[]> {
  const db = await getDb();
  if (!db) return [];
  if (roomId !== undefined) {
    return db.select().from(racks).where(eq(racks.roomId, roomId)).orderBy(racks.name);
  }
  return db.select().from(racks).orderBy(racks.name);
}

export async function getRackById(id: number): Promise<Rack | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(racks).where(eq(racks.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createRack(data: Omit<InsertRack, "id" | "createdAt" | "updatedAt">): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(racks).values(data);
  return (result[0] as any).insertId;
}

export async function updateRack(id: number, data: Partial<Omit<InsertRack, "id" | "createdAt" | "updatedAt">>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(racks).set(data).where(eq(racks.id, id));
}

export async function deleteRack(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(racks).where(eq(racks.id, id));
}

// ─── CTOs ─────────────────────────────────────────────────────────────────────
import { ctos, Cto, InsertCto, mapElements, MapElement, InsertMapElement, mapRoutes, MapRoute, InsertMapRoute, sgpConfig, SgpConfig, InsertSgpConfig, ctoAlerts, CtoAlert, ctoAlertConfig, CtoAlertConfig, sgpLinkHistory, SgpLinkHistory } from "../drizzle/schema";

export async function getCtos(): Promise<Cto[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(ctos).orderBy(ctos.name);
}
export async function getCtoById(id: number): Promise<Cto | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(ctos).where(eq(ctos.id, id)).limit(1);
  return rows[0] ?? null;
}
export async function createCto(data: Omit<InsertCto, "id" | "createdAt" | "updatedAt">): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(ctos).values(data);
  return (result[0] as any).insertId;
}
export async function updateCto(id: number, data: Partial<Omit<InsertCto, "id" | "createdAt" | "updatedAt">>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(ctos).set(data).where(eq(ctos.id, id));
}
export async function deleteCto(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Remove vias e tubos em cascata
  const tubes = await db.select().from(ctoTubes).where(eq(ctoTubes.ctoId, id));
  for (const tube of tubes) {
    await db.delete(ctoVias).where(eq(ctoVias.tubeId, tube.id));
  }
  await db.delete(ctoTubes).where(eq(ctoTubes.ctoId, id));
  // Remove o marcador do mapa vinculado a esta CTO (se existir)
  await db.delete(mapElements).where(and(eq(mapElements.type, "cto"), eq(mapElements.referenceId, id)));
  await db.delete(ctos).where(eq(ctos.id, id));
}

// ─── Map Elements ─────────────────────────────────────────────────────────────
export async function getMapElements(): Promise<MapElement[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(mapElements);
}
export async function upsertMapElement(type: string, referenceId: number, lat: number, lng: number, color?: string | null): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(mapElements)
    .where(eq(mapElements.referenceId, referenceId))
    .limit(1);
  if (existing.length > 0) {
    const updateData: any = { lat, lng };
    if (color !== undefined) updateData.color = color;
    await db.update(mapElements).set(updateData).where(eq(mapElements.id, existing[0].id));
    return existing[0].id;
  }
  const result = await db.insert(mapElements).values({ type, referenceId, lat, lng, color: color ?? null });
  return (result[0] as any).insertId;
}
export async function deleteMapElement(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(mapElements).where(eq(mapElements.id, id));
}

// ─── Map Routes ───────────────────────────────────────────────────────────────
export async function getMapRoutes(): Promise<MapRoute[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(mapRoutes).orderBy(mapRoutes.id);
}
export async function createMapRoute(data: Omit<InsertMapRoute, "id" | "createdAt" | "updatedAt">): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Usar SQL raw para garantir que fromElementId e toElementId sejam sempre passados
  // como valores inteiros (nunca como DEFAULT), pois no servidor físico são NOT NULL
  const fromId = (data.fromElementId != null && data.fromElementId > 0) ? data.fromElementId : 0;
  const toId   = (data.toElementId   != null && data.toElementId   > 0) ? data.toElementId   : 0;
  const name       = (data.name  && data.name.trim()  !== "") ? data.name.trim()  : "Cabo";
  const fiberCount = data.fiberCount ?? 12;
  const cableType  = data.cableType  ?? "FO";
  const color      = data.color      ?? "#22d3ee";
  const path       = data.path       ?? "[]";
  const notes      = (data.notes && data.notes.trim() !== "") ? data.notes.trim() : null;
  // Usar pool diretamente para SQL raw (evita que Drizzle gere DEFAULT em campos NOT NULL)
  if (!_pool) _pool = createPool();
  const [result] = await _pool.promise().execute(
    `INSERT INTO map_routes (name, fromElementId, toElementId, fiberCount, cableType, color, path, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, fromId, toId, fiberCount, cableType, color, path, notes]
  );
  return (result as any).insertId;
}
export async function updateMapRoute(id: number, data: Partial<Omit<InsertMapRoute, "id" | "createdAt" | "updatedAt">> & { fromElementId?: number | null; toElementId?: number | null; fromTubeId?: number | null; toTubeId?: number | null }): Promise<void> {
  // Usar raw SQL via _pool para garantir que null é enviado como SQL NULL
  // O Drizzle ORM com sql`NULL` ainda pode falhar em alguns drivers MySQL/TiDB
  if (!_pool) _pool = createPool();
  const setClauses: string[] = [];
  const params: any[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === null) {
      setClauses.push(`\`${key}\` = NULL`);
      // NULL não precisa de parâmetro
    } else if (value !== undefined) {
      setClauses.push(`\`${key}\` = ?`);
      params.push(value);
    }
  }
  if (setClauses.length === 0) return;
  params.push(id);
  await _pool.promise().execute(
    `UPDATE \`map_routes\` SET ${setClauses.join(", ")} WHERE \`id\` = ?`,
    params
  );
}
export async function deleteMapRoute(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(mapRoutes).where(eq(mapRoutes.id, id));
}

// ─── SGP Config ───────────────────────────────────────────────────────────────
export async function getSgpConfig(): Promise<SgpConfig | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(sgpConfig).limit(1);
  return rows[0] ?? null;
}
export async function saveSgpConfig(data: { baseUrl: string; token: string; app: string; active: boolean }): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(sgpConfig).limit(1);
  if (existing.length > 0) {
    await db.update(sgpConfig).set(data).where(eq(sgpConfig.id, existing[0].id));
  } else {
    await db.insert(sgpConfig).values(data);
  }
}

// ─── Alertas de Ocupação de CTOs ──────────────────────────────────────────────
export async function getCtoAlertConfig(): Promise<CtoAlertConfig | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(ctoAlertConfig).limit(1);
  return rows[0] ?? null;
}

export async function saveCtoAlertConfig(data: {
  enabled: boolean;
  warningThreshold: number;
  criticalThreshold: number;
  checkIntervalMinutes: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(ctoAlertConfig).limit(1);
  if (existing.length > 0) {
    await db.update(ctoAlertConfig).set(data).where(eq(ctoAlertConfig.id, existing[0].id));
  } else {
    await db.insert(ctoAlertConfig).values(data);
  }
}

export async function getCtoAlerts(opts?: {
  onlyActive?: boolean;
  limit?: number;
}): Promise<(CtoAlert & { ctoName: string })[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (opts?.onlyActive) {
    conditions.push(isNull(ctoAlerts.resolvedAt));
  }
  const rows = await db
    .select({
      id: ctoAlerts.id,
      ctoId: ctoAlerts.ctoId,
      ctoName: ctos.name,
      occupancyPct: ctoAlerts.occupancyPct,
      threshold: ctoAlerts.threshold,
      severity: ctoAlerts.severity,
      message: ctoAlerts.message,
      acknowledgedAt: ctoAlerts.acknowledgedAt,
      acknowledgedBy: ctoAlerts.acknowledgedBy,
      resolvedAt: ctoAlerts.resolvedAt,
      createdAt: ctoAlerts.createdAt,
      updatedAt: ctoAlerts.updatedAt,
    })
    .from(ctoAlerts)
    .leftJoin(ctos, eq(ctoAlerts.ctoId, ctos.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(ctoAlerts.createdAt))
    .limit(opts?.limit ?? 100);
  return rows.map(r => ({ ...r, ctoName: r.ctoName ?? `CTO-${r.ctoId}` })) as any;
}

export async function countActiveCtoAlerts(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(ctoAlerts)
    .where(isNull(ctoAlerts.resolvedAt));
  return Number(rows[0]?.count ?? 0);
}

export async function acknowledgeCtoAlert(id: number, by: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(ctoAlerts)
    .set({ acknowledgedAt: new Date(), acknowledgedBy: by })
    .where(eq(ctoAlerts.id, id));
}

export async function resolveCtoAlert(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(ctoAlerts).set({ resolvedAt: new Date() }).where(eq(ctoAlerts.id, id));
}

export async function checkAndCreateCtoAlerts(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const config = await getCtoAlertConfig();
  if (!config?.enabled) return 0;
  const allCtos = await getCtos();
  let created = 0;
  for (const cto of allCtos) {
    const capacity = cto.capacity ?? 0;
    if (capacity === 0) continue;
    const pct = Math.round(((cto.usedPorts ?? 0) / capacity) * 100);
    const isCritical = pct >= (config.criticalThreshold ?? 90);
    const isWarning = pct >= (config.warningThreshold ?? 80);
    if (!isWarning && !isCritical) continue;
    // Verificar se já existe alerta ativo para esta CTO
    const existing = await db.select().from(ctoAlerts)
      .where(and(eq(ctoAlerts.ctoId, cto.id), isNull(ctoAlerts.resolvedAt)))
      .limit(1);
    if (existing.length > 0) continue; // Já tem alerta ativo
    const severity = isCritical ? "critical" : "warning";
    const threshold = isCritical ? (config.criticalThreshold ?? 90) : (config.warningThreshold ?? 80);
    const message = `CTO "${cto.name}" com ${pct}% de ocupação (${cto.usedPorts}/${capacity} portas). Threshold: ${threshold}%.`;
    await db.insert(ctoAlerts).values({
      ctoId: cto.id,
      occupancyPct: pct,
      threshold,
      severity,
      message,
    });
    created++;
  }
  return created;
}

// ─── Grupos/Pastas do Mapa ────────────────────────────────────────────────────
export async function getMapGroups(): Promise<MapGroup[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(mapGroups).orderBy(mapGroups.name);
}

export async function createMapGroup(data: { name: string; color?: string; description?: string }): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(mapGroups).values({
    name: data.name,
    color: data.color ?? "#6366f1",
    description: data.description ?? null,
  });
  return (result as any).insertId as number;
}

export async function updateMapGroup(id: number, data: { name?: string; color?: string; description?: string }): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(mapGroups).set({ ...data, updatedAt: new Date() }).where(eq(mapGroups.id, id));
}

export async function deleteMapGroup(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(mapElementGroups).where(eq(mapElementGroups.groupId, id));
  await db.delete(mapRouteGroups).where(eq(mapRouteGroups.groupId, id));
  await db.delete(mapGroups).where(eq(mapGroups.id, id));
}

export async function getGroupMembers(groupId: number): Promise<{ elementIds: number[]; routeIds: number[] }> {
  const db = await getDb();
  if (!db) return { elementIds: [], routeIds: [] };
  const elements = await db.select().from(mapElementGroups).where(eq(mapElementGroups.groupId, groupId));
  const routes = await db.select().from(mapRouteGroups).where(eq(mapRouteGroups.groupId, groupId));
  return {
    elementIds: elements.map((e) => e.elementId),
    routeIds: routes.map((r) => r.routeId),
  };
}

export async function getElementGroups(elementId: number): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(mapElementGroups).where(eq(mapElementGroups.elementId, elementId));
  return rows.map((r) => r.groupId);
}

export async function getRouteGroups(routeId: number): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(mapRouteGroups).where(eq(mapRouteGroups.routeId, routeId));
  return rows.map((r) => r.groupId);
}

export async function addElementToGroup(elementId: number, groupId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Evitar duplicatas
  const existing = await db.select().from(mapElementGroups)
    .where(and(eq(mapElementGroups.elementId, elementId), eq(mapElementGroups.groupId, groupId)))
    .limit(1);
  if (existing.length === 0) {
    await db.insert(mapElementGroups).values({ elementId, groupId });
  }
}

export async function removeElementFromGroup(elementId: number, groupId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(mapElementGroups)
    .where(and(eq(mapElementGroups.elementId, elementId), eq(mapElementGroups.groupId, groupId)));
}

export async function addRouteToGroup(routeId: number, groupId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(mapRouteGroups)
    .where(and(eq(mapRouteGroups.routeId, routeId), eq(mapRouteGroups.groupId, groupId)))
    .limit(1);
  if (existing.length === 0) {
    await db.insert(mapRouteGroups).values({ routeId, groupId });
  }
}

export async function removeRouteFromGroup(routeId: number, groupId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(mapRouteGroups)
    .where(and(eq(mapRouteGroups.routeId, routeId), eq(mapRouteGroups.groupId, groupId)));
}

export async function getAllElementGroupMemberships(): Promise<MapElementGroup[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(mapElementGroups);
}

export async function getAllRouteGroupMemberships(): Promise<MapRouteGroup[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(mapRouteGroups);
}

// ─── Ocupação de Fibras por Rota ─────────────────────────────────────────────
export async function getRoutesOccupancy(): Promise<{ routeId: number; fiberCount: number; fusedCount: number; pct: number; tubeLabel: string | null }[]> {
  const db = await getDb();
  if (!db) return [];
  const routes = await db.select().from(mapRoutes);
  const result: { routeId: number; fiberCount: number; fusedCount: number; pct: number; tubeLabel: string | null }[] = [];

  // Helper: contar vias fusionadas em um tubo específico (CEO ou CTO)
  async function countFusedInTube(tubeId: number, elType: "ceo" | "cto"): Promise<{ count: number; label: string | null; totalVias: number }> {
    if (elType === "ceo") {
      const [tube] = await db!.select().from(ceoTubes).where(eq(ceoTubes.id, tubeId)).limit(1);
      if (!tube) return { count: 0, label: null, totalVias: 0 };
      const fused = await db!.select().from(ceoVias).where(and(eq(ceoVias.tubeId, tubeId), isNotNull(ceoVias.fusedToViaId)));
      return { count: fused.length, label: tube.identifier, totalVias: tube.totalVias };
    } else {
      const [tube] = await db!.select().from(ctoTubes).where(eq(ctoTubes.id, tubeId)).limit(1);
      if (!tube) return { count: 0, label: null, totalVias: 0 };
      const fused = await db!.select().from(ctoVias).where(and(eq(ctoVias.tubeId, tubeId), isNotNull(ctoVias.fusedToViaId)));
      return { count: fused.length, label: tube.identifier, totalVias: tube.totalVias };
    }
  }

  // Helper: contar vias fusionadas em todos os tubos de um elemento
  async function countFusedInElement(elementId: number): Promise<number> {
    const [el] = await db!.select().from(mapElements).where(eq(mapElements.id, elementId)).limit(1);
    if (!el) return 0;
    let total = 0;
    if (el.type === "ceo") {
      const tubes = await db!.select().from(ceoTubes).where(eq(ceoTubes.ceoId, el.referenceId!));
      for (const tube of tubes) {
        const fused = await db!.select().from(ceoVias).where(and(eq(ceoVias.tubeId, tube.id), isNotNull(ceoVias.fusedToViaId)));
        total += fused.length;
      }
    } else if (el.type === "cto") {
      const tubes = await db!.select().from(ctoTubes).where(eq(ctoTubes.ctoId, el.referenceId!));
      for (const tube of tubes) {
        const fused = await db!.select().from(ctoVias).where(and(eq(ctoVias.tubeId, tube.id), isNotNull(ctoVias.fusedToViaId)));
        total += fused.length;
      }
    }
    return total;
  }

  for (const route of routes) {
    const fiberCount = route.fiberCount ?? 12;
    let fusedCount = 0;
    let tubeLabel: string | null = null;

    // Prioridade: usar tubo vinculado (fromTubeId) para ocupação precisa
    if (route.fromTubeId) {
      // Precisamos saber o tipo do elemento de origem para buscar na tabela certa
      const [fromEl] = route.fromElementId
        ? await db.select().from(mapElements).where(eq(mapElements.id, route.fromElementId)).limit(1)
        : [null];
      const elType = (fromEl?.type ?? "ceo") as "ceo" | "cto";
      const { count, label, totalVias } = await countFusedInTube(route.fromTubeId, elType);
      fusedCount = count;
      tubeLabel = label;
      // Usar totalVias do tubo como referência se fiberCount não estiver definido
      const effectiveFiberCount = fiberCount > 0 ? fiberCount : totalVias;
      const pct = effectiveFiberCount > 0 ? Math.min(100, Math.round((fusedCount / effectiveFiberCount) * 100)) : 0;
      result.push({ routeId: route.id, fiberCount: effectiveFiberCount, fusedCount, pct, tubeLabel });
      continue;
    }

    // Fallback: contar em todos os tubos do elemento de origem
    if (route.fromElementId) {
      fusedCount = await countFusedInElement(route.fromElementId);
    }

    const pct = fiberCount > 0 ? Math.min(100, Math.round((fusedCount / fiberCount) * 100)) : 0;
    result.push({ routeId: route.id, fiberCount, fusedCount, pct, tubeLabel });
  }
  return result;
}

// ─── Tubos por elemento do mapa (para vínculo de cabo ao tubo) ────────────────
export async function getTubesByMapElement(elementId: number): Promise<{ id: number; identifier: string; totalVias: number; color: string | null; type: string }[]> {
  const db = await getDb();
  if (!db) return [];
  const [el] = await db.select().from(mapElements).where(eq(mapElements.id, elementId));
  if (!el) return [];
  if (el.type === "ceo") {
    const rows = await db.select().from(ceoTubes).where(eq(ceoTubes.ceoId, el.referenceId));
    return rows.sort((a, b) => a.identifier.localeCompare(b.identifier, "pt-BR", { numeric: true }))
      .map(r => ({ id: r.id, identifier: r.identifier, totalVias: r.totalVias, color: r.color, type: r.type ?? "tube" }));
  } else if (el.type === "cto") {
    const rows = await db.select().from(ctoTubes).where(eq(ctoTubes.ctoId, el.referenceId));
    return rows.sort((a, b) => a.identifier.localeCompare(b.identifier, "pt-BR", { numeric: true }))
      .map(r => ({ id: r.id, identifier: r.identifier, totalVias: r.totalVias, color: r.color, type: r.type ?? "tube" }));
  }
  return [];
}

// ─── Histórico de Vínculos CTO ↔ SGP ─────────────────────────────────────────
export async function addSgpLinkHistory(data: {
  ctoId: number;
  ctoName: string;
  sgpId: number | null;
  action: "linked" | "unlinked";
  performedBy?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(sgpLinkHistory).values({
    ctoId: data.ctoId,
    ctoName: data.ctoName,
    sgpId: data.sgpId ?? null,
    action: data.action,
    performedBy: data.performedBy ?? null,
  });
}

export async function getSgpLinkHistory(ctoId?: number): Promise<SgpLinkHistory[]> {
  const db = await getDb();
  if (!db) return [];
  if (ctoId != null) {
    return db.select().from(sgpLinkHistory)
      .where(eq(sgpLinkHistory.ctoId, ctoId))
      .orderBy(desc(sgpLinkHistory.createdAt))
      .limit(50);
  }
  return db.select().from(sgpLinkHistory)
    .orderBy(desc(sgpLinkHistory.createdAt))
    .limit(100);
}

// ─── CEO Bandejas ─────────────────────────────────────────────────────────────
export async function getBandejasByCeo(ceoId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(ceoBandejas).where(eq(ceoBandejas.ceoId, ceoId));
  return rows.sort((a, b) => a.number - b.number);
}

export async function createCeoBandeja(data: Omit<InsertCeoBandeja, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(ceoBandejas).values(data);
  return (result as any)[0]?.insertId ?? 0;
}

export async function updateCeoBandeja(id: number, data: Partial<Omit<InsertCeoBandeja, "id" | "createdAt" | "updatedAt">>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(ceoBandejas).set(data).where(eq(ceoBandejas.id, id));
}

export async function deleteCeoBandeja(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Remover splitters da bandeja
  const splitters = await db.select().from(ceoSplitters).where(eq(ceoSplitters.bandejaId, id));
  for (const s of splitters) {
    await db.delete(ceoSplitterVias).where(eq(ceoSplitterVias.splitterId, s.id));
  }
  await db.delete(ceoSplitters).where(eq(ceoSplitters.bandejaId, id));
  // Desvincular tubos desta bandeja (não apagar, apenas desassociar)
  await db.update(ceoTubes).set({ bandejaId: null }).where(eq(ceoTubes.bandejaId, id));
  await db.delete(ceoBandejas).where(eq(ceoBandejas.id, id));
}

// ─── CEO Splitters ────────────────────────────────────────────────────────────

// Tabela de perda dB por tipo de splitter balanceado (valores típicos)
const BALANCED_LOSS_DB: Record<string, number> = {
  "1:2": 3.5,
  "1:4": 7.2,
  "1:8": 10.5,
  "1:16": 13.5,
  "1:32": 17.0,
};

// Perda dB para splitters desbalanceados (entrada=0, saídas indexadas por percentagem)
// Formato ratio: "1:2_90/10", "1:2_80/20", etc.
function getUnbalancedLoss(ratio: string): { inputLoss: number; outputs: number[] } {
  const match = ratio.match(/(\d+)\/(\d+)/);
  if (!match) return { inputLoss: 0, outputs: [3.5, 3.5] };
  const p1 = parseInt(match[1]);
  const p2 = parseInt(match[2]);
  // Perda = -10 * log10(percentagem/100)
  const loss1 = parseFloat((-10 * Math.log10(p1 / 100)).toFixed(1));
  const loss2 = parseFloat((-10 * Math.log10(p2 / 100)).toFixed(1));
  return { inputLoss: 0, outputs: [loss1, loss2] };
}

export async function getSplittersByCeo(ceoId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(ceoSplitters).where(eq(ceoSplitters.ceoId, ceoId));
}

export async function getSplittersByBandeja(bandejaId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(ceoSplitters).where(eq(ceoSplitters.bandejaId, bandejaId));
}

export async function createCeoSplitter(data: Omit<InsertCeoSplitter, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(ceoSplitters).values(data);
  const insertId = (result as any)[0]?.insertId ?? 0;

  // Criar vias automaticamente
  const vias: Omit<InsertCeoSplitterVia, "id" | "createdAt" | "updatedAt">[] = [];
  if (data.splitterType === "balanced") {
    const outputCount = parseInt(data.ratio.split(":")[1] ?? "2");
    const lossDb = BALANCED_LOSS_DB[data.ratio] ?? 3.5;
    // Via 0 = entrada (sem perda)
    vias.push({ splitterId: insertId, ceoId: data.ceoId, viaNumber: 0, label: "Entrada", lossDb: 0 });
    // Vias 1..N = saídas
    for (let i = 1; i <= outputCount; i++) {
      vias.push({ splitterId: insertId, ceoId: data.ceoId, viaNumber: i, label: `Saída ${i}`, lossDb });
    }
  } else {
    // Desbalanceado
    const { inputLoss, outputs } = getUnbalancedLoss(data.ratio);
    vias.push({ splitterId: insertId, ceoId: data.ceoId, viaNumber: 0, label: "Entrada", lossDb: inputLoss });
    outputs.forEach((loss, idx) => {
      vias.push({ splitterId: insertId, ceoId: data.ceoId, viaNumber: idx + 1, label: `Saída ${idx + 1}`, lossDb: loss });
    });
  }
  if (vias.length > 0) {
    await db.insert(ceoSplitterVias).values(vias);
  }
  return insertId;
}

export async function updateCeoSplitter(id: number, data: Partial<Omit<InsertCeoSplitter, "id" | "createdAt" | "updatedAt">>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(ceoSplitters).set(data).where(eq(ceoSplitters.id, id));
}

export async function deleteCeoSplitter(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Remover associações de vias que referenciam este splitter
  await db.delete(ceoViaAssociations).where(
    and(
      eq(ceoViaAssociations.ceoId, (await db.select({ ceoId: ceoSplitters.ceoId }).from(ceoSplitters).where(eq(ceoSplitters.id, id)).limit(1))[0]?.ceoId ?? 0),
      // Não filtramos por via aqui — apagamos as vias primeiro e depois as associações ficam órfãs
    )
  );
  await db.delete(ceoSplitterVias).where(eq(ceoSplitterVias.splitterId, id));
  await db.delete(ceoSplitters).where(eq(ceoSplitters.id, id));
}

// ─── CEO Splitter Vias ────────────────────────────────────────────────────────
export async function getSplitterViasBySplitter(splitterId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(ceoSplitterVias).where(eq(ceoSplitterVias.splitterId, splitterId));
  return rows.sort((a, b) => a.viaNumber - b.viaNumber);
}

export async function getSplitterViasByCeo(ceoId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(ceoSplitterVias).where(eq(ceoSplitterVias.ceoId, ceoId));
  return rows.sort((a, b) => a.viaNumber - b.viaNumber);
}

export async function updateCeoSplitterVia(id: number, data: { label?: string | null; notes?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(ceoSplitterVias).set(data).where(eq(ceoSplitterVias.id, id));
}

// ─── CEO Via Associations ─────────────────────────────────────────────────────
export async function getViaAssociationsByCeo(ceoId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(ceoViaAssociations).where(eq(ceoViaAssociations.ceoId, ceoId));
}

export async function createViaAssociation(data: Omit<InsertCeoViaAssociation, "id" | "createdAt">) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Verificar se já existe associação exacta entre estas vias (evitar duplicados)
  const existing = await db.select().from(ceoViaAssociations).where(
    and(
      eq(ceoViaAssociations.ceoId, data.ceoId),
      eq(ceoViaAssociations.sourceViaId, data.sourceViaId),
      eq(ceoViaAssociations.targetViaId, data.targetViaId),
    )
  ).limit(1);
  if (existing.length > 0) return existing[0].id;
  // Verificar se a via (source ou target) já tem qualquer associação
  // Cada via só pode ter uma fusão via associação
  // Verificar source como source
  const existingSrcAsSource = await db.select().from(ceoViaAssociations).where(
    and(
      eq(ceoViaAssociations.ceoId, data.ceoId),
      eq(ceoViaAssociations.sourceViaId, data.sourceViaId),
    )
  ).limit(1);
  if (existingSrcAsSource.length > 0) throw new Error("Esta via já tem uma fusão associada.");
  // Verificar source como target
  const existingSrcAsTarget = await db.select().from(ceoViaAssociations).where(
    and(
      eq(ceoViaAssociations.ceoId, data.ceoId),
      eq(ceoViaAssociations.targetViaId, data.sourceViaId),
    )
  ).limit(1);
  if (existingSrcAsTarget.length > 0) throw new Error("Esta via já tem uma fusão associada.");
  // Verificar target como target
  const existingTgtAsTarget = await db.select().from(ceoViaAssociations).where(
    and(
      eq(ceoViaAssociations.ceoId, data.ceoId),
      eq(ceoViaAssociations.targetViaId, data.targetViaId),
    )
  ).limit(1);
  if (existingTgtAsTarget.length > 0) throw new Error("Esta via já tem uma fusão associada.");
  // Verificar target como source
  const existingTgtAsSource = await db.select().from(ceoViaAssociations).where(
    and(
      eq(ceoViaAssociations.ceoId, data.ceoId),
      eq(ceoViaAssociations.sourceViaId, data.targetViaId),
    )
  ).limit(1);
  if (existingTgtAsSource.length > 0) throw new Error("Esta via já tem uma fusão associada.");
  const result = await db.insert(ceoViaAssociations).values(data);
  return (result as any)[0]?.insertId ?? 0;
}

export async function deleteViaAssociation(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(ceoViaAssociations).where(eq(ceoViaAssociations.id, id));
}

export async function deleteViaAssociationByVias(ceoId: number, viaId1: number, viaId2: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Apagar em ambas as direcções
  await db.delete(ceoViaAssociations).where(
    and(
      eq(ceoViaAssociations.ceoId, ceoId),
      eq(ceoViaAssociations.sourceViaId, viaId1),
      eq(ceoViaAssociations.targetViaId, viaId2),
    )
  );
  await db.delete(ceoViaAssociations).where(
    and(
      eq(ceoViaAssociations.ceoId, ceoId),
      eq(ceoViaAssociations.sourceViaId, viaId2),
      eq(ceoViaAssociations.targetViaId, viaId1),
    )
  );
}

// ─── OTDR Virtual — Travessia de Fibra por Fusões ─────────────────────────────

export type OtdrTraceResult = {
  found: boolean;
  lat: number | null;
  lng: number | null;
  distanceTraveled: number;         // metros percorridos até ao ponto
  totalLength: number;              // comprimento total da cadeia percorrida
  segmentName: string | null;       // nome da rota onde o ponto foi encontrado
  segmentRouteId: number | null;    // id da rota onde o ponto foi encontrado
  elementReached: { id: number; name: string; type: string } | null; // se terminou num elemento
  tracedPath: { lat: number; lng: number }[]; // traçado percorrido (para desenhar no mapa)
  warnings: string[];
};

/** Função haversine interna para calcular distância entre dois pontos em metros */
function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/** Interpola um ponto entre A e B a uma distância `d` de A */
function interpolatePoint(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
  d: number,
  segLen: number
): { lat: number; lng: number } {
  const t = segLen > 0 ? Math.min(1, d / segLen) : 0;
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

/**
 * Percorre o traçado de fibra a partir de um elemento/tubo/via, seguindo fusões
 * registadas, até atingir a distância alvo ou o fim da cadeia.
 */
export async function traceOtdrPath(
  startElementId: number,
  startTubeId: number,
  startViaNumber: number,
  targetDistanceMeters: number
): Promise<OtdrTraceResult> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const warnings: string[] = [];
  const tracedPath: { lat: number; lng: number }[] = [];
  let distanceTraveled = 0;
  let totalLength = 0;

  // Carregar todos os dados necessários de uma vez para evitar N+1 queries
  const allElements = await db.select().from(mapElements);
  const allRoutes = await db.select().from(mapRoutes);
  const allCeoTubes = await db.select().from(ceoTubes);
  const allCtoTubes = await db.select().from(ctoTubes);
  const allCeoVias = await db.select().from(ceoVias);
  const allCtoVias = await db.select().from(ctoVias);
  const allCeos = await db.select({ id: ceos.id, name: ceos.name }).from(ceos);
  const allCtos = await db.select({ id: ctos.id, name: ctos.name }).from(ctos);

  // Índices para acesso rápido
  const elementById = new Map(allElements.map(e => [e.id, e]));
  const ceoTubeById = new Map(allCeoTubes.map(t => [t.id, t]));
  const ctoTubeById = new Map(allCtoTubes.map(t => [t.id, t]));
  const ceoViaById = new Map(allCeoVias.map(v => [v.id, v]));
  const ctoViaById = new Map(allCtoVias.map(v => [v.id, v]));
  const ceoById = new Map(allCeos.map(c => [c.id, c]));
  const ctoById = new Map(allCtos.map(c => [c.id, c]));

  // Função para obter o nome de um elemento
  function getElementName(el: { type: string; referenceId: number }): string {
    if (el.type === "ceo") return ceoById.get(el.referenceId)?.name ?? `CEO #${el.referenceId}`;
    return ctoById.get(el.referenceId)?.name ?? `CTO #${el.referenceId}`;
  }

  // Função para encontrar a rota que sai de um elemento via um tubo específico
  // Retorna { route, isForward } onde isForward=true significa que o tubo está como fromTubeId
  // (o cabo sai deste elemento em direcção ao toElementId)
  function findRouteFromTube(elementId: number, tubeId: number): { route: typeof allRoutes[0]; isForward: boolean } | null {
    // Tubo está como fromTubeId → percorrer em frente (from→to)
    let r = allRoutes.find(r => r.fromElementId === elementId && r.fromTubeId === tubeId);
    if (r) return { route: r, isForward: true };
    // Tubo está como toTubeId → percorrer ao contrário (to→from)
    r = allRoutes.find(r => r.toElementId === elementId && r.toTubeId === tubeId);
    if (r) return { route: r, isForward: false };
    return null;
  }

  // Função para obter a via de um tubo por número de via
  function getViaByNumber(elementType: string, tubeId: number, viaNumber: number) {
    if (elementType === "ceo") {
      return allCeoVias.find(v => v.tubeId === tubeId && v.viaNumber === viaNumber) ?? null;
    }
    return allCtoVias.find(v => v.tubeId === tubeId && v.viaNumber === viaNumber) ?? null;
  }

  // Estado de travessia
  let currentElementId = startElementId;
  let currentTubeId = startTubeId;
  let currentViaNumber = startViaNumber;
  const visitedElements = new Set<string>(); // evitar loops infinitos

  for (let iteration = 0; iteration < 50; iteration++) {
    const currentElement = elementById.get(currentElementId);
    if (!currentElement) {
      warnings.push(`Elemento #${currentElementId} não encontrado no mapa`);
      break;
    }

    const loopKey = `${currentElementId}:${currentTubeId}:${currentViaNumber}`;
    if (visitedElements.has(loopKey)) {
      warnings.push("Loop detectado na cadeia de fusões — travessia interrompida");
      break;
    }
    visitedElements.add(loopKey);

    // Encontrar a rota que sai deste elemento via este tubo
    const routeResult = findRouteFromTube(currentElementId, currentTubeId);
    if (!routeResult) {
      // Não há rota vinculada a este tubo — verificar se há rota sem tubo vinculado
      const routeNoTube = allRoutes.find(r =>
        (r.fromElementId === currentElementId && !r.fromTubeId) ||
        (r.toElementId === currentElementId && !r.toTubeId)
      );
      if (!routeNoTube) {
        warnings.push(`Nenhuma rota encontrada saindo do elemento "${getElementName(currentElement)}" pelo tubo #${currentTubeId}. Verifique se o cabo está vinculado ao tubo correcto.`);
        return {
          found: false, lat: null, lng: null,
          distanceTraveled, totalLength,
          segmentName: null, segmentRouteId: null,
          elementReached: { id: currentElementId, name: getElementName(currentElement), type: currentElement.type },
          tracedPath, warnings
        };
      }
      warnings.push(`Rota "${routeNoTube.name ?? `#${routeNoTube.id}`}" não tem tubo vinculado — usando rota sem vínculo de tubo`);
    }

    // isForward: true = o tubo está como fromTubeId (cabo sai deste elemento em frente)
    //            false = o tubo está como toTubeId (cabo chega a este elemento, percorrer ao contrário)
    const isForward = routeResult ? routeResult.isForward : (allRoutes.find(r =>
      (r.fromElementId === currentElementId && !r.fromTubeId)
    ) != null);
    const activeRoute = routeResult ? routeResult.route : allRoutes.find(r =>
      (r.fromElementId === currentElementId && !r.fromTubeId) ||
      (r.toElementId === currentElementId && !r.toTubeId)
    )!;

    // Verificar se o splitter está no caminho
    const tubeInfo = currentElement.type === "ceo"
      ? ceoTubeById.get(currentTubeId)
      : ctoTubeById.get(currentTubeId);
    if (tubeInfo && (tubeInfo as any).type === "splitter") {
      warnings.push(`Atenção: a fibra passa por um splitter em "${getElementName(currentElement)}" — o sinal é dividido`);
    }

    // Determinar o próximo elemento com base na direcção
    const nextElementId = isForward ? activeRoute.toElementId : activeRoute.fromElementId;

    // Obter os pontos do traçado
    let pathPoints: { lat: number; lng: number }[] = [];
    try {
      pathPoints = activeRoute.path ? JSON.parse(activeRoute.path) : [];
    } catch {
      warnings.push(`Traçado da rota "${activeRoute.name ?? `#${activeRoute.id}`}" é inválido`);
    }

    if (pathPoints.length < 2) {
      // Sem traçado — usar linha recta entre os dois elementos
      const fromEl = elementById.get(activeRoute.fromElementId ?? 0);
      const toEl = elementById.get(activeRoute.toElementId ?? 0);
      if (fromEl && toEl) {
        pathPoints = [
          { lat: fromEl.lat, lng: fromEl.lng },
          { lat: toEl.lat, lng: toEl.lng }
        ];
        warnings.push(`Rota "${activeRoute.name ?? `#${activeRoute.id}`}" sem traçado desenhado — usando linha recta (aproximação)`);
      } else {
        warnings.push(`Rota "${activeRoute.name ?? `#${activeRoute.id}`}" sem traçado e sem elementos vinculados`);
        break;
      }
    } else {
      // Normalizar a orientação do path: verificar se o primeiro ponto do path
      // corresponde ao fromElement ou ao toElement e inverter se necessário.
      // O path pode ter sido desenhado em qualquer direcção independentemente do fromElementId/toElementId.
      const fromEl = elementById.get(activeRoute.fromElementId ?? 0);
      const toEl = elementById.get(activeRoute.toElementId ?? 0);
      if (fromEl && toEl && pathPoints.length >= 2) {
        const firstPt = pathPoints[0];
        const lastPt = pathPoints[pathPoints.length - 1];
        // Calcular distância do primeiro ponto ao fromElement e ao toElement
        const distFirstToFrom = haversineMeters(firstPt, { lat: fromEl.lat, lng: fromEl.lng });
        const distFirstToTo = haversineMeters(firstPt, { lat: toEl.lat, lng: toEl.lng });
        const distLastToFrom = haversineMeters(lastPt, { lat: fromEl.lat, lng: fromEl.lng });
        // Se o primeiro ponto está mais próximo do toElement do que do fromElement,
        // o path está invertido — inverter para que comece no fromElement
        if (distFirstToTo < distFirstToFrom && distLastToFrom < distFirstToFrom) {
          pathPoints = [...pathPoints].reverse();
        }
      }
    }

    // Percorrer no sentido correcto (após normalização, pathPoints[0] ≈ fromElement)
    const pts = isForward ? pathPoints : [...pathPoints].reverse();

    // Adicionar ponto de partida ao traçado se for o primeiro segmento
    if (tracedPath.length === 0 && pts.length > 0) {
      tracedPath.push(pts[0]);
    }

    // Percorrer ponto a ponto acumulando distância
    for (let i = 1; i < pts.length; i++) {
      const segLen = haversineMeters(pts[i - 1], pts[i]);
      totalLength += segLen;

      if (distanceTraveled + segLen >= targetDistanceMeters) {
        // O ponto alvo está neste segmento — interpolar
        const remaining = targetDistanceMeters - distanceTraveled;
        const pt = interpolatePoint(pts[i - 1], pts[i], remaining, segLen);
        tracedPath.push(pt);
        distanceTraveled = targetDistanceMeters;
        return {
          found: true,
          lat: pt.lat, lng: pt.lng,
          distanceTraveled,
          totalLength: totalLength + (segLen - remaining), // aproximação
          segmentName: activeRoute.name ?? null,
          segmentRouteId: activeRoute.id,
          elementReached: null,
          tracedPath, warnings
        };
      }

      distanceTraveled += segLen;
      tracedPath.push(pts[i]);
    }

    // Chegou ao elemento destino — verificar se há fusão que continua
    if (!nextElementId) {
      const elName = getElementName(currentElement);
      return {
        found: false, lat: null, lng: null,
        distanceTraveled, totalLength,
        segmentName: activeRoute.name ?? null, segmentRouteId: activeRoute.id,
        elementReached: { id: currentElementId, name: elName, type: currentElement.type },
        tracedPath, warnings: [...warnings, `A fibra termina no elemento "${getElementName(elementById.get(nextElementId ?? 0) ?? currentElement)}" após ${Math.round(distanceTraveled)} m (distância alvo: ${targetDistanceMeters} m)`]
      };
    }

    const nextElement = elementById.get(nextElementId);
    if (!nextElement) {
      warnings.push(`Elemento destino #${nextElementId} não encontrado`);
      break;
    }

    // Determinar o tubo de chegada no elemento destino
    const arrivalTubeId = isForward ? (activeRoute.toTubeId ?? null) : (activeRoute.fromTubeId ?? null);
    if (!arrivalTubeId) {
      // Sem tubo vinculado no destino — não conseguimos seguir a fusão
      return {
        found: false, lat: null, lng: null,
        distanceTraveled, totalLength,
        segmentName: activeRoute.name ?? null, segmentRouteId: activeRoute.id,
        elementReached: { id: nextElementId, name: getElementName(nextElement), type: nextElement.type },
        tracedPath,
        warnings: [...warnings, `Cabo chega ao elemento "${getElementName(nextElement)}" mas não tem tubo de chegada vinculado — não é possível seguir a fusão. Configure o tubo de chegada na rota.`]
      };
    }

    // Procurar a via de chegada no tubo de chegada
    const arrivalVia = getViaByNumber(nextElement.type, arrivalTubeId, currentViaNumber);
    if (!arrivalVia) {
      return {
        found: false, lat: null, lng: null,
        distanceTraveled, totalLength,
        segmentName: activeRoute.name ?? null, segmentRouteId: activeRoute.id,
        elementReached: { id: nextElementId, name: getElementName(nextElement), type: nextElement.type },
        tracedPath,
        warnings: [...warnings, `Via ${currentViaNumber} não encontrada no tubo de chegada em "${getElementName(nextElement)}" — verifique se as vias foram criadas`]
      };
    }

    // Verificar se há fusão de saída
    if (!arrivalVia.fusedToViaId || !arrivalVia.fusedToTubeId) {
      return {
        found: false, lat: null, lng: null,
        distanceTraveled, totalLength,
        segmentName: activeRoute.name ?? null, segmentRouteId: activeRoute.id,
        elementReached: { id: nextElementId, name: getElementName(nextElement), type: nextElement.type },
        tracedPath,
        warnings: [...warnings, `A fibra chega ao elemento "${getElementName(nextElement)}" mas a via ${currentViaNumber} não tem fusão de saída registada — a fibra termina aqui`]
      };
    }

    // Seguir a fusão para o tubo de saída
    const exitTubeId = arrivalVia.fusedToTubeId;
    const exitViaId = arrivalVia.fusedToViaId;

    // Obter o número da via de saída
    let exitViaNumber = currentViaNumber;
    if (nextElement.type === "ceo") {
      const exitVia = ceoViaById.get(exitViaId);
      if (exitVia) exitViaNumber = exitVia.viaNumber;
    } else {
      const exitVia = ctoViaById.get(exitViaId);
      if (exitVia) exitViaNumber = exitVia.viaNumber;
    }

    // Continuar a travessia a partir do elemento destino, tubo de saída
    currentElementId = nextElementId;
    currentTubeId = exitTubeId;
    currentViaNumber = exitViaNumber;
  }

  // Chegou ao limite de iterações
  return {
    found: false, lat: null, lng: null,
    distanceTraveled, totalLength,
    segmentName: null, segmentRouteId: null,
    elementReached: null,
    tracedPath,
    warnings: [...warnings, `Distância alvo (${targetDistanceMeters} m) excede o comprimento total da cadeia de fibra percorrida (${Math.round(distanceTraveled)} m)`]
  };
}

// ─── OLT no Mapa ─────────────────────────────────────────────────────────────
import { mapOltElements, MapOltElement, InsertMapOltElement, oltPortFiberLinks, OltPortFiberLink, InsertOltPortFiberLink } from "../drizzle/schema";
// Note: ceos, ceoTubes, ceoVias, ceoSplitters, ceoSplitterVias, ctoTubes, ctoVias, ctos, mapElements, mapRoutes already imported above

export async function getMapOltElements(): Promise<(MapOltElement & { equipmentName: string })[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: mapOltElements.id,
      equipmentId: mapOltElements.equipmentId,
      lat: mapOltElements.lat,
      lng: mapOltElements.lng,
      defaultTxPowerDbm: mapOltElements.defaultTxPowerDbm,
      fiberAttenuationDbPerKm: mapOltElements.fiberAttenuationDbPerKm,
      fusionLossDb: mapOltElements.fusionLossDb,
      notes: mapOltElements.notes,
      createdAt: mapOltElements.createdAt,
      updatedAt: mapOltElements.updatedAt,
      equipmentName: equipments.name,
    })
    .from(mapOltElements)
    .leftJoin(equipments, eq(mapOltElements.equipmentId, equipments.id));
  return rows.map(r => ({ ...r, equipmentName: r.equipmentName ?? `OLT #${r.equipmentId}` }));
}

export async function getMapOltElementById(id: number): Promise<(MapOltElement & { equipmentName: string }) | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select({
      id: mapOltElements.id,
      equipmentId: mapOltElements.equipmentId,
      lat: mapOltElements.lat,
      lng: mapOltElements.lng,
      defaultTxPowerDbm: mapOltElements.defaultTxPowerDbm,
      fiberAttenuationDbPerKm: mapOltElements.fiberAttenuationDbPerKm,
      fusionLossDb: mapOltElements.fusionLossDb,
      notes: mapOltElements.notes,
      createdAt: mapOltElements.createdAt,
      updatedAt: mapOltElements.updatedAt,
      equipmentName: equipments.name,
    })
    .from(mapOltElements)
    .leftJoin(equipments, eq(mapOltElements.equipmentId, equipments.id))
    .where(eq(mapOltElements.id, id));
  if (!row) return null;
  return { ...row, equipmentName: row.equipmentName ?? `OLT #${row.equipmentId}` };
}

export async function createMapOltElement(data: Omit<InsertMapOltElement, "id" | "createdAt" | "updatedAt">): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(mapOltElements).values(data);
  return (result[0] as any).insertId;
}

export async function updateMapOltElement(id: number, data: Partial<Omit<InsertMapOltElement, "id" | "createdAt" | "updatedAt">>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(mapOltElements).set(data).where(eq(mapOltElements.id, id));
}

export async function deleteMapOltElement(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(mapOltElements).where(eq(mapOltElements.id, id));
}

// ─── Vinculação Porta PON → Via/Tubo CEO ─────────────────────────────────────

export async function getOltPortLinks(oltElementId: number): Promise<(OltPortFiberLink & {
  portLabel: string | null;
  portNumber: string;
  portName: string | null;
  slotNumber: string | null;
  slotLabel: string | null;
  ceoName: string;
  tubeIdentifier: string;
})[]> {
  const db = await getDb();
  if (!db) return [];
  const links = await db.select().from(oltPortFiberLinks).where(eq(oltPortFiberLinks.oltElementId, oltElementId));
  if (links.length === 0) return [];
  // Enriquecer com dados de porta, slot, CEO e tubo
  const allPorts = await db.select({
    id: ports.id,
    label: ports.label,
    portNumber: ports.portNumber,
    slotId: ports.slotId,
  }).from(ports);;
  const allElements = await db.select({ id: mapElements.id, type: mapElements.type, referenceId: mapElements.referenceId }).from(mapElements);
  const allCeos = await db.select({ id: ceos.id, name: ceos.name }).from(ceos);
  const allCeoTubes = await db.select({ id: ceoTubes.id, identifier: ceoTubes.identifier }).from(ceoTubes);

   // Buscar slots dos ports que têm slotId
  const slotIds = [...new Set(allPorts.map(p => p.slotId).filter(Boolean))] as number[];
  let slotMap = new Map<number, { slotNumber: string; label: string | null }>();
  if (slotIds.length > 0) {
    const allSlots = await db.select({ id: equipmentSlots.id, slotNumber: equipmentSlots.slotNumber, label: equipmentSlots.label }).from(equipmentSlots).where(sql`${equipmentSlots.id} IN (${sql.join(slotIds.map(id => sql`${id}`), sql`, `)})`);
    slotMap = new Map(allSlots.map(s => [s.id, { slotNumber: s.slotNumber, label: s.label }]));
  }
  const portMap = new Map(allPorts.map(p => [p.id, p]));
  const elementMap = new Map(allElements.map(e => [e.id, e]));
  const ceoMap = new Map(allCeos.map(c => [c.id, c]));
  const tubeMap = new Map(allCeoTubes.map(t => [t.id, t]));
  return links.map(link => {
    const port = portMap.get(link.portId);
    const el = elementMap.get(link.ceoElementId);
    const ceo = el ? ceoMap.get(el.referenceId) : null;
    const tube = tubeMap.get(link.tubeId);
    const slot = port?.slotId ? slotMap.get(port.slotId) : null;
    const portDisplayName = port?.label || port?.portNumber || `Porta #${link.portId}`;
    const slotDisplay = slot ? `Slot ${slot.slotNumber}${slot.label ? ` — ${slot.label}` : ""}` : null;
    return {
      ...link,
      portLabel: port?.label ?? null,
      portNumber: port?.portNumber ?? `Porta #${link.portId}`,
      portName: slotDisplay ? `${slotDisplay} / ${portDisplayName}` : portDisplayName,
      slotNumber: slot?.slotNumber ?? null,
      slotLabel: slot?.label ?? null,
      ceoName: ceo?.name ?? `CEO #${link.ceoElementId}`,
      tubeIdentifier: tube?.identifier ?? `Tubo #${link.tubeId}`,
    };
  });
}

export async function createOltPortLink(data: Omit<InsertOltPortFiberLink, "id" | "createdAt" | "updatedAt">): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(oltPortFiberLinks).values(data);
  return (result[0] as any).insertId;
}

export async function updateOltPortLink(id: number, data: Partial<Omit<InsertOltPortFiberLink, "id" | "createdAt" | "updatedAt">>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(oltPortFiberLinks).set(data).where(eq(oltPortFiberLinks.id, id));
}

export async function deleteOltPortLink(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(oltPortFiberLinks).where(eq(oltPortFiberLinks.id, id));
}

// ─── Cálculo de Balanço Óptico ────────────────────────────────────────────────
// Calcula a potência estimada que chega a uma CTO a partir de uma porta OLT,
// seguindo a cadeia de fibra (cabos, fusões, splitters).

export interface OpticalBalanceResult {
  found: boolean;
  rxPowerDbm: number | null;         // Potência estimada na CTO em dBm
  txPowerDbm: number;                // Potência de saída da porta OLT
  totalLossDb: number;               // Perda total acumulada
  distanceKm: number;                // Distância total percorrida em km
  cableLossDb: number;               // Perda por cabo
  splitterLossDb: number;            // Perda por splitters
  fusionLossDb: number;              // Perda por fusões
  signalQuality: "optimal" | "good" | "marginal" | "weak" | "no_signal";
  path: Array<{
    type: "olt" | "cable" | "splitter" | "fusion" | "ceo" | "cto";
    label: string;
    lossDb: number;
    cumulativePowerDbm: number;
  }>;
  warnings: string[];
}

// Tabela de perda por splitter balanceado (em dB)
const SPLITTER_LOSS_DB: Record<string, number> = {
  "1:2": 3.5,
  "1:4": 7.0,
  "1:8": 10.5,
  "1:16": 13.5,
  "1:32": 17.0,
  "1:64": 20.5,
};

function getSplitterLoss(ratio: string): number {
  // Normalizar o ratio (ex: "1/8" → "1:8", "8" → "1:8")
  const normalized = ratio.replace("/", ":").trim();
  if (SPLITTER_LOSS_DB[normalized] !== undefined) return SPLITTER_LOSS_DB[normalized];
  // Tentar extrair o denominador
  const match = normalized.match(/1[:/](\d+)/);
  if (match) {
    const n = parseInt(match[1]);
    return Math.round(10 * Math.log10(n) * 10) / 10; // 10*log10(N) dB
  }
  return 3.5; // fallback: 1:2
}

function getSignalQuality(rxDbm: number): OpticalBalanceResult["signalQuality"] {
  if (rxDbm >= -15) return "optimal";
  if (rxDbm >= -20) return "good";
  if (rxDbm >= -25) return "marginal";
  if (rxDbm >= -30) return "weak";
  return "no_signal";
}

export async function calculateOpticalBalance(
  ctoElementId: number,  // map_elements.id da CTO alvo
): Promise<OpticalBalanceResult> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const warnings: string[] = [];
  const path: OpticalBalanceResult["path"] = [];

  // Carregar todos os dados necessários
  const allElements = await db.select().from(mapElements);
  const allRoutes = await db.select().from(mapRoutes);
  const allCeoTubes = await db.select().from(ceoTubes);
  const allCtoTubes = await db.select().from(ctoTubes);
  const allCeoVias = await db.select().from(ceoVias);
  const allCtoVias = await db.select().from(ctoVias);
  const allCeos = await db.select({ id: ceos.id, name: ceos.name }).from(ceos);
  const allCtos = await db.select({ id: ctos.id, name: ctos.name }).from(ctos);
  const allSplitters = await db.select().from(ceoSplitters);
  const allSplitterVias = await db.select().from(ceoSplitterVias);
  const allOltElements = await db.select().from(mapOltElements);
  const allOltLinks = await db.select().from(oltPortFiberLinks);
  const allPorts = await db.select({ id: ports.id, label: ports.label, portNumber: ports.portNumber }).from(ports);

  // Índices
  const elementById = new Map(allElements.map(e => [e.id, e]));
  const ceoById = new Map(allCeos.map(c => [c.id, c]));
  const ctoById = new Map(allCtos.map(c => [c.id, c]));
  const ceoTubeById = new Map(allCeoTubes.map(t => [t.id, t]));
  const ctoTubeById = new Map(allCtoTubes.map(t => [t.id, t]));
  const ceoViaById = new Map(allCeoVias.map(v => [v.id, v]));
  const ctoViaById = new Map(allCtoVias.map(v => [v.id, v]));
  const splitterById = new Map(allSplitters.map(s => [s.id, s]));
  const portById = new Map(allPorts.map(p => [p.id, p]));

  function getElementName(el: { type: string; referenceId: number }): string {
    if (el.type === "ceo") return ceoById.get(el.referenceId)?.name ?? `CEO #${el.referenceId}`;
    return ctoById.get(el.referenceId)?.name ?? `CTO #${el.referenceId}`;
  }

  // Verificar se o elemento alvo é uma CTO
  const ctoElement = elementById.get(ctoElementId);
  if (!ctoElement) {
    return { found: false, rxPowerDbm: null, txPowerDbm: 0, totalLossDb: 0, distanceKm: 0, cableLossDb: 0, splitterLossDb: 0, fusionLossDb: 0, signalQuality: "no_signal", path: [], warnings: [`Elemento #${ctoElementId} não encontrado`] };
  }
  if (ctoElement.type !== "cto") {
    return { found: false, rxPowerDbm: null, txPowerDbm: 0, totalLossDb: 0, distanceKm: 0, cableLossDb: 0, splitterLossDb: 0, fusionLossDb: 0, signalQuality: "no_signal", path: [], warnings: [`Elemento #${ctoElementId} não é uma CTO`] };
  }

  const ctoName = getElementName(ctoElement);

  // Encontrar todas as vias da CTO que têm fusão de entrada (fusedToViaId preenchido por outra via)
  // A CTO recebe fibra por um tubo — precisamos encontrar qual tubo/via está conectado a um cabo que vem de um CEO
  // Estratégia: encontrar rotas que chegam a esta CTO (toElementId = ctoElementId)
  const incomingRoutes = allRoutes.filter(r => r.toElementId === ctoElementId || r.fromElementId === ctoElementId);
  if (incomingRoutes.length === 0) {
    return { found: false, rxPowerDbm: null, txPowerDbm: 0, totalLossDb: 0, distanceKm: 0, cableLossDb: 0, splitterLossDb: 0, fusionLossDb: 0, signalQuality: "no_signal", path: [], warnings: [`CTO "${ctoName}" não tem cabos conectados`] };
  }

  // Para cada rota que chega à CTO, tentar rastrear de volta até uma OLT
  // Usar BFS/DFS reverso: CTO ← CEO ← ... ← OLT
  // Simplificação: seguir o primeiro cabo que tem tubo vinculado e rastrear para trás

  // Encontrar a rota de entrada e o tubo de chegada
  let entryRoute: typeof allRoutes[0] | null = null;
  let entryTubeId: number | null = null;
  let entryIsFromSide = false; // true se a CTO é o fromElement da rota

  for (const route of incomingRoutes) {
    if (route.toElementId === ctoElementId && route.toTubeId) {
      entryRoute = route;
      entryTubeId = route.toTubeId;
      entryIsFromSide = false;
      break;
    }
    if (route.fromElementId === ctoElementId && route.fromTubeId) {
      entryRoute = route;
      entryTubeId = route.fromTubeId;
      entryIsFromSide = true;
      break;
    }
  }

  if (!entryRoute || !entryTubeId) {
    // Tentar sem tubo vinculado
    entryRoute = incomingRoutes[0];
    warnings.push(`Cabo "${entryRoute.name ?? `#${entryRoute.id}`}" não tem tubo vinculado na CTO — estimativa pode ser imprecisa`);
  }

  // Rastrear de volta: CTO → CEO de origem → ... → OLT
  // Construir o percurso reverso
  interface TraceNode {
    elementId: number;
    tubeId: number | null;
    viaNumber: number | null;
    routeId: number | null;
    distanceKm: number;
    splitterLoss: number;
    fusionCount: number;
  }

  // Função haversine para calcular distância em km
  function haversineKm(p1: { lat: number; lng: number }, p2: { lat: number; lng: number }): number {
    const R = 6371;
    const phi1 = p1.lat * Math.PI / 180;
    const phi2 = p2.lat * Math.PI / 180;
    const dphi = (p2.lat - p1.lat) * Math.PI / 180;
    const dlambda = (p2.lng - p1.lng) * Math.PI / 180;
    const a = Math.sin(dphi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlambda / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function calcRouteDistanceKm(route: typeof allRoutes[0]): number {
    let pts: { lat: number; lng: number }[] = [];
    try { pts = route.path ? JSON.parse(route.path) : []; } catch { /* ignore */ }
    if (pts.length < 2) {
      const fromEl = elementById.get(route.fromElementId ?? 0);
      const toEl = elementById.get(route.toElementId ?? 0);
      if (fromEl && toEl) pts = [{ lat: fromEl.lat, lng: fromEl.lng }, { lat: toEl.lat, lng: toEl.lng }];
    }
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += haversineKm(pts[i - 1], pts[i]);
    return total;
  }

  // Rastrear de volta a partir da CTO até encontrar uma OLT
  // Percurso: CTO ← (cabo) ← CEO ← (fusão) ← CEO ← ... ← OLT
  let totalDistanceKm = 0;
  let totalSplitterLoss = 0;
  let totalFusionCount = 0;
  let foundOlt: { element: typeof allOltElements[0]; link: typeof allOltLinks[0] } | null = null;

  // Construir o percurso reverso (da CTO para a OLT)
  const reversePath: Array<{ type: string; label: string; lossDb: number; distKm?: number }> = [];

  // Passo 1: Adicionar a CTO ao percurso
  reversePath.push({ type: "cto", label: ctoName, lossDb: 0 });

  // Passo 2: Seguir os cabos de volta, elemento por elemento
  let currentElementId = ctoElementId;
  let currentTubeId = entryTubeId;
  let currentViaNumber: number | null = null;
  const visited = new Set<string>();

  for (let iter = 0; iter < 30; iter++) {
    const loopKey = `${currentElementId}:${currentTubeId}`;
    if (visited.has(loopKey)) { warnings.push("Loop detectado na cadeia de fibra"); break; }
    visited.add(loopKey);

    // Encontrar o cabo que conecta a este elemento por este tubo
    let activeRoute: typeof allRoutes[0] | null = null;
    let isForwardOnRoute = false; // true = este elemento é o toElement da rota

    if (currentTubeId) {
      // Tubo como toTubeId (elemento é destino da rota)
      activeRoute = allRoutes.find(r => r.toElementId === currentElementId && r.toTubeId === currentTubeId) ?? null;
      if (activeRoute) { isForwardOnRoute = true; }
      if (!activeRoute) {
        // Tubo como fromTubeId (elemento é origem da rota — cabo sai daqui)
        activeRoute = allRoutes.find(r => r.fromElementId === currentElementId && r.fromTubeId === currentTubeId) ?? null;
        if (activeRoute) { isForwardOnRoute = false; }
      }
    }
    if (!activeRoute) {
      // Sem tubo vinculado — tentar qualquer cabo conectado a este elemento
      activeRoute = allRoutes.find(r => r.toElementId === currentElementId || r.fromElementId === currentElementId) ?? null;
      if (activeRoute) {
        isForwardOnRoute = activeRoute.toElementId === currentElementId;
        warnings.push(`Cabo "${activeRoute.name ?? `#${activeRoute.id}`}" sem tubo vinculado — estimativa pode ser imprecisa`);
      }
    }

    if (!activeRoute) {
      warnings.push(`Nenhum cabo encontrado chegando ao elemento "${getElementName(elementById.get(currentElementId)!)}" — cadeia interrompida`);
      break;
    }

    // Calcular distância deste segmento
    const segDistKm = calcRouteDistanceKm(activeRoute);
    totalDistanceKm += segDistKm;

    reversePath.push({ type: "cable", label: activeRoute.name ?? `Cabo #${activeRoute.id}`, lossDb: 0, distKm: segDistKm });

    // Avançar para o elemento anterior (origem do cabo)
    const prevElementId = isForwardOnRoute
      ? (activeRoute.fromElementId ?? null)
      : (activeRoute.toElementId ?? null);

    if (!prevElementId) {
      warnings.push(`Cabo "${activeRoute.name ?? `#${activeRoute.id}`}" não tem elemento de origem vinculado`);
      break;
    }

    const prevElement = elementById.get(prevElementId);
    if (!prevElement) { warnings.push(`Elemento #${prevElementId} não encontrado`); break; }

    const prevElementName = getElementName(prevElement);

    // Determinar o tubo de chegada no elemento anterior
    const arrivalTubeId = isForwardOnRoute
      ? (activeRoute.fromTubeId ?? null)
      : (activeRoute.toTubeId ?? null);

    // Verificar se o elemento anterior é uma OLT (via olt_port_fiber_links)
    const oltLink = allOltLinks.find(l => l.ceoElementId === prevElementId && (arrivalTubeId === null || l.tubeId === arrivalTubeId));
    if (oltLink) {
      const oltEl = allOltElements.find(o => o.id === oltLink.oltElementId);
      if (oltEl) {
        foundOlt = { element: oltEl, link: oltLink };
        const portInfo = portById.get(oltLink.portId);
        const portLabel = portInfo?.label ?? portInfo?.portNumber ?? `Porta #${oltLink.portId}`;
        reversePath.push({ type: "ceo", label: prevElementName, lossDb: 0 });
        reversePath.push({ type: "olt", label: portLabel, lossDb: 0 });
        break;
      }
    }

    // Adicionar CEO/CTO ao percurso
    reversePath.push({ type: prevElement.type === "ceo" ? "ceo" : "cto", label: prevElementName, lossDb: 0 });

    // Verificar se há splitter no CEO que processa esta fibra
    if (prevElement.type === "ceo" && arrivalTubeId) {
      // Verificar se o tubo de chegada é um splitter (ceo_tube_type = 'splitter')
      const arrivalTube = ceoTubeById.get(arrivalTubeId);
      if (arrivalTube && (arrivalTube as any).ceo_tube_type === "splitter") {
        // Encontrar o splitter associado a este tubo
        // Os splitters estão em ceo_splitters, ligados por bandejaId
        // Simplificação: usar a perda padrão de 1:8 se não encontrar
        const splitterForTube = allSplitters.find(s => s.ceoId === prevElement.referenceId);
        const ratio = splitterForTube?.ratio ?? "1:8";
        const loss = getSplitterLoss(ratio);
        totalSplitterLoss += loss;
        reversePath.push({ type: "splitter", label: `Splitter ${ratio}`, lossDb: loss });
      }
    }

    // Verificar se há fusão de saída no CEO (via ceo_vias.fusedToViaId)
    if (arrivalTubeId) {
      // Encontrar a via de chegada (pelo número de via, se disponível)
      let arrivalVia: typeof allCeoVias[0] | typeof allCtoVias[0] | null = null;
      if (prevElement.type === "ceo") {
        arrivalVia = allCeoVias.find(v => v.tubeId === arrivalTubeId && (currentViaNumber === null || v.viaNumber === currentViaNumber)) ?? null;
      } else {
        arrivalVia = allCtoVias.find(v => v.tubeId === arrivalTubeId && (currentViaNumber === null || v.viaNumber === currentViaNumber)) ?? null;
      }

      if (arrivalVia && arrivalVia.fusedToTubeId) {
        totalFusionCount++;
        // Seguir a fusão para o tubo de saída
        currentTubeId = arrivalVia.fusedToTubeId;
        if (arrivalVia.fusedToViaId) {
          const exitVia = prevElement.type === "ceo"
            ? ceoViaById.get(arrivalVia.fusedToViaId)
            : ctoViaById.get(arrivalVia.fusedToViaId);
          currentViaNumber = exitVia?.viaNumber ?? currentViaNumber;
        }
      } else {
        currentTubeId = arrivalTubeId;
      }
    } else {
      currentTubeId = null;
    }

    currentElementId = prevElementId;
  }

  if (!foundOlt) {
    warnings.push("Não foi possível rastrear a fibra até uma porta OLT — verifique se a OLT está posicionada no mapa e se as portas estão vinculadas aos tubos dos CEOs");
    return { found: false, rxPowerDbm: null, txPowerDbm: 0, totalLossDb: 0, distanceKm: totalDistanceKm, cableLossDb: 0, splitterLossDb: totalSplitterLoss, fusionLossDb: 0, signalQuality: "no_signal", path: [], warnings };
  }

  // Calcular potência
  const txPower = foundOlt.link.txPowerDbm ?? foundOlt.element.defaultTxPowerDbm ?? 5.0;
  const attenuationPerKm = foundOlt.element.fiberAttenuationDbPerKm ?? 0.35;
  const fusionLossPerFusion = foundOlt.element.fusionLossDb ?? 0.1;

  const cableLoss = totalDistanceKm * attenuationPerKm;
  const fusionLoss = totalFusionCount * fusionLossPerFusion;
  const totalLoss = cableLoss + totalSplitterLoss + fusionLoss;
  const rxPower = txPower - totalLoss;

  // Construir o path final (inverter o percurso reverso)
  const finalPath = reversePath.reverse();
  let cumulativePower = txPower;
  const pathWithPower: OpticalBalanceResult["path"] = finalPath.map(step => {
    cumulativePower -= step.lossDb;
    return {
      type: step.type as any,
      label: step.label,
      lossDb: step.lossDb,
      cumulativePowerDbm: Math.round(cumulativePower * 10) / 10,
    };
  });

  // Adicionar perda de cabo distribuída ao longo do percurso
  // (já calculada globalmente, não por segmento)

  return {
    found: true,
    rxPowerDbm: Math.round(rxPower * 10) / 10,
    txPowerDbm: txPower,
    totalLossDb: Math.round(totalLoss * 10) / 10,
    distanceKm: Math.round(totalDistanceKm * 1000) / 1000,
    cableLossDb: Math.round(cableLoss * 10) / 10,
    splitterLossDb: Math.round(totalSplitterLoss * 10) / 10,
    fusionLossDb: Math.round(fusionLoss * 10) / 10,
    signalQuality: getSignalQuality(rxPower),
    path: pathWithPower,
    warnings,
  };
}

// ─── CTO Via Associations (tubo ↔ splitter) ───────────────────────────────────
export async function getViaAssociationsByCto(ctoId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(ctoViaAssociations).where(eq(ctoViaAssociations.ctoId, ctoId));
}

export async function createCtoViaAssociation(data: Omit<InsertCtoViaAssociation, "id" | "createdAt">) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Verificar se já existe associação exacta entre estas vias (evitar duplicados)
  const existing = await db.select().from(ctoViaAssociations).where(
    and(
      eq(ctoViaAssociations.ctoId, data.ctoId),
      eq(ctoViaAssociations.sourceViaId, data.sourceViaId),
      eq(ctoViaAssociations.targetViaId, data.targetViaId),
    )
  ).limit(1);
  if (existing.length > 0) return existing[0].id;
  // Verificar se a via source já tem qualquer associação
  const existingSrcAsSource = await db.select().from(ctoViaAssociations).where(
    and(
      eq(ctoViaAssociations.ctoId, data.ctoId),
      eq(ctoViaAssociations.sourceViaId, data.sourceViaId),
    )
  ).limit(1);
  if (existingSrcAsSource.length > 0) throw new Error("Esta via já tem uma fusão associada.");
  const existingSrcAsTarget = await db.select().from(ctoViaAssociations).where(
    and(
      eq(ctoViaAssociations.ctoId, data.ctoId),
      eq(ctoViaAssociations.targetViaId, data.sourceViaId),
    )
  ).limit(1);
  if (existingSrcAsTarget.length > 0) throw new Error("Esta via já tem uma fusão associada.");
  // Verificar se a via target já tem qualquer associação
  const existingTgtAsTarget = await db.select().from(ctoViaAssociations).where(
    and(
      eq(ctoViaAssociations.ctoId, data.ctoId),
      eq(ctoViaAssociations.targetViaId, data.targetViaId),
    )
  ).limit(1);
  if (existingTgtAsTarget.length > 0) throw new Error("Esta via já tem uma fusão associada.");
  const existingTgtAsSource = await db.select().from(ctoViaAssociations).where(
    and(
      eq(ctoViaAssociations.ctoId, data.ctoId),
      eq(ctoViaAssociations.sourceViaId, data.targetViaId),
    )
  ).limit(1);
  if (existingTgtAsSource.length > 0) throw new Error("Esta via já tem uma fusão associada.");
  const result = await db.insert(ctoViaAssociations).values(data);
  return (result as any)[0]?.insertId ?? 0;
}

export async function deleteCtoViaAssociation(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(ctoViaAssociations).where(eq(ctoViaAssociations.id, id));
}

export async function deleteCtoViaAssociationByVias(ctoId: number, viaId1: number, viaId2: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(ctoViaAssociations).where(
    and(
      eq(ctoViaAssociations.ctoId, ctoId),
      eq(ctoViaAssociations.sourceViaId, viaId1),
      eq(ctoViaAssociations.targetViaId, viaId2),
    )
  );
  await db.delete(ctoViaAssociations).where(
    and(
      eq(ctoViaAssociations.ctoId, ctoId),
      eq(ctoViaAssociations.sourceViaId, viaId2),
      eq(ctoViaAssociations.targetViaId, viaId1),
    )
  );
}
