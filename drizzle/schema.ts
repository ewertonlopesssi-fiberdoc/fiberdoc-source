import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  float,
  boolean,
} from "drizzle-orm/mysql-core";

// ─── Usuários ────────────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Salas / Localizações ────────────────────────────────────────────────────
export const rooms = mysqlTable("rooms", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  type: mysqlEnum("room_type", ["datacenter", "noc", "pop", "cabinet", "outdoor", "other"]).default("pop").notNull(),
  description: text("description"),
  location: varchar("location", { length: 128 }),
  address: text("address"),
  floor: varchar("floor", { length: 32 }),
  city: varchar("city", { length: 128 }),
  state: varchar("state", { length: 32 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Room = typeof rooms.$inferSelect;
export type InsertRoom = typeof rooms.$inferInsert;

// ─── Equipamentos ────────────────────────────────────────────────────────────
export const equipmentTypeEnum = mysqlEnum("equipment_type", [
  "switch",
  "olt",
  "dgo",
  "splitter",
  "router",
  "server",
  "patch_panel",
  "amplifier",
  "other",
]);

export const equipments = mysqlTable("equipments", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  type: equipmentTypeEnum.notNull(),
  model: varchar("model", { length: 128 }),
  manufacturer: varchar("manufacturer", { length: 128 }),
  serialNumber: varchar("serialNumber", { length: 128 }),
  roomId: int("roomId"),
  rack: varchar("rack", { length: 64 }),
  rackPosition: varchar("rackPosition", { length: 32 }),
  ipAddress: varchar("ipAddress", { length: 64 }),
  macAddress: varchar("macAddress", { length: 32 }),
  totalPorts: int("totalPorts").default(0),
  notes: text("notes"),
  status: mysqlEnum("status", ["active", "inactive", "maintenance"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Equipment = typeof equipments.$inferSelect;
export type InsertEquipment = typeof equipments.$inferInsert;

// ─── Slots de Equipamentos ─────────────────────────────────────────────────
export const equipmentSlots = mysqlTable("equipment_slots", {
  id: int("id").autoincrement().primaryKey(),
  equipmentId: int("equipmentId").notNull(),
  slotNumber: varchar("slotNumber", { length: 16 }).notNull(), // ex: "A", "B", "1", "2"
  label: varchar("label", { length: 64 }),                    // ex: "Slot A — LC 12 portas"
  portType: mysqlEnum("slot_port_type", ["sc", "lc", "fc", "st", "rj45", "sfp", "sfp_plus", "qsfp", "qsfp28", "qsfp_dd", "cfp", "cfp2", "cfp4", "gpon", "xgspon", "dag", "other"]).default("lc"),
  speed: mysqlEnum("slot_speed", ["1g", "10g", "25g", "40g", "100g", "400g", "other"]),
  totalPorts: int("totalPorts").default(0),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EquipmentSlot = typeof equipmentSlots.$inferSelect;
export type InsertEquipmentSlot = typeof equipmentSlots.$inferInsert;

// ─── Portas ──────────────────────────────────────────────────────────────────
export const ports = mysqlTable("ports", {
  id: int("id").autoincrement().primaryKey(),
  equipmentId: int("equipmentId").notNull(),
  portNumber: varchar("portNumber", { length: 32 }).notNull(),
  label: varchar("label", { length: 64 }),
  slotId: int("slotId"),                                        // null = porta sem slot
  type: mysqlEnum("port_type", ["sc", "lc", "fc", "st", "rj45", "sfp", "sfp_plus", "qsfp", "qsfp28", "qsfp_dd", "cfp", "cfp2", "cfp4", "gpon", "xgspon", "dag", "other"]).default("lc").notNull(),
  speed: mysqlEnum("port_speed", ["1g", "10g", "25g", "40g", "100g", "400g", "other"]),
  status: mysqlEnum("port_status", ["free", "occupied", "reserved", "faulty"]).default("free").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Port = typeof ports.$inferSelect;
export type InsertPort = typeof ports.$inferInsert;

// ─── Fibras Ópticas ──────────────────────────────────────────────────────────
export const fiberColorEnum = mysqlEnum("fiber_color", [
  "blue", "orange", "green", "brown", "slate", "white", "red", "black", "yellow", "violet", "rose", "aqua"
]);

export const fibers = mysqlTable("fibers", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  originEquipmentId: int("originEquipmentId"),
  originPortId: int("originPortId"),
  destinationEquipmentId: int("destinationEquipmentId"),
  destinationPortId: int("destinationPortId"),
  color: fiberColorEnum,
  type: mysqlEnum("fiber_type", ["single_mode", "multi_mode", "armored", "aerial", "underground"]).default("single_mode").notNull(),
  lengthMeters: float("lengthMeters"),
  cableId: varchar("cableId", { length: 64 }),
  tubeColor: varchar("tubeColor", { length: 32 }),
  attenuation: float("attenuation"),
  status: mysqlEnum("fiber_status", ["active", "inactive", "reserved", "faulty"]).default("active").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Fiber = typeof fibers.$inferSelect;
export type InsertFiber = typeof fibers.$inferInsert;

// ─── Conexões ────────────────────────────────────────────────────────────────
export const connections = mysqlTable("connections", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }),
  sourcePortId: int("sourcePortId").notNull(),
  targetPortId: int("targetPortId").notNull(),
  fiberId: int("fiberId"),
  type: mysqlEnum("connection_type", ["direct", "spliced", "patch", "cross_connect"]).default("direct").notNull(),
  status: mysqlEnum("connection_status", ["active", "inactive", "testing"]).default("active").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Connection = typeof connections.$inferSelect;
export type InsertConnection = typeof connections.$inferInsert;

// ─── Histórico de Manutenções ────────────────────────────────────────────────
export const maintenanceHistory = mysqlTable("maintenance_history", {
  id: int("id").autoincrement().primaryKey(),
  entityType: mysqlEnum("entity_type", ["equipment", "fiber", "port", "connection", "room"]).notNull(),
  entityId: int("entityId").notNull(),
  action: mysqlEnum("action", ["created", "updated", "deleted", "maintenance", "repaired", "inspected"]).notNull(),
  description: text("description").notNull(),
  performedBy: varchar("performedBy", { length: 128 }),
  userId: int("userId"),
  previousState: text("previousState"),
  newState: text("newState"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MaintenanceHistory = typeof maintenanceHistory.$inferSelect;
export type InsertMaintenanceHistory = typeof maintenanceHistory.$inferInsert;

// ─── CEO (Caixa de Emenda Óptica) ────────────────────────────────────────────
export const ceos = mysqlTable("ceos", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  location: varchar("location", { length: 256 }),
  roomId: int("roomId"),
  notes: text("notes"),
  status: mysqlEnum("ceo_status", ["active", "inactive", "maintenance"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Ceo = typeof ceos.$inferSelect;
export type InsertCeo = typeof ceos.$inferInsert;

// ─── Tubos / Splitters do CEO ────────────────────────────────────────────────
export const ceoTubes = mysqlTable("ceo_tubes", {
  id: int("id").autoincrement().primaryKey(),
  ceoId: int("ceoId").notNull(),
  type: mysqlEnum("ceo_tube_type", ["tube", "splitter"]).default("tube").notNull(),
  identifier: varchar("identifier", { length: 32 }).notNull(), // ex: "TUBO 1", "SPLITTER 1*8"
  totalVias: int("totalVias").default(12).notNull(),
  color: varchar("color", { length: 32 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CeoTube = typeof ceoTubes.$inferSelect;
export type InsertCeoTube = typeof ceoTubes.$inferInsert;

// ─── Vias do Tubo/Splitter ───────────────────────────────────────────────────
export const ceoVias = mysqlTable("ceo_vias", {
  id: int("id").autoincrement().primaryKey(),
  tubeId: int("tubeId").notNull(),
  ceoId: int("ceoId").notNull(),
  viaNumber: int("viaNumber").notNull(),           // 1, 2, 3...
  label: varchar("label", { length: 64 }),         // etiqueta opcional
  fusedToViaId: int("fusedToViaId"),               // id da via destino da fusão
  fusedToTubeId: int("fusedToTubeId"),             // id do tubo destino
  fiberId: int("fiberId"),                         // fibra óptica associada a esta via
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CeoVia = typeof ceoVias.$inferSelect;
export type InsertCeoVia = typeof ceoVias.$inferInsert;
