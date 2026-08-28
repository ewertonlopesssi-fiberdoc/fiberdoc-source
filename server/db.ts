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
  mapPoleGroups,
  MapPoleGroup,
  mapReserveGroups,
  MapReserveGroup,
  mapPoles,
  MapPole,
  InsertMapPole,
  mapTechnicalReserves,
  MapTechnicalReserve,
  InsertMapTechnicalReserve,
  mapPois,
  MapPoi,
  InsertMapPoi,
  mapPoiGroups,
  mapOltGroups,
  MapOltGroup,
  mapDgoElements,
  MapDgoElement,
  InsertMapDgoElement,
  dgoSlotCableLinks,
  DgoSlotCableLink,
  InsertDgoSlotCableLink,
  dgoPortLinks,
  DgoPortLink,
  InsertDgoPortLink,
  mapDgoGroups,
  MapDgoGroup,
  routeExtraTubes,
  RouteExtraTube,
  InsertRouteExtraTube,
} from "../drizzle/schema";
import { normalizeProjectStatus, type ProjectTipo } from "../shared/projectStatus";
import type { ContagensDoProjeto } from "../shared/projectSummary";
import { unirFusoes } from "../shared/opticalFusions";
import { lerTracado, metrosDoTracado } from "../shared/optica/comprimento";
import type { OpticalEndpoint } from "../shared/optica/endpoint";
import { validarNovaLigacao, validarFusaoDirecta } from "../shared/optica/regrasFusao";
import { ENV } from "./_core/env";
import { getTenantDbFromContext, getTenantDbNameFromContext } from "./_core/tenantContext";
import { getTenantRawPool } from "./_core/tenantPool";

let _pool: mysql.Pool | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

function createPool(): mysql.Pool {
  const pool = mysql.createPool({
    uri: process.env.DATABASE_URL!,
    waitForConnections: true,
    connectionLimit: 3,
    queueLimit: 50,
    enableKeepAlive: true,
    keepAliveInitialDelay: 60000,
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
  // Se estiver em contexto de tenant (via AsyncLocalStorage), usar o banco do tenant
  const tenantDb = getTenantDbFromContext();
  if (tenantDb) return tenantDb;

  // Banco padrão (instalação sem multi-tenant)
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
  // Buscar portas
  const portRows = await db
    .select({
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
      connectedEquipmentName: equipments.name,
      connectedPortNumber: sql<string | null>`connected_port.portNumber`,
      connectedPortLabel: sql<string | null>`connected_port.label`,
      connectedPortSlotId: sql<number | null>`connected_port.slotId`,
    })
    .from(ports)
    .leftJoin(equipments, eq(ports.connectedToEquipmentId, equipments.id))
    .leftJoin(
      sql`${ports} AS connected_port`,
      sql`connected_port.id = ${ports.connectedToPortId}`
    )
    .where(eq(ports.equipmentId, equipmentId));
  // Buscar slots separadamente para evitar conflito de aliases
  const slotIds = Array.from(new Set(portRows.map(p => p.slotId).filter(Boolean))) as number[];
  // Coletar também os slotIds das portas conectadas
  const connectedSlotIds = Array.from(new Set(
    portRows.map(p => (p as any).connectedPortSlotId).filter(Boolean)
  )) as number[];
  const allSlotIds = Array.from(new Set([...slotIds, ...connectedSlotIds]));
  let slotMap = new Map<number, { slotNumber: string; slotLabel: string | null }>();
  if (allSlotIds.length > 0) {
    const slotRows = await db
      .select({ id: equipmentSlots.id, slotNumber: equipmentSlots.slotNumber, label: equipmentSlots.label })
      .from(equipmentSlots)
      .where(sql`${equipmentSlots.id} IN (${sql.join(allSlotIds.map(id => sql`${id}`), sql`, `)})`);
    slotMap = new Map(slotRows.map(s => [s.id, { slotNumber: s.slotNumber, slotLabel: s.label ?? null }]));
  }
  // Juntar e ordenar
  const rows = portRows.map(p => {
    const connSlotId = (p as any).connectedPortSlotId as number | null;
    const connSlot = connSlotId ? slotMap.get(connSlotId) : null;
    return {
      ...p,
      slotNumber: p.slotId ? (slotMap.get(p.slotId)?.slotNumber ?? null) : null,
      slotLabel: p.slotId ? (slotMap.get(p.slotId)?.slotLabel ?? null) : null,
      connectedPortSlotNumber: connSlot?.slotNumber ?? null,
      connectedPortSlotLabel: connSlot?.slotLabel ?? null,
    };
  });
  rows.sort((a, b) => {
    const sA = a.slotNumber ?? "";
    const sB = b.slotNumber ?? "";
    const slotCmp = sA.localeCompare(sB, undefined, { numeric: true });
    if (slotCmp !== 0) return slotCmp;
    const sortCmp = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    if (sortCmp !== 0) return sortCmp;
    return String(a.portNumber).localeCompare(String(b.portNumber), undefined, { numeric: true });
  });
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
  // A conta esta em shared/optica/comprimento.ts, a mesma que o cliente usa.
  // Aqui nao ha recurso a linha recta: um cabo sem tracado nao entra no total,
  // que e o comportamento que ja existia. E `lerTracado` descarta pontos
  // invalidos em vez de os deixar virar NaN e envenenar a soma inteira.
  let totalNetworkKm = 0;
  const routeRows: any[] = Array.isArray(allRoutes[0]) ? allRoutes[0] : (allRoutes.rows ?? allRoutes);
  const totalRoutes = routeRows.length;
  for (const r of routeRows) {
    totalNetworkKm += metrosDoTracado(lerTracado(r.path)) / 1000;
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

  // O tubo e as suas vias, ou nada.
  //
  // NOTA sobre a unicidade do identificador: a verificacao ali abaixo continua
  // a ser um SELECT seguido de um INSERT. A transacao garante que o tubo e as
  // vias entram juntos, mas NAO impede duas criacoes simultaneas do mesmo
  // identificador de passarem as duas -- para isso era preciso um indice unico
  // em (ceoId, identifier), que e migracao e fica para depois de medir se ja
  // existem duplicados. Digo-o aqui para nao dar a impressao de que esta
  // resolvido.
  return await db.transaction(async (tx) => {
    // Verificar se já existe tubo com mesmo identificador nesta CEO
    const existing = await tx.select({ id: ceoTubes.id, bandejaId: ceoTubes.bandejaId })
      .from(ceoTubes)
      .where(and(eq(ceoTubes.ceoId, data.ceoId), eq(ceoTubes.identifier, data.identifier.trim())));
    if (existing.length > 0) {
      // Se existe um tubo órfão (sem bandeja), reatribuir à nova bandeja em vez de criar duplicata
      const orphan = existing.find(t => t.bandejaId === null);
      if (orphan) {
        const newBandejaId = (data as any).bandejaId ?? null;
        await tx.update(ceoTubes).set({ bandejaId: newBandejaId }).where(eq(ceoTubes.id, orphan.id));
        return orphan.id;
      }
      throw new Error(`Já existe um tubo com o identificador "${data.identifier.trim()}" nesta CEO.`);
    }
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
    const result = await tx.insert(ceoTubes).values(insertData);
    const insertId = (result as any)[0]?.insertId ?? 0;
    // Criar as vias automaticamente
    const totalVias = data.totalVias ?? 0;
    if (totalVias > 0) {
      const viaRows: Omit<InsertCeoVia, "id" | "createdAt" | "updatedAt">[] = [];
      for (let i = 1; i <= totalVias; i++) {
        viaRows.push({ tubeId: insertId, ceoId: data.ceoId, viaNumber: i });
      }
      if (viaRows.length > 0) {
        await tx.insert(ceoVias).values(viaRows);
      }
    }
    return insertId;
  });
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

  // Este era o caminho SEM validacao nenhuma.
  //
  // A regra "uma fusao por via" so alguma vez foi aplicada no caminho das
  // associacoes -- o das fusoes tubo<->splitter. As tubo<->tubo, que sao 100%
  // das que existem em producao, passavam por aqui e escreviam por cima. Com
  // A ja fundida a C, fundir A com B deixava C a apontar para A sem que A
  // apontasse de volta: uma fusao meio aberta criada em uso NORMAL, nao por
  // falha. O diagrama desenha-a de um lado so e o rastreio optico segue-a
  // numa direccao e perde-a na outra.
  //
  // Encontrado a 28/08/2026 pelo roteiro manual, depois de 309 testes verdes.
  // Nenhum teste automatico o teria apanhado: o defeito estava no que o codigo
  // NAO fazia.
  await db.transaction(async (tx) => {
    // As duas linhas sao bloqueadas por ordem crescente de id, sempre.
    // Bloquear "primeiro a origem, depois o destino" faria duas fusoes
    // simultaneas em sentidos opostos travarem uma na outra.
    const ids = fusedToViaId != null && fusedToViaId !== viaId
      ? [viaId, fusedToViaId].sort((a, b) => a - b)
      : [viaId];
    const linhas = await tx.select().from(ceoVias)
      .where(inArray(ceoVias.id, ids)).orderBy(ceoVias.id).for("update");

    const origem = linhas.find(v => v.id === viaId);
    if (!origem) throw new Error("Via de origem não encontrada");

    const limpar = {
      fusedToTubeId: null, fusedToViaId: null,
      fusedToSplitterId: null, fusedToSplitterViaId: null,
    };

    // Desfazer. Tem de limpar os DOIS lados: limpar so a origem era outra
    // maneira de fabricar uma fusao meio aberta.
    if (fusedToViaId === null || fusedToTubeId === null) {
      const parceiro = origem.fusedToViaId;
      await tx.update(ceoVias).set({ ...limpar, notes: notes ?? null })
        .where(eq(ceoVias.id, viaId));
      if (parceiro != null) {
        await tx.update(ceoVias).set(limpar).where(eq(ceoVias.id, parceiro));
      }
      return;
    }

    if (fusedToViaId === viaId) throw new Error("Uma via não se funde a si própria.");

    const destino = linhas.find(v => v.id === fusedToViaId);
    if (!destino) throw new Error("Via de destino não encontrada");

    // A regra vive em shared/optica/regrasFusao.ts, onde tem teste.
    const r = validarFusaoDirecta(origem, destino);
    if (r.tipo === "recusado") throw new Error(r.motivo);
    if (r.tipo === "jaExiste") return;  // ja esta assim: nada a fazer

    await tx.update(ceoVias)
      .set({ fusedToTubeId, fusedToViaId, fusedToSplitterId: null, fusedToSplitterViaId: null, notes: notes ?? null })
      .where(eq(ceoVias.id, viaId));
    await tx.update(ceoVias)
      .set({ fusedToTubeId: origem.tubeId, fusedToViaId: viaId, fusedToSplitterId: null, fusedToSplitterViaId: null })
      .where(eq(ceoVias.id, fusedToViaId));
  });
}

// Fusão tubo → splitter: grava na via do tubo os campos de splitter
export async function setViaFusionToSplitter(
  viaId: number,
  fusedToSplitterId: number | null,
  fusedToSplitterViaId: number | null,
  notes?: string
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  // Limpar fusão tubo→tubo se existir
  await db.update(ceoVias)
    .set({ fusedToTubeId: null, fusedToViaId: null, fusedToSplitterId, fusedToSplitterViaId, notes: notes ?? null })
    .where(eq(ceoVias.id, viaId));
}

export async function clearViaFusion(viaId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  await db.transaction(async (tx) => {
    const rows = await tx.select().from(ceoVias)
      .where(eq(ceoVias.id, viaId)).limit(1).for("update");
    const via = rows[0];
    if (!via) return;

    const limpar = {
      fusedToTubeId: null, fusedToViaId: null,
      fusedToSplitterId: null, fusedToSplitterViaId: null,
    };

    await tx.update(ceoVias).set(limpar).where(eq(ceoVias.id, viaId));
    if (via.fusedToViaId) {
      await tx.update(ceoVias).set(limpar).where(eq(ceoVias.id, via.fusedToViaId));
    }

    // O filtro por ceoId nao e zelo: sem ele este DELETE apaga fusoes de
    // OUTRAS CEOs. `ceo_vias.id` e `ceo_splitter_vias.id` sao numeracoes
    // independentes, e a tabela de associacoes guarda as duas -- portanto
    // "sourceViaId = 7" casa tanto com a via 7 desta CEO como com a via 7 de
    // um splitter de qualquer outra. Desfazer uma fusao aqui apagava uma
    // fusao acola, sem erro e sem rasto.
    await tx.delete(ceoViaAssociations).where(
      and(
        eq(ceoViaAssociations.ceoId, via.ceoId),
        or(
          eq(ceoViaAssociations.sourceViaId, viaId),
          eq(ceoViaAssociations.targetViaId, viaId)
        )
      )
    );
  });
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

/** Exclui uma via CEO somente quando ela está realmente livre. */
export async function deleteCeoVia(viaId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [via] = await db.select().from(ceoVias).where(eq(ceoVias.id, viaId)).limit(1);
  if (!via) throw new Error("Via não encontrada");
  if (via.fiberId !== null) throw new Error("Não é possível excluir uma via com fibra associada. Remova a fibra primeiro.");
  if (via.fusedToViaId !== null || via.fusedToTubeId !== null || via.fusedToSplitterId !== null || via.fusedToSplitterViaId !== null) {
    throw new Error("Não é possível excluir uma via fusionada. Remova a fusão primeiro.");
  }
  const [reverse] = await db.select({ id: ceoVias.id }).from(ceoVias).where(eq(ceoVias.fusedToViaId, viaId)).limit(1);
  if (reverse) throw new Error("Não é possível excluir: outra via ainda aponta para esta fusão.");
  const [association] = await db.select({ id: ceoViaAssociations.id }).from(ceoViaAssociations).where(
    or(eq(ceoViaAssociations.sourceViaId, viaId), eq(ceoViaAssociations.targetViaId, viaId))
  ).limit(1);
  if (association) throw new Error("Não é possível excluir uma via associada a um splitter.");
  await db.delete(ceoVias).where(eq(ceoVias.id, viaId));
  return { ok: true };
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

  // O tubo e as suas vias, ou nada. Mesmo raciocinio do createCeoSplitter:
  // um tubo de 12 FO sem vias nao serve para nada e ninguem o arranja sem
  // apagar.
  return await db.transaction(async (tx) => {
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
    if ((data as any).splitterType) insertData.splitterType = (data as any).splitterType;
    if ((data as any).ratio) insertData.ratio = (data as any).ratio;
    const result = await tx.insert(ctoTubes).values(insertData);
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
      if (viaRows.length > 0) await tx.insert(ctoVias).values(viaRows);
    }
    return insertId;
  });
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

/** Exclui uma via CTO somente quando ela está realmente livre. */
export async function deleteCtoVia(viaId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [via] = await db.select().from(ctoVias).where(eq(ctoVias.id, viaId)).limit(1);
  if (!via) throw new Error("Via não encontrada");
  if (via.fiberId !== null) throw new Error("Não é possível excluir uma via com fibra associada. Remova a fibra primeiro.");
  if (via.fusedToViaId !== null || via.fusedToTubeId !== null) {
    throw new Error("Não é possível excluir uma via fusionada. Remova a fusão primeiro.");
  }
  const [reverse] = await db.select({ id: ctoVias.id }).from(ctoVias).where(eq(ctoVias.fusedToViaId, viaId)).limit(1);
  if (reverse) throw new Error("Não é possível excluir: outra via ainda aponta para esta fusão.");
  const [association] = await db.select({ id: ctoViaAssociations.id }).from(ctoViaAssociations).where(
    or(eq(ctoViaAssociations.sourceViaId, viaId), eq(ctoViaAssociations.targetViaId, viaId))
  ).limit(1);
  if (association) throw new Error("Não é possível excluir uma via associada a outro equipamento.");
  await db.delete(ctoVias).where(eq(ctoVias.id, viaId));
  return { ok: true };
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
export async function getMapElements(): Promise<(MapElement & { elementName?: string; projectStatus?: string })[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(mapElements);
  // Enrich with name from ceos/ctos.
  // projectStatus vive na tabela do elemento (ceos/ctos), não em map_elements,
  // que guarda só a posição. Vem junto para o mapa poder colorir por estado
  // de projeto sem uma segunda consulta por marcador.
  const ceoIds = rows.filter(r => r.type === 'ceo').map(r => r.referenceId);
  const ctoIds = rows.filter(r => r.type === 'cto').map(r => r.referenceId);
  const ceoRows = ceoIds.length > 0 ? await db.select({ id: ceos.id, name: ceos.name, projectStatus: ceos.projectStatus }).from(ceos).where(inArray(ceos.id, ceoIds)) : [];
  const ctoRows = ctoIds.length > 0 ? await db.select({ id: ctos.id, name: ctos.name, projectStatus: ctos.projectStatus }).from(ctos).where(inArray(ctos.id, ctoIds)) : [];
  const ceoMap = new Map(ceoRows.map(r => [r.id, r]));
  const ctoMap = new Map(ctoRows.map(r => [r.id, r]));
  return rows.map(r => {
    const origem = r.type === 'ceo' ? ceoMap.get(r.referenceId) : ctoMap.get(r.referenceId);
    return {
      ...r,
      elementName: origem?.name ?? undefined,
      projectStatus: origem?.projectStatus ?? undefined,
    };
  });
}
export async function upsertMapElement(type: string, referenceId: number, lat: number, lng: number, color?: string | null): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // IMPORTANTE: filtrar por type E referenceId — IDs de CEO e CTO são independentes
  // (uma CEO com id=5 e uma CTO com id=5 são elementos diferentes)
  const existing = await db.select().from(mapElements)
    .where(and(eq(mapElements.type, type), eq(mapElements.referenceId, referenceId)))
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
  // Obter o pool correto: tenant ou padrão
  const tenantDbName = getTenantDbNameFromContext();
  const pool = tenantDbName ? getTenantRawPool(tenantDbName) : (_pool ?? (_pool = createPool()));
  const [result] = await pool.promise().execute(
    `INSERT INTO map_routes (name, fromElementId, toElementId, fiberCount, cableType, color, path, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, fromId, toId, fiberCount, cableType, color, path, notes]
  );
  return (result as any).insertId;
}
export async function updateMapRoute(id: number, data: Partial<Omit<InsertMapRoute, "id" | "createdAt" | "updatedAt">> & { fromElementId?: number | null; toElementId?: number | null; fromTubeId?: number | null; toTubeId?: number | null }): Promise<void> {
  // Usar raw SQL para garantir que null é enviado como SQL NULL
  // Obtém o pool correto: tenant (via AsyncLocalStorage) ou padrão
  const tenantDbName = getTenantDbNameFromContext();
  const pool = tenantDbName ? getTenantRawPool(tenantDbName) : (_pool ?? (_pool = createPool()));
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
  await pool.promise().execute(
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

export async function createMapGroup(data: { name: string; color?: string; description?: string; parentId?: number | null; isProject?: boolean }): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(mapGroups).values({
    name: data.name,
    color: data.color ?? "#6366f1",
    description: data.description ?? null,
    parentId: data.parentId ?? null,
    // Grupo comum é o padrão. Projeto é a excepção que a pessoa liga.
    isProject: data.isProject ?? false,
  });
  return (result as any).insertId as number;
}

export async function updateMapGroup(id: number, data: { name?: string; color?: string; description?: string; parentId?: number | null; isProject?: boolean }): Promise<void> {
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

// Reordenar grupos: recebe array de { id, sortOrder, parentId } e atualiza em lote
export async function reorderMapGroups(updates: { id: number; sortOrder: number; parentId: number | null }[]): Promise<void> {
  const db = await getDb();
  if (!db || updates.length === 0) return;
  await Promise.all(updates.map(u =>
    db.update(mapGroups).set({ sortOrder: u.sortOrder, parentId: u.parentId, updatedAt: new Date() }).where(eq(mapGroups.id, u.id))
  ));
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

// ─── Grupos de Postes ─────────────────────────────────────────────────────────
export async function addPoleToGroup(poleId: number, groupId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(mapPoleGroups)
    .where(and(eq(mapPoleGroups.poleId, poleId), eq(mapPoleGroups.groupId, groupId)))
    .limit(1);
  if (existing.length === 0) {
    await db.insert(mapPoleGroups).values({ poleId, groupId });
  }
}

export async function removePoleFromGroup(poleId: number, groupId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(mapPoleGroups)
    .where(and(eq(mapPoleGroups.poleId, poleId), eq(mapPoleGroups.groupId, groupId)));
}

export async function removePoleFromAllGroups(poleId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(mapPoleGroups).where(eq(mapPoleGroups.poleId, poleId));
}

export async function getAllPoleGroupMemberships(): Promise<MapPoleGroup[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(mapPoleGroups);
}

// ─── Grupos de Reservas Técnicas ──────────────────────────────────────────────
export async function addReserveToGroup(reserveId: number, groupId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(mapReserveGroups)
    .where(and(eq(mapReserveGroups.reserveId, reserveId), eq(mapReserveGroups.groupId, groupId)))
    .limit(1);
  if (existing.length === 0) {
    await db.insert(mapReserveGroups).values({ reserveId, groupId });
  }
}

export async function removeReserveFromGroup(reserveId: number, groupId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(mapReserveGroups)
    .where(and(eq(mapReserveGroups.reserveId, reserveId), eq(mapReserveGroups.groupId, groupId)));
}

export async function removeReserveFromAllGroups(reserveId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(mapReserveGroups).where(eq(mapReserveGroups.reserveId, reserveId));
}

export async function getAllReserveGroupMemberships(): Promise<MapReserveGroup[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(mapReserveGroups);
}

export async function getAllRouteGroupMemberships(): Promise<MapRouteGroup[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(mapRouteGroups);
}

// ─── Ocupação de Fibras por Rota ─────────────────────────────────────────────
export async function getRoutesOccupancy(): Promise<{ routeId: number; fiberCount: number; fusedCount: number; pct: number; tubeLabel: string | null }[]> {
  // Versão otimizada: substitui N+1 queries por batch queries agrupadas
  // Usa o pool do tenant quando disponível (multi-tenant)
  const tenantDbName = getTenantDbNameFromContext();
  if (!tenantDbName && !_pool) _pool = createPool();
  const pool = (tenantDbName ? getTenantRawPool(tenantDbName) : _pool!).promise();

  // 1. Buscar todas as rotas
  const [routeRows] = await pool.execute<any[]>(
    `SELECT id, fiberCount, fromElementId, fromTubeId FROM map_routes`
  );
  if (!routeRows.length) return [];

  // 2. Buscar tipo de todos os elementos referenciados como fromElementId
  const fromElementIds: number[] = Array.from(
    new Set(routeRows.map((r: any) => r.fromElementId).filter((id: any) => id != null))
  );
  const elementTypeMap = new Map<number, { type: string; referenceId: number }>();
  if (fromElementIds.length > 0) {
    const ph = fromElementIds.map(() => '?').join(',');
    const [elRows] = await pool.execute<any[]>(
      `SELECT id, type, referenceId FROM map_elements WHERE id IN (${ph})`,
      fromElementIds
    );
    for (const el of elRows) elementTypeMap.set(el.id, { type: el.type, referenceId: el.referenceId });
  }

  // 3. Batch: buscar stats de tubos CEO e CTO vinculados via fromTubeId
  const ceoTubeIds: number[] = Array.from(new Set(
    routeRows
      .filter((r: any) => r.fromTubeId && elementTypeMap.get(r.fromElementId)?.type === 'ceo')
      .map((r: any) => r.fromTubeId as number)
  ));
  const ctoTubeIds: number[] = Array.from(new Set(
    routeRows
      .filter((r: any) => r.fromTubeId && elementTypeMap.get(r.fromElementId)?.type === 'cto')
      .map((r: any) => r.fromTubeId as number)
  ));

  const ceoTubeStats = new Map<number, { fusedCount: number; label: string; totalVias: number }>();
  const ctoTubeStats = new Map<number, { fusedCount: number; label: string; totalVias: number }>();

  if (ceoTubeIds.length > 0) {
    const ph = ceoTubeIds.map(() => '?').join(',');
    const [tubeRows] = await pool.execute<any[]>(
      `SELECT id, identifier, totalVias FROM ceo_tubes WHERE id IN (${ph})`, ceoTubeIds
    );
    const [fusedRows] = await pool.execute<any[]>(
      `SELECT tubeId, COUNT(*) AS cnt FROM ceo_vias WHERE tubeId IN (${ph}) AND fusedToViaId IS NOT NULL GROUP BY tubeId`, ceoTubeIds
    );
    const fusedMap = new Map<number, number>();
    for (const f of fusedRows) fusedMap.set(Number(f.tubeId), Number(f.cnt));
    for (const t of tubeRows) ceoTubeStats.set(Number(t.id), { fusedCount: fusedMap.get(Number(t.id)) ?? 0, label: t.identifier, totalVias: Number(t.totalVias) });
  }

  if (ctoTubeIds.length > 0) {
    const ph = ctoTubeIds.map(() => '?').join(',');
    const [tubeRows] = await pool.execute<any[]>(
      `SELECT id, identifier, totalVias FROM cto_tubes WHERE id IN (${ph})`, ctoTubeIds
    );
    const [fusedRows] = await pool.execute<any[]>(
      `SELECT tubeId, COUNT(*) AS cnt FROM cto_vias WHERE tubeId IN (${ph}) AND fusedToViaId IS NOT NULL GROUP BY tubeId`, ctoTubeIds
    );
    const fusedMap = new Map<number, number>();
    for (const f of fusedRows) fusedMap.set(Number(f.tubeId), Number(f.cnt));
    for (const t of tubeRows) ctoTubeStats.set(Number(t.id), { fusedCount: fusedMap.get(Number(t.id)) ?? 0, label: t.identifier, totalVias: Number(t.totalVias) });
  }

  // 4. Fallback: rotas sem fromTubeId — contar vias fusionadas por elemento (batch)
  const fallbackElementIds: number[] = Array.from(new Set(
    routeRows
      .filter((r: any) => !r.fromTubeId && r.fromElementId != null)
      .map((r: any) => r.fromElementId as number)
  ));
  const elementFusedMap = new Map<number, number>();

  if (fallbackElementIds.length > 0) {
    // CEO fallback
    const ceoElIds = fallbackElementIds.filter(id => elementTypeMap.get(id)?.type === 'ceo');
    if (ceoElIds.length > 0) {
      const ph = ceoElIds.map(() => '?').join(',');
      const refIds = ceoElIds.map(id => elementTypeMap.get(id)!.referenceId);
      const phRef = refIds.map(() => '?').join(',');
      const [rows] = await pool.execute<any[]>(
        `SELECT ct.ceoId, COUNT(cv.id) AS cnt
         FROM ceo_tubes ct
         JOIN ceo_vias cv ON cv.tubeId = ct.id AND cv.fusedToViaId IS NOT NULL
         WHERE ct.ceoId IN (${phRef})
         GROUP BY ct.ceoId`, refIds
      );
      const ceoFusedMap = new Map<number, number>();
      for (const r of rows) ceoFusedMap.set(Number(r.ceoId), Number(r.cnt));
      for (const elId of ceoElIds) {
        const refId = elementTypeMap.get(elId)?.referenceId;
        elementFusedMap.set(elId, refId != null ? (ceoFusedMap.get(refId) ?? 0) : 0);
      }
    }
    // CTO fallback
    const ctoElIds = fallbackElementIds.filter(id => elementTypeMap.get(id)?.type === 'cto');
    if (ctoElIds.length > 0) {
      const refIds = ctoElIds.map(id => elementTypeMap.get(id)!.referenceId);
      const phRef = refIds.map(() => '?').join(',');
      const [rows] = await pool.execute<any[]>(
        `SELECT ct.ctoId, COUNT(cv.id) AS cnt
         FROM cto_tubes ct
         JOIN cto_vias cv ON cv.tubeId = ct.id AND cv.fusedToViaId IS NOT NULL
         WHERE ct.ctoId IN (${phRef})
         GROUP BY ct.ctoId`, refIds
      );
      const ctoFusedMap = new Map<number, number>();
      for (const r of rows) ctoFusedMap.set(Number(r.ctoId), Number(r.cnt));
      for (const elId of ctoElIds) {
        const refId = elementTypeMap.get(elId)?.referenceId;
        elementFusedMap.set(elId, refId != null ? (ctoFusedMap.get(refId) ?? 0) : 0);
      }
    }
  }

  // 5. Montar resultado
  const result: { routeId: number; fiberCount: number; fusedCount: number; pct: number; tubeLabel: string | null }[] = [];
  for (const route of routeRows) {
    const fiberCount = Number(route.fiberCount ?? 12);
    const elInfo = route.fromElementId != null ? elementTypeMap.get(route.fromElementId) : undefined;

    if (route.fromTubeId) {
      const stats = elInfo?.type === 'ceo'
        ? ceoTubeStats.get(Number(route.fromTubeId))
        : ctoTubeStats.get(Number(route.fromTubeId));
      const fusedCount = stats?.fusedCount ?? 0;
      const tubeLabel = stats?.label ?? null;
      const effectiveFiberCount = fiberCount > 0 ? fiberCount : (stats?.totalVias ?? 12);
      const pct = effectiveFiberCount > 0 ? Math.min(100, Math.round((fusedCount / effectiveFiberCount) * 100)) : 0;
      result.push({ routeId: Number(route.id), fiberCount: effectiveFiberCount, fusedCount, pct, tubeLabel });
      continue;
    }

    const fusedCount = route.fromElementId != null ? (elementFusedMap.get(route.fromElementId) ?? 0) : 0;
    const pct = fiberCount > 0 ? Math.min(100, Math.round((fusedCount / fiberCount) * 100)) : 0;
    result.push({ routeId: Number(route.id), fiberCount, fusedCount, pct, tubeLabel: null });
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

export async function deleteCeoBandeja(id: number, deleteTubes = false) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Remover splitters da bandeja
  const splitters = await db.select().from(ceoSplitters).where(eq(ceoSplitters.bandejaId, id));
  for (const s of splitters) {
    await db.delete(ceoSplitterVias).where(eq(ceoSplitterVias.splitterId, s.id));
  }
  await db.delete(ceoSplitters).where(eq(ceoSplitters.bandejaId, id));
  if (deleteTubes) {
    // Excluir os tubos e suas vias junto com a bandeja
    const tubes = await db.select({ id: ceoTubes.id }).from(ceoTubes).where(eq(ceoTubes.bandejaId, id));
    for (const t of tubes) {
      // Limpar fusões que apontam para este tubo
      await db.update(ceoVias).set({ fusedToTubeId: null, fusedToViaId: null }).where(eq(ceoVias.fusedToTubeId, t.id));
      await db.delete(ceoVias).where(eq(ceoVias.tubeId, t.id));
    }
    await db.delete(ceoTubes).where(eq(ceoTubes.bandejaId, id));
  } else {
    // Desvincular tubos desta bandeja (não apagar, apenas desassociar)
    await db.update(ceoTubes).set({ bandejaId: null }).where(eq(ceoTubes.bandejaId, id));
  }
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

  // O splitter e as suas vias, ou nada.
  //
  // Eram dois INSERT independentes: o do splitter, e o das vias em lote.
  // Falhar o segundo deixava um splitter SEM VIAS NENHUMAS -- uma entidade
  // que existe no cadastro, aparece no diagrama, e nao tem uma unica porta
  // para ligar. Nao ha caminho de reparacao na interface: so apagando e
  // criando de novo, e so depois de alguem perceber o que aconteceu.
  return await db.transaction(async (tx) => {
    const result = await tx.insert(ceoSplitters).values(data);
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
      await tx.insert(ceoSplitterVias).values(vias);
    }
    return insertId;
  });
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

  const a: OpticalEndpoint = {
    tipo: data.sourceType === "splitter" ? "ceoSplitterVia" : "ceoVia",
    id: data.sourceViaId,
  };
  const b: OpticalEndpoint = {
    tipo: data.targetType === "splitter" ? "ceoSplitterVia" : "ceoVia",
    id: data.targetViaId,
  };

  // Ler e escrever na MESMA transacao, com as linhas bloqueadas.
  //
  // Antes eram quatro SELECT soltos seguidos de um INSERT. Duas chamadas ao
  // mesmo tempo passavam as duas na validacao e inseriam as duas -- a regra
  // "uma fusao por via" era verificada mas nao garantida. E sob REPEATABLE
  // READ um SELECT simples dentro da transacao le um instantaneo e nao
  // bloqueia nada, por isso o `for("update")` nao e decoracao: e ele que
  // serializa.
  //
  // A regra em si saiu para shared/optica/regrasFusao.ts, onde tem teste. Os
  // quatro SELECT antigos comparavam so o ID, sem o tipo, e como ceo_vias e
  // ceo_splitter_vias sao numeracoes independentes que se sobrepoem, o sistema
  // recusava fusoes validas dizendo que a via estava ocupada.
  return await db.transaction(async (tx) => {
    const existentes = await tx.select().from(ceoViaAssociations)
      .where(eq(ceoViaAssociations.ceoId, data.ceoId))
      .for("update");

    const r = validarNovaLigacao(existentes, a, b, "ceo");
    if (r.tipo === "jaExiste") return r.id;
    if (r.tipo === "recusado") throw new Error(r.motivo);

    const result = await tx.insert(ceoViaAssociations).values(data);
    return (result as any)[0]?.insertId ?? 0;
  });
}

export async function deleteViaAssociation(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  // Antes de apagar, buscar a associação para saber quais vias limpar
  const [assoc] = await db.select().from(ceoViaAssociations).where(eq(ceoViaAssociations.id, id)).limit(1);

  await db.delete(ceoViaAssociations).where(eq(ceoViaAssociations.id, id));

  // Bidirecionalidade: limpar fusedToSplitterId na via do tubo
  if (assoc) {
    let tubeViaId: number | null = null;
    if (assoc.sourceType === "tube" && assoc.targetType === "splitter") {
      tubeViaId = assoc.sourceViaId;
    } else if (assoc.sourceType === "splitter" && assoc.targetType === "tube") {
      tubeViaId = assoc.targetViaId;
    }
    if (tubeViaId !== null) {
      await db.update(ceoVias)
        .set({ fusedToSplitterId: null, fusedToSplitterViaId: null })
        .where(eq(ceoVias.id, tubeViaId));
    }
  }
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
  // Carregar splitters e vias de splitter para seguir fusões tubo→splitter
  const allCeoSplitters = await db.select().from(ceoSplitters);
  const allCeoSplitterVias = await db.select().from(ceoSplitterVias);
  // Carregar reservas técnicas vinculadas a rotas (para somar ao comprimento do traçado)
  const allTechReserves = await db.select().from(mapTechnicalReserves);
  // Mapa routeId -> total de metros de reserva vinculados
  const reserveByRoute = new Map<number, number>();
  for (const r of allTechReserves) {
    if (r.routeId != null) {
      reserveByRoute.set(r.routeId, (reserveByRoute.get(r.routeId) ?? 0) + r.sizeMeters);
    }
  }
  // Índices para acesso rápido
  const elementById = new Map(allElements.map(e => [e.id, e]));
  const ceoTubeById = new Map(allCeoTubes.map(t => [t.id, t]));
  const ctoTubeById = new Map(allCtoTubes.map(t => [t.id, t]));
  const ceoViaById = new Map(allCeoVias.map(v => [v.id, v]));
  const ctoViaById = new Map(allCtoVias.map(v => [v.id, v]));
  const ceoById = new Map(allCeos.map(c => [c.id, c]));
  const ctoById = new Map(allCtos.map(c => [c.id, c]));
  const ceoSplitterById = new Map(allCeoSplitters.map(s => [s.id, s]));
  // Índice: splitterId -> vias do splitter
  const splitterViasBySplitter = new Map<number, typeof allCeoSplitterVias>();
  for (const sv of allCeoSplitterVias) {
    if (!splitterViasBySplitter.has(sv.splitterId)) splitterViasBySplitter.set(sv.splitterId, []);
    splitterViasBySplitter.get(sv.splitterId)!.push(sv);
  }

  // Função para obter o nome de um elemento
  function getElementName(el: { type: string; referenceId: number }): string {
    if (el.type === "ceo") return ceoById.get(el.referenceId)?.name ?? `CEO #${el.referenceId}`;
    return ctoById.get(el.referenceId)?.name ?? `CTO #${el.referenceId}`;
  }

  // Função para encontrar a rota que sai de um elemento via um tubo específico
  // Retorna { route, isForward } onde isForward=true significa que o tubo está como fromTubeId
  // (o cabo sai deste elemento em direcção ao toElementId)
  // Quando há múltiplas rotas com o mesmo tubo, tenta selecionar a que tem a via correcta no destino
  function findRouteFromTube(elementId: number, tubeId: number, viaNumber?: number): { route: typeof allRoutes[0]; isForward: boolean } | null {
    // Tubo está como fromTubeId → percorrer em frente (from→to)
    const forwardRoutes = allRoutes.filter(r => r.fromElementId === elementId && r.fromTubeId === tubeId);
    if (forwardRoutes.length === 1) return { route: forwardRoutes[0], isForward: true };
    if (forwardRoutes.length > 1 && viaNumber !== undefined) {
      // Múltiplos cabos saindo pelo mesmo tubo: selecionar o que tem a via correcta no destino
      const best = forwardRoutes.find(r => {
        if (!r.toElementId || !r.toTubeId) return false;
        const destEl = elementById.get(r.toElementId);
        if (!destEl) return false;
        const destVia = destEl.type === "ceo"
          ? allCeoVias.find(v => v.tubeId === r.toTubeId! && v.viaNumber === viaNumber)
          : allCtoVias.find(v => v.tubeId === r.toTubeId! && v.viaNumber === viaNumber);
        return !!destVia;
      });
      if (best) return { route: best, isForward: true };
      return { route: forwardRoutes[0], isForward: true }; // fallback ao primeiro
    }
    if (forwardRoutes.length > 0) return { route: forwardRoutes[0], isForward: true };
    // Tubo está como toTubeId → percorrer ao contrário (to→from)
    const backwardRoutes = allRoutes.filter(r => r.toElementId === elementId && r.toTubeId === tubeId);
    if (backwardRoutes.length === 1) return { route: backwardRoutes[0], isForward: false };
    if (backwardRoutes.length > 1 && viaNumber !== undefined) {
      const best = backwardRoutes.find(r => {
        if (!r.fromElementId || !r.fromTubeId) return false;
        const destEl = elementById.get(r.fromElementId);
        if (!destEl) return false;
        const destVia = destEl.type === "ceo"
          ? allCeoVias.find(v => v.tubeId === r.fromTubeId! && v.viaNumber === viaNumber)
          : allCtoVias.find(v => v.tubeId === r.fromTubeId! && v.viaNumber === viaNumber);
        return !!destVia;
      });
      if (best) return { route: best, isForward: false };
      return { route: backwardRoutes[0], isForward: false };
    }
    if (backwardRoutes.length > 0) return { route: backwardRoutes[0], isForward: false };
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
    // Passar viaNumber para desambiguar quando há múltiplos cabos no mesmo tubo
    const routeResult = findRouteFromTube(currentElementId, currentTubeId, currentViaNumber);
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

    // Reserva técnica vinculada a esta rota (metros extras no final do traçado, próximo ao elemento destino)
    const reserveMeters = reserveByRoute.get(activeRoute.id) ?? 0;
    if (reserveMeters > 0) {
      warnings.push(`Reserva técnica de ${reserveMeters}m incluída no cálculo da rota "${activeRoute.name ?? `#${activeRoute.id}`}"`);
      totalLength += reserveMeters;
      // Verificar se a distância alvo é atingida dentro da reserva (após percorrer o traçado físico)
      if (distanceTraveled + reserveMeters >= targetDistanceMeters) {
        const remaining = targetDistanceMeters - distanceTraveled;
        // O ponto está dentro da reserva técnica — posicioná-lo no último ponto do traçado
        const endPt = pts[pts.length - 1] ?? pts[0];
        distanceTraveled = targetDistanceMeters;
        return {
          found: true,
          lat: endPt.lat, lng: endPt.lng,
          distanceTraveled,
          totalLength,
          segmentName: activeRoute.name ?? null,
          segmentRouteId: activeRoute.id,
          elementReached: null,
          tracedPath,
          warnings: [...warnings, `Ponto OTDR localizado dentro da reserva técnica de ${reserveMeters}m (${Math.round(remaining)}m usados da reserva)`]
        };
      }
      distanceTraveled += reserveMeters;
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

    // Verificar se há fusão de saída (tubo→tubo ou tubo→splitter)
    if (nextElement.type === "ceo" && !arrivalVia.fusedToViaId && !arrivalVia.fusedToTubeId) {
      // Verificar se há fusão tubo→splitter (novo mecanismo)
      const ceoArrivalVia = arrivalVia as typeof allCeoVias[0];
      if (ceoArrivalVia.fusedToSplitterId != null) {
        // A via do tubo está fundida com a entrada (via 0) de um splitter
        // Precisamos encontrar a via de saída do splitter que conecta ao próximo tubo
        const splitter = ceoSplitterById.get(ceoArrivalVia.fusedToSplitterId);
        if (!splitter) {
          return {
            found: false, lat: null, lng: null,
            distanceTraveled, totalLength,
            segmentName: activeRoute.name ?? null, segmentRouteId: activeRoute.id,
            elementReached: { id: nextElementId, name: getElementName(nextElement), type: nextElement.type },
            tracedPath,
            warnings: [...warnings, `Splitter #${ceoArrivalVia.fusedToSplitterId} não encontrado no CEO "${getElementName(nextElement)}"`]
          };
        }
        // Encontrar a via de saída do splitter (via 1, 2, ...) que está fundida com outro tubo
        // Para OTDR, precisamos encontrar qual saída do splitter conecta ao próximo cabo
        // Procurar entre as vias de saída do splitter aquela que tem uma via de CEO fundida de volta
        const splitterVias = splitterViasBySplitter.get(splitter.id) ?? [];
        // Encontrar a via de saída do splitter que tem uma ceoVia com fusedToSplitterViaId apontando para ela
        // e essa ceoVia pertence a um tubo que tem rota de saída do elemento
        let foundExitTubeId: number | null = null;
        let foundExitViaNumber: number = currentViaNumber;
        for (const splVia of splitterVias) {
          if (splVia.viaNumber === 0) continue; // pular entrada
          // Procurar ceoVia que aponta para esta via de splitter como saída
          const exitCeoVia = allCeoVias.find(v =>
            v.ceoId === nextElement.referenceId &&
            (v as any).fusedToSplitterId === splitter.id &&
            (v as any).fusedToSplitterViaId === splVia.id
          );
          if (exitCeoVia) {
            // Verificar se este tubo tem rota de saída
            const hasRoute = allRoutes.some(r =>
              (r.fromElementId === nextElementId && r.fromTubeId === exitCeoVia.tubeId) ||
              (r.toElementId === nextElementId && r.toTubeId === exitCeoVia.tubeId)
            );
            if (hasRoute) {
              foundExitTubeId = exitCeoVia.tubeId;
              foundExitViaNumber = exitCeoVia.viaNumber;
              break;
            }
          }
        }
        if (foundExitTubeId === null) {
          // Tentar usar a via de saída do splitter indicada em fusedToSplitterViaId
          const targetSplVia = ceoArrivalVia.fusedToSplitterViaId != null
            ? allCeoSplitterVias.find(sv => sv.id === ceoArrivalVia.fusedToSplitterViaId)
            : null;
          const splViaNum = targetSplVia?.viaNumber ?? 1;
          warnings.push(`Splitter "${splitter.identifier}" em "${getElementName(nextElement)}": via de saída ${splViaNum} não tem tubo de saída configurado`);
          return {
            found: false, lat: null, lng: null,
            distanceTraveled, totalLength,
            segmentName: activeRoute.name ?? null, segmentRouteId: activeRoute.id,
            elementReached: { id: nextElementId, name: getElementName(nextElement), type: nextElement.type },
            tracedPath, warnings
          };
        }
        warnings.push(`Fibra passa pelo splitter "${splitter.identifier}" em "${getElementName(nextElement)}" — sinal dividido`);
        currentElementId = nextElementId;
        currentTubeId = foundExitTubeId;
        currentViaNumber = foundExitViaNumber;
        continue;
      }
      // Sem fusão de saída
      return {
        found: false, lat: null, lng: null,
        distanceTraveled, totalLength,
        segmentName: activeRoute.name ?? null, segmentRouteId: activeRoute.id,
        elementReached: { id: nextElementId, name: getElementName(nextElement), type: nextElement.type },
        tracedPath,
        warnings: [...warnings, `A fibra chega ao elemento "${getElementName(nextElement)}" mas a via ${currentViaNumber} não tem fusão de saída registada — a fibra termina aqui`]
      };
    } else if (!arrivalVia.fusedToViaId || !arrivalVia.fusedToTubeId) {
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
    const exitTubeId = arrivalVia.fusedToTubeId!;
    const exitViaId = arrivalVia.fusedToViaId!;

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
import { mapOltElements, MapOltElement, InsertMapOltElement, oltPortFiberLinks, OltPortFiberLink, InsertOltPortFiberLink, dgoPortFiberLinks, DgoPortFiberLink, InsertDgoPortFiberLink } from "../drizzle/schema";
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
  // Buscar apenas as portas referenciadas pelos links (não todas)
  const portIds = Array.from(new Set(links.map(l => l.portId)));
  const allPorts = await db.select({
    id: ports.id,
    label: ports.label,
    portNumber: ports.portNumber,
    slotId: ports.slotId,
  }).from(ports).where(sql`${ports.id} IN (${sql.join(portIds.map(id => sql`${id}`), sql`, `)})`);;
  const allElements = await db.select({ id: mapElements.id, type: mapElements.type, referenceId: mapElements.referenceId }).from(mapElements);
  const allCeos = await db.select({ id: ceos.id, name: ceos.name }).from(ceos);
  const allCeoTubes = await db.select({ id: ceoTubes.id, identifier: ceoTubes.identifier }).from(ceoTubes);

   // Buscar slots dos ports que têm slotId
  const slotIds = Array.from(new Set(allPorts.map(p => p.slotId).filter(Boolean))) as number[];
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
    // Formato: "Porta {portNumber}" + opcionalmente " — {label}"
    const portBase = port ? `Porta ${port.portNumber}${port.label ? ` — ${port.label}` : ""}` : `Porta #${link.portId}`;
    const slotDisplay = slot?.slotNumber ?? null;
    return {
      ...link,
      portLabel: port?.label ?? null,
      portNumber: port?.portNumber ?? String(link.portId),
      portName: slotDisplay ? `${slotDisplay} / ${portBase}` : portBase,
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

// ─── DGO Port Fiber Links (vínculos porta DGO → tubo CEO) ─────────────────────────────────────────────────────────────────────────────────────
export async function getDgoPortFiberLinks(dgoElementId: number): Promise<(DgoPortFiberLink & {
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
  const links = await db.select().from(dgoPortFiberLinks).where(eq(dgoPortFiberLinks.dgoElementId, dgoElementId));
  if (links.length === 0) return [];
  const portIds = Array.from(new Set(links.map(l => l.portId)));
  const allPorts = await db.select({
    id: ports.id,
    label: ports.label,
    portNumber: ports.portNumber,
    slotId: ports.slotId,
  }).from(ports).where(sql`${ports.id} IN (${sql.join(portIds.map(id => sql`${id}`), sql`, `)})`);
  const allElements = await db.select({ id: mapElements.id, type: mapElements.type, referenceId: mapElements.referenceId }).from(mapElements);
  const allCeos = await db.select({ id: ceos.id, name: ceos.name }).from(ceos);
  const allCeoTubes = await db.select({ id: ceoTubes.id, identifier: ceoTubes.identifier }).from(ceoTubes);
  const slotIds = Array.from(new Set(allPorts.map(p => p.slotId).filter(Boolean))) as number[];
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
    const portBase = port ? `Porta ${port.portNumber}${port.label ? ` — ${port.label}` : ""}` : `Porta #${link.portId}`;
    const slotDisplay = slot?.slotNumber ?? null;
    return {
      ...link,
      portLabel: port?.label ?? null,
      portNumber: port?.portNumber ?? String(link.portId),
      portName: slotDisplay ? `${slotDisplay} / ${portBase}` : portBase,
      slotNumber: slot?.slotNumber ?? null,
      slotLabel: slot?.label ?? null,
      ceoName: ceo?.name ?? `CEO #${link.ceoElementId}`,
      tubeIdentifier: tube?.identifier ?? `Tubo #${link.tubeId}`,
    };
  });
}

export async function createDgoPortFiberLink(data: Omit<InsertDgoPortFiberLink, "id" | "createdAt" | "updatedAt">): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(dgoPortFiberLinks).values(data);
  return (result[0] as any).insertId;
}

export async function updateDgoPortFiberLink(id: number, data: Partial<Omit<InsertDgoPortFiberLink, "id" | "createdAt" | "updatedAt">>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(dgoPortFiberLinks).set(data).where(eq(dgoPortFiberLinks.id, id));
}

export async function deleteDgoPortFiberLink(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(dgoPortFiberLinks).where(eq(dgoPortFiberLinks.id, id));
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

/**
 * Detecta se o identifier corresponde a um splitter desbalanceado.
 * Retorna as percentagens [maior, menor] ou null se não for desbalanceado.
 * Ex: "95/5" → [95, 5], "SPLINTER 90/10" → [90, 10]
 */
function detectUnbalancedRatio(identifier: string): [number, number] | null {
  const m = identifier.match(/(\d+)\/(\d+)/);
  if (!m) return null;
  const a = parseInt(m[1]);
  const b = parseInt(m[2]);
  // Se ambos > 1 e somam ~100, é desbalanceado
  if (a > 1 && b > 1 && Math.abs(a + b - 100) <= 5) {
    return [Math.max(a, b), Math.min(a, b)];
  }
  return null;
}

/**
 * Calcula a perda de um splitter desbalanceado com base no viaNumber da via de saída.
 * Usa a fórmula: perda = -10 × log10(percentagem/100)
 * Convenção: via de MAIOR viaNumber = porta de MAIOR percentagem (menor perda).
 *             via de MENOR viaNumber (excluindo ENT=0) = porta de MENOR percentagem (maior perda).
 * @param ratio Identifier do splitter (ex: "95/5", "SPLINTER 90/10")
 * @param exitViaNumber viaNumber da via de saída do splitter
 * @param allSplitterViaNumbers todos os viaNumbers das vias deste splitter
 */
function getUnbalancedSplitterLoss(
  ratio: string,
  exitViaNumber: number,
  allSplitterViaNumbers: number[]
): number | null {
  const percentages = detectUnbalancedRatio(ratio);
  if (!percentages) return null;
  const [pctMajor, pctMinor] = percentages;
  // Excluir via ENT (viaNumber=0) para determinar max/min das saídas
  const outputVias = allSplitterViaNumbers.filter(n => n > 0);
  if (outputVias.length === 0) return null;
  const maxVia = Math.max(...outputVias);
  // Via de maior viaNumber = porta maior% = menor perda
  const pct = exitViaNumber === maxVia ? pctMajor : pctMinor;
  return parseFloat((-10 * Math.log10(pct / 100)).toFixed(2));
}

function getSplitterLoss(ratio: string): number {
  // Normalizar o ratio (ex: "1/8" → "1:8", "SPLINTER 1:8" → "1:8", "8" → "1:8")
  const normalized = ratio.replace("/", ":").trim();
  // Verificação directa na tabela
  if (SPLITTER_LOSS_DB[normalized] !== undefined) return SPLITTER_LOSS_DB[normalized];
  // Extrair padrão "1:N" ou "1/N" de qualquer parte do string (ex: "SPLINTER 1:8" → "1:8")
  const ratioMatch = normalized.match(/\b(1[:/]\d+)\b/);
  if (ratioMatch) {
    const extracted = ratioMatch[1].replace("/", ":");
    if (SPLITTER_LOSS_DB[extracted] !== undefined) return SPLITTER_LOSS_DB[extracted];
  }
  // Tentar extrair apenas o denominador
  const denomMatch = normalized.match(/1[:/](\d+)/);
  if (denomMatch) {
    const n = parseInt(denomMatch[1]);
    // Procurar na tabela pelo denominador
    const tableKey = `1:${n}`;
    if (SPLITTER_LOSS_DB[tableKey] !== undefined) return SPLITTER_LOSS_DB[tableKey];
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
  options?: {
    overrideTxPowerDbm?: number;       // Se fornecido, substitui a busca pela OLT (usado via DGO)
    overrideEquipmentName?: string;    // Nome do equipamento de origem (OLT/Switch via DGO)
  }
): Promise<OpticalBalanceResult> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const warnings: string[] = [];
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
  const allViaAssocs = await db.select().from(ceoViaAssociations);
  const allCtoViaAssocs = await db.select().from(ctoViaAssociations);
  const allOltElements = await db.select().from(mapOltElements);
  const allOltLinks = await db.select().from(oltPortFiberLinks);
  const allDgoElements = await db.select().from(mapDgoElements).catch(() => [] as any[]);
  // dgo_port_fiber_links pode não existir se migrate-v19 ainda não foi aplicado
  const allDgoLinks: any[] = await db.select().from(dgoPortFiberLinks).catch(() => []);
  // dgo_slot_cable_links: vincula cabo (routeId) a bandeja DGO — usado para rastrear quando fromElementId=null
  const allDgoSlotLinks: any[] = await db.select().from(dgoSlotCableLinks).catch(() => []);
  // equipments.txPowerDbm pode não existir se migrate-v17 ainda não foi aplicado
  const allEquipments: any[] = await db.select({ id: equipments.id, name: equipments.name, txPowerDbm: equipments.txPowerDbm }).from(equipments).catch(() => []);
  // ports.txPowerDbm pode não existir se migrate-v18 ainda não foi aplicado
  const allPorts: any[] = await db.select({ id: ports.id, label: ports.label, portNumber: ports.portNumber, slotId: ports.slotId, equipmentId: ports.equipmentId, connectedToEquipmentId: ports.connectedToEquipmentId, txPowerDbm: ports.txPowerDbm }).from(ports).catch(() => []);
  // Reservas técnicas: mapa routeId -> metros extras
  const allTechReservesOB = await db.select().from(mapTechnicalReserves);
  const reserveByRouteOB = new Map<number, number>();
  for (const r of allTechReservesOB) {
    if (r.routeId != null) {
      reserveByRouteOB.set(r.routeId, (reserveByRouteOB.get(r.routeId) ?? 0) + r.sizeMeters);
    }
  }
  // Índices
  const elementById = new Map(allElements.map(e => [e.id, e]));
  const ceoById = new Map(allCeos.map(c => [c.id, c]));
  const ctoById = new Map(allCtos.map(c => [c.id, c]));
  const ceoTubeById = new Map(allCeoTubes.map(t => [t.id, t]));
  const ctoTubeById = new Map(allCtoTubes.map(t => [t.id, t]));
  const ceoViaById = new Map(allCeoVias.map(v => [v.id, v]));
  const ctoViaById = new Map(allCtoVias.map(v => [v.id, v]));
  const splitterViaById = new Map(allSplitterVias.map(v => [v.id, v]));
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
  // Encontrar rotas conectadas à CTO
  const incomingRoutes = allRoutes.filter(r => r.toElementId === ctoElementId || r.fromElementId === ctoElementId);
  if (incomingRoutes.length === 0) {
    return { found: false, rxPowerDbm: null, txPowerDbm: 0, totalLossDb: 0, distanceKm: 0, cableLossDb: 0, splitterLossDb: 0, fusionLossDb: 0, signalQuality: "no_signal", path: [], warnings: [`CTO "${ctoName}" não tem cabos conectados`] };
  }
  // Encontrar a rota de entrada e o tubo de chegada
  let entryRoute: typeof allRoutes[0] | null = null;
  let entryTubeId: number | null = null;
  for (const route of incomingRoutes) {
    if (route.toElementId === ctoElementId && route.toTubeId) {
      entryRoute = route; entryTubeId = route.toTubeId; break;
    }
    if (route.fromElementId === ctoElementId && route.fromTubeId) {
      entryRoute = route; entryTubeId = route.fromTubeId; break;
    }
  }
  if (!entryRoute || !entryTubeId) {
    entryRoute = incomingRoutes[0];
    warnings.push(`Cabo "${entryRoute.name ?? `#${entryRoute.id}`}" não tem tubo vinculado na CTO — estimativa pode ser imprecisa`);
  }
  // Funções auxiliares
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
  let totalDistanceKm = 0;
  let totalSplitterLoss = 0;
  let totalFusionCount = 0;
  let foundOlt: { element: typeof allOltElements[0]; link: typeof allOltLinks[0] } | null = null;
  let foundDgo: { element: typeof allDgoElements[0]; link: typeof allDgoLinks[0] } | null = null;
  const reversePath: Array<{ type: "olt" | "cable" | "splitter" | "fusion" | "ceo" | "cto"; label: string; lossDb: number; distKm?: number }> = [];
  reversePath.push({ type: "cto", label: ctoName, lossDb: 0 });
  // Estado actual do rastreio
  let currentElementId = ctoElementId;
  let currentTubeId = entryTubeId;
  let currentViaNumber: number | null = null;
  // ─── Processar splitter interno da CTO alvo ──────────────────────────────────
  // A CTO pode ter um splitter interno onde a fibra chega ao tubo de entrada,
  // é fusionada para a via ENT do splitter, e o sinal é distribuído pelas saídas.
  // O rastreio deve detectar este splitter e adicionar a sua perda.
  if (entryTubeId !== null) {
    const ctoRefId = ctoElement.referenceId;
    // Verificar se o tubo de entrada é do tipo 'splitter'
    const entryTubeObj = ctoTubeById.get(entryTubeId);
    if (entryTubeObj?.type === "splitter") {
      // O tubo de entrada é o próprio splitter — adicionar perda
      const splitterRatio = entryTubeObj.identifier ?? "1:8";
      // Encontrar a via ENT do splitter (viaNumber = 0 ou 1) que tem fusão com um tubo
      const splitterVias = allCtoVias.filter(v => v.tubeId === entryTubeId);
      // Para splitter desbalanceado, a via de saída é a que está associada ao cliente
      // (a via que está conectada ao cabo de entrada da CTO = a via de saída do splitter)
      // Neste caso, o entryTubeId é o splitter, e a via de saída é a que tem viaNumber máximo
      const splitterViaNumbers = splitterVias.map(v => v.viaNumber);
      // A via de saída do splitter (que vai para o cliente) tem o maior viaNumber
      const exitViaNumber = splitterViaNumbers.length > 0 ? Math.max(...splitterViaNumbers) : 0;
      const unbalancedLoss = getUnbalancedSplitterLoss(splitterRatio, exitViaNumber, splitterViaNumbers);
      const loss = unbalancedLoss !== null ? unbalancedLoss : getSplitterLoss(splitterRatio);
      totalSplitterLoss += loss;
      reversePath.push({ type: "splitter", label: `${entryTubeObj.identifier} (splitter interno)`, lossDb: loss });
      // Procurar via ENT com fusão directa (fusedToTubeId)
      const entViaWithFusion = splitterVias.find(v => v.fusedToTubeId !== null && v.fusedToTubeId !== undefined);
      if (entViaWithFusion?.fusedToTubeId) {
        totalFusionCount++;
        currentTubeId = entViaWithFusion.fusedToTubeId;
        currentViaNumber = entViaWithFusion.fusedToViaId ? (ctoViaById.get(entViaWithFusion.fusedToViaId)?.viaNumber ?? null) : null;
      } else {
        // Procurar via ENT via ctoViaAssociations (splitter → tube)
        const assocForSplitter = allCtoViaAssocs.find(a =>
          a.ctoId === ctoRefId &&
          ((a.sourceType === "splitter" && splitterVias.some(v => v.id === a.sourceViaId)) ||
           (a.targetType === "splitter" && splitterVias.some(v => v.id === a.targetViaId)))
        );
        if (assocForSplitter) {
          const tubeSideViaId = assocForSplitter.sourceType === "splitter"
            ? assocForSplitter.targetViaId
            : assocForSplitter.sourceViaId;
          const tubeSideVia = ctoViaById.get(tubeSideViaId);
          if (tubeSideVia) {
            totalFusionCount++;
            currentTubeId = tubeSideVia.tubeId;
            currentViaNumber = tubeSideVia.viaNumber;
          }
        }
      }
    } else {
      // Tubo de entrada não é splitter — verificar se alguma via deste tubo está
      // associada a um splitter via ctoViaAssociations
      const ctoRefId2 = ctoElement.referenceId;
      const tubeVias = allCtoVias.filter(v => v.tubeId === entryTubeId);
      // Procurar via do tubo que tem fusão directa com um tubo splitter
      const viaWithSplitterFusion = tubeVias.find(v =>
        v.fusedToTubeId !== null && v.fusedToTubeId !== undefined &&
        ctoTubeById.get(v.fusedToTubeId!)?.type === "splitter"
      );
      if (viaWithSplitterFusion?.fusedToTubeId) {
        const splitterTube = ctoTubeById.get(viaWithSplitterFusion.fusedToTubeId!);
        if (splitterTube) {
          // Para splitter desbalanceado: a via que está fusionada ao tubo de entrada
          // é a via de saída do splitter (a que vai para o cliente)
          const splitterVias2 = allCtoVias.filter(v => v.tubeId === viaWithSplitterFusion.fusedToTubeId!);
          const splitterViaNumbers2 = splitterVias2.map(v => v.viaNumber);
          // A via de saída é a via que tem fusão com o tubo de entrada (viaWithSplitterFusion)
          const exitViaForFusion = viaWithSplitterFusion.fusedToViaId
            ? (ctoViaById.get(viaWithSplitterFusion.fusedToViaId)?.viaNumber ?? Math.max(...splitterViaNumbers2))
            : Math.max(...splitterViaNumbers2);
          const unbalancedLoss2 = getUnbalancedSplitterLoss(splitterTube.identifier ?? "1:8", exitViaForFusion, splitterViaNumbers2);
          const loss = unbalancedLoss2 !== null ? unbalancedLoss2 : getSplitterLoss(splitterTube.identifier ?? "1:8");
          totalSplitterLoss += loss;
          totalFusionCount++;
          reversePath.push({ type: "splitter", label: `${splitterTube.identifier} (splitter interno)`, lossDb: loss });
          // O tubo de entrada real é o tubo de entrada do splitter — mas como o splitter
          // é interno à CTO, o cabo chega ao tubo de entrada (entryTubeId) directamente.
          // Definir currentViaNumber com o viaNumber da via fusionada ao splitter
          // para que o algoritmo propague correctamente ao longo da cadeia.
          currentViaNumber = viaWithSplitterFusion.viaNumber;
        }
      } else {
        // Procurar via ctoViaAssociations: via do tubo associada a via de splitter
        const assocForTube = allCtoViaAssocs.find(a =>
          a.ctoId === ctoRefId2 &&
          ((a.sourceType === "tube" && tubeVias.some(v => v.id === a.sourceViaId) && a.targetType === "splitter") ||
           (a.targetType === "tube" && tubeVias.some(v => v.id === a.targetViaId) && a.sourceType === "splitter"))
        );
        if (assocForTube) {
          const splitterSideViaId = assocForTube.sourceType === "splitter"
            ? assocForTube.sourceViaId
            : assocForTube.targetViaId;
          const splitterSideVia = ctoViaById.get(splitterSideViaId);
          if (splitterSideVia) {
            const splitterTube = ctoTubeById.get(splitterSideVia.tubeId);
            if (splitterTube?.type === "splitter") {
              // Para splitter desbalanceado: a splitterSideVia é a via de saída do splitter
              const splitterVias3 = allCtoVias.filter(v => v.tubeId === splitterSideVia.tubeId);
              const splitterViaNumbers3 = splitterVias3.map(v => v.viaNumber);
              const unbalancedLoss3 = getUnbalancedSplitterLoss(splitterTube.identifier ?? "1:8", splitterSideVia.viaNumber, splitterViaNumbers3);
              const loss = unbalancedLoss3 !== null ? unbalancedLoss3 : getSplitterLoss(splitterTube.identifier ?? "1:8");
              totalSplitterLoss += loss;
              totalFusionCount++;
              reversePath.push({ type: "splitter", label: `${splitterTube.identifier} (splitter interno)`, lossDb: loss });
              // currentTubeId permanece = entryTubeId (o cabo chega a este tubo)
            }
          }
        }
      }
    }
  }
  // Conjunto de estados visitados para detectar loops reais
  // Chave inclui viaNumber para evitar falsos positivos quando o mesmo elemento
  // aparece com tubos/vias diferentes (passagem legítima de cabo)
  const visited = new Set<string>();
  const visitedRouteIds = new Set<number>(); // IDs de rotas já percorridas (evitar voltar atrás)
  for (let iter = 0; iter < 50; iter++) {
    const loopKey = `${currentElementId}:${currentTubeId ?? "null"}:${currentViaNumber ?? "null"}`;
    if (visited.has(loopKey)) { warnings.push("Loop detectado na cadeia de fibra"); break; }
    visited.add(loopKey);

    // ── Verificar se o estado actual (elemento CEO + tubo + via) corresponde a um vínculo DGO ──
    // Esta verificação é feita no início de cada iteração, DEPOIS de o CEO ter processado
    // as fusões internas e actualizado currentTubeId/currentViaNumber para o tubo de saída.
    if (currentTubeId !== null) {
      const dgoLinkAtStart = allDgoLinks.find(l =>
        l.ceoElementId === currentElementId &&
        l.tubeId === currentTubeId &&
        (currentViaNumber === null || l.viaNumber === currentViaNumber)
      ) ?? allDgoLinks.find(l =>
        l.ceoElementId === currentElementId &&
        l.tubeId === currentTubeId
      );
      if (dgoLinkAtStart) {
        const dgoEl = allDgoElements.find(d => d.id === dgoLinkAtStart.dgoElementId);
        if (dgoEl) {
          foundDgo = { element: dgoEl, link: dgoLinkAtStart };
          const portInfo = portById.get(dgoLinkAtStart.portId);
          const portLabel = portInfo?.label ?? portInfo?.portNumber ?? `Porta #${dgoLinkAtStart.portId}`;
          const ceoEl = elementById.get(currentElementId);
          if (ceoEl) reversePath.push({ type: "ceo", label: getElementName(ceoEl), lossDb: 0 });
          reversePath.push({ type: "olt", label: `DGO — ${portLabel}`, lossDb: 0 });
          break;
        }
      }
    }

    // Encontrar o cabo que chega a este elemento por este tubo
    let activeRoute: typeof allRoutes[0] | null = null;
    let isForwardOnRoute = false;
    if (currentTubeId) {
      // Excluir rotas já percorridas para evitar loops
      activeRoute = allRoutes.find(r => r.toElementId === currentElementId && r.toTubeId === currentTubeId && !visitedRouteIds.has(r.id)) ?? null;
      if (activeRoute) { isForwardOnRoute = true; }
      if (!activeRoute) {
        activeRoute = allRoutes.find(r => r.fromElementId === currentElementId && r.fromTubeId === currentTubeId && !visitedRouteIds.has(r.id)) ?? null;
        if (activeRoute) { isForwardOnRoute = false; }
      }
    }
    if (!activeRoute) {
      // Sem tubo vinculado — tentar qualquer cabo conectado a este elemento
      // Excluir todas as rotas já percorridas (evitar voltar atrás em qualquer ramo)
      const candidateRoutes = allRoutes.filter(r =>
        (r.toElementId === currentElementId || r.fromElementId === currentElementId) &&
        !visitedRouteIds.has(r.id)
      );
      // Priorizar cabos cujo outro extremo é um CEO (rastreio de volta à OLT passa por CEOs)
      const routeViaCeo = candidateRoutes.find(r => {
        const otherId = r.toElementId === currentElementId ? r.fromElementId : r.toElementId;
        const otherEl = otherId ? elementById.get(otherId) : null;
        return otherEl?.type === "ceo";
      });
      activeRoute = routeViaCeo ?? candidateRoutes[0] ?? null;
      if (activeRoute) {
        isForwardOnRoute = activeRoute.toElementId === currentElementId;
        warnings.push(`Cabo "${activeRoute.name ?? `#${activeRoute.id}`}" sem tubo vinculado — estimativa pode ser imprecisa`);
      }
    }
    if (!activeRoute) {
      warnings.push(`Nenhum cabo encontrado chegando ao elemento "${getElementName(elementById.get(currentElementId)!)}" — cadeia interrompida`);
      break;
    }
    visitedRouteIds.add(activeRoute.id); // marcar rota como percorrida
    const segDistKmBase = calcRouteDistanceKm(activeRoute);
    const reserveMetersOB = reserveByRouteOB.get(activeRoute.id) ?? 0;
    const segDistKm = segDistKmBase + (reserveMetersOB / 1000);
    totalDistanceKm += segDistKm;
    const cableLabel = reserveMetersOB > 0
      ? `${activeRoute.name ?? `Cabo #${activeRoute.id}`} (+${reserveMetersOB}m reserva)`
      : (activeRoute.name ?? `Cabo #${activeRoute.id}`);
    reversePath.push({ type: "cable", label: cableLabel, lossDb: 0, distKm: segDistKm });
    // Avançar para o elemento anterior (origem do cabo)
    const prevElementId = isForwardOnRoute ? (activeRoute.fromElementId ?? null) : (activeRoute.toElementId ?? null);
    if (!prevElementId) {
      // ── Vinculação automática DGO → CEO ──────────────────────────────────────────
      // O DGO não é um map_element, por isso fromElementId/toElementId do cabo é null.
      // Regra: cada bandeja (slot) do DGO corresponde a 1 tubo do cabo.
      //   tubo 1 → bandeja 1, tubo 2 → bandeja 2, etc.
      //   via N dentro do tubo → porta N da bandeja.
      // Buscamos o dgo_slot_cable_link que vincula este cabo a uma bandeja do DGO.
      // Se o tubo do CEO (currentTubeId) estiver mapeado neste link (tubeId),
      // usamos a bandeja correspondente e a via atual como número de porta.
      const dgoSlotLinksForRoute = allDgoSlotLinks.filter((sl: any) => sl.routeId === activeRoute!.id);
      if (dgoSlotLinksForRoute.length > 0) {
        // Determinar qual slot corresponde ao tubo atual do CEO
        // Prioridade: slot com tubeId === currentTubeId (vínculo explícito)
        // Fallback: ordenar slots por slotId e usar índice do tubo no cabo
        let matchedSlotLink: any = null;
        if (currentTubeId !== null) {
          matchedSlotLink = dgoSlotLinksForRoute.find((sl: any) => sl.tubeId === currentTubeId);
        }
        if (!matchedSlotLink && dgoSlotLinksForRoute.length === 1) {
          // Apenas um slot vinculado — usar diretamente
          matchedSlotLink = dgoSlotLinksForRoute[0];
        }
        if (!matchedSlotLink && currentTubeId !== null) {
          // Múltiplos slots: ordenar por slotId e descobrir índice do tubo no CEO
          // Os tubos do CEO que chegam a este cabo são ordenados por id
          const ceoTubesForRoute = allCeoTubes
            .filter((t: any) => {
              // Tubo pertence ao CEO do elemento de chegada do cabo
              const ceoEl = isForwardOnRoute
                ? (activeRoute!.toElementId ? elementById.get(activeRoute!.toElementId) : null)
                : (activeRoute!.fromElementId ? elementById.get(activeRoute!.fromElementId) : null);
              return ceoEl && t.ceoId === ceoEl.referenceId;
            })
            .sort((a: any, b: any) => a.id - b.id);
          const tubeIndex = ceoTubesForRoute.findIndex((t: any) => t.id === currentTubeId);
          const sortedSlotLinks = [...dgoSlotLinksForRoute].sort((a: any, b: any) => a.slotId - b.slotId);
          if (tubeIndex >= 0 && tubeIndex < sortedSlotLinks.length) {
            matchedSlotLink = sortedSlotLinks[tubeIndex];
          } else {
            matchedSlotLink = sortedSlotLinks[0];
          }
        }
        if (matchedSlotLink) {
          const dgoEl = allDgoElements.find((d: any) => d.id === matchedSlotLink.dgoElementId);
          if (dgoEl) {
            const dgoEquipment = allEquipments.find((e: any) => e.id === dgoEl.equipmentId);
            const dgoEquipName = dgoEquipment?.name ?? `DGO #${dgoEl.id}`;
            // Porta = via atual (via 1 → porta 1, via 2 → porta 2, ...)
            const portNumber = currentViaNumber ?? 1;
            // Buscar porta do equipamento DGO com slotId = matchedSlotLink.slotId e portNumber = portNumber
            const dgoPort = allPorts.find((p: any) =>
              p.equipmentId === dgoEl.equipmentId &&
              p.slotId === matchedSlotLink.slotId &&
              String(p.portNumber) === String(portNumber)
            );
            // Verificar se há dgo_port_fiber_link manual configurado para esta porta
            const manualDgoLink = dgoPort
              ? allDgoLinks.find((l: any) => l.dgoElementId === dgoEl.id && l.portId === dgoPort.id)
              : null;
            if (manualDgoLink) {
              // Vínculo manual tem prioridade
              foundDgo = { element: dgoEl, link: manualDgoLink };
              const portLabel = dgoPort?.label ?? `Porta ${portNumber}`;
              reversePath.push({ type: "olt", label: `${dgoEquipName} — ${portLabel}`, lossDb: 0 });
              break;
            }
            // Vinculação automática: porta do DGO encontrada
            if (dgoPort) {
              // Buscar equipamento conectado a esta porta (OLT/switch)
              const connectedEquip = dgoPort.connectedToEquipmentId
                ? allEquipments.find((e: any) => e.id === dgoPort.connectedToEquipmentId)
                : null;
              const effectiveTxPower = dgoPort.txPowerDbm ?? connectedEquip?.txPowerDbm ?? dgoEquipment?.txPowerDbm ?? null;
              const portLabel = dgoPort.label ?? `Porta ${portNumber}`;
              // Criar um link sintético para foundDgo (sem portId real de dgo_port_fiber_links)
              foundDgo = {
                element: dgoEl,
                link: {
                  id: -1,
                  dgoElementId: dgoEl.id,
                  portId: dgoPort.id,
                  txPowerDbm: effectiveTxPower,
                  ceoElementId: -1,
                  tubeId: currentTubeId ?? -1,
                  viaNumber: portNumber,
                  notes: null,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                } as any,
              };
              reversePath.push({ type: "olt", label: `${dgoEquipName} — ${portLabel}`, lossDb: 0 });
              break;
            }
            // Porta não encontrada no cadastro — usar potência do equipamento DGO
            const effectiveTxPower = dgoEquipment?.txPowerDbm ?? null;
            const portLabel = `Porta ${portNumber} (auto)`;
            foundDgo = {
              element: dgoEl,
              link: {
                id: -1,
                dgoElementId: dgoEl.id,
                portId: -1,
                txPowerDbm: effectiveTxPower,
                ceoElementId: -1,
                tubeId: currentTubeId ?? -1,
                viaNumber: portNumber,
                notes: null,
                createdAt: new Date(),
                updatedAt: new Date(),
              } as any,
            };
            reversePath.push({ type: "olt", label: `${dgoEquipName} — ${portLabel}`, lossDb: 0 });
            warnings.push(`Porta ${portNumber} da bandeja do DGO "${dgoEquipName}" não encontrada no cadastro — usando potência do equipamento`);
            break;
          }
        }
      }
      warnings.push(`Cabo "${activeRoute.name ?? `#${activeRoute.id}`}" não tem elemento de origem vinculado`);
      break;
    }
    const prevElement = elementById.get(prevElementId);
    if (!prevElement) { warnings.push(`Elemento #${prevElementId} não encontrado`); break; }
    const prevElementName = getElementName(prevElement);
    const arrivalTubeId = isForwardOnRoute ? (activeRoute.fromTubeId ?? null) : (activeRoute.toTubeId ?? null);
    // Verificar se o elemento anterior é uma OLT (via olt_port_fiber_links)
    // Verificar com tubo e, se disponível, com viaNumber
    const oltLink = allOltLinks.find(l =>
      l.ceoElementId === prevElementId &&
      (arrivalTubeId === null || l.tubeId === arrivalTubeId) &&
      (currentViaNumber === null || l.viaNumber === currentViaNumber)
    ) ?? allOltLinks.find(l =>
      l.ceoElementId === prevElementId &&
      (arrivalTubeId === null || l.tubeId === arrivalTubeId)
    );
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
    // Processar o interior do CEO: seguir fusões e associações de vias
    if (prevElement.type === "ceo" && arrivalTubeId !== null) {
      const ceoRefId = prevElement.referenceId;
      // Encontrar a via de chegada no tubo de chegada
      // Se currentViaNumber está definido, usar a via exacta; caso contrário preferir vias com fusão
      let arrivalVia: typeof allCeoVias[0] | null = null;
      if (currentViaNumber !== null) {
        arrivalVia = allCeoVias.find(v => v.tubeId === arrivalTubeId && v.viaNumber === currentViaNumber) ?? null;
      }
      if (!arrivalVia) {
        // Preferir via com fusão directa (tubo→tubo)
        arrivalVia = allCeoVias.find(v => v.tubeId === arrivalTubeId && v.fusedToTubeId != null) ?? null;
      }
      if (!arrivalVia) {
        // Preferir via com fusão tubo→splitter
        arrivalVia = allCeoVias.find(v => v.tubeId === arrivalTubeId && (v as any).fusedToSplitterId != null) ?? null;
      }
      if (!arrivalVia) {
        // Preferir via com associação (ceoViaAssociations)
        const tubeViaIds = new Set(allCeoVias.filter(v => v.tubeId === arrivalTubeId).map(v => v.id));
        const assocVia = allViaAssocs.find(a =>
          a.ceoId === ceoRefId &&
          ((a.sourceType === "tube" && tubeViaIds.has(a.sourceViaId)) ||
           (a.targetType === "tube" && tubeViaIds.has(a.targetViaId)))
        );
        if (assocVia) {
          const assocViaId = assocVia.sourceType === "tube" ? assocVia.sourceViaId : assocVia.targetViaId;
          arrivalVia = ceoViaById.get(assocViaId) ?? null;
        }
      }
      if (!arrivalVia) {
        // Fallback: primeira via do tubo
        arrivalVia = allCeoVias.find(v => v.tubeId === arrivalTubeId) ?? null;
      }
      // Caminho 1: fusão directa (fusedToTubeId na via do tubo)
      if (arrivalVia?.fusedToTubeId) {
        totalFusionCount++;
        currentTubeId = arrivalVia.fusedToTubeId;
        if (arrivalVia.fusedToViaId) {
          const exitVia = ceoViaById.get(arrivalVia.fusedToViaId);
          currentViaNumber = exitVia?.viaNumber ?? null;
        } else {
          currentViaNumber = null;
        }
        currentElementId = prevElementId;
        continue;
      }
      // Caminho 1b: fusão directa tubo→splitter (fusedToSplitterId na via do tubo)
      if (arrivalVia && (arrivalVia as any).fusedToSplitterId != null) {
        const splitterIdForFusion = (arrivalVia as any).fusedToSplitterId as number;
        const splitter = splitterById.get(splitterIdForFusion);
        if (splitter) {
          // Calcular perda do splitter (via de saída indicada por fusedToSplitterViaId)
          const splitterViaIdForFusion = (arrivalVia as any).fusedToSplitterViaId as number | null;
          const splitterViaForFusion = splitterViaIdForFusion ? allSplitterVias.find(v => v.id === splitterViaIdForFusion) : null;
          const loss = splitterViaForFusion?.lossDb ?? getSplitterLoss(splitter.ratio);
          totalSplitterLoss += loss;
          reversePath.push({ type: "splitter", label: `${splitter.identifier} (${splitter.ratio})`, lossDb: loss });
          totalFusionCount++; // fusão de entrada do splitter
          // Encontrar a via de entrada do splitter (viaNumber=0)
          const splitterEntryVia = allSplitterVias.find(v => v.splitterId === splitter.id && v.viaNumber === 0);
          if (splitterEntryVia) {
            // Método 1: procurar ceoVia com fusedToSplitterId apontando para a via ENT
            const exitCeoVia = allCeoVias.find(v =>
              v.ceoId === ceoRefId &&
              (v as any).fusedToSplitterId === splitter.id &&
              (v as any).fusedToSplitterViaId === splitterEntryVia.id
            );
            if (exitCeoVia) {
              currentTubeId = exitCeoVia.tubeId;
              currentViaNumber = exitCeoVia.viaNumber;
              currentElementId = prevElementId;
              continue;
            }
            // Método 2: procurar via ceoViaAssociations (splitter ENT → tubo)
            const assocEntToTube = allViaAssocs.find(a =>
              a.ceoId === ceoRefId &&
              ((a.sourceType === "splitter" && a.sourceViaId === splitterEntryVia.id && a.targetType === "tube") ||
               (a.targetType === "splitter" && a.targetViaId === splitterEntryVia.id && a.sourceType === "tube"))
            );
            if (assocEntToTube) {
              const exitTubeViaId = assocEntToTube.sourceType === "splitter"
                ? assocEntToTube.targetViaId
                : assocEntToTube.sourceViaId;
              const exitTubeVia = ceoViaById.get(exitTubeViaId);
              if (exitTubeVia) {
                currentTubeId = exitTubeVia.tubeId;
                currentViaNumber = exitTubeVia.viaNumber;
                currentElementId = prevElementId;
                continue;
              }
            }
          }
          // Fallback: procurar qualquer ceoVia que aponte para a entrada deste splitter
          const anyExitCeoVia = allCeoVias.find(v =>
            v.ceoId === ceoRefId &&
            (v as any).fusedToSplitterId === splitter.id
          );
          if (anyExitCeoVia) {
            currentTubeId = anyExitCeoVia.tubeId;
            currentViaNumber = anyExitCeoVia.viaNumber;
            currentElementId = prevElementId;
            continue;
          }
          warnings.push(`Splitter "${splitter.identifier}" em "${prevElementName}": via de entrada não tem tubo de saída configurado`);
          break;
        }
      }
      // Caminho 2: associação via ceoViaAssociations (tubo → splitter ou splitter → tubo)
      if (arrivalVia) {
        // Procurar associação onde a via de chegada é source ou target
        const assocToSplitter = allViaAssocs.find(a =>
          a.ceoId === ceoRefId &&
          a.sourceType === "tube" && a.sourceViaId === arrivalVia!.id &&
          a.targetType === "splitter"
        ) ?? allViaAssocs.find(a =>
          a.ceoId === ceoRefId &&
          a.targetType === "tube" && a.targetViaId === arrivalVia!.id &&
          a.sourceType === "splitter"
        );
        if (assocToSplitter) {
          // Determinar qual é a via do splitter
          const splitterViaId = assocToSplitter.sourceType === "tube"
            ? assocToSplitter.targetViaId
            : assocToSplitter.sourceViaId;
          const splitterVia = splitterViaById.get(splitterViaId);
          if (splitterVia) {
            const splitter = splitterById.get(splitterVia.splitterId);
            if (splitter) {
              // Calcular perda do splitter
              const loss = splitterVia.lossDb ?? getSplitterLoss(splitter.ratio);
              totalSplitterLoss += loss;
              reversePath.push({ type: "splitter", label: `${splitter.identifier} (${splitter.ratio})`, lossDb: loss });
              totalFusionCount++; // fusão de entrada do splitter
              // Encontrar a via de entrada do splitter (viaNumber=0)
              const splitterEntryVia = allSplitterVias.find(v =>
                v.splitterId === splitter.id && v.viaNumber === 0
              );
              if (splitterEntryVia) {
                // Encontrar a associação da via de entrada do splitter com um tubo
                const assocFromSplitter = allViaAssocs.find(a =>
                  a.ceoId === ceoRefId &&
                  a.sourceType === "splitter" && a.sourceViaId === splitterEntryVia.id &&
                  a.targetType === "tube"
                ) ?? allViaAssocs.find(a =>
                  a.ceoId === ceoRefId &&
                  a.targetType === "splitter" && a.targetViaId === splitterEntryVia.id &&
                  a.sourceType === "tube"
                );
                if (assocFromSplitter) {
                  const exitTubeViaId = assocFromSplitter.sourceType === "splitter"
                    ? assocFromSplitter.targetViaId
                    : assocFromSplitter.sourceViaId;
                  const exitTubeVia = ceoViaById.get(exitTubeViaId);
                  if (exitTubeVia) {
                    currentTubeId = exitTubeVia.tubeId;
                    currentViaNumber = exitTubeVia.viaNumber;
                    currentElementId = prevElementId;
                    continue;
                  }
                }
                warnings.push(`Splitter "${splitter.identifier}": via de entrada não tem tubo associado`);
              }
            }
          }
        }
      }
      // Caminho 3: tubo de chegada é do tipo 'splitter' (campo type === 'splitter')
      const arrivalTubeObj = ceoTubeById.get(arrivalTubeId);
      if (arrivalTubeObj?.type === "splitter") {
        const splitterForTube = allSplitters.find(s => s.ceoId === ceoRefId);
        if (splitterForTube) {
          const loss = getSplitterLoss(splitterForTube.ratio);
          totalSplitterLoss += loss;
          reversePath.push({ type: "splitter", label: `${splitterForTube.identifier} (${splitterForTube.ratio})`, lossDb: loss });
        }
      }
      // Sem fusão nem associação — parar com aviso claro (não há como continuar sem fusão configurada)
      const elName = getElementName(prevElement);
      const tubeObj = ceoTubeById.get(arrivalTubeId);
      const viaStr = currentViaNumber ? ` via ${currentViaNumber}` : "";
      warnings.push(`A fibra chega ao elemento "${elName}" pelo tubo "${tubeObj?.identifier ?? `#${arrivalTubeId}`}"${viaStr} mas não tem fusão de saída registada — a fibra termina aqui`);
      break;
    } else if (prevElement.type === "cto" && arrivalTubeId !== null) {
      // CTO intermédia: seguir fusão se existir
      const arrivalVia = allCtoVias.find(v =>
        v.tubeId === arrivalTubeId &&
        (currentViaNumber === null || v.viaNumber === currentViaNumber)
      ) ?? null;
      if (arrivalVia?.fusedToTubeId) {
        totalFusionCount++;
        currentTubeId = arrivalVia.fusedToTubeId;
        if (arrivalVia.fusedToViaId) {
          const exitVia = ctoViaById.get(arrivalVia.fusedToViaId);
          // Preservar viaNumber: se a fusão não muda o número, manter o actual
          currentViaNumber = exitVia?.viaNumber ?? currentViaNumber;
        }
        // Se não tem fusedToViaId, manter currentViaNumber (propagação automática)
      } else {
        currentTubeId = arrivalTubeId;
        // Preservar viaNumber: via N do tubo de origem = via N do tubo de destino
        currentViaNumber = arrivalVia?.viaNumber ?? currentViaNumber;
      }
    } else {
      currentTubeId = arrivalTubeId;
      // Preservar viaNumber ao atravessar elementos sem fusão explícita
      // (via N do cabo de entrada = via N do cabo de saída)
    }
    currentElementId = prevElementId;
  }
  if (!foundOlt && !foundDgo && options?.overrideTxPowerDbm == null) {
    warnings.push("Não foi possível rastrear a fibra até uma porta OLT ou DGO — verifique se o equipamento está posicionado no mapa e se as portas estão vinculadas aos tubos dos CEOs");
    return { found: false, rxPowerDbm: null, txPowerDbm: 0, totalLossDb: 0, distanceKm: totalDistanceKm, cableLossDb: 0, splitterLossDb: totalSplitterLoss, fusionLossDb: 0, signalQuality: "no_signal" as const, path: [], warnings };
  }
  // Calcular potência
  // Prioridade: overrideTxPowerDbm > DGO link txPowerDbm > DGO equipment txPowerDbm > OLT link txPowerDbm > OLT defaultTxPowerDbm
  let txPower: number;
  let attenuationPerKm: number;
  let fusionLossPerFusion: number;
  if (options?.overrideTxPowerDbm != null) {
    txPower = options.overrideTxPowerDbm;
    attenuationPerKm = 0.35;
    fusionLossPerFusion = 0.1;
    if (options.overrideEquipmentName) {
      reversePath.push({ type: "olt", label: options.overrideEquipmentName, lossDb: 0 });
    }
  } else if (foundDgo) {
    // txPowerDbm efetivo: já calculado na vinculação (link.txPowerDbm pode ser sintético ou manual)
    // Para links manuais (id > 0): override do link > porta.txPowerDbm > equipamento.txPowerDbm
    // Para links sintéticos (id === -1): txPowerDbm já está resolvido no link
    let resolvedTxPower: number | null = foundDgo.link.txPowerDbm ?? null;
    if (resolvedTxPower === null && foundDgo.link.id > 0) {
      // Link manual sem override: buscar pela porta e equipamento
      const dgoPort = allPorts.find((p: any) => p.id === foundDgo!.link.portId);
      const dgoEquipment = dgoPort?.connectedToEquipmentId
        ? allEquipments.find((e: any) => e.id === dgoPort.connectedToEquipmentId)
        : null;
      resolvedTxPower = dgoPort?.txPowerDbm ?? dgoEquipment?.txPowerDbm ?? null;
    }
    if (resolvedTxPower === null) {
      // Último fallback: txPowerDbm do equipamento DGO
      const dgoEquip = allEquipments.find((e: any) => e.id === foundDgo!.element.equipmentId);
      resolvedTxPower = dgoEquip?.txPowerDbm ?? 5.0;
    }
    txPower = resolvedTxPower ?? 5.0;
    attenuationPerKm = 0.35;
    fusionLossPerFusion = 0.1;
  } else {
    txPower = foundOlt?.link.txPowerDbm ?? foundOlt?.element.defaultTxPowerDbm ?? 5.0;
    attenuationPerKm = foundOlt?.element.fiberAttenuationDbPerKm ?? 0.35;
    fusionLossPerFusion = foundOlt?.element.fusionLossDb ?? 0.1;
  }
  const cableLoss = totalDistanceKm * attenuationPerKm;
  const fusionLoss = totalFusionCount * fusionLossPerFusion;
  const totalLoss = cableLoss + totalSplitterLoss + fusionLoss;
  const rxPower = txPower - totalLoss;
  // Construir o path final (inverter o percurso reverso)
  const finalPath = reversePath.reverse();
  let cumulativePower = txPower;
  const pathWithPower: OpticalBalanceResult["path"] = finalPath.map(step => {
    cumulativePower -= step.lossDb;
    return { ...step, cumulativePowerDbm: cumulativePower };
  });
  return {
    found: true,
    rxPowerDbm: rxPower,
    txPowerDbm: txPower,
    totalLossDb: totalLoss,
    distanceKm: totalDistanceKm,
    cableLossDb: cableLoss,
    splitterLossDb: totalSplitterLoss,
    fusionLossDb: fusionLoss,
    signalQuality: getSignalQuality(rxPower),
    path: pathWithPower,
    warnings,
  };
}
// ─── CTO Via Associations (tubo ↔ splitter) ────────────────────────────────────
export async function getViaAssociationsByCto(ctoId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(ctoViaAssociations).where(eq(ctoViaAssociations.ctoId, ctoId));
}

export async function createCtoViaAssociation(data: Omit<InsertCtoViaAssociation, "id" | "createdAt">) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  // Na CTO o splitter E um tubo: as suas vias vivem em cto_vias, o mesmo
  // espaco de ids de todas as outras. Por isso os dois lados sao "ctoVia",
  // independentemente do type gravado -- e por isso a familia e "cto".
  const a: OpticalEndpoint = { tipo: "ctoVia", id: data.sourceViaId };
  const b: OpticalEndpoint = { tipo: "ctoVia", id: data.targetViaId };

  return await db.transaction(async (tx) => {
    const existentes = await tx.select().from(ctoViaAssociations)
      .where(eq(ctoViaAssociations.ctoId, data.ctoId))
      .for("update");

    const r = validarNovaLigacao(existentes, a, b, "cto");
    if (r.tipo === "jaExiste") return r.id;
    if (r.tipo === "recusado") throw new Error(r.motivo);

    const result = await tx.insert(ctoViaAssociations).values(data);
    return (result as any)[0]?.insertId ?? 0;
  });
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

// ─── Postes (map_poles) ───────────────────────────────────────────────────────
export async function getMapPoles(): Promise<MapPole[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(mapPoles).orderBy(mapPoles.name);
}

export async function getMapPoleById(id: number): Promise<MapPole | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(mapPoles).where(eq(mapPoles.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createMapPole(data: InsertMapPole): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(mapPoles).values(data);
  return (result as any).insertId ?? 0;
}

export async function updateMapPole(id: number, data: Partial<InsertMapPole>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(mapPoles).set({ ...data, updatedAt: new Date() } as any).where(eq(mapPoles.id, id));
}

export async function deleteMapPole(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(mapPoles).where(eq(mapPoles.id, id));
}

// ─── Reservas Técnicas (map_technical_reserves) ───────────────────────────────
export async function getMapTechnicalReserves(): Promise<MapTechnicalReserve[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(mapTechnicalReserves).orderBy(mapTechnicalReserves.name);
}

export async function getMapTechnicalReserveById(id: number): Promise<MapTechnicalReserve | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(mapTechnicalReserves).where(eq(mapTechnicalReserves.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getMapTechnicalReservesByRoute(routeId: number): Promise<MapTechnicalReserve[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(mapTechnicalReserves).where(eq(mapTechnicalReserves.routeId, routeId));
}

export async function createMapTechnicalReserve(data: InsertMapTechnicalReserve): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(mapTechnicalReserves).values(data);
  return (result as any).insertId ?? 0;
}

export async function updateMapTechnicalReserve(id: number, data: Partial<InsertMapTechnicalReserve>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(mapTechnicalReserves).set({ ...data, updatedAt: new Date() } as any).where(eq(mapTechnicalReserves.id, id));
}

export async function deleteMapTechnicalReserve(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(mapTechnicalReserves).where(eq(mapTechnicalReserves.id, id));
}

/** Retorna a soma total de metros de reserva técnica vinculada a uma rota */
export async function getTechnicalReserveExtraMeters(routeId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db.select({ sizeMeters: mapTechnicalReserves.sizeMeters })
    .from(mapTechnicalReserves)
    .where(eq(mapTechnicalReserves.routeId, routeId));
  return rows.reduce((sum, r) => sum + (r.sizeMeters ?? 0), 0);
}

// ─── Pontos de Interesse (POI) ────────────────────────────────────────────────
export async function getMapPois(): Promise<MapPoi[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(mapPois).orderBy(mapPois.name);
}
export async function getMapPoiById(id: number): Promise<MapPoi | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(mapPois).where(eq(mapPois.id, id));
  return rows[0] ?? null;
}
export async function createMapPoi(data: InsertMapPoi): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(mapPois).values(data);
  return (result as any).insertId ?? 0;
}
export async function updateMapPoi(id: number, data: Partial<InsertMapPoi>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(mapPois).set({ ...data, updatedAt: new Date() } as any).where(eq(mapPois.id, id));
}
export async function deleteMapPoi(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(mapPois).where(eq(mapPois.id, id));
}
export async function addPoiToGroup(poiId: number, groupId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const exists = await db.select().from(mapPoiGroups).where(and(eq(mapPoiGroups.poiId, poiId), eq(mapPoiGroups.groupId, groupId)));
  if (exists.length === 0) await db.insert(mapPoiGroups).values({ poiId, groupId });
}
export async function removePoiFromGroup(poiId: number, groupId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(mapPoiGroups).where(and(eq(mapPoiGroups.poiId, poiId), eq(mapPoiGroups.groupId, groupId)));
}
export async function getAllPoiGroupMemberships(): Promise<{ poiId: number; groupId: number }[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select({ poiId: mapPoiGroups.poiId, groupId: mapPoiGroups.groupId }).from(mapPoiGroups);
}

// ─── Grupos de OLTs ───────────────────────────────────────────────────────────
export async function addOltToGroup(oltId: number, groupId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const exists = await db.select().from(mapOltGroups).where(and(eq(mapOltGroups.oltId, oltId), eq(mapOltGroups.groupId, groupId)));
  if (exists.length === 0) await db.insert(mapOltGroups).values({ oltId, groupId });
}
export async function removeOltFromGroup(oltId: number, groupId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(mapOltGroups).where(and(eq(mapOltGroups.oltId, oltId), eq(mapOltGroups.groupId, groupId)));
}
export async function removeOltFromAllGroups(oltId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(mapOltGroups).where(eq(mapOltGroups.oltId, oltId));
}
export async function getAllOltGroupMemberships(): Promise<MapOltGroup[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(mapOltGroups);
}

// ─── DGO no Mapa ──────────────────────────────────────────────────────────────
export async function getMapDgoElements(): Promise<(MapDgoElement & { equipmentName: string; equipmentStatus: string })[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({
    id: mapDgoElements.id,
    equipmentId: mapDgoElements.equipmentId,
    lat: mapDgoElements.lat,
    lng: mapDgoElements.lng,
    notes: mapDgoElements.notes,
    createdAt: mapDgoElements.createdAt,
    updatedAt: mapDgoElements.updatedAt,
    equipmentName: equipments.name,
    equipmentStatus: equipments.status,
  }).from(mapDgoElements).leftJoin(equipments, eq(mapDgoElements.equipmentId, equipments.id));
  return rows as any;
}

export async function getMapDgoElementById(id: number): Promise<(MapDgoElement & { equipmentName: string; equipmentStatus: string; totalPorts: number | null; model: string | null; ipAddress: string | null; notes: string | null }) | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select({
    id: mapDgoElements.id,
    equipmentId: mapDgoElements.equipmentId,
    lat: mapDgoElements.lat,
    lng: mapDgoElements.lng,
    notes: mapDgoElements.notes,
    createdAt: mapDgoElements.createdAt,
    updatedAt: mapDgoElements.updatedAt,
    equipmentName: equipments.name,
    equipmentStatus: equipments.status,
    totalPorts: equipments.totalPorts,
    model: equipments.model,
    ipAddress: equipments.ipAddress,
  }).from(mapDgoElements).leftJoin(equipments, eq(mapDgoElements.equipmentId, equipments.id)).where(eq(mapDgoElements.id, id)).limit(1);
  return rows[0] as any ?? null;
}

export async function createMapDgoElement(data: Omit<InsertMapDgoElement, "id" | "createdAt" | "updatedAt">): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(mapDgoElements).values(data);
  return (result[0] as any).insertId;
}

export async function updateMapDgoElement(id: number, data: Partial<Omit<InsertMapDgoElement, "id" | "createdAt" | "updatedAt">>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(mapDgoElements).set({ ...data, updatedAt: new Date() } as any).where(eq(mapDgoElements.id, id));
}

export async function deleteMapDgoElement(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(mapDgoElements).where(eq(mapDgoElements.id, id));
}

// ─── Vinculação Bandeja DGO → Cabo ────────────────────────────────────────────
export async function getDgoSlotCableLinks(dgoElementId: number): Promise<(DgoSlotCableLink & {
  slotLabel: string | null;
  slotNumber: string | null;
  routeName: string | null;
  cableType: string | null;
  fiberCount: number | null;
  // Tubo automaticamente detectado do cabo (fromTubeId ou toTubeId conforme side)
  autoTubeId: number | null;
  autoTubeIdentifier: string | null;
  autoTubeColor: string | null;
  autoTubeElementName: string | null;  // Nome do CEO/CTO de onde vem o tubo
  autoTubeElementType: string | null;  // "ceo" ou "cto"
})[]> {
  const db = await getDb();
  if (!db) return [];
  const links = await db.select().from(dgoSlotCableLinks).where(eq(dgoSlotCableLinks.dgoElementId, dgoElementId));
  if (links.length === 0) return [];
  // Enriquecer com dados de slot e rota
  const slotIds = Array.from(new Set(links.map(l => l.slotId)));
  const routeIds = Array.from(new Set(links.map(l => l.routeId)));
  const allSlots = slotIds.length > 0
    ? await db.select({ id: equipmentSlots.id, slotNumber: equipmentSlots.slotNumber, label: equipmentSlots.label }).from(equipmentSlots).where(sql`${equipmentSlots.id} IN (${sql.join(slotIds.map(id => sql`${id}`), sql`, `)})`)
    : [];
  const allRoutes = routeIds.length > 0
    ? await db.select({
        id: mapRoutes.id, name: mapRoutes.name, cableType: mapRoutes.cableType, fiberCount: mapRoutes.fiberCount,
        fromTubeId: mapRoutes.fromTubeId, toTubeId: mapRoutes.toTubeId,
        fromElementId: mapRoutes.fromElementId, toElementId: mapRoutes.toElementId,
      }).from(mapRoutes).where(sql`${mapRoutes.id} IN (${sql.join(routeIds.map(id => sql`${id}`), sql`, `)})`)
    : [];
  const slotMap = new Map(allSlots.map(s => [s.id, s]));
  const routeMap = new Map(allRoutes.map(r => [r.id, r]));

  // Coletar IDs de tubos (CEO e CTO) e elementos para buscar nomes
  const ceoTubeIds: number[] = [];
  const ctoTubeIds: number[] = [];
  const elementIds: number[] = [];
  for (const link of links) {
    const route = routeMap.get(link.routeId);
    if (!route) continue;
    // Se side=="in" o DGO é destino → tubo relevante é toTubeId; se side=="out" é origem → fromTubeId
    const tubeId = link.side === "in" ? route.toTubeId : route.fromTubeId;
    const elemId = link.side === "in" ? route.toElementId : route.fromElementId;
    if (tubeId) {
      // Não sabemos se é CEO ou CTO; tentamos ambos
      ceoTubeIds.push(tubeId);
      ctoTubeIds.push(tubeId);
    }
    if (elemId) elementIds.push(elemId);
  }

  // Buscar tubos de CEO
  const ceoTubeRows = ceoTubeIds.length > 0
    ? await db.select({ id: ceoTubes.id, identifier: ceoTubes.identifier, color: ceoTubes.color, ceoId: ceoTubes.ceoId })
        .from(ceoTubes).where(sql`${ceoTubes.id} IN (${sql.join(ceoTubeIds.map(id => sql`${id}`), sql`, `)})`)
    : [];
  // Buscar tubos de CTO
  const ctoTubeRows = ctoTubeIds.length > 0
    ? await db.select({ id: ctoTubes.id, identifier: ctoTubes.identifier, color: ctoTubes.color, ctoId: ctoTubes.ctoId })
        .from(ctoTubes).where(sql`${ctoTubes.id} IN (${sql.join(ctoTubeIds.map(id => sql`${id}`), sql`, `)})`)
    : [];
  // Buscar elementos do mapa para obter nome via CEO/CTO referenceId
  const elemRows = elementIds.length > 0
    ? await db.select({ id: mapElements.id, type: mapElements.type, referenceId: mapElements.referenceId })
        .from(mapElements).where(sql`${mapElements.id} IN (${sql.join(elementIds.map(id => sql`${id}`), sql`, `)})`)
    : [];

  // Buscar nomes dos CEOs e CTOs referenciados
  const ceoRefIds = elemRows.filter(e => e.type === "ceo").map(e => e.referenceId);
  const ctoRefIds = elemRows.filter(e => e.type === "cto").map(e => e.referenceId);
  const ceoNameRows = ceoRefIds.length > 0
    ? await db.select({ id: ceos.id, name: ceos.name }).from(ceos).where(sql`${ceos.id} IN (${sql.join(ceoRefIds.map(id => sql`${id}`), sql`, `)})`)
    : [];
  const ctoNameRows = ctoRefIds.length > 0
    ? await db.select({ id: ctos.id, name: ctos.name }).from(ctos).where(sql`${ctos.id} IN (${sql.join(ctoRefIds.map(id => sql`${id}`), sql`, `)})`)
    : [];

  const ceoTubeMap = new Map(ceoTubeRows.map(t => [t.id, t]));
  const ctoTubeMap = new Map(ctoTubeRows.map(t => [t.id, t]));
  const elemMap = new Map(elemRows.map(e => [e.id, e]));
  const ceoNameMap = new Map(ceoNameRows.map(c => [c.id, c.name]));
  const ctoNameMap = new Map(ctoNameRows.map(c => [c.id, c.name]));

  return links.map(link => {
    const slot = slotMap.get(link.slotId);
    const route = routeMap.get(link.routeId);
    const tubeId = route ? (link.side === "in" ? route.toTubeId : route.fromTubeId) : null;
    const elemId = route ? (link.side === "in" ? route.toElementId : route.fromElementId) : null;

    // Tentar encontrar o tubo (primeiro como CEO, depois como CTO)
    const ceoTubeRow = tubeId ? ceoTubeMap.get(tubeId) : null;
    const ctoTubeRow = tubeId && !ceoTubeRow ? ctoTubeMap.get(tubeId) : null;
    const tubeRow = ceoTubeRow ?? ctoTubeRow ?? null;
    const tubeType = ceoTubeRow ? "ceo" : ctoTubeRow ? "cto" : null;

    // Nome do elemento (CEO/CTO)
    let autoTubeElementName: string | null = null;
    let autoTubeElementType: string | null = null;
    if (elemId) {
      const elem = elemMap.get(elemId);
      if (elem) {
        autoTubeElementType = elem.type;
        if (elem.type === "ceo") autoTubeElementName = ceoNameMap.get(elem.referenceId) ?? null;
        else if (elem.type === "cto") autoTubeElementName = ctoNameMap.get(elem.referenceId) ?? null;
      }
    } else if (tubeRow) {
      // Sem elemento no mapa, mas tem tubo — tentar pelo ceoId/ctoId do tubo
      if (ceoTubeRow) {
        autoTubeElementType = "ceo";
        autoTubeElementName = ceoNameMap.get(ceoTubeRow.ceoId) ?? null;
      } else if (ctoTubeRow) {
        autoTubeElementType = "cto";
        autoTubeElementName = ctoNameMap.get(ctoTubeRow.ctoId) ?? null;
      }
    }

    return {
      ...link,
      slotLabel: slot?.label ?? null,
      slotNumber: slot?.slotNumber ?? null,
      routeName: route?.name ?? null,
      cableType: route?.cableType ?? null,
      fiberCount: route?.fiberCount ?? null,
      autoTubeId: tubeRow?.id ?? null,
      autoTubeIdentifier: tubeRow?.identifier ?? null,
      autoTubeColor: tubeRow?.color ?? null,
      autoTubeElementName,
      autoTubeElementType,
    };
  });
}

export async function createDgoSlotCableLink(data: Omit<InsertDgoSlotCableLink, "id" | "createdAt">): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(dgoSlotCableLinks).values(data);
  return (result[0] as any).insertId;
}

export async function deleteDgoSlotCableLink(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(dgoSlotCableLinks).where(eq(dgoSlotCableLinks.id, id));
}

// ─── Grupos de DGOs ───────────────────────────────────────────────────────────
export async function addDgoToGroup(dgoId: number, groupId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const exists = await db.select().from(mapDgoGroups).where(and(eq(mapDgoGroups.dgoId, dgoId), eq(mapDgoGroups.groupId, groupId)));
  if (exists.length === 0) await db.insert(mapDgoGroups).values({ dgoId, groupId });
}

export async function removeDgoFromGroup(dgoId: number, groupId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(mapDgoGroups).where(and(eq(mapDgoGroups.dgoId, dgoId), eq(mapDgoGroups.groupId, groupId)));
}

export async function getAllDgoGroupMemberships(): Promise<MapDgoGroup[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(mapDgoGroups);
}

// ─── Tubos extras por cabo (múltiplos tubos de origem/destino) ────────────────
export async function getRouteExtraTubes(routeId: number): Promise<{ id: number; routeId: number; elementId: number; tubeId: number; side: string; notes: string | null; createdAt: Date; tubeIdentifier: string; elementName: string; elementType: string }[]> {
  const tenantDbName = getTenantDbNameFromContext();
  if (!tenantDbName && !_pool) return [];
  const pool = (tenantDbName ? getTenantRawPool(tenantDbName) : _pool!).promise();
  const [rows] = await pool.execute<any[]>(
    `SELECT
       ret.id,
       ret.routeId,
       ret.elementId,
       ret.tubeId,
       ret.side,
       ret.notes,
       ret.createdAt,
       COALESCE(ct.identifier, ctt.identifier, CONCAT('Tubo #', ret.tubeId)) AS tubeIdentifier,
       COALESCE(me.name, me.label, CONCAT('#', me.id)) AS elementName,
       me.type AS elementType
     FROM route_extra_tubes ret
     LEFT JOIN map_elements me ON me.id = ret.elementId
     LEFT JOIN ceo_tubes ct ON ct.id = ret.tubeId AND me.type = 'ceo'
     LEFT JOIN cto_tubes ctt ON ctt.id = ret.tubeId AND me.type = 'cto'
     WHERE ret.routeId = ?
     ORDER BY ret.side, ret.id`,
    [routeId]
  );
  return rows;
}

export async function addRouteExtraTube(data: { routeId: number; elementId: number; tubeId: number; side: 'from' | 'to'; notes?: string }): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(routeExtraTubes).values({
    routeId: data.routeId,
    elementId: data.elementId,
    tubeId: data.tubeId,
    side: data.side,
    notes: data.notes ?? null,
  });
  return (result[0] as any).insertId;
}

export async function deleteRouteExtraTube(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(routeExtraTubes).where(eq(routeExtraTubes.id, id));
}

export async function deleteRouteExtraTubesByRoute(routeId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(routeExtraTubes).where(eq(routeExtraTubes.routeId, routeId));
}

// ─── Vinculação Porta DGO → CEO passagem + Equipamento ───────────────────────
export async function getDgoPortLinks(dgoElementId: number): Promise<{
  id: number;
  dgoElementId: number;
  slotId: number;
  portNumber: number;
  ceoElementId: number | null;
  ceoName: string | null;
  portId: number | null;
  portNumber_eq: string | null;
  portLabel: string | null;
  equipmentId: number | null;
  equipmentName: string | null;
  equipmentType: string | null;
  connectedToEquipmentId: number | null;
  connectedToEquipmentName: string | null;
  connectedToPortId: number | null;
  connectedToPortNumber: string | null;
  connectedToPortLabel: string | null;
  notes: string | null;
}[]> {
  const tenantDbName = getTenantDbNameFromContext();
  if (!tenantDbName && !_pool) return [];
  const pool = (tenantDbName ? getTenantRawPool(tenantDbName) : _pool!).promise();
  const [rows] = await pool.execute<any[]>(
    `SELECT
       dpl.id,
       dpl.dgoElementId,
       dpl.slotId,
       dpl.portNumber,
       dpl.ceoElementId,
       dpl.notes,
       -- CEO de passagem
       COALESCE(ceo_me.name, ceo_me.label, CONCAT('CEO #', dpl.ceoElementId)) AS ceoName,
       -- Porta do equipamento vinculado
       dpl.portId,
       p.portNumber AS portNumber_eq,
       p.label AS portLabel,
       p.equipmentId,
       eq.name AS equipmentName,
       eq.type AS equipmentType,
       -- Equipamento conectado (lido automaticamente via ports.connectedTo*)
       p.connectedToEquipmentId,
       eq2.name AS connectedToEquipmentName,
       p.connectedToPortId,
       p2.portNumber AS connectedToPortNumber,
       p2.label AS connectedToPortLabel
     FROM dgo_port_links dpl
     LEFT JOIN map_elements ceo_me ON ceo_me.id = dpl.ceoElementId
     LEFT JOIN ports p ON p.id = dpl.portId
     LEFT JOIN equipments eq ON eq.id = p.equipmentId
     LEFT JOIN equipments eq2 ON eq2.id = p.connectedToEquipmentId
     LEFT JOIN ports p2 ON p2.id = p.connectedToPortId
     WHERE dpl.dgoElementId = ?
     ORDER BY dpl.slotId, dpl.portNumber`,
    [dgoElementId]
  );
  return rows;
}

export async function upsertDgoPortLink(data: {
  dgoElementId: number;
  slotId: number;
  portNumber: number;
  ceoElementId?: number | null;
  portId?: number | null;
  notes?: string | null;
}): Promise<number> {
  const tenantDbName = getTenantDbNameFromContext();
  if (!tenantDbName && !_pool) throw new Error("DB not available");
  const pool = (tenantDbName ? getTenantRawPool(tenantDbName) : _pool!).promise();
  // Verificar se já existe
  const [existing] = await pool.execute<any[]>(
    `SELECT id FROM dgo_port_links WHERE dgoElementId = ? AND slotId = ? AND portNumber = ? LIMIT 1`,
    [data.dgoElementId, data.slotId, data.portNumber]
  );
  if (existing.length > 0) {
    await pool.execute(
      `UPDATE dgo_port_links SET ceoElementId = ?, portId = ?, notes = ?, updatedAt = NOW() WHERE id = ?`,
      [data.ceoElementId ?? null, data.portId ?? null, data.notes ?? null, existing[0].id]
    );
    return existing[0].id;
  } else {
    const [result] = await pool.execute<any>(
      `INSERT INTO dgo_port_links (dgoElementId, slotId, portNumber, ceoElementId, portId, notes) VALUES (?, ?, ?, ?, ?, ?)`,
      [data.dgoElementId, data.slotId, data.portNumber, data.ceoElementId ?? null, data.portId ?? null, data.notes ?? null]
    );
    return result.insertId;
  }
}

export async function deleteDgoPortLink(id: number): Promise<void> {
  if (!_pool) return;
  await _pool.promise().execute(`DELETE FROM dgo_port_links WHERE id = ?`, [id]);
}

export async function getPortsByEquipmentForDgo(equipmentId: number): Promise<{
  id: number;
  portNumber: string;
  label: string | null;
  slotId: number | null;
  slotLabel: string | null;
  connectedToEquipmentId: number | null;
  connectedToEquipmentName: string | null;
  connectedToEquipmentTxPowerDbm: number | null;  // COALESCE(porta.txPowerDbm, equipamento.txPowerDbm)
  portTxPowerDbm: number | null;                  // Override específico desta porta (null = usa o do equipamento)
  connectedToPortId: number | null;
  connectedToPortNumber: string | null;
  connectedToSlotLabel: string | null;
}[]> {
  const tenantDbName = getTenantDbNameFromContext();
  if (!tenantDbName && !_pool) return [];
  const pool = (tenantDbName ? getTenantRawPool(tenantDbName) : _pool!).promise();
  try {
    const [rows] = await pool.execute<any[]>(
      `SELECT
         p.id,
         p.portNumber,
         p.label,
         p.slotId,
         es.label AS slotLabel,
         p.connectedToEquipmentId,
         eq2.name AS connectedToEquipmentName,
         COALESCE(p.txPowerDbm, eq2.txPowerDbm) AS connectedToEquipmentTxPowerDbm,
         p.txPowerDbm AS portTxPowerDbm,
         p.connectedToPortId,
         p2.portNumber AS connectedToPortNumber,
         es2.slotNumber AS connectedToSlotLabel
       FROM ports p
       LEFT JOIN equipment_slots es ON es.id = p.slotId
       LEFT JOIN equipments eq2 ON eq2.id = p.connectedToEquipmentId
       LEFT JOIN ports p2 ON p2.id = p.connectedToPortId
       LEFT JOIN equipment_slots es2 ON es2.id = p2.slotId
       WHERE p.equipmentId = ?
       ORDER BY COALESCE(p.sortOrder, 0), CAST(p.portNumber AS UNSIGNED), p.portNumber`,
      [equipmentId]
    );
    return rows;
  } catch (err) {
    console.error('[getPortsByEquipmentForDgo] SQL error:', err);
    return [];
  }
}

// ─── Balanço Óptico Estimado via DGO ───────────────────────────────────────────────────────────────────────────────
// Calcula o balanço óptico completo a partir de uma porta do DGO até uma CTO.
// Fluxo: porta DGO → txPowerDbm do equipamento (OLT/Switch) → cabo de saída da bandeja
//        → CEO (fusões) → splitter → CTO
// Reutiliza calculateOpticalBalance com overrideTxPowerDbm.
export async function calculateOpticalBalanceFromDgo(input: {
  dgoElementId: number;
  slotId: number;
  portNumber: number;
  ctoElementId?: number;   // Se fornecido, calcula o balanço até esta CTO específica
}): Promise<Omit<OpticalBalanceResult, "txPowerDbm"> & {
  txPowerDbm: number | null;
  equipmentName: string | null;
  cableOutElementId: number | null;  // map_elements.id do CEO/CTO destino do cabo de saída
}> {
  const noResult = (msg: string) => ({
    found: false as const, rxPowerDbm: null, txPowerDbm: null, equipmentName: null,
    totalLossDb: 0, distanceKm: 0, cableLossDb: 0, splitterLossDb: 0, fusionLossDb: 0,
    signalQuality: "no_signal" as const, path: [], warnings: [msg], cableOutElementId: null,
  });

  if (!_pool) return noResult("DB não disponível");
  const pool = _pool.promise();

  // 1. Buscar a potência TX efetiva: COALESCE(porta.txPowerDbm, equipamento.txPowerDbm)
  // Tentativa 1: via dgo_port_links (porta do equipamento vinculada à porta do DGO)
  const [portLinkRows] = await pool.execute<any[]>(
    `SELECT
       dpl.portId,
       p.connectedToEquipmentId,
       p.txPowerDbm AS portTxPowerDbm,
       eq.name AS equipmentName,
       eq.txPowerDbm AS equipmentTxPowerDbm,
       COALESCE(p.txPowerDbm, eq.txPowerDbm) AS effectiveTxPowerDbm
     FROM dgo_port_links dpl
     LEFT JOIN ports p ON p.id = dpl.portId
     LEFT JOIN equipments eq ON eq.id = p.connectedToEquipmentId
     WHERE dpl.dgoElementId = ? AND dpl.slotId = ? AND dpl.portNumber = ?
     LIMIT 1`,
    [input.dgoElementId, input.slotId, input.portNumber]
  );
  const portLinkRow = portLinkRows[0] ?? null;

  // Tentativa 2: via portas do equipamento do DGO (connectedToEquipmentId na porta)
  const [dgoPortRows] = await pool.execute<any[]>(
    `SELECT
       p.connectedToEquipmentId,
       p.txPowerDbm AS portTxPowerDbm,
       eq.name AS equipmentName,
       eq.txPowerDbm AS equipmentTxPowerDbm,
       COALESCE(p.txPowerDbm, eq.txPowerDbm) AS effectiveTxPowerDbm
     FROM equipment_slots es
     JOIN ports p ON p.slotId = es.id
     JOIN map_dgo_elements mde ON mde.equipmentId = es.equipmentId
     LEFT JOIN equipments eq ON eq.id = p.connectedToEquipmentId
     WHERE mde.id = ? AND es.id = ?
     ORDER BY COALESCE(p.sortOrder, 0), CAST(p.portNumber AS UNSIGNED), p.portNumber
     LIMIT 100`,
    [input.dgoElementId, input.slotId]
  );
  const dgoPortRow = (dgoPortRows as any[])[input.portNumber - 1] ?? null;

  let txPowerDbm: number | null = null;
  let equipmentName: string | null = null;

  if (portLinkRow?.effectiveTxPowerDbm != null) {
    txPowerDbm = Number(portLinkRow.effectiveTxPowerDbm);
    equipmentName = portLinkRow.equipmentName ?? null;
  } else if (dgoPortRow?.effectiveTxPowerDbm != null) {
    txPowerDbm = Number(dgoPortRow.effectiveTxPowerDbm);
    equipmentName = dgoPortRow.equipmentName ?? null;
  }

  if (txPowerDbm === null) {
    const eqName = portLinkRow?.equipmentName ?? dgoPortRow?.equipmentName ?? null;
    return noResult(eqName
      ? `Equipamento "${eqName}" não tem Potência TX (dBm) cadastrada`
      : "Nenhum equipamento com Potência TX (dBm) vinculado a esta porta"
    );
  }

  // 2. Buscar o cabo de saída (side="out") da bandeja do DGO
  // O cabo de saída conecta o DGO a um CEO ou CTO (toElementId ou fromElementId em map_elements)
  const [cableRows] = await pool.execute<any[]>(
    `SELECT
       mr.id AS routeId,
       mr.name AS routeName,
       mr.fromElementId,
       mr.toElementId,
       dscl.side
     FROM dgo_slot_cable_links dscl
     JOIN map_routes mr ON mr.id = dscl.routeId
     WHERE dscl.dgoElementId = ? AND dscl.slotId = ? AND dscl.side = 'out'
     LIMIT 1`,
    [input.dgoElementId, input.slotId]
  );
  const cableRow = (cableRows as any[])[0] ?? null;

  if (!cableRow) {
    return { ...noResult("Nenhum cabo de saída vinculado a esta bandeja"), txPowerDbm, equipmentName, cableOutElementId: null };
  }

  // O elemento destino do cabo de saída é o CEO/CTO que recebe a fibra do DGO
  // O DGO não está em map_elements, então fromElementId e toElementId são sempre CEO/CTO
  // O elemento "destino" do ponto de vista do DGO é o toElementId (ou fromElementId se o cabo for bidirecional)
  const cableOutElementId = cableRow.toElementId ?? cableRow.fromElementId ?? null;

  if (!cableOutElementId) {
    return { ...noResult("Cabo de saída sem elemento destino configurado"), txPowerDbm, equipmentName, cableOutElementId: null };
  }

  // 3. Determinar a CTO alvo:
  // - Se ctoElementId foi fornecido, usar diretamente
  // - Caso contrário, usar o elemento destino do cabo de saída (que pode ser CEO ou CTO)
  const targetElementId = input.ctoElementId ?? cableOutElementId;

  // 4. Calcular o balanço óptico completo usando calculateOpticalBalance com override
  try {
    const result = await calculateOpticalBalance(targetElementId, {
      overrideTxPowerDbm: txPowerDbm,
      overrideEquipmentName: equipmentName ?? "DGO",
    });
    return { ...result, txPowerDbm, equipmentName, cableOutElementId };
  } catch (err) {
    console.error('[calculateOpticalBalanceFromDgo] erro ao calcular balanço:', err);
    return { ...noResult(`Erro ao calcular balanço: ${(err as Error).message}`), txPowerDbm, equipmentName, cableOutElementId };
  }
}

// ─── CTOs alcançáveis pelo cabo de saída de uma bandeja do DGO ─────────────────
// Dado um dgoElementId + slotId + portNumber, busca o cabo de saída da bandeja,
// encontra todas as CTOs conectadas ao elemento destino do cabo (CEO ou CTO),
// e calcula o balanço óptico estimado para cada CTO usando o txPowerDbm do
// equipamento (OLT/Switch) conectado à porta do DGO.
export async function getDgoSlotCtoBalances(input: {
  dgoElementId: number;
  slotId: number;
  portNumber: number;
}): Promise<Array<{
  ctoElementId: number;
  ctoName: string;
  balance: OpticalBalanceResult;
}>> {
  const tenantDbName = getTenantDbNameFromContext();
  if (!tenantDbName && !_pool) return [];
  const pool = (tenantDbName ? getTenantRawPool(tenantDbName) : _pool!).promise();

  // 1. Buscar a potência TX efetiva da porta do DGO
  const [portLinkRows] = await pool.execute<any[]>(
    `SELECT
       COALESCE(p.txPowerDbm, eq.txPowerDbm) AS effectiveTxPowerDbm,
       eq.name AS equipmentName
     FROM dgo_port_links dpl
     LEFT JOIN ports p ON p.id = dpl.portId
     LEFT JOIN equipments eq ON eq.id = p.connectedToEquipmentId
     WHERE dpl.dgoElementId = ? AND dpl.slotId = ? AND dpl.portNumber = ?
     LIMIT 1`,
    [input.dgoElementId, input.slotId, input.portNumber]
  );
  const portLinkRow = portLinkRows[0] ?? null;

  // Tentativa 2: via portas do equipamento do DGO
  const [dgoPortRows] = await pool.execute<any[]>(
    `SELECT
       COALESCE(p.txPowerDbm, eq.txPowerDbm) AS effectiveTxPowerDbm,
       eq.name AS equipmentName
     FROM equipment_slots es
     JOIN ports p ON p.slotId = es.id
     JOIN map_dgo_elements mde ON mde.equipmentId = es.equipmentId
     LEFT JOIN equipments eq ON eq.id = p.connectedToEquipmentId
     WHERE mde.id = ? AND es.id = ?
     ORDER BY COALESCE(p.sortOrder, 0), CAST(p.portNumber AS UNSIGNED), p.portNumber
     LIMIT 100`,
    [input.dgoElementId, input.slotId]
  );
  const dgoPortRow = (dgoPortRows as any[])[input.portNumber - 1] ?? null;

  const txPowerDbm: number | null =
    portLinkRow?.effectiveTxPowerDbm != null ? Number(portLinkRow.effectiveTxPowerDbm) :
    dgoPortRow?.effectiveTxPowerDbm != null ? Number(dgoPortRow.effectiveTxPowerDbm) :
    null;

  const equipmentName: string | null =
    portLinkRow?.equipmentName ?? dgoPortRow?.equipmentName ?? null;

  if (txPowerDbm === null) return [];

  // 2. Buscar o cabo de saída (side="out") da bandeja e o elemento destino
  const [cableRows] = await pool.execute<any[]>(
    `SELECT mr.fromElementId, mr.toElementId
     FROM dgo_slot_cable_links dscl
     JOIN map_routes mr ON mr.id = dscl.routeId
     WHERE dscl.dgoElementId = ? AND dscl.slotId = ? AND dscl.side = 'out'
     LIMIT 1`,
    [input.dgoElementId, input.slotId]
  );
  const cableRow = (cableRows as any[])[0] ?? null;
  if (!cableRow) return [];

  const cableOutElementId = cableRow.toElementId ?? cableRow.fromElementId ?? null;
  if (!cableOutElementId) return [];

  // 3. Buscar o tipo do elemento destino (CEO ou CTO)
  const [elemRows] = await pool.execute<any[]>(
    `SELECT me.id, me.type, me.referenceId,
            COALESCE(ceo.name, cto.name) AS elementName
     FROM map_elements me
     LEFT JOIN ceos ceo ON ceo.id = me.referenceId AND me.type = 'ceo'
     LEFT JOIN ctos cto ON cto.id = me.referenceId AND me.type = 'cto'
     WHERE me.id = ?
     LIMIT 1`,
    [cableOutElementId]
  );
  const elemRow = (elemRows as any[])[0] ?? null;
  if (!elemRow) return [];

  // 4. Coletar as CTOs alvo:
  // - Se o elemento destino for uma CTO → calcular diretamente
  // - Se for um CEO → buscar todas as CTOs conectadas a esse CEO via map_routes
  let ctoTargets: Array<{ ctoElementId: number; ctoName: string }> = [];

  if (elemRow.type === 'cto') {
    ctoTargets.push({ ctoElementId: elemRow.id, ctoName: elemRow.elementName ?? `CTO #${elemRow.id}` });
  } else if (elemRow.type === 'ceo') {
    // Buscar todas as CTOs conectadas a este CEO via map_routes
    const [ctoRows] = await pool.execute<any[]>(
      `SELECT me.id AS ctoElementId, cto.name AS ctoName
       FROM map_routes mr
       JOIN map_elements me ON (
         (mr.fromElementId = ? AND me.id = mr.toElementId) OR
         (mr.toElementId = ? AND me.id = mr.fromElementId)
       )
       JOIN ctos cto ON cto.id = me.referenceId
       WHERE me.type = 'cto'
       ORDER BY cto.name`,
      [cableOutElementId, cableOutElementId]
    );
    ctoTargets = (ctoRows as any[]).map(r => ({
      ctoElementId: r.ctoElementId,
      ctoName: r.ctoName ?? `CTO #${r.ctoElementId}`,
    }));
  }

  if (ctoTargets.length === 0) return [];

  // 5. Calcular o balanço óptico para cada CTO
  const results: Array<{ ctoElementId: number; ctoName: string; balance: OpticalBalanceResult }> = [];
  for (const target of ctoTargets) {
    try {
      const balance = await calculateOpticalBalance(target.ctoElementId, {
        overrideTxPowerDbm: txPowerDbm,
        overrideEquipmentName: equipmentName ?? "DGO",
      });
      results.push({ ctoElementId: target.ctoElementId, ctoName: target.ctoName, balance });
    } catch (err) {
      console.error(`[getDgoSlotCtoBalances] erro CTO #${target.ctoElementId}:`, err);
    }
  }

  return results;
}

// ─── Ciclo de vida de projeto ─────────────────────────────────────────────────
// Ver shared/projectStatus.ts para a semântica dos estados e a distinção em
// relação ao campo `status`, que é operacional.

/**
 * Tabelas que têm ciclo de vida de projeto, e o rótulo usado na API.
 *
 * Tipado como Record<ProjectTipo, string> de propósito: a lista de tipos vive
 * em shared/projectStatus.ts, e amarrar as duas faz de um esquecimento um erro
 * de compilação. Sem isso, acrescentar um tipo lá e não acrescentar a tabela
 * aqui daria `undefined` no nome da tabela e uma SQL inválida em produção.
 */
const PROJECT_STATUS_TABLES: Record<ProjectTipo, string> = {
  ceo: "ceos",
  cto: "ctos",
  cabo: "map_routes",
  poste: "map_poles",
  reserva: "map_technical_reserves",
};

export type ProjectStatusTipo = ProjectTipo;

function poolDoTenant() {
  const tenantDbName = getTenantDbNameFromContext();
  if (!tenantDbName && !_pool) _pool = createPool();
  return (tenantDbName ? getTenantRawPool(tenantDbName) : _pool!).promise();
}

/**
 * Define o estado de projeto de um elemento.
 * O nome da tabela vem de um mapa fechado, nunca da entrada — o tipo é
 * validado antes de chegar aqui e nada do usuário entra na SQL.
 */
export async function setProjectStatus(tipo: ProjectStatusTipo, id: number, status: string): Promise<void> {
  const tabela = PROJECT_STATUS_TABLES[tipo];
  if (!tabela) throw new Error(`Tipo inválido: ${tipo}`);
  const pool = poolDoTenant();
  await pool.execute(`UPDATE \`${tabela}\` SET projectStatus = ? WHERE id = ?`, [status, id]);
}

/** Define o estado de projeto de vários elementos do mesmo tipo de uma vez. */
export async function setProjectStatusEmLote(tipo: ProjectStatusTipo, ids: number[], status: string): Promise<number> {
  if (ids.length === 0) return 0;
  const tabela = PROJECT_STATUS_TABLES[tipo];
  if (!tabela) throw new Error(`Tipo inválido: ${tipo}`);
  const pool = poolDoTenant();
  const marcadores = ids.map(() => "?").join(",");
  const [res] = await pool.execute<any>(
    `UPDATE \`${tabela}\` SET projectStatus = ? WHERE id IN (${marcadores})`,
    [status, ...ids]
  );
  return res?.affectedRows ?? 0;
}

/**
 * Contagem de elementos por estado de projeto, para cada tipo.
 * É a base do percentual de implantação exibido no mapa.
 */
export async function getProjectStatusSummary(): Promise<
  Record<ProjectStatusTipo, Record<string, number>>
> {
  const pool = poolDoTenant();
  const saida = {} as Record<ProjectStatusTipo, Record<string, number>>;
  for (const [tipo, tabela] of Object.entries(PROJECT_STATUS_TABLES) as [ProjectStatusTipo, string][]) {
    const [linhas] = await pool.execute<any[]>(
      `SELECT projectStatus, COUNT(*) AS total FROM \`${tabela}\` GROUP BY projectStatus`
    );
    saida[tipo] = {};
    for (const l of linhas) saida[tipo][l.projectStatus ?? "deployed"] = Number(l.total);
  }
  return saida;
}

// ─── Resumo de execução por projeto ───────────────────────────────────────────
//
// Um projeto é um grupo do mapa com `isProject` ligado (migrate-v23.sql). O que
// se quer saber dele é quanto já saiu do papel: dos seus CTOs, CEOs, cabos,
// postes e reservas, quantos estão implantados.
//
// Escrito com Drizzle, e não com SQL crua como o resto desta secção, por um
// motivo concreto: `map_pole_groups` e `map_reserve_groups` usam colunas em
// snake_case (`pole_id`, `group_id`) enquanto `map_element_groups` e
// `map_route_groups` usam camelCase (`elementId`, `groupId`). Escrevendo à mão
// eu erraria, e o erro apareceria como um JOIN devolvendo zero linhas em
// silêncio — não como um estouro que alguém nota.

type LinhaDeContagem = { groupId: number; estado: string | null; total: unknown };

/**
 * Executa uma das consultas de contagem, devolvendo [] se a tabela ainda não
 * existir (migração pendente). O mapa continua abrindo com os outros tipos, em
 * vez de a tela inteira falhar por causa de um.
 */
async function contarPorGrupo(
  tipo: ProjectTipo,
  executar: () => Promise<LinhaDeContagem[]>
): Promise<LinhaDeContagem[]> {
  try {
    return await executar();
  } catch (erro) {
    console.warn(`[getProjectSummaries] contagem de ${tipo} falhou:`, erro);
    return [];
  }
}

/**
 * Contagens por grupo, tipo e estado de projeto.
 *
 * Devolve todos os grupos, não só os marcados como projeto: filtrar aqui
 * economizaria pouco e obrigaria a refazer a consulta no dia em que um grupo
 * comum quiser exibir a mesma informação. Quem decide o que mostrar é a tela.
 *
 * A interpretação dos números — percentual, o que omitir, o que conta como
 * executado — vive em shared/projectSummary.ts. Aqui só sai o dado cru.
 */
export async function getProjectSummaries(): Promise<Record<number, ContagensDoProjeto>> {
  const db = await getDb();
  if (!db) return {};

  const acc: Record<number, ContagensDoProjeto> = {};
  const somar = (tipo: ProjectTipo, linhas: LinhaDeContagem[]) => {
    for (const linha of linhas) {
      const n = Number(linha.total);
      if (!Number.isFinite(n) || n <= 0) continue;
      const grupo = Number(linha.groupId);
      if (!Number.isFinite(grupo)) continue;
      const doGrupo = acc[grupo] ?? (acc[grupo] = {});
      const doTipo = doGrupo[tipo] ?? (doGrupo[tipo] = {});
      const st = normalizeProjectStatus(linha.estado);
      doTipo[st] = (doTipo[st] ?? 0) + n;
    }
  };

  // CEOs e CTOs passam por map_elements: o grupo guarda o id do elemento do
  // mapa (que é só posição), e o projectStatus vive na tabela de cadastro.
  somar("ceo", await contarPorGrupo("ceo", async () =>
    db
      .select({
        groupId: mapElementGroups.groupId,
        estado: ceos.projectStatus,
        total: sql<number>`count(*)`,
      })
      .from(mapElementGroups)
      .innerJoin(mapElements, eq(mapElements.id, mapElementGroups.elementId))
      .innerJoin(ceos, eq(ceos.id, mapElements.referenceId))
      .where(eq(mapElements.type, "ceo"))
      .groupBy(mapElementGroups.groupId, ceos.projectStatus)
  ));

  somar("cto", await contarPorGrupo("cto", async () =>
    db
      .select({
        groupId: mapElementGroups.groupId,
        estado: ctos.projectStatus,
        total: sql<number>`count(*)`,
      })
      .from(mapElementGroups)
      .innerJoin(mapElements, eq(mapElements.id, mapElementGroups.elementId))
      .innerJoin(ctos, eq(ctos.id, mapElements.referenceId))
      .where(eq(mapElements.type, "cto"))
      .groupBy(mapElementGroups.groupId, ctos.projectStatus)
  ));

  somar("cabo", await contarPorGrupo("cabo", async () =>
    db
      .select({
        groupId: mapRouteGroups.groupId,
        estado: mapRoutes.projectStatus,
        total: sql<number>`count(*)`,
      })
      .from(mapRouteGroups)
      .innerJoin(mapRoutes, eq(mapRoutes.id, mapRouteGroups.routeId))
      .groupBy(mapRouteGroups.groupId, mapRoutes.projectStatus)
  ));

  somar("poste", await contarPorGrupo("poste", async () =>
    db
      .select({
        groupId: mapPoleGroups.groupId,
        estado: mapPoles.projectStatus,
        total: sql<number>`count(*)`,
      })
      .from(mapPoleGroups)
      .innerJoin(mapPoles, eq(mapPoles.id, mapPoleGroups.poleId))
      .groupBy(mapPoleGroups.groupId, mapPoles.projectStatus)
  ));

  somar("reserva", await contarPorGrupo("reserva", async () =>
    db
      .select({
        groupId: mapReserveGroups.groupId,
        estado: mapTechnicalReserves.projectStatus,
        total: sql<number>`count(*)`,
      })
      .from(mapReserveGroups)
      .innerJoin(mapTechnicalReserves, eq(mapTechnicalReserves.id, mapReserveGroups.reserveId))
      .groupBy(mapReserveGroups.groupId, mapTechnicalReserves.projectStatus)
  ));

  return acc;
}

// ─── Diagrama óptico ──────────────────────────────────────────────────────────
//
// Retrato de leitura do interior de uma CEO ou CTO: tubos, vias, splitters,
// fusões e os cabos que chegam ali. Uma consulta só, e não seis, porque o
// canvas desenha tudo junto — seis consultas independentes podem chegar de
// instantes diferentes e mostrar uma fusão apontando para uma via que a outra
// consulta ainda não trouxe.
//
// Só lê. A criação de tubos e vias para um cabo recém-ligado é escrita, e fica
// para depois de este desenho estar provado.
//
// Assimetria que o desenho tem de aguentar: na CEO um splitter é entidade
// própria (ceo_splitters + ceo_splitter_vias, dentro de bandeja); na CTO é um
// cto_tubes com type="splitter" e um campo `ratio`. São dois modelos para a
// mesma coisa, e uniformizá-los mexeria em dados de produção por elegância,
// antes de a tela existir.

export interface DiagramaViaOptica {
  id: number;
  viaNumber: number;
  label: string | null;
  lossDb?: number | null;
}

export interface DiagramaTuboOptico {
  id: number;
  identifier: string;
  tipo: "tube" | "splitter";
  totalVias: number;
  bandejaId: number | null;
  cor: string | null;
  /** Só nas CTOs, onde o splitter é um tubo. */
  ratio: string | null;
  vias: DiagramaViaOptica[];
}

export interface DiagramaSplitterOptico {
  id: number;
  identifier: string;
  ratio: string;
  splitterType: string;
  bandejaId: number;
  vias: DiagramaViaOptica[];
}

export interface DiagramaCaboOptico {
  id: number;
  nome: string;
  fibras: number;
  cor: string | null;
  /** Se este elemento é a origem ou o destino do cabo. */
  lado: "from" | "to";
  /** Tubos deste elemento onde o cabo termina. Vazio = ligado sem estrutura. */
  tuboIds: number[];
  /** Geometria, para o cliente medir o comprimento com o módulo que já tem. */
  path: string | null;
}

export interface DiagramaOptico {
  tipo: "ceo" | "cto";
  id: number;
  elementId: number | null;
  nome: string;
  bandejas: Array<{ id: number; number: number; label: string | null }>;
  tubos: DiagramaTuboOptico[];
  splitters: DiagramaSplitterOptico[];
  fusoes: Array<{
    id: number;
    sourceType: "tube" | "splitter";
    sourceViaId: number;
    targetType: "tube" | "splitter";
    targetViaId: number;
    notes: string | null;
    /**
     * "associacao" = linha de *_via_associations, com id real, apagavel.
     * "coluna"     = fusao gravada em ceo_vias/cto_vias.fusedTo*, id negativo
     *                sintetico. Nao existe linha para apagar por id.
     */
    origem: "associacao" | "coluna";
  }>;
  cabos: DiagramaCaboOptico[];
}

export async function getOpticalDiagram(tipo: "ceo" | "cto", id: number): Promise<DiagramaOptico | null> {
  const db = await getDb();
  if (!db) return null;

  const cadastro = tipo === "ceo"
    ? (await db.select().from(ceos).where(eq(ceos.id, id)).limit(1))[0]
    : (await db.select().from(ctos).where(eq(ctos.id, id)).limit(1))[0];
  if (!cadastro) return null;

  // O elemento do mapa é quem os cabos referenciam — não o cadastro.
  const elemRows = await db.select().from(mapElements)
    .where(and(eq(mapElements.type, tipo), eq(mapElements.referenceId, id)))
    .limit(1);
  const elementId = elemRows[0]?.id ?? null;

  const saida: DiagramaOptico = {
    tipo, id, elementId,
    nome: (cadastro as any).name ?? `${tipo.toUpperCase()} #${id}`,
    bandejas: [], tubos: [], splitters: [], fusoes: [], cabos: [],
  };

  if (tipo === "ceo") {
    const [bandejas, tubos, vias, splitters, splitterVias, assoc] = await Promise.all([
      db.select().from(ceoBandejas).where(eq(ceoBandejas.ceoId, id)),
      db.select().from(ceoTubes).where(eq(ceoTubes.ceoId, id)),
      db.select().from(ceoVias).where(eq(ceoVias.ceoId, id)),
      db.select().from(ceoSplitters).where(eq(ceoSplitters.ceoId, id)),
      db.select().from(ceoSplitterVias).where(eq(ceoSplitterVias.ceoId, id)),
      db.select().from(ceoViaAssociations).where(eq(ceoViaAssociations.ceoId, id)),
    ]);
    saida.bandejas = bandejas.map(b => ({ id: b.id, number: b.number, label: b.label ?? null }));
    saida.tubos = tubos.map(t => ({
      id: t.id, identifier: t.identifier, tipo: t.type as "tube" | "splitter",
      totalVias: t.totalVias, bandejaId: t.bandejaId ?? null, cor: t.color ?? null, ratio: null,
      vias: vias.filter(v => v.tubeId === t.id)
        .sort((a, b) => a.viaNumber - b.viaNumber)
        .map(v => ({ id: v.id, viaNumber: v.viaNumber, label: v.label ?? null })),
    }));
    saida.splitters = splitters.map(s => ({
      id: s.id, identifier: s.identifier, ratio: s.ratio,
      splitterType: s.splitterType, bandejaId: s.bandejaId,
      vias: splitterVias.filter(v => v.splitterId === s.id)
        .sort((a, b) => a.viaNumber - b.viaNumber)
        .map(v => ({ id: v.id, viaNumber: v.viaNumber, label: v.label ?? null, lossDb: v.lossDb ?? null })),
    }));
    // As duas fontes juntas. Ler so as associacoes escondia 100% das fusoes
    // tubo<->tubo -- 686 vias no banco principal, medido a 28/08/2026.
    saida.fusoes = unirFusoes(assoc, vias);
  } else {
    const [tubos, vias, assoc] = await Promise.all([
      db.select().from(ctoTubes).where(eq(ctoTubes.ctoId, id)),
      db.select().from(ctoVias).where(eq(ctoVias.ctoId, id)),
      db.select().from(ctoViaAssociations).where(eq(ctoViaAssociations.ctoId, id)),
    ]);
    saida.tubos = tubos.map(t => ({
      id: t.id, identifier: t.identifier, tipo: t.type as "tube" | "splitter",
      totalVias: t.totalVias, bandejaId: null, cor: t.color ?? null, ratio: t.ratio ?? null,
      vias: vias.filter(v => v.tubeId === t.id)
        .sort((a, b) => a.viaNumber - b.viaNumber)
        .map(v => ({ id: v.id, viaNumber: v.viaNumber, label: v.label ?? null })),
    }));
    // Na CTO o splitter E um tubo: as suas vias vivem em cto_vias, no mesmo
    // espaco de ids das outras. O tipo "splitter" gravado na associacao mandava
    // o cliente procurar a ancora em "splitter:<id>", que nunca existe na CTO --
    // e a fusao desaparecia sem erro. Aqui normaliza-se para "tube", que e o que
    // o id realmente e. O tubo continua a dizer de si `tipo: "splitter"`.
    const assocCto = assoc.map(a => ({ ...a, sourceType: "tube", targetType: "tube" }));
    saida.fusoes = unirFusoes(assocCto, vias);
  }

  if (elementId != null) {
    const rotas = await db.select().from(mapRoutes)
      .where(or(eq(mapRoutes.fromElementId, elementId), eq(mapRoutes.toElementId, elementId)));
    const extras = rotas.length > 0
      ? await db.select().from(routeExtraTubes)
          .where(and(
            eq(routeExtraTubes.elementId, elementId),
            inArray(routeExtraTubes.routeId, rotas.map(r => r.id))
          ))
      : [];
    saida.cabos = rotas.map(r => {
      const lado: "from" | "to" = r.toElementId === elementId ? "to" : "from";
      const principal = lado === "to" ? r.toTubeId : r.fromTubeId;
      const tuboIds = [
        ...(principal != null ? [principal] : []),
        ...extras.filter(e => e.routeId === r.id && e.side === lado).map(e => e.tubeId),
      ];
      return {
        id: r.id,
        nome: r.name ?? `Cabo #${r.id}`,
        fibras: r.fiberCount ?? 12,
        cor: r.color ?? null,
        lado,
        // Sem repetidos: um cabo pode aparecer no principal e nos extras.
        tuboIds: Array.from(new Set(tuboIds)),
        path: r.path ?? null,
      };
    });
  }

  return saida;
}
