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
  passwordHash: varchar("passwordHash", { length: 255 }),   // Login mobile por senha
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
  imageUrl: text("imageUrl"),                  // URL da imagem do equipamento (S3)
  powerType: mysqlEnum("power_type", ["ac", "dc"]),                    // Tipo de energia: AC ou DC
  powerSource: mysqlEnum("power_source", ["rectifier", "inverter", "ups", "grid", "other"]),  // Fonte de alimentação (legado)
  powerSourceLabel: varchar("powerSourceLabel", { length: 128 }),      // Identificação da fonte (legado)
  powerSourceId: int("powerSourceId"),                                 // FK para power_sources cadastradas
  notes: text("notes"),
  // Campos de rede
  vlan: int("vlan"),                                                          // VLAN ID (ex: 100)
  interfaceIp: varchar("interfaceIp", { length: 64 }),                        // IP da interface de gerência (ex: 10.0.0.1/24)
  ipBlockId: int("ipBlockId"),                                                // FK para ip_blocks (bloco IP associado)
  serviceDescription: varchar("serviceDescription", { length: 255 }),        // Descrição do serviço (ex: "Core MPLS", "Acesso cliente")
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

// ─── Agendamento de Backup ───────────────────────────────────────────────────
export const backupSchedules = mysqlTable("backup_schedules", {
  id: int("id").autoincrement().primaryKey(),
  enabled: boolean("enabled").default(false).notNull(),
  frequency: mysqlEnum("frequency", ["daily", "weekly", "monthly"]).default("weekly").notNull(),
  hour: int("hour").default(2).notNull(),         // hora do dia (0-23) para executar
  dayOfWeek: int("dayOfWeek"),                    // 0=Dom..6=Sáb (para weekly)
  dayOfMonth: int("dayOfMonth"),                  // 1-28 (para monthly)
  retentionDays: int("retentionDays").default(30).notNull(), // dias para manter backups
  nextRunAt: timestamp("nextRunAt"),
  lastRunAt: timestamp("lastRunAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type BackupSchedule = typeof backupSchedules.$inferSelect;
export type InsertBackupSchedule = typeof backupSchedules.$inferInsert;

// ─── Histórico de Backups ────────────────────────────────────────────────────
export const backupHistory = mysqlTable("backup_history", {
  id: int("id").autoincrement().primaryKey(),
  filename: varchar("filename", { length: 256 }).notNull(),
  fileUrl: text("fileUrl"),                       // URL S3 do arquivo
  fileKey: varchar("fileKey", { length: 512 }),   // chave S3
  fileSizeBytes: int("fileSizeBytes"),
  totalRecords: int("totalRecords"),
  status: mysqlEnum("backup_status", ["success", "error"]).default("success").notNull(),
  trigger: mysqlEnum("backup_trigger", ["manual", "scheduled"]).default("manual").notNull(),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type BackupHistoryEntry = typeof backupHistory.$inferSelect;
export type InsertBackupHistory = typeof backupHistory.$inferInsert;

// ─── Configurações do Sistema ────────────────────────────────────────────────
export const systemSettings = mysqlTable("system_settings", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 64 }).notNull().unique(),
  value: text("value"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = typeof systemSettings.$inferInsert;

// ─── IP DOC — Blocos IP ──────────────────────────────────────────────────────
export const ipBlocks = mysqlTable("ip_blocks", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  cidr: varchar("cidr", { length: 43 }).notNull(),          // ex: 192.168.1.0/24
  networkAddress: varchar("networkAddress", { length: 39 }).notNull(), // primeiro IP
  broadcastAddress: varchar("broadcastAddress", { length: 39 }).notNull(), // último IP
  totalHosts: int("totalHosts").notNull(),
  gateway: varchar("gateway", { length: 39 }),
  dns1: varchar("dns1", { length: 39 }),
  dns2: varchar("dns2", { length: 39 }),
  vlan: int("vlan"),
  type: mysqlEnum("ip_block_type", ["infrastructure", "clients", "management", "transit", "loopback", "reserved", "other"]).default("other").notNull(),
  status: mysqlEnum("ip_block_status", ["active", "inactive", "reserved"]).default("active").notNull(),
  description: text("description"),
  roomId: int("roomId").references(() => rooms.id, { onDelete: "set null" }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type IpBlock = typeof ipBlocks.$inferSelect;
export type InsertIpBlock = typeof ipBlocks.$inferInsert;

// ─── IP DOC — Endereços IP ───────────────────────────────────────────────────
export const ipAddresses = mysqlTable("ip_addresses", {
  id: int("id").autoincrement().primaryKey(),
  blockId: int("blockId").notNull().references(() => ipBlocks.id, { onDelete: "cascade" }),
  address: varchar("address", { length: 39 }).notNull(),    // ex: 192.168.1.10
  status: mysqlEnum("ip_address_status", ["free", "allocated", "reserved", "dhcp"]).default("free").notNull(),
  hostname: varchar("hostname", { length: 255 }),
  description: text("description"),
  equipmentId: int("equipmentId").references(() => equipments.id, { onDelete: "set null" }),
  macAddress: varchar("macAddress", { length: 17 }),
  owner: varchar("owner", { length: 128 }),                 // cliente ou setor
  lastSeen: timestamp("lastSeen"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type IpAddress = typeof ipAddresses.$inferSelect;
export type InsertIpAddress = typeof ipAddresses.$inferInsert;

// ─── IP DOC — Log de Auditoria ───────────────────────────────────────────────
export const ipAuditLog = mysqlTable("ip_audit_log", {
  id: int("id").autoincrement().primaryKey(),
  blockId: int("blockId").notNull().references(() => ipBlocks.id, { onDelete: "cascade" }),
  addressId: int("addressId"),                              // null se o IP foi deletado
  address: varchar("address", { length: 39 }).notNull(),   // snapshot do IP no momento
  action: mysqlEnum("ip_audit_action", ["allocated", "released", "updated", "deleted", "imported"]).notNull(),
  previousStatus: varchar("previousStatus", { length: 32 }),
  newStatus: varchar("newStatus", { length: 32 }),
  hostname: varchar("hostname", { length: 255 }),
  owner: varchar("owner", { length: 128 }),
  equipmentId: int("equipmentId"),
  equipmentName: varchar("equipmentName", { length: 128 }), // snapshot do nome
  performedBy: varchar("performedBy", { length: 128 }),
  userId: int("userId"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type IpAuditLog = typeof ipAuditLog.$inferSelect;
export type InsertIpAuditLog = typeof ipAuditLog.$inferInsert;

// ─── Equipamentos — Interfaces/VLANs ─────────────────────────────────────────
export const equipmentInterfaces = mysqlTable("equipment_interfaces", {
  id: int("id").autoincrement().primaryKey(),
  equipmentId: int("equipmentId").notNull().references(() => equipments.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 64 }).notNull(),          // ex: eth0, GigabitEthernet0/1
  vlan: int("vlan"),                                        // VLAN ID 1-4094
  ipAddress: varchar("ipAddress", { length: 43 }),          // ex: 192.168.1.1/24
  macAddress: varchar("macAddress", { length: 17 }),
  ipBlockId: int("ipBlockId").references(() => ipBlocks.id, { onDelete: "set null" }),
  serviceDescription: varchar("serviceDescription", { length: 255 }), // ex: "Core MPLS", "Clientes"
  isPrimary: boolean("isPrimary").default(false).notNull(), // true = interface principal
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type EquipmentInterface = typeof equipmentInterfaces.$inferSelect;
export type InsertEquipmentInterface = typeof equipmentInterfaces.$inferInsert;

// ─── Fontes de Energia Cadastráveis ──────────────────────────────────────────
export const powerSources = mysqlTable("power_sources", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),          // ex: "Retificadora R1 - Huawei ETP48100"
  type: mysqlEnum("ps_type", ["rectifier", "inverter", "ups", "grid", "generator", "other"]).notNull().default("rectifier"),
  manufacturer: varchar("manufacturer", { length: 128 }),    // ex: "Huawei", "APC", "Powerware"
  model: varchar("model", { length: 128 }),                  // ex: "ETP48100-B1", "Smart-UPS 3000"
  roomId: int("roomId").references(() => rooms.id, { onDelete: "set null" }),
  location: varchar("location", { length: 255 }),            // Localização física dentro da sala
  outputVoltage: float("outputVoltage"),                     // Tensão de saída em Volts (ex: 48.0)
  outputCurrentMax: float("outputCurrentMax"),               // Corrente máxima em Amperes
  notes: text("notes"),

  // ─── Configuração SNMP ────────────────────────────────────────────────────
  snmpEnabled: boolean("snmpEnabled").default(false).notNull(),
  snmpHost: varchar("snmpHost", { length: 128 }),            // IP ou hostname de gerência
  snmpPort: int("snmpPort").default(161),
  snmpVersion: mysqlEnum("snmp_version", ["v1", "v2c", "v3"]).default("v2c"),
  snmpCommunity: varchar("snmpCommunity", { length: 128 }),  // Community string (v1/v2c)
  // SNMPv3
  snmpV3User: varchar("snmpV3User", { length: 128 }),
  snmpV3AuthProto: mysqlEnum("snmpv3_auth_proto", ["MD5", "SHA"]),
  snmpV3AuthKey: varchar("snmpV3AuthKey", { length: 255 }),
  snmpV3PrivProto: mysqlEnum("snmpv3_priv_proto", ["DES", "AES"]),
  snmpV3PrivKey: varchar("snmpV3PrivKey", { length: 255 }),
  // OIDs configuráveis
  oidOutputVoltage: varchar("oidOutputVoltage", { length: 128 }),    // ex: 1.3.6.1.4.1.2011.6.199.1.2.1.1.0
  oidOutputCurrent: varchar("oidOutputCurrent", { length: 128 }),
  oidTemperature: varchar("oidTemperature", { length: 128 }),
  oidAlarmStatus: varchar("oidAlarmStatus", { length: 128 }),
  oidBatteryLevel: varchar("oidBatteryLevel", { length: 128 }),
  oidLoadPercent: varchar("oidLoadPercent", { length: 128 }),
  snmpPollInterval: int("snmpPollInterval").default(300),             // Intervalo em segundos
  // Último valor coletado (cache)
  lastPollAt: timestamp("lastPollAt"),
  lastVoltage: float("lastVoltage"),
  lastCurrent: float("lastCurrent"),
  lastTemperature: float("lastTemperature"),
  lastAlarmStatus: varchar("lastAlarmStatus", { length: 64 }),
  lastBatteryLevel: float("lastBatteryLevel"),
  lastLoadPercent: float("lastLoadPercent"),
  lastPollError: text("lastPollError"),
  // ─── Thresholds de alerta ─────────────────────────────────────────────────
  alertsEnabled: boolean("alertsEnabled").default(false).notNull(),
  alertTempMax: float("alertTempMax"),          // °C — acima dispara alerta
  alertVoltageMin: float("alertVoltageMin"),    // V — abaixo dispara alerta
  alertVoltageMax: float("alertVoltageMax"),    // V — acima dispara alerta
  alertBatteryMin: float("alertBatteryMin"),    // V ou % — abaixo dispara alerta
  alertBatteryMax: float("alertBatteryMax"),    // V ou % — acima dispara alerta
  alertCurrentMax: float("alertCurrentMax"),    // A — acima dispara alerta
  alertLoadMax: float("alertLoadMax"),          // % — acima dispara alerta
  alertAcFailEnabled: boolean("alertAcFailEnabled").default(false).notNull(), // monitorar falta de AC
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PowerSource = typeof powerSources.$inferSelect;
export type InsertPowerSource = typeof powerSources.$inferInsert;;

// ─── Equipamentos — FK para fonte de energia cadastrada ───────────────────────


// ─── Alertas SNMP ─────────────────────────────────────────────────────────────
export const snmpAlerts = mysqlTable("snmp_alerts", {
  id: int("id").autoincrement().primaryKey(),
  powerSourceId: int("powerSourceId").notNull().references(() => powerSources.id, { onDelete: "cascade" }),
  alertType: mysqlEnum("alert_type", [
    "temp_high",          // Temperatura acima do limite
    "voltage_low",        // Tensão de saída abaixo do mínimo
    "voltage_high",       // Tensão de saída acima do máximo
    "battery_low",        // Bateria abaixo do mínimo
    "battery_high",       // Bateria acima do máximo (sobrecarga)
    "current_high",       // Corrente acima do máximo
    "load_high",          // Carga acima do máximo
    "ac_fail",            // Falha na rede AC (tensão = 0 ou alarme ativo)
    "snmp_unreachable",   // Equipamento não responde ao SNMP
  ]).notNull(),
  severity: mysqlEnum("alert_severity", ["warning", "critical"]).notNull().default("warning"),
  message: text("message").notNull(),
  currentValue: float("currentValue"),      // Valor coletado que disparou o alerta
  thresholdValue: float("thresholdValue"),  // Threshold configurado
  // Ciclo de vida do alerta
  acknowledgedAt: timestamp("acknowledgedAt"),
  acknowledgedBy: varchar("acknowledgedBy", { length: 128 }),
  resolvedAt: timestamp("resolvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SnmpAlert = typeof snmpAlerts.$inferSelect;
export type InsertSnmpAlert = typeof snmpAlerts.$inferInsert;

// ─── Dispositivos Tuya IoT ─────────────────────────────────────────────────────
export const tuyaDevices = mysqlTable("tuya_devices", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  deviceId: varchar("deviceId", { length: 128 }).notNull().unique(), // ID do dispositivo na plataforma Tuya
  type: mysqlEnum("type", [
    "temperature_humidity", // Sensor de temperatura e umidade
    "temperature",          // Sensor de temperatura
    "humidity",             // Sensor de umidade
    "co2",                  // Sensor de CO₂
    "smoke",                // Sensor de fumaça
    "motion",               // Sensor de presença/movimento
    "door",                 // Sensor de porta/janela
    "power_meter",          // Medidor de energia (tomada inteligente)
    "other",                // Outro tipo
  ]).notNull().default("temperature_humidity"),
  tuyaAccountId: int("tuyaAccountId").references(() => tuyaAccounts.id, { onDelete: "set null" }),
  roomId: int("roomId").references(() => rooms.id, { onDelete: "set null" }),
  powerSourceId: int("powerSourceId").references(() => powerSources.id, { onDelete: "set null" }),
  notes: text("notes"),
  // Polling
  pollInterval: int("pollInterval").default(300).notNull(), // segundos
  lastPolledAt: timestamp("lastPolledAt"),
  lastPollError: text("lastPollError"),
  // Últimos valores coletados (cache)
  lastTemperature: float("lastTemperature"),
  lastHumidity: float("lastHumidity"),
  lastCo2: float("lastCo2"),
  lastPower: float("lastPower"),          // W
  lastVoltage: float("lastVoltage"),      // V
  lastCurrent: float("lastCurrent"),      // A
  lastRawData: text("lastRawData"),       // JSON com todos os DPs coletados
  // Status
  status: mysqlEnum("status", ["online", "offline", "unknown"]).default("unknown").notNull(),
  // Thresholds de alerta
  alertsEnabled: boolean("alertsEnabled").default(false).notNull(),
  alertTempMax: float("alertTempMax"),
  alertTempMin: float("alertTempMin"),
  alertHumidityMax: float("alertHumidityMax"),
  alertHumidityMin: float("alertHumidityMin"),
  alertCo2Max: float("alertCo2Max"),
  alertPowerMax: float("alertPowerMax"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type TuyaDevice = typeof tuyaDevices.$inferSelect;
export type InsertTuyaDevice = typeof tuyaDevices.$inferInsert;

// ─── Contas Tuya IoT (múltiplas contas) ───────────────────────────────────────
export const tuyaAccounts = mysqlTable("tuya_accounts", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),           // Ex: "Conta Principal", "Cliente ABC"
  accessId: varchar("accessId", { length: 128 }).notNull(),   // Client ID do projeto Tuya
  accessSecret: varchar("accessSecret", { length: 256 }).notNull(), // Client Secret
  region: mysqlEnum("region", ["us", "eu", "cn", "in"]).notNull().default("us"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type TuyaAccount = typeof tuyaAccounts.$inferSelect;
export type InsertTuyaAccount = typeof tuyaAccounts.$inferInsert;

// ─── Histórico de Leituras Tuya ───────────────────────────────────────────────
export const tuyaReadings = mysqlTable("tuya_readings", {
  id: int("id").autoincrement().primaryKey(),
  deviceId: int("deviceId").notNull().references(() => tuyaDevices.id, { onDelete: "cascade" }),
  temperature: float("temperature"),
  humidity: float("humidity"),
  co2: float("co2"),
  power: float("power"),
  voltage: float("voltage"),
  current: float("current"),
  rawData: text("rawData"), // JSON com todos os DPs coletados
  collectedAt: timestamp("collectedAt").defaultNow().notNull(),
});
export type TuyaReading = typeof tuyaReadings.$inferSelect;
export type InsertTuyaReading = typeof tuyaReadings.$inferInsert;
