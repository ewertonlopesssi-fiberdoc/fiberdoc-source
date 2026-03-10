import {
  int,
  bigint,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  float,
  double,
  boolean,
} from "drizzle-orm/mysql-core";

// ─── Usuários ────────────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "operator"]).default("user").notNull(),
  passwordHash: varchar("passwordHash", { length: 255 }),   // Login mobile por senha
  mustChangePassword: boolean("mustChangePassword").default(false).notNull(), // Forçar troca de senha no primeiro acesso
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
  rackUnits: int("rackUnits").default(1),                               // Altura em U (unidades de rack)
  ipAddress: varchar("ipAddress", { length: 64 }),
  macAddress: varchar("macAddress", { length: 32 }),
  totalPorts: int("totalPorts").default(0),
  imageUrl: text("imageUrl"),                  // URL da imagem do equipamento (S3)
  powerType: mysqlEnum("power_type", ["ac", "dc"]),                    // Tipo de energia: AC ou DC
  powerSource: mysqlEnum("power_source", ["rectifier", "inverter", "ups", "grid", "other"]),  // Fonte de alimentação (legado)
  powerSourceLabel: varchar("powerSourceLabel", { length: 128 }),      // Identificação da fonte (legado)
  powerSourceId: int("powerSourceId"),                                 // FK para power_sources cadastradas
  voltage: float("voltage"),                                           // Tensão de operação (V)
  powerConsumptionW: float("powerConsumptionW"),                       // Consumo elétrico (W)
  notes: text("notes"),
  // Campos de rede
  vlan: int("vlan"),                                                          // VLAN ID (ex: 100)
  interfaceIp: varchar("interfaceIp", { length: 64 }),                        // IP da interface de gerência (ex: 10.0.0.1/24)
  ipBlockId: int("ipBlockId"),                                                // FK para ip_blocks (bloco IP associado)
  serviceDescription: varchar("serviceDescription", { length: 255 }),        // Descrição do serviço (ex: "Core MPLS", "Acesso cliente")
  status: mysqlEnum("status", ["active", "inactive", "maintenance"]).default("active").notNull(),
  // Campos SSH (para o módulo SSH Commander)
  sshUser: varchar("sshUser", { length: 64 }),                         // Utilizador SSH (ex: admin)
  sshPasswordEnc: text("sshPasswordEnc"),                              // Password SSH encriptada (AES-256)
  sshPort: int("sshPort").default(22),                                 // Porta SSH (default: 22)
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
  sortOrder: int("sortOrder").default(0).notNull(),
  connectedToEquipmentId: int("connectedToEquipmentId"),      // Equipamento da porta vinculada
  connectedToPortId: int("connectedToPortId"),                // Porta vinculada (patch/conexão direta)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Port = typeof ports.$inferSelect;;
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
  bandejaId: int("bandejaId"),                    // FK ceo_bandejas.id (null = tubo sem bandeja, compatibilidade)
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
  localPath: varchar("localPath", { length: 512 }), // caminho local (quando sem S3)
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
  // Divisores de escala para conversão dos valores brutos SNMP
  snmpVoltageDivisor: float("snmpVoltageDivisor").default(1),   // ex: 10 para valores em 0.1V
  snmpCurrentDivisor: float("snmpCurrentDivisor").default(1),   // ex: 100 para valores em 0.01A
  snmpTempDivisor:    float("snmpTempDivisor").default(1),       // ex: 10 para valores em 0.1°C
  snmpBatteryDivisor: float("snmpBatteryDivisor").default(1),   // ex: 10 para tensão bateria em 0.1V
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

// ─── Layout do Mapa de Topologia ──────────────────────────────────────────────
export const topologyLayouts = mysqlTable("topology_layouts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),                        // FK para users.id
  roomFilter: varchar("roomFilter", { length: 32 }).notNull().default("all"), // "all" ou roomId
  nodePositions: text("nodePositions").notNull(),         // JSON: { [equipmentId]: { x, y } }
  ctrlPoints: text("ctrlPoints").notNull().default("{}"), // JSON: { "eqA-eqB": { x, y } }
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type TopologyLayout = typeof topologyLayouts.$inferSelect;
export type InsertTopologyLayout = typeof topologyLayouts.$inferInsert;

// ─── Histórico de Leituras SNMP ───────────────────────────────────────────────
export const snmpReadings = mysqlTable("snmp_readings", {
  id: int("id").autoincrement().primaryKey(),
  powerSourceId: int("powerSourceId").notNull().references(() => powerSources.id, { onDelete: "cascade" }),
  voltage: float("voltage"),
  current: float("current"),
  temperature: float("temperature"),
  batteryLevel: float("batteryLevel"),
  loadPercent: float("loadPercent"),
  alarmStatus: varchar("alarmStatus", { length: 64 }),
  collectedAt: timestamp("collectedAt").defaultNow().notNull(),
});
export type SnmpReading = typeof snmpReadings.$inferSelect;
export type InsertSnmpReading = typeof snmpReadings.$inferInsert;

// ─── Racks por Sala ───────────────────────────────────────────────────────────
export const racks = mysqlTable("racks", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 64 }).notNull(),                    // Ex: "RACK-01", "RACK-02"
  roomId: int("roomId").references(() => rooms.id, { onDelete: "cascade" }),
  totalUnits: int("totalUnits").default(44),                          // Altura total em U
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Rack = typeof racks.$inferSelect;
export type InsertRack = typeof racks.$inferInsert;

// ─── CTOs (Caixas de Terminação Óptica) ───────────────────────────────────────
export const ctos = mysqlTable("ctos", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  address: varchar("address", { length: 256 }),
  capacity: int("capacity").default(8),                               // Total de portas
  usedPorts: int("usedPorts").default(0),                             // Portas usadas
  status: varchar("status", { length: 32 }).default("active"),        // active | maintenance | inactive
  lat: double("lat"),                                                  // Latitude
  lng: double("lng"),                                                  // Longitude
  notes: text("notes"),
  sgpId: int("sgpId"),                                                 // ID da CTO no SGP (para sincronização)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Cto = typeof ctos.$inferSelect;
export type InsertCto = typeof ctos.$inferInsert;

// ─── Elementos do Mapa (posições de CEOs e CTOs) ──────────────────────────────
export const mapElements = mysqlTable("map_elements", {
  id: int("id").autoincrement().primaryKey(),
  type: varchar("type", { length: 8 }).notNull(),                     // "ceo" | "cto"
  referenceId: int("referenceId").notNull(),                          // ID do CEO ou CTO
  lat: double("lat").notNull(),
  lng: double("lng").notNull(),
  color: varchar("color", { length: 16 }),                              // Cor personalizada do marcador (null = cor padrão por status)
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type MapElement = typeof mapElements.$inferSelect;
export type InsertMapElement = typeof mapElements.$inferInsert;

// ─── Rotas/Cabos do Mapa ──────────────────────────────────────────────────────
export const mapRoutes = mysqlTable("map_routes", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }),
  fromElementId: int("fromElementId"),                               // FK map_elements.id (null = cabo livre sem vínculo)
  toElementId: int("toElementId"),                                    // FK map_elements.id (null = cabo livre sem vínculo)
  fromTubeId: int("fromTubeId"),                                      // FK ceo_tubes.id ou cto_tubes.id (tubo de entrada na origem)
  toTubeId: int("toTubeId"),                                          // FK ceo_tubes.id ou cto_tubes.id (tubo de entrada no destino)
  fiberCount: int("fiberCount").default(12),
  cableType: varchar("cableType", { length: 64 }).default("FO"),      // FO, Metálico, etc.
  color: varchar("color", { length: 16 }).default("#22d3ee"),         // Cor da linha no mapa
  path: text("path"),                                                  // JSON: [{lat, lng}] pontos intermediários
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type MapRoute = typeof mapRoutes.$inferSelect;
export type InsertMapRoute = typeof mapRoutes.$inferInsert;

// ─── Configuração SGP TSMx ────────────────────────────────────────────────────
export const sgpConfig = mysqlTable("sgp_config", {
  id: int("id").autoincrement().primaryKey(),
  baseUrl: varchar("baseUrl", { length: 256 }).notNull(),             // Ex: https://empresa.tsmx.net.br
  token: varchar("token", { length: 512 }).notNull(),
  app: varchar("app", { length: 128 }).notNull(),
  active: boolean("active").default(true),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SgpConfig = typeof sgpConfig.$inferSelect;
export type InsertSgpConfig = typeof sgpConfig.$inferInsert;
// ─── Alertas de Ocupação de CTOs ──────────────────────────────────────────────
export const ctoAlerts = mysqlTable("cto_alerts", {
  id: int("id").autoincrement().primaryKey(),
  ctoId: int("ctoId").notNull().references(() => ctos.id, { onDelete: "cascade" }),
  occupancyPct: int("occupancyPct").notNull(),                        // % de ocupação que disparou o alerta
  threshold: int("threshold").notNull().default(80),                  // Threshold configurado
  severity: mysqlEnum("cto_alert_severity", ["warning", "critical"]).notNull().default("warning"),
  message: text("message").notNull(),
  acknowledgedAt: timestamp("acknowledgedAt"),
  acknowledgedBy: varchar("acknowledgedBy", { length: 128 }),
  resolvedAt: timestamp("resolvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CtoAlert = typeof ctoAlerts.$inferSelect;
export type InsertCtoAlert = typeof ctoAlerts.$inferInsert;
// ─── Configuração de Alertas de CTOs ─────────────────────────────────────────
export const ctoAlertConfig = mysqlTable("cto_alert_config", {
  id: int("id").autoincrement().primaryKey(),
  enabled: boolean("enabled").default(false),
  warningThreshold: int("warningThreshold").default(80),              // % para aviso
  criticalThreshold: int("criticalThreshold").default(90),            // % para crítico
  checkIntervalMinutes: int("checkIntervalMinutes").default(60),      // Verificar a cada N minutos
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CtoAlertConfig = typeof ctoAlertConfig.$inferSelect;

// ─── Tubos / Splitters da CTO ─────────────────────────────────────────────────
export const ctoTubes = mysqlTable("cto_tubes", {
  id: int("id").autoincrement().primaryKey(),
  ctoId: int("ctoId").notNull(),
  type: mysqlEnum("cto_tube_type", ["tube", "splitter"]).default("tube").notNull(),
  identifier: varchar("identifier", { length: 32 }).notNull(), // ex: "TUBO 1", "SPLITTER 1*8"
  totalVias: int("totalVias").default(12).notNull(),
  color: varchar("color", { length: 32 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CtoTube = typeof ctoTubes.$inferSelect;
export type InsertCtoTube = typeof ctoTubes.$inferInsert;
// ─── Vias do Tubo/Splitter da CTO ─────────────────────────────────────────────
export const ctoVias = mysqlTable("cto_vias", {
  id: int("id").autoincrement().primaryKey(),
  tubeId: int("tubeId").notNull(),
  ctoId: int("ctoId").notNull(),
  viaNumber: int("viaNumber").notNull(),           // 1, 2, 3...
  label: varchar("label", { length: 64 }),         // etiqueta opcional
  fusedToViaId: int("fusedToViaId"),               // id da via destino da fusão
  fusedToTubeId: int("fusedToTubeId"),             // id do tubo destino
  fiberId: int("fiberId"),                         // fibra óptica associada a esta via
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CtoVia = typeof ctoVias.$inferSelect;
export type InsertCtoVia = typeof ctoVias.$inferInsert;

// ─── Grupos/Pastas do Mapa ────────────────────────────────────────────────────
export const mapGroups = mysqlTable("map_groups", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  color: varchar("color", { length: 16 }).default("#6366f1").notNull(),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type MapGroup = typeof mapGroups.$inferSelect;
export type InsertMapGroup = typeof mapGroups.$inferInsert;

// ─── Associação de Elementos a Grupos ─────────────────────────────────────────
export const mapElementGroups = mysqlTable("map_element_groups", {
  id: int("id").autoincrement().primaryKey(),
  elementId: int("elementId").notNull(),
  groupId: int("groupId").notNull(),
});
export type MapElementGroup = typeof mapElementGroups.$inferSelect;

// ─── Associação de Cabos a Grupos ─────────────────────────────────────────────
export const mapRouteGroups = mysqlTable("map_route_groups", {
  id: int("id").autoincrement().primaryKey(),
  routeId: int("routeId").notNull(),
  groupId: int("groupId").notNull(),
});
export type MapRouteGroup = typeof mapRouteGroups.$inferSelect;

// ─── Configurações da Aplicação (Integrações) ─────────────────────────────────
export const appSettings = mysqlTable("app_settings", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 128 }).notNull().unique(),
  value: text("value"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AppSetting = typeof appSettings.$inferSelect;

// ─── Histórico de Vínculos CTO ↔ SGP ─────────────────────────────────────────
export const sgpLinkHistory = mysqlTable("sgp_link_history", {
  id: int("id").autoincrement().primaryKey(),
  ctoId: int("ctoId").notNull().references(() => ctos.id, { onDelete: "cascade" }),
  ctoName: varchar("ctoName", { length: 128 }).notNull(),
  sgpId: int("sgpId"),                                                   // null quando desvinculado
  action: mysqlEnum("sgp_link_action", ["linked", "unlinked"]).notNull(),
  performedBy: varchar("performedBy", { length: 128 }),                  // nome/email do utilizador
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SgpLinkHistory = typeof sgpLinkHistory.$inferSelect;
export type InsertSgpLinkHistory = typeof sgpLinkHistory.$inferInsert;

// ─── Bandejas do CEO ──────────────────────────────────────────────────────────
// Cada CEO pode ter múltiplas bandejas. Tubos e splitters ficam dentro de bandejas.
export const ceoBandejas = mysqlTable("ceo_bandejas", {
  id: int("id").autoincrement().primaryKey(),
  ceoId: int("ceoId").notNull(),
  number: int("number").notNull(),                 // número da bandeja (1, 2, 3...)
  label: varchar("label", { length: 64 }),         // etiqueta opcional (ex: "Bandeja 1 - Entrada")
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CeoBandeja = typeof ceoBandejas.$inferSelect;
export type InsertCeoBandeja = typeof ceoBandejas.$inferInsert;

// ─── Splitters do CEO (dentro de bandejas) ────────────────────────────────────
// Splitters ficam dentro de bandejas (bandejaId obrigatório).
// type: "balanced" | "unbalanced"
// ratio: "1:2" | "1:4" | "1:8" | "1:16" | "1:32" (balanced)
//        "1:2_90/10" | "1:2_80/20" | "1:2_70/30" | "1:2_60/40" | "1:2_50/50" (unbalanced)
export const ceoSplitters = mysqlTable("ceo_splitters", {
  id: int("id").autoincrement().primaryKey(),
  ceoId: int("ceoId").notNull(),
  bandejaId: int("bandejaId").notNull(),           // FK ceo_bandejas.id
  identifier: varchar("identifier", { length: 64 }).notNull(), // ex: "SPLITTER 1:8 #1"
  splitterType: mysqlEnum("ceo_splitter_type", ["balanced", "unbalanced"]).default("balanced").notNull(),
  ratio: varchar("ratio", { length: 32 }).notNull(), // ex: "1:8" ou "1:2_90/10"
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CeoSplitter = typeof ceoSplitters.$inferSelect;
export type InsertCeoSplitter = typeof ceoSplitters.$inferInsert;

// ─── Vias do Splitter do CEO ──────────────────────────────────────────────────
// Via 00 = entrada do splitter; Via 01, 02, ... = saídas
export const ceoSplitterVias = mysqlTable("ceo_splitter_vias", {
  id: int("id").autoincrement().primaryKey(),
  splitterId: int("splitterId").notNull(),         // FK ceo_splitters.id
  ceoId: int("ceoId").notNull(),
  viaNumber: int("viaNumber").notNull(),           // 0=entrada, 1,2,...=saídas
  label: varchar("label", { length: 64 }),
  lossDb: float("lossDb"),                         // perda estimada em dB
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CeoSplitterVia = typeof ceoSplitterVias.$inferSelect;
export type InsertCeoSplitterVia = typeof ceoSplitterVias.$inferInsert;

// ─── Associações de Vias do CEO (fusões entre quaisquer vias) ─────────────────
// Permite associar qualquer via de tubo ou splitter a qualquer outra via.
// sourceType: "tube" | "splitter"  (indica de qual tabela vem a via de origem)
// targetType: "tube" | "splitter"  (indica de qual tabela vem a via de destino)
export const ceoViaAssociations = mysqlTable("ceo_via_associations", {
  id: int("id").autoincrement().primaryKey(),
  ceoId: int("ceoId").notNull(),
  sourceType: mysqlEnum("ceo_assoc_source_type", ["tube", "splitter"]).notNull(),
  sourceViaId: int("sourceViaId").notNull(),       // FK ceo_vias.id ou ceo_splitter_vias.id
  targetType: mysqlEnum("ceo_assoc_target_type", ["tube", "splitter"]).notNull(),
  targetViaId: int("targetViaId").notNull(),       // FK ceo_vias.id ou ceo_splitter_vias.id
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CeoViaAssociation = typeof ceoViaAssociations.$inferSelect;
export type InsertCeoViaAssociation = typeof ceoViaAssociations.$inferInsert;

// ─── SSH Commander ────────────────────────────────────────────────────────────
// Credenciais SSH por equipamento (password encriptado com AES-256)
export const sshCredentials = mysqlTable("ssh_credentials", {
  id: int("id").autoincrement().primaryKey(),
  equipmentId: int("equipmentId").notNull().unique(), // FK equipments.id
  sshUser: varchar("sshUser", { length: 128 }).notNull(),
  sshPasswordEnc: text("sshPasswordEnc").notNull(),   // AES-256-GCM encriptado
  sshPort: int("sshPort").notNull().default(22),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SshCredential = typeof sshCredentials.$inferSelect;
export type InsertSshCredential = typeof sshCredentials.$inferInsert;

// Comandos SSH (cada comando pode ter múltiplas linhas e parâmetros variáveis)
export const sshCommands = mysqlTable("ssh_commands", {
  id: int("id").autoincrement().primaryKey(),
  equipmentId: int("equipmentId").notNull(),          // FK equipments.id
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  commandLines: text("commandLines").notNull(),        // JSON: string[]
  sleepMs: int("sleepMs").notNull().default(300),      // sleep entre linhas (ms)
  confirmMode: mysqlEnum("ssh_confirm_mode", ["none", "auto_y", "auto_n", "manual"]).notNull().default("none"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SshCommand = typeof sshCommands.$inferSelect;
export type InsertSshCommand = typeof sshCommands.$inferInsert;

// Histórico de execuções SSH
export const sshExecutionLog = mysqlTable("ssh_execution_log", {
  id: int("id").autoincrement().primaryKey(),
  equipmentId: int("equipmentId").notNull(),
  commandId: int("commandId"),                         // null se executado ad-hoc
  commandName: varchar("commandName", { length: 128 }).notNull(),
  params: text("params"),                              // JSON: {key: value}
  output: text("output").notNull(),
  success: boolean("success").notNull().default(true),
  executedBy: varchar("executedBy", { length: 128 }),
  executedAt: timestamp("executedAt").defaultNow().notNull(),
});
export type SshExecutionLog = typeof sshExecutionLog.$inferSelect;

// ─── SSH Commander — Dispositivos ─────────────────────────────────────────────
// Dispositivos SSH geridos pelo SSH Commander (independente dos equipamentos do inventário)
export const sshDevices = mysqlTable("ssh_devices", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  host: varchar("host", { length: 255 }).notNull(),
  port: int("port").notNull().default(22),
  username: varchar("username", { length: 100 }).notNull(),
  authType: mysqlEnum("ssh_auth_type", ["password", "key"]).notNull().default("password"),
  password: text("password"),
  privateKey: text("private_key"),
  deviceType: varchar("device_type", { length: 50 }).default("generic"),
  notes: text("notes"),
  createdAt: timestamp("ssh_device_created_at").defaultNow().notNull(),
  updatedAt: timestamp("ssh_device_updated_at").defaultNow().onUpdateNow().notNull(),
});
export type SshDevice = typeof sshDevices.$inferSelect;
export type InsertSshDevice = typeof sshDevices.$inferInsert;

// ─── SSH Commander — Comandos Rápidos ─────────────────────────────────────────
export const sshQuickCommands = mysqlTable("ssh_quick_commands", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  command: text("command").notNull(),
  category: varchar("category", { length: 50 }).default("diagnostico"),
  deviceType: varchar("device_type", { length: 50 }).default("generic"),
  isDangerous: int("is_dangerous").default(0),
  color: varchar("color", { length: 20 }).default("#3B82F6"),
  createdAt: timestamp("ssh_qcmd_created_at").defaultNow().notNull(),
});
export type SshQuickCommand = typeof sshQuickCommands.$inferSelect;
export type InsertSshQuickCommand = typeof sshQuickCommands.$inferInsert;

// ─── SSH Commander — Execuções ────────────────────────────────────────────────
export const sshExecutions = mysqlTable("ssh_executions", {
  id: int("id").autoincrement().primaryKey(),
  deviceId: int("device_id").notNull(),
  commandName: varchar("command_name", { length: 100 }),
  commandText: text("command_text").notNull(),
  output: text("output"),
  status: mysqlEnum("ssh_exec_status", ["success", "error", "timeout"]).default("success"),
  durationMs: int("duration_ms"),
  executedBy: int("executed_by"),
  executedAt: timestamp("ssh_executed_at").defaultNow().notNull(),
});
export type SshExecution = typeof sshExecutions.$inferSelect;

// ─── SSH Commander — BGP Peers ────────────────────────────────────────────────
export const bgpPeers = mysqlTable("bgp_peers", {
  id: int("id").autoincrement().primaryKey(),
  deviceId: int("device_id").notNull(),
  peerIp: varchar("peer_ip", { length: 45 }).notNull(),
  remoteAs: int("remote_as").notNull(),
  description: varchar("description", { length: 200 }),
  peerType: mysqlEnum("bgp_peer_type", ["ebgp", "ibgp"]).default("ebgp"),
  localAs: int("local_as"),
  activateScript: text("activate_script"),
  deactivateScript: text("deactivate_script"),
  notes: text("notes"),
  createdAt: timestamp("bgp_peer_created_at").defaultNow().notNull(),
  updatedAt: timestamp("bgp_peer_updated_at").defaultNow().onUpdateNow().notNull(),
});
export type BgpPeer = typeof bgpPeers.$inferSelect;
export type InsertBgpPeer = typeof bgpPeers.$inferInsert;

// ─── SSH Commander — Comandos por Dispositivo ─────────────────────────────────
// Comandos rápidos específicos de cada dispositivo SSH
export const sshDeviceCommands = mysqlTable("ssh_device_commands", {
  id: int("id").autoincrement().primaryKey(),
  deviceId: int("device_id").notNull(),                  // FK sshDevices.id
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  command: text("command").notNull(),
  category: varchar("category", { length: 50 }).default("diagnostico"),
  isDangerous: int("is_dangerous").default(0),
  color: varchar("color", { length: 20 }).default("#3B82F6"),
  sortOrder: int("sort_order").default(0),
  createdAt: timestamp("ssh_dcmd_created_at").defaultNow().notNull(),
  updatedAt: timestamp("ssh_dcmd_updated_at").defaultNow().onUpdateNow().notNull(),
});
export type SshDeviceCommand = typeof sshDeviceCommands.$inferSelect;
export type InsertSshDeviceCommand = typeof sshDeviceCommands.$inferInsert;

// ─── Monitoramento SNMP de Equipamentos de Rede ───────────────────────────────
// Configuração SNMP por equipamento (switch, roteador, OLT, etc.)
export const networkSnmpConfig = mysqlTable("network_snmp_config", {
  id: int("id").autoincrement().primaryKey(),
  equipmentId: int("equipmentId").notNull().unique().references(() => equipments.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").default(false).notNull(),
  snmpHost: varchar("snmpHost", { length: 128 }),            // IP ou hostname de gerência
  snmpPort: int("snmpPort").default(161),
  snmpVersion: mysqlEnum("net_snmp_version", ["v1", "v2c", "v3"]).default("v2c"),
  snmpCommunity: varchar("snmpCommunity", { length: 128 }),  // Community string (v1/v2c)
  // SNMPv3
  snmpV3User: varchar("snmpV3User", { length: 128 }),
  snmpV3AuthProto: mysqlEnum("net_snmpv3_auth_proto", ["MD5", "SHA"]),
  snmpV3AuthKey: varchar("snmpV3AuthKey", { length: 255 }),
  snmpV3PrivProto: mysqlEnum("net_snmpv3_priv_proto", ["DES", "AES"]),
  snmpV3PrivKey: varchar("snmpV3PrivKey", { length: 255 }),
  pollInterval: int("pollInterval").default(300),            // Intervalo em segundos
  // Alertas
  alertsEnabled: boolean("alertsEnabled").default(false).notNull(),
  alertCpuMax: float("alertCpuMax"),                         // % CPU — acima dispara alerta
  alertMemMax: float("alertMemMax"),                         // % Memória — acima dispara alerta
  alertTempMax: float("alertTempMax"),                       // °C — acima dispara alerta
  // Último poll
  lastPollAt: timestamp("lastPollAt"),
  lastPollError: text("lastPollError"),
  // Últimos valores coletados (cache)
  lastCpuPercent: float("lastCpuPercent"),
  lastMemPercent: float("lastMemPercent"),
  lastTemperature: float("lastTemperature"),
  lastUptimeSeconds: int("lastUptimeSeconds"),
  lastPortCount: int("lastPortCount"),
  createdAt: timestamp("net_snmp_created_at").defaultNow().notNull(),
  updatedAt: timestamp("net_snmp_updated_at").defaultNow().onUpdateNow().notNull(),
});
export type NetworkSnmpConfig = typeof networkSnmpConfig.$inferSelect;
export type InsertNetworkSnmpConfig = typeof networkSnmpConfig.$inferInsert;

// ─── Portas SNMP de Equipamentos de Rede ─────────────────────────────────────
// Portas descobertas via SNMP (IF-MIB) — tráfego e estado
export const networkSnmpPorts = mysqlTable("network_snmp_ports", {
  id: int("id").autoincrement().primaryKey(),
  equipmentId: int("equipmentId").notNull().references(() => equipments.id, { onDelete: "cascade" }),
  ifIndex: int("ifIndex").notNull(),                         // SNMP ifIndex
  ifName: varchar("ifName", { length: 64 }),                 // ex: GigabitEthernet0/1
  ifAlias: varchar("ifAlias", { length: 128 }),              // Descrição/alias configurado
  ifSpeed: int("ifSpeed"),                                   // Velocidade em bps
  ifType: varchar("ifType", { length: 32 }),                 // ethernetCsmacd, opticalChannel, etc.
  // Último estado coletado
  ifOperStatus: mysqlEnum("if_oper_status", ["up", "down", "testing", "unknown", "dormant", "notPresent", "lowerLayerDown"]).default("unknown"),
  ifAdminStatus: mysqlEnum("if_admin_status", ["up", "down", "testing"]).default("up"),
  // Tráfego (bytes/s calculado entre polls)
  lastInBps: float("lastInBps"),                             // bps de entrada
  lastOutBps: float("lastOutBps"),                           // bps de saída
  lastInOctets: bigint("lastInOctets", { mode: "number" }),   // contador bruto entrada (32/64-bit)
  lastOutOctets: bigint("lastOutOctets", { mode: "number" }), // contador bruto saída (32/64-bit)
  // GBIC / Óptica (DOM — Digital Optical Monitoring)
  gbicEnabled: boolean("gbicEnabled").default(false).notNull(),
  lastRxPowerDbm: float("lastRxPowerDbm"),                   // Potência RX em dBm
  lastTxPowerDbm: float("lastTxPowerDbm"),                   // Potência TX em dBm
  lastGbicTemp: float("lastGbicTemp"),                       // Temperatura do GBIC em °C
  lastGbicVoltage: float("lastGbicVoltage"),                 // Tensão do GBIC em V
  // Alertas de sinal óptico
  alertRxMin: float("alertRxMin"),                           // dBm mínimo para RX
  alertRxMax: float("alertRxMax"),                           // dBm máximo para RX
  // Threshold de tráfego
  alertBpsMax: float("alertBpsMax"),                         // bps máximo para alerta de tráfego
  lastPollAt: timestamp("net_port_last_poll_at"),
  createdAt: timestamp("net_port_created_at").defaultNow().notNull(),
  updatedAt: timestamp("net_port_updated_at").defaultNow().onUpdateNow().notNull(),
});
export type NetworkSnmpPort = typeof networkSnmpPorts.$inferSelect;
export type InsertNetworkSnmpPort = typeof networkSnmpPorts.$inferInsert;

// ─── Histórico de Leituras SNMP de Equipamentos de Rede ──────────────────────
export const networkSnmpReadings = mysqlTable("network_snmp_readings", {
  id: int("id").autoincrement().primaryKey(),
  equipmentId: int("equipmentId").notNull().references(() => equipments.id, { onDelete: "cascade" }),
  cpuPercent: float("cpuPercent"),
  memPercent: float("memPercent"),
  temperature: float("temperature"),
  uptimeSeconds: int("uptimeSeconds"),
  collectedAt: timestamp("net_reading_collected_at").defaultNow().notNull(),
});
export type NetworkSnmpReading = typeof networkSnmpReadings.$inferSelect;
export type InsertNetworkSnmpReading = typeof networkSnmpReadings.$inferInsert;

// ─── Histórico de Tráfego por Porta SNMP ─────────────────────────────────────
export const networkPortReadings = mysqlTable("network_port_readings", {
  id: int("id").autoincrement().primaryKey(),
  portId: int("portId").notNull().references(() => networkSnmpPorts.id, { onDelete: "cascade" }),
  equipmentId: int("equipmentId").notNull(),
  inBps: float("inBps"),                                     // bps de entrada
  outBps: float("outBps"),                                   // bps de saída
  rxPowerDbm: float("rxPowerDbm"),                           // Potência RX em dBm
  txPowerDbm: float("txPowerDbm"),                           // Potência TX em dBm
  gbicTemp: float("gbicTemp"),
  collectedAt: timestamp("net_port_reading_at").defaultNow().notNull(),
});
export type NetworkPortReading = typeof networkPortReadings.$inferSelect;
export type InsertNetworkPortReading = typeof networkPortReadings.$inferInsert;

// ─── Alertas SNMP de Equipamentos de Rede ────────────────────────────────────
export const networkSnmpAlerts = mysqlTable("network_snmp_alerts", {
  id: int("id").autoincrement().primaryKey(),
  equipmentId: int("equipmentId").notNull().references(() => equipments.id, { onDelete: "cascade" }),
  portId: int("portId").references(() => networkSnmpPorts.id, { onDelete: "cascade" }),
  alertType: mysqlEnum("net_alert_type", [
    "cpu_high",
    "mem_high",
    "temp_high",
    "port_down",
    "port_up",
    "rx_power_low",
    "rx_power_high",
    "tx_power_low",
    "tx_power_high",
    "snmp_unreachable",
    "traffic_high",
  ]).notNull(),
  severity: mysqlEnum("net_alert_severity", ["info", "warning", "critical"]).notNull().default("warning"),
  message: text("message").notNull(),
  currentValue: float("currentValue"),
  thresholdValue: float("thresholdValue"),
  acknowledgedAt: timestamp("net_alert_ack_at"),
  acknowledgedBy: varchar("acknowledgedBy", { length: 128 }),
  resolvedAt: timestamp("net_alert_resolved_at"),
  createdAt: timestamp("net_alert_created_at").defaultNow().notNull(),
  updatedAt: timestamp("net_alert_updated_at").defaultNow().onUpdateNow().notNull(),
});
export type NetworkSnmpAlert = typeof networkSnmpAlerts.$inferSelect;
export type InsertNetworkSnmpAlert = typeof networkSnmpAlerts.$inferInsert;
