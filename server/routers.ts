import { z } from "zod";
import path from "path";
import fs from "fs";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { TRPCError } from "@trpc/server";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";

// Helper: salva arquivo localmente quando S3 não está disponível
const LOCAL_UPLOADS_DIR = process.env.BACKUP_LOCAL_DIR
  ? path.join(path.dirname(process.env.BACKUP_LOCAL_DIR), "uploads")
  : "/opt/fiberdoc/uploads";

async function uploadFile(buffer: Buffer, key: string, mimeType: string): Promise<string> {
  const hasS3 = !!(process.env.BUILT_IN_FORGE_API_URL && process.env.BUILT_IN_FORGE_API_KEY);
  if (hasS3) {
    const { storagePut } = await import("./storage");
    const { url } = await storagePut(key, buffer, mimeType);
    return url;
  }
  const fname = key.replace(/\//g, "-");
  fs.mkdirSync(LOCAL_UPLOADS_DIR, { recursive: true });
  fs.writeFileSync(path.join(LOCAL_UPLOADS_DIR, fname), buffer);
  return `/api/uploads/${fname}`;
}
import {
  getCeos, getCeoById, createCeo, updateCeo, deleteCeo,
  getTubesByCeo, createCeoTube, updateCeoTube, deleteCeoTube,
  getViasByTube, getViasByCeo, setViaFusion, clearViaFusion, updateVia, setViaFiber,
  getTubesByCto, createCtoTube, updateCtoTube, deleteCtoTube,
  getViasByCtotube, getViasByCto, setCtoViaFusion, clearCtoViaFusion, updateCtoVia, setCtoViaFiber,
} from "./db";
import {
  createConnection,
  createEquipment,
  createFiber,
  createMaintenanceRecord,
  createPort,
  createRoom,
  deleteConnection,
  deleteEquipment,
  deleteFiber,
  deletePort,
  deleteRoom,
  getConnections,
  getDashboardStats,
  getEquipmentById,
  getEquipments,
  getFiberById,
  getFibers,
  getMaintenanceHistory,
  getPortById,
  getPortsByEquipment,
  searchPorts,
  getRoomById,
  getRooms,
  getTopologyData,
  updateConnection,
  updateEquipment,
  updateFiber,
  updatePort,
  updateRoom,
  bulkCreatePorts,
  bulkImportEquipments,
  bulkImportFibers,
  getSlotsByEquipment,
  createSlot,
  updateSlot,
  deleteSlot,
  getAllUsers,
  updateUserRole,
  deleteUser,
  exportFullBackup,
  restoreFromBackup,
  getBackupSchedule,
  upsertBackupSchedule,
  getBackupHistory,
  deleteBackupHistoryEntry,
  getSystemSettings,
  setSystemSettings,
  updateEquipmentImage,
  getOccupancyReport,
  getRoomReport,
  getUserByEmail,
  setUserPassword,
  getUserById,
  listUsersForAdmin,
  getAllPortLinks,
  getTopologyLayout,
  saveTopologyLayout,
  type BackupData,
  type BulkEquipmentRow,
  type BulkFiberRow,
} from "./db";
import { runBackup, calcNextRun } from "./backupScheduler";
import {
  getIpBlocks, getIpBlockById, createIpBlock, updateIpBlock, deleteIpBlock,
  getIpAddressesByBlock, allocateIpAddress, releaseIpAddress, updateIpAddress, deleteIpAddress,
  getIpBlockStats, getIpDashboardSummary, parseCidr,
  getPrimaryIpByEquipment, getPrimaryIpsByEquipments,
  addIpAuditLog, getIpAuditByBlock,
  getInterfacesByEquipment, createInterface, updateInterface, deleteInterface,
} from "./ipdb";
import {
  getPowerSources, getPowerSourceById, createPowerSource, updatePowerSource, deletePowerSource,
  getSnmpAlerts, countActiveSnmpAlerts, acknowledgeSnmpAlert, resolveSnmpAlert,
  getSnmpReadings,
} from "./db";
import { pollSinglePowerSource } from "./snmpPoller";
import { sendTelegramMessage } from "./telegram";
import {
  getTuyaDevices, getTuyaDeviceById, createTuyaDevice, updateTuyaDevice, deleteTuyaDevice,
  getTuyaAccounts, getTuyaAccountById, createTuyaAccount, updateTuyaAccount, deleteTuyaAccount,
  getTuyaReadingsByDevice, getLatestTuyaReadings,
} from "./db";
import { pollSingleTuyaDevice, testTuyaConnection, scheduleTuyaDevice, unscheduleTuyaDevice } from "./tuyaPoller";
import { sgpCacheGet, sgpCacheInvalidateAll, sgpFetch } from "./sgpCache";
import {
  getCtos, getCtoById, createCto, updateCto, deleteCto,
  getMapElements, upsertMapElement, deleteMapElement,
  getMapRoutes, createMapRoute, updateMapRoute, deleteMapRoute,
  getSgpConfig, saveSgpConfig,
  getCtoAlertConfig, saveCtoAlertConfig,
  getCtoAlerts, countActiveCtoAlerts, acknowledgeCtoAlert, resolveCtoAlert, checkAndCreateCtoAlerts,
  addSgpLinkHistory, getSgpLinkHistory,
} from "./db";
import { getRacks, getRackById, createRack, updateRack, deleteRack } from "./db";
import {
  getMapGroups, createMapGroup, updateMapGroup, deleteMapGroup,
  getGroupMembers, addElementToGroup, removeElementFromGroup,
  addRouteToGroup, removeRouteFromGroup,
  getAllElementGroupMemberships, getAllRouteGroupMemberships,
} from "./db";
// ─── Zod Schemas ─────────────────────────────────────────────────────────────
const equipmentTypeEnum = z.enum(["switch", "olt", "dgo", "splitter", "router", "server", "patch_panel", "amplifier", "other"]);
const equipmentStatusEnum = z.enum(["active", "inactive", "maintenance"]);
const portTypeEnum = z.enum(["sc", "lc", "fc", "st", "rj45", "sfp", "sfp_plus", "qsfp", "qsfp28", "qsfp_dd", "cfp", "cfp2", "cfp4", "gpon", "xgspon", "dag", "other"]);
const portSpeedEnum = z.enum(["1g", "10g", "25g", "40g", "100g", "400g", "other"]);
const portStatusEnum = z.enum(["free", "occupied", "reserved", "faulty"]);
const fiberColorEnum = z.enum(["blue", "orange", "green", "brown", "slate", "white", "red", "black", "yellow", "violet", "rose", "aqua"]);
const fiberTypeEnum = z.enum(["single_mode", "multi_mode", "armored", "aerial", "underground"]);
const fiberStatusEnum = z.enum(["active", "inactive", "reserved", "faulty"]);
const connectionTypeEnum = z.enum(["direct", "spliced", "patch", "cross_connect"]);
const connectionStatusEnum = z.enum(["active", "inactive", "testing"]);
const entityTypeEnum = z.enum(["equipment", "fiber", "port", "connection", "room"]);
const actionEnum = z.enum(["created", "updated", "deleted", "maintenance", "repaired", "inspected"]);

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Rooms ─────────────────────────────────────────────────────────────────
  rooms: router({
    list: publicProcedure.query(() => getRooms()),

    byId: publicProcedure.input(z.object({ id: z.number() })).query(({ input }) => getRoomById(input.id)),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        type: z.enum(["datacenter", "noc", "pop", "cabinet", "outdoor", "other"]).optional(),
        description: z.string().optional(),
        location: z.string().optional(),
        address: z.string().optional(),
        floor: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await createRoom(input as any);
        await createMaintenanceRecord({
          entityType: "room", entityId: 0, action: "created",
          description: `Sala "${input.name}" criada`, performedBy: ctx.user.name ?? undefined, userId: ctx.user.id,
        });
        return result;
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        type: z.enum(["datacenter", "noc", "pop", "cabinet", "outdoor", "other"]).optional(),
        description: z.string().optional(),
        location: z.string().optional(),
        address: z.string().optional(),
        floor: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await updateRoom(id, data);
        await createMaintenanceRecord({
          entityType: "room", entityId: id, action: "updated",
          description: `Sala #${id} atualizada`, performedBy: ctx.user.name ?? undefined, userId: ctx.user.id,
        });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await deleteRoom(input.id);
        await createMaintenanceRecord({
          entityType: "room", entityId: input.id, action: "deleted",
          description: `Sala #${input.id} removida`, performedBy: ctx.user.name ?? undefined, userId: ctx.user.id,
        });
        return { success: true };
      }),
  }),

  // ─── Equipments ────────────────────────────────────────────────────────────
  equipments: router({
    list: publicProcedure
      .input(z.object({
        search: z.string().optional(),
        type: z.string().optional(),
        roomId: z.number().optional(),
        status: z.string().optional(),
        ipSearch: z.string().optional(),
      }).optional())
      .query(({ input }) => getEquipments(input?.search, input?.type, input?.roomId, input?.status, input?.ipSearch)),

    byId: publicProcedure.input(z.object({ id: z.number() })).query(({ input }) => getEquipmentById(input.id)),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        type: equipmentTypeEnum,
        model: z.string().optional(),
        manufacturer: z.string().optional(),
        serialNumber: z.string().optional(),
        roomId: z.number().optional(),
        rack: z.string().optional(),
        rackPosition: z.string().optional(),
        rackUnits: z.number().int().min(1).max(50).optional(),
        ipAddress: z.string().optional(),
        macAddress: z.string().optional(),
        totalPorts: z.number().optional(),
        notes: z.string().optional(),
        status: equipmentStatusEnum.optional(),
        autoCreatePorts: z.boolean().optional(),
        portType: portTypeEnum.optional(),
        imageUrl: z.string().optional(),
        powerType: z.enum(["ac", "dc"]).optional(),
        powerSource: z.enum(["rectifier", "inverter", "ups", "grid", "other"]).optional(),
        powerSourceLabel: z.string().optional(),
        powerSourceId: z.number().optional().nullable(),
        voltage: z.number().optional().nullable(),
        powerConsumptionW: z.number().optional().nullable(),
        // Campos de rede
        vlan: z.number().int().min(1).max(4094).optional().nullable(),
        interfaceIp: z.string().optional().nullable(),
        ipBlockId: z.number().optional().nullable(),
        serviceDescription: z.string().max(255).optional().nullable(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { autoCreatePorts, portType, ...equipData } = input;
        await createEquipment(equipData);
        const newEquip = await getEquipments(input.name);
        const created = newEquip[0];
        if (autoCreatePorts && created && input.totalPorts && input.totalPorts > 0) {
          await bulkCreatePorts(created.id, input.totalPorts, portType ?? "lc");
        }
        await createMaintenanceRecord({
          entityType: "equipment", entityId: created?.id ?? 0, action: "created",
          description: `Equipamento "${input.name}" (${input.type}) criado`, performedBy: ctx.user.name ?? undefined, userId: ctx.user.id,
        });
        return created;
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        type: equipmentTypeEnum.optional(),
        model: z.string().optional(),
        manufacturer: z.string().optional(),
        serialNumber: z.string().optional(),
        roomId: z.number().optional(),
        rack: z.string().optional(),
        rackPosition: z.string().optional(),
        rackUnits: z.number().int().min(1).max(50).optional().nullable(),
        ipAddress: z.string().optional(),
        macAddress: z.string().optional(),
        totalPorts: z.number().optional(),
        notes: z.string().optional(),
        status: equipmentStatusEnum.optional(),
        imageUrl: z.string().optional(),
        powerType: z.enum(["ac", "dc"]).optional().nullable(),
        powerSource: z.enum(["rectifier", "inverter", "ups", "grid", "other"]).optional().nullable(),
        powerSourceLabel: z.string().optional().nullable(),
        powerSourceId: z.number().optional().nullable(),
        voltage: z.number().optional().nullable(),
        powerConsumptionW: z.number().optional().nullable(),
        // Campos de rede
        vlan: z.number().int().min(1).max(4094).optional().nullable(),
        interfaceIp: z.string().optional().nullable(),
        ipBlockId: z.number().optional().nullable(),
        serviceDescription: z.string().max(255).optional().nullable(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await updateEquipment(id, data);
        await createMaintenanceRecord({
          entityType: "equipment", entityId: id, action: "updated",
          description: `Equipamento #${id} atualizado`, performedBy: ctx.user.name ?? undefined, userId: ctx.user.id,
        });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await deleteEquipment(input.id);
        await createMaintenanceRecord({
          entityType: "equipment", entityId: input.id, action: "deleted",
          description: `Equipamento #${input.id} removido`, performedBy: ctx.user.name ?? undefined, userId: ctx.user.id,
        });
        return { success: true };
      }),
    uploadImage: protectedProcedure
      .input(z.object({
        base64: z.string(),
        mimeType: z.string().default("image/jpeg"),
        fileName: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const buffer = Buffer.from(input.base64, "base64");
        const ext = input.mimeType.split("/")[1] ?? "jpg";
        const suffix = Math.random().toString(36).slice(2, 8);
        const key = `equipment-images/${suffix}.${ext}`;
        const url = await uploadFile(buffer, key, input.mimeType);
        return { url };
      }),
  }),
  // ─── Portss ─────────────────────────────────────────────────────────────────
  ports: router({
    byEquipment: publicProcedure.input(z.object({ equipmentId: z.number() })).query(({ input }) => getPortsByEquipment(input.equipmentId)),
    byId: publicProcedure.input(z.object({ id: z.number() })).query(({ input }) => getPortById(input.id)),
    allLinks: publicProcedure.query(() => getAllPortLinks()),

    create: protectedProcedure
      .input(z.object({
        equipmentId: z.number(),
        portNumber: z.string().min(1),
        label: z.string().optional(),
        type: portTypeEnum.optional(),
        speed: portSpeedEnum.optional(),
        status: portStatusEnum.optional(),
        notes: z.string().optional(),
        sortOrder: z.number().optional(),
        connectedToEquipmentId: z.number().optional().nullable(),
        connectedToPortId: z.number().optional().nullable(),
      }))
      .mutation(async ({ input, ctx }) => {
        const newPort = await createPort(input);
        // Vínculo bidirecional: se a porta destino foi especificada, atualizar a porta destino para apontar de volta
        if (input.connectedToPortId && newPort) {
          const destPort = await getPortById(input.connectedToPortId);
          if (destPort) {
            await updatePort(input.connectedToPortId, {
              connectedToEquipmentId: input.equipmentId,
              connectedToPortId: (newPort as any).insertId ?? (newPort as any).id ?? undefined,
            });
          }
        }
        await createMaintenanceRecord({
          entityType: "port", entityId: input.equipmentId, action: "created",
          description: `Porta "${input.portNumber}" criada no equipamento #${input.equipmentId}`, performedBy: ctx.user.name ?? undefined, userId: ctx.user.id,
        });
        return { success: true };
      }),

    bulkCreate: protectedProcedure
      .input(z.object({
        equipmentId: z.number(),
        count: z.number().min(1).max(256),
        type: portTypeEnum.optional(),
        speed: portSpeedEnum.optional(),
        slotId: z.number().optional(),
        startIndex: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await bulkCreatePorts(input.equipmentId, input.count, input.type ?? "lc", input.speed ?? undefined, input.slotId ?? undefined, input.startIndex ?? undefined);
        const slotInfo = input.slotId ? ` no Slot #${input.slotId}` : "";
        await createMaintenanceRecord({
          entityType: "port", entityId: input.equipmentId, action: "created",
          description: `${input.count} portas criadas em lote no equipamento #${input.equipmentId}${slotInfo}`, performedBy: ctx.user.name ?? undefined, userId: ctx.user.id,
        });
        return { success: true };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        portNumber: z.string().min(1).optional(),
        label: z.string().optional(),
        type: portTypeEnum.optional(),
        speed: portSpeedEnum.optional(),
        status: portStatusEnum.optional(),
        notes: z.string().optional(),
        sortOrder: z.number().optional(),
        connectedToEquipmentId: z.number().optional().nullable(),
        connectedToPortId: z.number().optional().nullable(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        // Obter estado anterior para gerenciar vínculo bidirecional
        const prevPort = await getPortById(id);
        await updatePort(id, data);
        // Se o connectedToPortId mudou, atualizar o vínculo bidirecional
        if ("connectedToPortId" in data) {
          const prevLinkedId = prevPort?.connectedToPortId;
          const newLinkedId = data.connectedToPortId ?? null;
          // Remover vínculo da porta anterior (se existia e mudou)
          if (prevLinkedId && prevLinkedId !== newLinkedId) {
            const prevDest = await getPortById(prevLinkedId);
            if (prevDest && prevDest.connectedToPortId === id) {
              await updatePort(prevLinkedId, { connectedToEquipmentId: null, connectedToPortId: null });
            }
          }
          // Criar vínculo na porta destino (se foi definida)
          if (newLinkedId) {
            const destPort = await getPortById(newLinkedId);
            if (destPort) {
              // Obter o equipmentId da porta atual
              const currentPort = await getPortById(id);
              await updatePort(newLinkedId, {
                connectedToEquipmentId: currentPort?.equipmentId ?? null,
                connectedToPortId: id,
              });
            }
          }
        }
        await createMaintenanceRecord({
          entityType: "port", entityId: id, action: "updated",
          description: `Porta #${id} atualizada`, performedBy: ctx.user.name ?? undefined, userId: ctx.user.id,
        });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        // Remover vínculo bidirecional antes de deletar
        const portToDelete = await getPortById(input.id);
        if (portToDelete?.connectedToPortId) {
          const destPort = await getPortById(portToDelete.connectedToPortId);
          if (destPort && destPort.connectedToPortId === input.id) {
            await updatePort(portToDelete.connectedToPortId, { connectedToEquipmentId: null, connectedToPortId: null });
          }
        }
        await deletePort(input.id);
        return { success: true };
      }),
    search: publicProcedure
      .input(z.object({ query: z.string().min(1), limit: z.number().optional() }))
      .query(({ input }) => searchPorts(input.query, input.limit ?? 50)),
  }),

  // ─── Slots ─────────────────────────────────────────────────────────────────
  slots: router({
    byEquipment: publicProcedure
      .input(z.object({ equipmentId: z.number() }))
      .query(({ input }) => getSlotsByEquipment(input.equipmentId)),

    create: protectedProcedure
      .input(z.object({
        equipmentId: z.number(),
        slotNumber: z.string().min(1).max(16),
        label: z.string().optional(),
        portType: z.enum(["sc","lc","fc","st","rj45","sfp","sfp_plus","qsfp","qsfp28","qsfp_dd","cfp","cfp2","cfp4","gpon","xgspon","dag","other"]).optional(),
        speed: z.enum(["1g","10g","25g","40g","100g","400g","other"]).optional(),
        totalPorts: z.number().min(0).max(256).optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await createSlot({
          equipmentId: input.equipmentId,
          slotNumber: input.slotNumber,
          label: input.label ?? null,
          portType: input.portType ?? "lc",
          speed: input.speed ?? null,
          totalPorts: input.totalPorts ?? 0,
          notes: input.notes ?? null,
        });
        await createMaintenanceRecord({
          entityType: "equipment", entityId: input.equipmentId, action: "updated",
          description: `Slot ${input.slotNumber} adicionado ao equipamento #${input.equipmentId}`,
          performedBy: ctx.user.name ?? undefined, userId: ctx.user.id,
        });
        return result;
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        slotNumber: z.string().min(1).max(16).optional(),
        label: z.string().optional(),
        portType: z.enum(["sc","lc","fc","st","rj45","sfp","sfp_plus","qsfp","qsfp28","qsfp_dd","cfp","cfp2","cfp4","gpon","xgspon","dag","other"]).optional(),
        speed: z.enum(["1g","10g","25g","40g","100g","400g","other"]).optional(),
        totalPorts: z.number().min(0).max(256).optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateSlot(id, data);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteSlot(input.id);
        return { success: true };
      }),
  }),

  // ─── Fibers ────────────────────────────────────────────────────────────────
  fibers: router({
    list: publicProcedure
      .input(z.object({
        search: z.string().optional(),
        type: z.string().optional(),
        status: z.string().optional(),
      }).optional())
      .query(({ input }) => getFibers(input?.search, input?.type, input?.status)),

    byId: publicProcedure.input(z.object({ id: z.number() })).query(({ input }) => getFiberById(input.id)),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        originEquipmentId: z.number().optional(),
        originPortId: z.number().optional(),
        destinationEquipmentId: z.number().optional(),
        destinationPortId: z.number().optional(),
        color: fiberColorEnum.optional(),
        type: fiberTypeEnum.optional(),
        lengthMeters: z.number().optional(),
        cableId: z.string().optional(),
        tubeColor: z.string().optional(),
        attenuation: z.number().optional(),
        status: fiberStatusEnum.optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await createFiber(input);
        await createMaintenanceRecord({
          entityType: "fiber", entityId: 0, action: "created",
          description: `Fibra "${input.name}" cadastrada`, performedBy: ctx.user.name ?? undefined, userId: ctx.user.id,
        });
        return { success: true };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        originEquipmentId: z.number().optional(),
        originPortId: z.number().optional(),
        destinationEquipmentId: z.number().optional(),
        destinationPortId: z.number().optional(),
        color: fiberColorEnum.optional(),
        type: fiberTypeEnum.optional(),
        lengthMeters: z.number().optional(),
        cableId: z.string().optional(),
        tubeColor: z.string().optional(),
        attenuation: z.number().optional(),
        status: fiberStatusEnum.optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await updateFiber(id, data);
        await createMaintenanceRecord({
          entityType: "fiber", entityId: id, action: "updated",
          description: `Fibra #${id} atualizada`, performedBy: ctx.user.name ?? undefined, userId: ctx.user.id,
        });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await deleteFiber(input.id);
        await createMaintenanceRecord({
          entityType: "fiber", entityId: input.id, action: "deleted",
          description: `Fibra #${input.id} removida`, performedBy: ctx.user.name ?? undefined, userId: ctx.user.id,
        });
        return { success: true };
      }),
  }),

  // ─── Connections ───────────────────────────────────────────────────────────
  connections: router({
    list: publicProcedure.query(() => getConnections()),

    byId: publicProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => { const all = await getConnections(); return all.find(c => c.id === input.id); }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().optional(),
        sourcePortId: z.number(),
        targetPortId: z.number(),
        fiberId: z.number().optional(),
        type: connectionTypeEnum.optional(),
        status: connectionStatusEnum.optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await createConnection(input);
        await createMaintenanceRecord({
          entityType: "connection", entityId: 0, action: "created",
          description: `Conexão entre porta #${input.sourcePortId} e porta #${input.targetPortId} criada`, performedBy: ctx.user.name ?? undefined, userId: ctx.user.id,
        });
        return { success: true };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        status: connectionStatusEnum.optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await updateConnection(id, data);
        await createMaintenanceRecord({
          entityType: "connection", entityId: id, action: "updated",
          description: `Conexão #${id} atualizada`, performedBy: ctx.user.name ?? undefined, userId: ctx.user.id,
        });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await deleteConnection(input.id);
        await createMaintenanceRecord({
          entityType: "connection", entityId: input.id, action: "deleted",
          description: `Conexão #${input.id} removida`, performedBy: ctx.user.name ?? undefined, userId: ctx.user.id,
        });
        return { success: true };
      }),
  }),

  // ─── Topology ──────────────────────────────────────────────────────────────
  topology: router({
    data: publicProcedure.query(() => getTopologyData()),
    layout: router({
      get: protectedProcedure
        .input(z.object({ roomFilter: z.string().default("all") }))
        .query(({ ctx, input }) => getTopologyLayout(ctx.user.id, input.roomFilter)),
      save: protectedProcedure
        .input(z.object({
          roomFilter: z.string().default("all"),
          nodePositions: z.record(z.string(), z.object({ x: z.number(), y: z.number() })),
          ctrlPoints: z.record(z.string(), z.object({ x: z.number(), y: z.number() })),
        }))
        .mutation(({ ctx, input }) =>
          saveTopologyLayout(ctx.user.id, input.roomFilter, input.nodePositions, input.ctrlPoints)
        ),
    }),
  }),

  // ─── Maintenance History ───────────────────────────────────────────────────
  history: router({
    list: publicProcedure
      .input(z.object({
        entityType: z.string().optional(),
        entityId: z.number().optional(),
        limit: z.number().optional(),
      }).optional())
      .query(({ input }) => getMaintenanceHistory(input?.entityType, input?.entityId, input?.limit)),

    create: protectedProcedure
      .input(z.object({
        entityType: entityTypeEnum,
        entityId: z.number(),
        action: actionEnum,
        description: z.string().min(1),
        performedBy: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await createMaintenanceRecord({ ...input, userId: ctx.user.id, performedBy: input.performedBy ?? ctx.user.name ?? undefined });
        return { success: true };
      }),
  }),

   // ─── Dashboard ─────────────────────────────────────────────────────────────
  dashboard: router({
    stats: publicProcedure.query(() => getDashboardStats()),
  }),

  // ─── CSV Import ────────────────────────────────────────────────────────────
  import: router({
    equipments: protectedProcedure
      .input(z.object({
        rows: z.array(z.object({
          name: z.string().min(1),
          type: equipmentTypeEnum,
          model: z.string().optional(),
          manufacturer: z.string().optional(),
          serialNumber: z.string().optional(),
          rack: z.string().optional(),
          rackPosition: z.string().optional(),
          ipAddress: z.string().optional(),
          macAddress: z.string().optional(),
          totalPorts: z.number().optional(),
          status: equipmentStatusEnum.optional(),
          notes: z.string().optional(),
          roomName: z.string().optional(),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        return bulkImportEquipments(
          input.rows as BulkEquipmentRow[],
          ctx.user.id,
          ctx.user.name ?? undefined
        );
      }),

    fibers: protectedProcedure
      .input(z.object({
        rows: z.array(z.object({
          name: z.string().min(1),
          type: fiberTypeEnum.optional(),
          color: fiberColorEnum.optional(),
          lengthMeters: z.number().optional(),
          cableId: z.string().optional(),
          tubeColor: z.string().optional(),
          attenuation: z.number().optional(),
          status: fiberStatusEnum.optional(),
          notes: z.string().optional(),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        return bulkImportFibers(
          input.rows as BulkFiberRow[],
          ctx.user.id,
          ctx.user.name ?? undefined
        );
      }),
  }),

  // ─── CEO (Caixa de Emenda Óptica) ─────────────────────────────────────────
  ceos: router({
    list: protectedProcedure
      .input(z.object({
        roomId: z.number().optional(),
        status: z.enum(["active", "inactive", "maintenance"]).optional(),
      }))
      .query(async ({ input }) => getCeos(input)),

    byId: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => getCeoById(input.id)),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        location: z.string().optional(),
        roomId: z.number().optional(),
        notes: z.string().optional(),
        status: z.enum(["active", "inactive", "maintenance"]).optional(),
      }))
      .mutation(async ({ input }) => {
        const id = await createCeo({
          name: input.name,
          location: input.location ?? null,
          roomId: input.roomId ?? null,
          notes: input.notes ?? null,
          status: input.status ?? "active",
        });
        return { id };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        location: z.string().optional(),
        roomId: z.number().nullable().optional(),
        notes: z.string().optional(),
        status: z.enum(["active", "inactive", "maintenance"]).optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateCeo(id, data as any);
      }),

     delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => deleteCeo(input.id)),
    mapElement: protectedProcedure
      .input(z.object({ ceoId: z.number() }))
      .query(async ({ input }) => {
        const all = await getMapElements();
        return all.find(e => e.type === 'ceo' && e.referenceId === input.ceoId) ?? null;
      }),
  }),
  // ─── Tubos / Splitters do CEO ─────────────────────────────────────────────
  ceoTubes: router({
    byCeo: protectedProcedure
      .input(z.object({ ceoId: z.number() }))
      .query(async ({ input }) => getTubesByCeo(input.ceoId)),

    create: protectedProcedure
      .input(z.object({
        ceoId: z.number(),
        type: z.enum(["tube", "splitter"]).default("tube"),
        identifier: z.string().min(1),
        totalVias: z.number().min(1).max(256).default(12),
        color: z.string().optional().transform(v => v === "" ? undefined : v),
        notes: z.string().optional().transform(v => v === "" ? undefined : v),
      }))
      .mutation(async ({ input }) => {
        return createCeoTube({
          ceoId: input.ceoId,
          type: input.type,
          identifier: input.identifier,
          totalVias: input.totalVias,
          color: input.color ?? null,
          notes: input.notes ?? null,
        });
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        identifier: z.string().min(1).optional(),
        type: z.enum(["tube", "splitter"]).optional(),
        color: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateCeoTube(id, data as any);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => deleteCeoTube(input.id)),
  }),

  // ─── Vias do CEO ──────────────────────────────────────────────────────────
  ceoVias: router({
    byTube: protectedProcedure
      .input(z.object({ tubeId: z.number() }))
      .query(async ({ input }) => getViasByTube(input.tubeId)),

    byCeo: protectedProcedure
      .input(z.object({ ceoId: z.number() }))
      .query(async ({ input }) => getViasByCeo(input.ceoId)),

    setFusion: protectedProcedure
      .input(z.object({
        viaId: z.number(),
        fusedToTubeId: z.number().nullable(),
        fusedToViaId: z.number().nullable(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        await setViaFusion(input.viaId, input.fusedToTubeId, input.fusedToViaId, input.notes);
      }),

    clearFusion: protectedProcedure
      .input(z.object({ viaId: z.number() }))
      .mutation(async ({ input }) => clearViaFusion(input.viaId)),

    updateLabel: protectedProcedure
      .input(z.object({
        id: z.number(),
        label: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateVia(id, data);
      }),

    setFiber: protectedProcedure
      .input(z.object({
        viaId: z.number(),
        fiberId: z.number().nullable(),
      }))
      .mutation(async ({ input }) => {
        await setViaFiber(input.viaId, input.fiberId);
      }),

    clearFiber: protectedProcedure
      .input(z.object({ viaId: z.number() }))
      .mutation(async ({ input }) => setViaFiber(input.viaId, null)),
  }),
  // ─── CTO Tubos ────────────────────────────────────────────────────────────
  ctoTubes: router({
    byCto: protectedProcedure
      .input(z.object({ ctoId: z.number() }))
      .query(({ input }) => getTubesByCto(input.ctoId)),
    create: protectedProcedure
      .input(z.object({
        ctoId: z.number(),
        identifier: z.string(),
        type: z.enum(["tube", "splitter"]).default("tube"),
        color: z.string().optional().transform(v => v === "" ? undefined : v),
        totalVias: z.number().min(1).max(288).default(12),
        notes: z.string().optional().transform(v => v === "" ? undefined : v),
      }))
      .mutation(async ({ input }) => {
        const result = await createCtoTube(input);
        return result;
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        identifier: z.string().optional(),
        type: z.enum(["tube", "splitter"]).optional(),
        color: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateCtoTube(id, data);
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => deleteCtoTube(input.id)),
  }),
  // ─── CTO Vias ─────────────────────────────────────────────────────────────
  ctoVias: router({
    byTube: protectedProcedure
      .input(z.object({ tubeId: z.number() }))
      .query(({ input }) => getViasByCtotube(input.tubeId)),
    byCto: protectedProcedure
      .input(z.object({ ctoId: z.number() }))
      .query(({ input }) => getViasByCto(input.ctoId)),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        label: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateCtoVia(id, data);
      }),
    setFusion: protectedProcedure
      .input(z.object({
        viaId: z.number(),
        fusedToTubeId: z.number(),
        fusedToViaId: z.number(),
        notes: z.string().optional(),
        label: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        await setCtoViaFusion(input.viaId, input.fusedToTubeId, input.fusedToViaId, input.notes);
        // Se um label foi fornecido (ex: nome do cliente SGP), aplica à via
        if (input.label) {
          await updateCtoVia(input.viaId, { label: input.label });
          // Sincronização bidirecional: aplica o mesmo label à via fundida
          await updateCtoVia(input.fusedToViaId, { label: input.label });
        }
      }),
    clearFusion: protectedProcedure
      .input(z.object({ viaId: z.number() }))
      .mutation(async ({ input }) => clearCtoViaFusion(input.viaId)),
    setFiber: protectedProcedure
      .input(z.object({
        viaId: z.number(),
        fiberId: z.number().nullable(),
      }))
      .mutation(async ({ input }) => {
        await setCtoViaFiber(input.viaId, input.fiberId);
      }),
    clearFiber: protectedProcedure
      .input(z.object({ viaId: z.number() }))
      .mutation(async ({ input }) => setCtoViaFiber(input.viaId, null)),
  }),
  // ─── Gerenciamento de Usuários (apenas admin) ──────────────────────────────
  users: router({
    list: adminProcedure.query(async () => getAllUsers()),

    updateRole: adminProcedure
      .input(z.object({
        userId: z.number(),
        role: z.enum(["admin", "user"]),
      }))
      .mutation(async ({ input, ctx }) => {
        // Impedir que o admin remova seu próprio papel
        if (ctx.user.id === input.userId) {
          throw new Error("Você não pode alterar seu próprio papel.");
        }
        await updateUserRole(input.userId, input.role);
      }),

    remove: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.id === input.userId) {
          throw new Error("Você não pode remover sua própria conta.");
        }
        await deleteUser(input.userId);
      }),
    createLocal: adminProcedure
      .input(z.object({
        name: z.string().min(1, "Nome é obrigatório"),
        email: z.string().email("E-mail inválido"),
        password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
        role: z.enum(["admin", "user"]).default("user"),
      }))
      .mutation(async ({ input }) => {
        const { hash } = await import("bcryptjs");
        // Verificar se e-mail já existe
        const existing = await getUserByEmail(input.email.trim().toLowerCase());
        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: "Já existe um usuário com este e-mail" });
        }
        const passwordHash = await hash(input.password, 12);
        const openId = `local:${input.email.trim().toLowerCase()}`;
        const { getDb } = await import("./db");
        const { users: usersTable } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const dbConn = await getDb();
        if (!dbConn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        // Inserir usuário com senha e mustChangePassword=true
        await dbConn.insert(usersTable).values({
          openId,
          name: input.name.trim(),
          email: input.email.trim().toLowerCase(),
          role: input.role,
          loginMethod: "local",
          passwordHash,
          mustChangePassword: true,
          lastSignedIn: new Date(),
        });
        return { success: true };
      }),
    resetPassword: adminProcedure
      .input(z.object({
        userId: z.number(),
        newPassword: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
      }))
      .mutation(async ({ input }) => {
        const { hash } = await import("bcryptjs");
        const passwordHash = await hash(input.newPassword, 12);
        const { getDb } = await import("./db");
        const { users: usersTable } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const dbConn = await getDb();
        if (!dbConn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        await dbConn.update(usersTable)
          .set({ passwordHash, mustChangePassword: true })
          .where(eq(usersTable.id, input.userId));
        return { success: true };
      }),
  }),

  // ─── Backup & Restauração (apenas admin) ───────────────────────────────────
  backup: router({
    export: adminProcedure.query(async () => {
      return exportFullBackup();
    }),

    restore: adminProcedure
      .input(z.object({
        backup: z.object({
          version: z.string(),
          generatedAt: z.string(),
          counts: z.record(z.string(), z.number()),
          data: z.object({
            rooms: z.array(z.any()),
            equipments: z.array(z.any()),
            equipmentSlots: z.array(z.any()),
            ports: z.array(z.any()),
            fibers: z.array(z.any()),
            connections: z.array(z.any()),
            maintenanceHistory: z.array(z.any()),
            ceos: z.array(z.any()),
            ceoTubes: z.array(z.any()),
            ceoVias: z.array(z.any()),
          }),
        }),
      }))
      .mutation(async ({ input }) => {
        return restoreFromBackup(input.backup as BackupData);
      }),

    // Backup manual com upload S3
    runManual: adminProcedure.mutation(async () => {
      return runBackup("manual");
    }),

    // Agendamento
    getSchedule: adminProcedure.query(async () => {
      return getBackupSchedule();
    }),
    saveSchedule: adminProcedure
      .input(z.object({
        enabled: z.boolean(),
        frequency: z.enum(["daily", "weekly", "monthly"]),
        hour: z.number().min(0).max(23),
        dayOfWeek: z.number().min(0).max(6).nullable().optional(),
        dayOfMonth: z.number().min(1).max(28).nullable().optional(),
        retentionDays: z.number().min(1).max(365),
      }))
      .mutation(async ({ input }) => {
        const nextRunAt = calcNextRun(
          input.frequency,
          input.hour,
          input.dayOfWeek ?? null,
          input.dayOfMonth ?? null
        );
        await upsertBackupSchedule({ ...input, nextRunAt });
        return { success: true, nextRunAt };
      }),

    // Histórico
    getHistory: adminProcedure.query(async () => {
      return getBackupHistory(50);
    }),
    deleteHistory: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteBackupHistoryEntry(input.id);
        return { success: true };
      }),
  }),

  // ─── Configurações do Sistema ────────────────────────────────────────────────
  systemConfig: router({
    get: publicProcedure.query(async () => {
      return getSystemSettings();
    }),
    save: adminProcedure
      .input(z.object({
        systemName: z.string().optional(),
        logoUrl: z.string().optional(),
        theme: z.string().optional(),
        capacityAlertThreshold: z.number().min(1).max(100).optional(),
        telegram_bot_token: z.string().optional(),
        telegram_chat_id: z.string().optional(),
        mapDefaultLat: z.number().optional(),
        mapDefaultLng: z.number().optional(),
        mapDefaultZoom: z.number().min(1).max(20).optional(),
      }))
      .mutation(async ({ input }) => {
        const settings: Record<string, string> = {};
        if (input.systemName !== undefined) settings.systemName = input.systemName;
        if (input.logoUrl !== undefined) settings.logoUrl = input.logoUrl;
        if (input.theme !== undefined) settings.theme = input.theme;
        if (input.capacityAlertThreshold !== undefined) settings.capacityAlertThreshold = String(input.capacityAlertThreshold);
        if (input.telegram_bot_token !== undefined) settings.telegram_bot_token = input.telegram_bot_token;
        if (input.telegram_chat_id !== undefined) settings.telegram_chat_id = input.telegram_chat_id;
        if (input.mapDefaultLat !== undefined) settings.mapDefaultLat = String(input.mapDefaultLat);
        if (input.mapDefaultLng !== undefined) settings.mapDefaultLng = String(input.mapDefaultLng);
        if (input.mapDefaultZoom !== undefined) settings.mapDefaultZoom = String(input.mapDefaultZoom);
        await setSystemSettings(settings);
        return { success: true };
      }),
    uploadLogo: adminProcedure
      .input(z.object({
        base64: z.string(),
        mimeType: z.string().default("image/png"),
        filename: z.string().default("logo.png"),
      }))
      .mutation(async ({ input }) => {
        const buffer = Buffer.from(input.base64, "base64");
        const ext = input.filename.split(".").pop() ?? "png";
        const fname = `logo-${Date.now()}.${ext}`;
        // Tentar S3 primeiro; se não disponível, salvar localmente
        const key = `system/${fname}`;
        const url = await uploadFile(buffer, key, input.mimeType);
        await setSystemSettings({ logoUrl: url });
        return { url };
      }),
  }),

  // ─── Relatório de Ocupação ─────────────────────────────────────────────────
  reports: router({
    occupancy: publicProcedure
      .input(z.object({
        roomId: z.number().optional(),
        equipmentId: z.number().optional(),
      }))
      .query(({ input }) => getOccupancyReport(input)),
    byRoom: publicProcedure
      .input(z.object({ roomId: z.number() }))
      .query(({ input }) => getRoomReport(input.roomId)),
  }),

  // ─── Upload de Imagem de Equipamento ────────────────────────────────────────
  equipmentImage: router({
    upload: adminProcedure
      .input(z.object({
        equipmentId: z.number(),
        base64: z.string(),
        mimeType: z.string().default("image/jpeg"),
        filename: z.string().default("equipment.jpg"),
      }))
      .mutation(async ({ input }) => {
        const buffer = Buffer.from(input.base64, "base64");
        const ext = input.filename.split(".").pop() ?? "jpg";
        const key = `equipments/${input.equipmentId}-${Date.now()}.${ext}`;
        const url = await uploadFile(buffer, key, input.mimeType);
        await updateEquipmentImage(input.equipmentId, url);
        return { url };
      }),
    remove: adminProcedure
      .input(z.object({ equipmentId: z.number() }))
      .mutation(async ({ input }) => {
        await updateEquipmentImage(input.equipmentId, null);
        return { success: true };
      }),
  }),

  // ─── Mobile Auth (login por senha) ──────────────────────────────────────────
  mobileAuth: router({
    login: publicProcedure
      .input(z.object({
        email: z.string().email(),
        password: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        const { compare } = await import("bcryptjs");
        const user = await getUserByEmail(input.email);
        if (!user || !user.passwordHash) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário ou senha inválidos" });
        }
        const valid = await compare(input.password, user.passwordHash);
        if (!valid) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário ou senha inválidos" });
        }
        // Gerar JWT para o app mobile
        const { SignJWT } = await import("jose");
        const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? "fallback-secret");
        const token = await new SignJWT({ role: user.role })
          .setProtectedHeader({ alg: "HS256" })
          .setSubject(String(user.id))
          .setIssuer("fiberdoc-mobile")
          .setExpirationTime("30d")
          .sign(secret);
        return {
          token,
          user: { id: user.id, name: user.name, email: user.email, role: user.role },
        };
      }),

    me: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        try {
          const { jwtVerify } = await import("jose");
          const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? "fallback-secret");
          const { payload } = await jwtVerify(input.token, secret);
          const user = await getUserById(payload.userId as number);
          if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });
          return { id: user.id, name: user.name, email: user.email, role: user.role };
        } catch {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Token inválido ou expirado" });
        }
      }),

    setPassword: adminProcedure
      .input(z.object({
        userId: z.number(),
        password: z.string().min(6),
      }))
      .mutation(async ({ input }) => {
        const { hash } = await import("bcryptjs");
        const passwordHash = await hash(input.password, 12);
        await setUserPassword(input.userId, passwordHash);
        return { success: true };
      }),

    listUsers: adminProcedure.query(() => listUsersForAdmin()),
  }),

  // ─── IP DOC ────────────────────────────────────────────────────────────────
  ipDoc: router({
    // Dashboard
    dashboard: protectedProcedure.query(() => getIpDashboardSummary()),

    // Blocos
    listBlocks: protectedProcedure
      .input(z.object({
        type: z.string().optional(),
        status: z.string().optional(),
        roomId: z.number().optional(),
      }).optional())
      .query(({ input }) => getIpBlocks(input ?? {})),

    blockById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getIpBlockById(input.id)),

    createBlock: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        cidr: z.string().min(7),
        gateway: z.string().optional().nullable(),
        dns1: z.string().optional().nullable(),
        dns2: z.string().optional().nullable(),
        vlan: z.number().optional().nullable(),
        type: z.enum(["infrastructure","clients","management","transit","loopback","reserved","other"]).optional(),
        status: z.enum(["active","inactive","reserved"]).optional(),
        description: z.string().optional().nullable(),
        roomId: z.number().optional().nullable(),
        notes: z.string().optional().nullable(),
      }))
      .mutation(async ({ input }) => {
        try {
          const id = await createIpBlock(input);
          return { success: true, id };
        } catch (e: any) {
          throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
        }
      }),

    updateBlock: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        gateway: z.string().optional().nullable(),
        dns1: z.string().optional().nullable(),
        dns2: z.string().optional().nullable(),
        vlan: z.number().optional().nullable(),
        type: z.enum(["infrastructure","clients","management","transit","loopback","reserved","other"]).optional(),
        status: z.enum(["active","inactive","reserved"]).optional(),
        description: z.string().optional().nullable(),
        roomId: z.number().optional().nullable(),
        notes: z.string().optional().nullable(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateIpBlock(id, data);
        return { success: true };
      }),

    deleteBlock: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteIpBlock(input.id);
        return { success: true };
      }),

    parseCidr: protectedProcedure
      .input(z.object({ cidr: z.string() }))
      .query(({ input }) => {
        try { return { success: true, data: parseCidr(input.cidr) }; }
        catch (e: any) { return { success: false, error: e.message }; }
      }),

    // Endereços
    addressesByBlock: protectedProcedure
      .input(z.object({ blockId: z.number() }))
      .query(({ input }) => getIpAddressesByBlock(input.blockId)),

    blockStats: protectedProcedure
      .input(z.object({ blockId: z.number() }))
      .query(({ input }) => getIpBlockStats(input.blockId)),

    allocate: protectedProcedure
      .input(z.object({
        blockId: z.number(),
        address: z.string(),
        status: z.enum(["allocated","reserved","dhcp","free"]).optional(),
        hostname: z.string().optional().nullable(),
        description: z.string().optional().nullable(),
        equipmentId: z.number().optional().nullable(),
        macAddress: z.string().optional().nullable(),
        owner: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await allocateIpAddress(input);
        await addIpAuditLog({
          blockId: input.blockId,
          addressId: id,
          address: input.address,
          action: "allocated",
          newStatus: input.status ?? "allocated",
          hostname: input.hostname ?? null,
          owner: input.owner ?? null,
          equipmentId: input.equipmentId ?? null,
          performedBy: ctx.user.name ?? ctx.user.email ?? null,
          userId: ctx.user.id,
        });
        return { success: true, id };
      }),

    updateAddress: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["free","allocated","reserved","dhcp"]).optional(),
        hostname: z.string().optional().nullable(),
        description: z.string().optional().nullable(),
        equipmentId: z.number().optional().nullable(),
        macAddress: z.string().optional().nullable(),
        owner: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        // Buscar estado anterior para auditoria
        const db = await (await import("./db")).getDb();
        const { ipAddresses: ipAddr } = await import("../drizzle/schema");
        const { eq: eqOp } = await import("drizzle-orm");
        const [prev] = db ? await db.select().from(ipAddr).where(eqOp(ipAddr.id, id)).limit(1) : [];
        await updateIpAddress(id, data);
        if (prev) {
          await addIpAuditLog({
            blockId: prev.blockId,
            addressId: id,
            address: prev.address,
            action: "updated",
            previousStatus: prev.status,
            newStatus: data.status ?? prev.status,
            hostname: data.hostname ?? prev.hostname,
            owner: data.owner ?? prev.owner,
            equipmentId: data.equipmentId ?? prev.equipmentId,
            performedBy: ctx.user.name ?? ctx.user.email ?? null,
            userId: ctx.user.id,
          });
        }
        return { success: true };
      }),

    releaseAddress: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await (await import("./db")).getDb();
        const { ipAddresses: ipAddr } = await import("../drizzle/schema");
        const { eq: eqOp } = await import("drizzle-orm");
        const [prev] = db ? await db.select().from(ipAddr).where(eqOp(ipAddr.id, input.id)).limit(1) : [];
        await releaseIpAddress(input.id);
        if (prev) {
          await addIpAuditLog({
            blockId: prev.blockId,
            addressId: input.id,
            address: prev.address,
            action: "released",
            previousStatus: prev.status,
            newStatus: "free",
            hostname: prev.hostname,
            owner: prev.owner,
            equipmentId: prev.equipmentId,
            performedBy: ctx.user.name ?? ctx.user.email ?? null,
            userId: ctx.user.id,
          });
        }
        return { success: true };
      }),

    deleteAddress: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await (await import("./db")).getDb();
        const { ipAddresses: ipAddr } = await import("../drizzle/schema");
        const { eq: eqOp } = await import("drizzle-orm");
        const [prev] = db ? await db.select().from(ipAddr).where(eqOp(ipAddr.id, input.id)).limit(1) : [];
        if (prev) {
          await addIpAuditLog({
            blockId: prev.blockId,
            addressId: null,
            address: prev.address,
            action: "deleted",
            previousStatus: prev.status,
            hostname: prev.hostname,
            owner: prev.owner,
            equipmentId: prev.equipmentId,
            performedBy: ctx.user.name ?? ctx.user.email ?? null,
            userId: ctx.user.id,
          });
        }
        await deleteIpAddress(input.id);
        return { success: true };
      }),

    importCsv: protectedProcedure
      .input(z.object({
        blockId: z.number(),
        rows: z.array(z.object({
          address: z.string().min(7),
          hostname: z.string().optional().nullable(),
          owner: z.string().optional().nullable(),
          mac: z.string().optional().nullable(),
          description: z.string().optional().nullable(),
          status: z.enum(["allocated","reserved","dhcp","free"]).optional(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        let imported = 0;
        let skipped = 0;
        const errors: string[] = [];
        for (const row of input.rows) {
          try {
            const id = await allocateIpAddress({
              blockId: input.blockId,
              address: row.address.trim(),
              status: row.status ?? "allocated",
              hostname: row.hostname ?? null,
              owner: row.owner ?? null,
              macAddress: row.mac ?? null,
              description: row.description ?? null,
            });
            await addIpAuditLog({
              blockId: input.blockId,
              addressId: id,
              address: row.address.trim(),
              action: "imported",
              newStatus: row.status ?? "allocated",
              hostname: row.hostname ?? null,
              owner: row.owner ?? null,
              performedBy: ctx.user.name ?? ctx.user.email ?? null,
              userId: ctx.user.id,
              notes: `Importado via CSV`,
            });
            imported++;
          } catch (e: any) {
            skipped++;
            errors.push(`${row.address}: ${e.message}`);
          }
        }
        return { success: true, imported, skipped, errors };
      }),

    primaryByEquipment: protectedProcedure
      .input(z.object({ equipmentId: z.number() }))
      .query(({ input }) => getPrimaryIpByEquipment(input.equipmentId)),

    primaryByEquipments: protectedProcedure
      .input(z.object({ equipmentIds: z.array(z.number()) }))
      .query(({ input }) => getPrimaryIpsByEquipments(input.equipmentIds)),

    auditByBlock: protectedProcedure
      .input(z.object({ blockId: z.number(), limit: z.number().optional() }))
      .query(({ input }) => getIpAuditByBlock(input.blockId, input.limit ?? 100)),

    // ─── Equipment Interfaces ───────────────────────────────────────────────
    interfaces: {
      byEquipment: protectedProcedure
        .input(z.object({ equipmentId: z.number() }))
        .query(({ input }) => getInterfacesByEquipment(input.equipmentId)),

      create: protectedProcedure
        .input(z.object({
          equipmentId: z.number(),
          name: z.string().min(1).max(64),
          vlan: z.number().int().min(1).max(4094).nullable().optional(),
          ipAddress: z.string().max(43).nullable().optional(),
          macAddress: z.string().max(17).nullable().optional(),
          ipBlockId: z.number().nullable().optional(),
          serviceDescription: z.string().max(255).nullable().optional(),
          isPrimary: z.boolean().optional(),
          notes: z.string().nullable().optional(),
        }))
        .mutation(({ input }) => createInterface(input)),

      update: protectedProcedure
        .input(z.object({
          id: z.number(),
          equipmentId: z.number(),
          name: z.string().min(1).max(64).optional(),
          vlan: z.number().int().min(1).max(4094).nullable().optional(),
          ipAddress: z.string().max(43).nullable().optional(),
          macAddress: z.string().max(17).nullable().optional(),
          ipBlockId: z.number().nullable().optional(),
          serviceDescription: z.string().max(255).nullable().optional(),
          isPrimary: z.boolean().optional(),
          notes: z.string().nullable().optional(),
        }))
        .mutation(({ input }) => {
          const { id, ...data } = input;
          return updateInterface(id, data);
        }),

      delete: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(({ input }) => deleteInterface(input.id)),
    },
  }),
  // ─── Fontes de Energia (Power Sources) ────────────────────────────────────
  powerSources: router({
    list: protectedProcedure.query(() => getPowerSources()),
    byId: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getPowerSourceById(input.id)),
    create: adminProcedure
      .input(z.object({
        name: z.string().min(1).max(128),
        type: z.enum(["rectifier", "inverter", "ups", "grid", "generator", "other"]).default("rectifier"),
        manufacturer: z.string().max(128).optional(),
        model: z.string().max(128).optional(),
        roomId: z.number().nullable().optional(),
        location: z.string().max(255).optional(),
        outputVoltage: z.number().optional(),
        outputCurrentMax: z.number().optional(),
        notes: z.string().optional(),
        snmpEnabled: z.boolean().default(false),
        snmpHost: z.string().max(128).optional(),
        snmpPort: z.number().int().default(161),
        snmpVersion: z.enum(["v1", "v2c", "v3"]).default("v2c"),
        snmpCommunity: z.string().max(128).optional(),
        snmpV3User: z.string().max(128).optional(),
        snmpV3AuthProto: z.enum(["MD5", "SHA"]).optional(),
        snmpV3AuthKey: z.string().max(255).optional(),
        snmpV3PrivProto: z.enum(["DES", "AES"]).optional(),
        snmpV3PrivKey: z.string().max(255).optional(),
        oidOutputVoltage: z.string().max(128).optional(),
        oidOutputCurrent: z.string().max(128).optional(),
        oidTemperature: z.string().max(128).optional(),
        oidAlarmStatus: z.string().max(128).optional(),
        oidBatteryLevel: z.string().max(128).optional(),
        oidLoadPercent: z.string().max(128).optional(),
        snmpPollInterval: z.number().int().default(300),
        // Divisores de escala SNMP
        snmpVoltageDivisor: z.number().default(1),
        snmpCurrentDivisor: z.number().default(1),
        snmpTempDivisor: z.number().default(1),
        snmpBatteryDivisor: z.number().default(1),
        // Thresholds de alerta
        alertsEnabled: z.boolean().default(false),
        alertTempMax: z.number().nullable().optional(),
        alertVoltageMin: z.number().nullable().optional(),
        alertVoltageMax: z.number().nullable().optional(),
        alertBatteryMin: z.number().nullable().optional(),
        alertBatteryMax: z.number().nullable().optional(),
        alertCurrentMax: z.number().nullable().optional(),
        alertLoadMax: z.number().nullable().optional(),
        alertAcFailEnabled: z.boolean().default(false),
      }))
      .mutation(({ input }) => createPowerSource(input as any)),
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(128).optional(),
        type: z.enum(["rectifier", "inverter", "ups", "grid", "generator", "other"]).optional(),
        manufacturer: z.string().max(128).nullable().optional(),
        model: z.string().max(128).nullable().optional(),
        roomId: z.number().nullable().optional(),
        location: z.string().max(255).nullable().optional(),
        outputVoltage: z.number().nullable().optional(),
        outputCurrentMax: z.number().nullable().optional(),
        notes: z.string().nullable().optional(),
        snmpEnabled: z.boolean().optional(),
        snmpHost: z.string().max(128).nullable().optional(),
        snmpPort: z.number().int().optional(),
        snmpVersion: z.enum(["v1", "v2c", "v3"]).optional(),
        snmpCommunity: z.string().max(128).nullable().optional(),
        snmpV3User: z.string().max(128).nullable().optional(),
        snmpV3AuthProto: z.enum(["MD5", "SHA"]).nullable().optional(),
        snmpV3AuthKey: z.string().max(255).nullable().optional(),
        snmpV3PrivProto: z.enum(["DES", "AES"]).nullable().optional(),
        snmpV3PrivKey: z.string().max(255).nullable().optional(),
        oidOutputVoltage: z.string().max(128).nullable().optional(),
        oidOutputCurrent: z.string().max(128).nullable().optional(),
        oidTemperature: z.string().max(128).nullable().optional(),
        oidAlarmStatus: z.string().max(128).nullable().optional(),
        oidBatteryLevel: z.string().max(128).nullable().optional(),
        oidLoadPercent: z.string().max(128).nullable().optional(),
        snmpPollInterval: z.number().int().optional(),
        // Divisores de escala SNMP
        snmpVoltageDivisor: z.number().optional(),
        snmpCurrentDivisor: z.number().optional(),
        snmpTempDivisor: z.number().optional(),
        snmpBatteryDivisor: z.number().optional(),
        // Thresholds de alerta
        alertsEnabled: z.boolean().optional(),
        alertTempMax: z.number().nullable().optional(),
        alertVoltageMin: z.number().nullable().optional(),
        alertVoltageMax: z.number().nullable().optional(),
        alertBatteryMin: z.number().nullable().optional(),
        alertBatteryMax: z.number().nullable().optional(),
        alertCurrentMax: z.number().nullable().optional(),
        alertLoadMax: z.number().nullable().optional(),
        alertAcFailEnabled: z.boolean().optional(),
      }))
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return updatePowerSource(id, data as any);
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deletePowerSource(input.id)),
     pollNow: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => pollSinglePowerSource(input.id)),
    readings: protectedProcedure
      .input(z.object({ id: z.number(), hours: z.number().int().min(1).max(168).default(24) }))
      .query(({ input }) => getSnmpReadings(input.id, input.hours)),
  }),
  // ─── Alertas SNMP ──────────────────────────────────────────────────────────
  alerts: router({
    list: protectedProcedure
      .input(z.object({
        powerSourceId: z.number().optional(),
        onlyActive: z.boolean().optional(),
        limit: z.number().int().max(200).optional(),
      }))
      .query(({ input }) => getSnmpAlerts(input)),

    activeCount: protectedProcedure
      .query(() => countActiveSnmpAlerts()),

    acknowledge: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input, ctx }) =>
        acknowledgeSnmpAlert(input.id, ctx.user.name ?? ctx.user.openId)
      ),

    resolve: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => resolveSnmpAlert(input.id)),

    testTelegram: adminProcedure
      .input(z.object({ botToken: z.string(), chatId: z.string() }))
      .mutation(async ({ input }) => {
        const result = await sendTelegramMessage(
          { botToken: input.botToken, chatId: input.chatId },
          `✅ <b>FiberDoc — Teste de notificação</b>\n\nIntegração com Telegram configurada com sucesso!\n🕐 ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`
        );
        if (!result.ok) throw new TRPCError({ code: "BAD_REQUEST", message: result.error ?? "Falha ao enviar" });
        return { ok: true };
      }),
  }),
  // ─── Dispositivos Tuya IoT ─────────────────────────────────────────────────
  tuyaDevices: router({
    list: protectedProcedure.query(() => getTuyaDevices()),
    byId: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getTuyaDeviceById(input.id)),
    create: adminProcedure
      .input(z.object({
        name: z.string().min(1),
        deviceId: z.string().min(1),
        type: z.enum(["temperature_humidity", "temperature", "humidity", "co2", "smoke", "motion", "door", "power_meter", "other"]),
        tuyaAccountId: z.number().optional(),
        roomId: z.number().optional(),
        powerSourceId: z.number().optional(),
        notes: z.string().optional(),
        pollInterval: z.number().int().min(30).max(86400).default(300),
        alertsEnabled: z.boolean().default(false),
        alertTempMax: z.number().optional(),
        alertTempMin: z.number().optional(),
        alertHumidityMax: z.number().optional(),
        alertHumidityMin: z.number().optional(),
        alertCo2Max: z.number().optional(),
        alertPowerMax: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const id = await createTuyaDevice(input as any);
        scheduleTuyaDevice(id, input.pollInterval);
        return { id };
      }),
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        deviceId: z.string().min(1).optional(),
        type: z.enum(["temperature_humidity", "temperature", "humidity", "co2", "smoke", "motion", "door", "power_meter", "other"]).optional(),
        tuyaAccountId: z.number().nullable().optional(),
        roomId: z.number().nullable().optional(),
        powerSourceId: z.number().nullable().optional(),
        notes: z.string().optional(),
        pollInterval: z.number().int().min(30).max(86400).optional(),
        alertsEnabled: z.boolean().optional(),
        alertTempMax: z.number().nullable().optional(),
        alertTempMin: z.number().nullable().optional(),
        alertHumidityMax: z.number().nullable().optional(),
        alertHumidityMin: z.number().nullable().optional(),
        alertCo2Max: z.number().nullable().optional(),
        alertPowerMax: z.number().nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateTuyaDevice(id, data as any);
        if (data.pollInterval !== undefined) {
          scheduleTuyaDevice(id, data.pollInterval);
        }
        return { ok: true };
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        unscheduleTuyaDevice(input.id);
        await deleteTuyaDevice(input.id);
        return { ok: true };
      }),
    pollNow: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => pollSingleTuyaDevice(input.id)),
    readings: protectedProcedure
      .input(z.object({ id: z.number(), hours: z.number().int().min(1).max(168).default(24) }))
      .query(({ input }) => getTuyaReadingsByDevice(input.id, input.hours)),
    latestAll: protectedProcedure
      .query(() => getLatestTuyaReadings()),
    testConnection: adminProcedure
      .input(z.object({ accessId: z.string(), accessSecret: z.string(), region: z.enum(["us", "eu", "cn", "in"]) }))
      .mutation(({ input }) => testTuyaConnection(input)),
  }),
  // ─── Contas Tuya IoT (múltiplas contas) ───────────────────────────────────────────
  tuyaAccounts: router({
    list: protectedProcedure.query(() => getTuyaAccounts()),
    byId: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getTuyaAccountById(input.id)),
    create: adminProcedure
      .input(z.object({
        name: z.string().min(1),
        accessId: z.string().min(1),
        accessSecret: z.string().min(1),
        region: z.enum(["us", "eu", "cn", "in"]).default("us"),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const id = await createTuyaAccount(input);
        return { id };
      }),
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        accessId: z.string().min(1).optional(),
        accessSecret: z.string().min(1).optional(),
        region: z.enum(["us", "eu", "cn", "in"]).optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateTuyaAccount(id, data);
        return { ok: true };
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteTuyaAccount(input.id);
        return { ok: true };
      }),
    testConnection: adminProcedure
      .input(z.object({ accessId: z.string(), accessSecret: z.string(), region: z.enum(["us", "eu", "cn", "in"]) }))
      .mutation(({ input }) => testTuyaConnection(input)),
  }),
  // ─── CTOs ────────────────────────────────────────────────────────────────────
  ctos: router({
    list: protectedProcedure.query(() => getCtos()),
    byId: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getCtoById(input.id)),
    create: adminProcedure
      .input(z.object({
        name: z.string().min(1),
        address: z.string().optional(),
        capacity: z.number().int().min(1).default(8),
        usedPorts: z.number().int().min(0).default(0),
        status: z.enum(["active", "maintenance", "inactive"]).default("active"),
        lat: z.number().optional(),
        lng: z.number().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const id = await createCto(input);
        return { id };
      }),
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        address: z.string().optional(),
        capacity: z.number().int().min(1).optional(),
        usedPorts: z.number().int().min(0).optional(),
        status: z.enum(["active", "maintenance", "inactive"]).optional(),
        lat: z.number().optional(),
        lng: z.number().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateCto(id, data);
        return { ok: true };
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteCto(input.id);
        return { ok: true };
      }),
    importCsv: adminProcedure
      .input(z.object({
        rows: z.array(z.object({
          name: z.string().min(1),
          address: z.string().optional(),
          capacity: z.number().int().min(1).default(8),
          usedPorts: z.number().int().min(0).default(0),
          status: z.enum(["active", "maintenance", "inactive"]).default("active"),
          lat: z.number().optional(),
          lng: z.number().optional(),
          notes: z.string().optional(),
        })),
      }))
      .mutation(async ({ input }) => {
        let created = 0;
        const errors: string[] = [];
        for (const row of input.rows) {
          try {
            await createCto(row);
            created++;
          } catch (e: any) {
            errors.push(`${row.name}: ${e.message}`);
          }
        }
        return { created, errors };
      }),
    mapElement: protectedProcedure
      .input(z.object({ ctoId: z.number() }))
      .query(async ({ input }) => {
        const all = await getMapElements();
        return all.find(e => e.type === 'cto' && e.referenceId === input.ctoId) ?? null;
      }),
  }),
  // ─── Mapa de Infraestrutura ───────────────────────────────────────────────────
  infraMap: router({
    elements: protectedProcedure.query(() => getMapElements()),
    routes: protectedProcedure.query(() => getMapRoutes()),
    upsertElement: adminProcedure
      .input(z.object({
        type: z.enum(["ceo", "cto"]),
        referenceId: z.number(),
        lat: z.number(),
        lng: z.number(),
      }))
      .mutation(async ({ input }) => {
        const id = await upsertMapElement(input.type, input.referenceId, input.lat, input.lng);
        return { id };
      }),
    deleteElement: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteMapElement(input.id);
        return { ok: true };
      }),
    createRoute: adminProcedure
      .input(z.object({
        name: z.string().optional(),
        fromElementId: z.number().optional(),
        toElementId: z.number().optional(),
        fromTubeId: z.number().nullable().optional(),
        toTubeId: z.number().nullable().optional(),
        fiberCount: z.number().int().min(1).default(12),
        cableType: z.string().default("FO"),
        color: z.string().default("#22d3ee"),
        path: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const id = await createMapRoute(input as any);
        return { id };
      }),
    updateRoute: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        fiberCount: z.number().int().min(1).optional(),
        cableType: z.string().optional(),
        color: z.string().optional(),
        path: z.string().optional(),
        notes: z.string().optional(),
        fromElementId: z.number().nullable().optional(),
        toElementId: z.number().nullable().optional(),
        fromTubeId: z.number().nullable().optional(),
        toTubeId: z.number().nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateMapRoute(id, data);
        return { ok: true };
      }),
    deleteRoute: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteMapRoute(input.id);
        return { ok: true };
      }),
    exportKml: protectedProcedure
      .input(z.object({
        format: z.enum(["kml", "kmz"]).default("kml"),
        // Seleção granular: se omitido, exporta tudo
        elementIds: z.array(z.number()).optional(),   // IDs de mapElements
        routeIds: z.array(z.number()).optional(),     // IDs de mapRoutes
        includeFibers: z.boolean().default(false),    // incluir fibras ópticas como linhas
        fiberIds: z.array(z.number()).optional(),     // IDs de fibras específicas
      }))
      .query(async ({ input }) => {
        const dbMod = await import("./db");
        const [allElements, allRoutes, allCtos, allCeos, allFibers] = await Promise.all([
          getMapElements(),
          getMapRoutes(),
          getCtos(),
          dbMod.getCeos(),
          input.includeFibers ? dbMod.getFibers() : Promise.resolve([]),
        ]);
        // Filtrar elementos e rotas conforme seleção
        const elements = input.elementIds?.length
          ? (allElements as any[]).filter((e: any) => input.elementIds!.includes(e.id))
          : allElements as any[];
        const routes = input.routeIds?.length
          ? (allRoutes as any[]).filter((r: any) => input.routeIds!.includes(r.id))
          : allRoutes as any[];
        const fibers = input.fiberIds?.length
          ? (allFibers as any[]).filter((f: any) => input.fiberIds!.includes(f.id))
          : allFibers as any[];
        const ctoMap = new Map(allCtos.map((c: any) => [c.id, c]));
        const ceoMap = new Map((allCeos as any[]).map((c: any) => [c.id, c]));
        const placemarks = elements.map((el: any) => {
          const isCtO = el.type === "cto";
          const ref = isCtO ? ctoMap.get(el.referenceId) : ceoMap.get(el.referenceId);
          const name = ref?.name ?? (isCtO ? `CTO-${el.referenceId}` : `CEO-${el.referenceId}`);
          const status = ref?.status ?? "active";
          const iconColor = status === "active" ? "ff00ff00" : status === "maintenance" ? "ff00ffff" : "ff0000ff";
          return `  <Placemark>
    <name>${name}</name>
    <description>${isCtO ? `CTO — Capacidade: ${ref?.capacity ?? 0} portas, Usadas: ${ref?.usedPorts ?? 0}` : "CEO"}</description>
    <Style><IconStyle><color>${iconColor}</color><scale>1.2</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/${isCtO ? "square" : "donut"}.png</href></Icon></IconStyle></Style>
    <Point><coordinates>${el.lng},${el.lat},0</coordinates></Point>
  </Placemark>`;
        }).join("\n");
        const linemarks = routes.map((r: any) => {
          const fromEl = elements.find((e: any) => e.id === r.fromElementId);
          const toEl = elements.find((e: any) => e.id === r.toElementId);
          if (!fromEl || !toEl) return "";
          let coords = `${fromEl.lng},${fromEl.lat},0`;
          if (r.path) {
            try {
              const pts = JSON.parse(r.path) as { lat: number; lng: number }[];
              coords += " " + pts.map(p => `${p.lng},${p.lat},0`).join(" ");
            } catch {}
          }
          coords += ` ${toEl.lng},${toEl.lat},0`;
          const color = (r.color ?? "#22d3ee").replace("#", "ff");
          return `  <Placemark>
    <name>${r.name ?? `Cabo ${r.id}`}</name>
    <description>${r.cableType ?? "FO"} — ${r.fiberCount ?? 12} fibras${r.notes ? " — " + r.notes : ""}</description>
    <Style><LineStyle><color>${color}</color><width>3</width></LineStyle></Style>
    <LineString><tessellate>1</tessellate><coordinates>${coords}</coordinates></LineString>
  </Placemark>`;
        }).filter(Boolean).join("\n");
        // Folder de fibras ópticas (apenas as que têm coordenadas de origem/destino via CEO)
        const fibermarks = fibers.map((f: any) => {
          // Fibras podem ter ceos associados — usar nome e status
          const name = f.name ?? `Fibra-${f.id}`;
          const color = f.status === "active" ? "ff00ff00" : f.status === "maintenance" ? "ff00ffff" : "ff0000ff";
          // Se não há coordenadas de rota, pular
          if (!f.path) return "";
          let coords = "";
          try { coords = (JSON.parse(f.path) as { lat: number; lng: number }[]).map(p => `${p.lng},${p.lat},0`).join(" "); } catch { return ""; }
          if (!coords) return "";
          return `  <Placemark>
    <name>${name}</name>
    <description>${f.type ?? "FO"} — ${f.fiberCount ?? ""} fibras — Status: ${f.status ?? "active"}</description>
    <Style><LineStyle><color>${color}</color><width>2</width></LineStyle></Style>
    <LineString><tessellate>1</tessellate><coordinates>${coords}</coordinates></LineString>
  </Placemark>`;
        }).filter(Boolean).join("\n");
        const fiberFolder = fibermarks ? `  <Folder><name>Fibras Ópticas</name>\n${fibermarks}\n  </Folder>` : "";
        const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>FiberDoc — Infraestrutura de Rede</name>
  <description>Exportado em ${new Date().toLocaleString("pt-BR")}</description>
  <Folder><name>Equipamentos</name>
${placemarks}
  </Folder>
  <Folder><name>Cabos</name>
${linemarks}
  </Folder>
${fiberFolder}
</Document>
</kml>`;
        // KMZ = ZIP contendo doc.kml
        if (input.format === "kmz") {
          const { createHash } = await import("crypto");
          // Criar ZIP simples (sem compressão) com o KML
          const kmlBuf = Buffer.from(kml, "utf-8");
          const fileName = "doc.kml";
          const fileNameBuf = Buffer.from(fileName);
          // Local file header
          const localHeader = Buffer.alloc(30 + fileNameBuf.length);
          localHeader.writeUInt32LE(0x04034b50, 0); // signature
          localHeader.writeUInt16LE(20, 4); // version needed
          localHeader.writeUInt16LE(0, 6); // flags
          localHeader.writeUInt16LE(0, 8); // compression: stored
          localHeader.writeUInt16LE(0, 10); // mod time
          localHeader.writeUInt16LE(0, 12); // mod date
          const crc = (() => { let c = 0xFFFFFFFF; for (let i = 0; i < kmlBuf.length; i++) { c ^= kmlBuf[i]; for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xEDB88320 : 0); } return (c ^ 0xFFFFFFFF) >>> 0; })();
          localHeader.writeUInt32LE(crc, 14); // crc32
          localHeader.writeUInt32LE(kmlBuf.length, 18); // compressed size
          localHeader.writeUInt32LE(kmlBuf.length, 22); // uncompressed size
          localHeader.writeUInt16LE(fileNameBuf.length, 26); // filename length
          localHeader.writeUInt16LE(0, 28); // extra field length
          fileNameBuf.copy(localHeader, 30);
          // Central directory
          const centralDir = Buffer.alloc(46 + fileNameBuf.length);
          centralDir.writeUInt32LE(0x02014b50, 0); // signature
          centralDir.writeUInt16LE(20, 4); // version made by
          centralDir.writeUInt16LE(20, 6); // version needed
          centralDir.writeUInt16LE(0, 8); // flags
          centralDir.writeUInt16LE(0, 10); // compression
          centralDir.writeUInt16LE(0, 12); // mod time
          centralDir.writeUInt16LE(0, 14); // mod date
          centralDir.writeUInt32LE(crc, 16); // crc32
          centralDir.writeUInt32LE(kmlBuf.length, 20); // compressed size
          centralDir.writeUInt32LE(kmlBuf.length, 24); // uncompressed size
          centralDir.writeUInt16LE(fileNameBuf.length, 28); // filename length
          centralDir.writeUInt16LE(0, 30); // extra field length
          centralDir.writeUInt16LE(0, 32); // comment length
          centralDir.writeUInt16LE(0, 34); // disk number start
          centralDir.writeUInt16LE(0, 36); // internal attributes
          centralDir.writeUInt32LE(0, 38); // external attributes
          centralDir.writeUInt32LE(0, 42); // relative offset of local header
          fileNameBuf.copy(centralDir, 46);
          // End of central directory
          const eocd = Buffer.alloc(22);
          eocd.writeUInt32LE(0x06054b50, 0); // signature
          eocd.writeUInt16LE(0, 4); // disk number
          eocd.writeUInt16LE(0, 6); // disk with central dir
          eocd.writeUInt16LE(1, 8); // entries on disk
          eocd.writeUInt16LE(1, 10); // total entries
          eocd.writeUInt32LE(centralDir.length, 12); // central dir size
          eocd.writeUInt32LE(localHeader.length + kmlBuf.length, 16); // central dir offset
          eocd.writeUInt16LE(0, 20); // comment length
          const kmzBuf = Buffer.concat([localHeader, kmlBuf, centralDir, eocd]);
          return { kml, kmzBase64: kmzBuf.toString("base64"), format: "kmz" };
        }
        return { kml, kmzBase64: null, format: input.format };
      }),
    exportCables: protectedProcedure
      .input(z.object({
        format: z.enum(["csv", "pdf"]).default("csv"),
      }))
      .query(async ({ input }) => {
        const dbMod = await import("./db");
        const [allRoutes, allElements, allCtos, allCeos] = await Promise.all([
          getMapRoutes(),
          getMapElements(),
          dbMod.getCtos(),
          dbMod.getCeos(),
        ]);

        // Calcular comprimento do traçado em km
        const haversine = (a: {lat:number;lng:number}, b: {lat:number;lng:number}) => {
          const R = 6371;
          const dLat = (b.lat - a.lat) * Math.PI / 180;
          const dLng = (b.lng - a.lng) * Math.PI / 180;
          const s = Math.sin(dLat/2)**2 + Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2;
          return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1-s));
        };
        const calcLen = (path: {lat:number;lng:number}[]) => {
          let d = 0;
          for (let i = 1; i < path.length; i++) d += haversine(path[i-1], path[i]);
          return d;
        };

        const rows = (allRoutes as any[]).map((r: any) => {
          const fromEl = (allElements as any[]).find((e: any) => e.id === r.fromElementId);
          const toEl   = (allElements as any[]).find((e: any) => e.id === r.toElementId);
          const fromRef = fromEl?.type === "cto"
            ? (allCtos as any[]).find((c: any) => c.id === fromEl?.referenceId)
            : (allCeos as any[]).find((c: any) => c.id === fromEl?.referenceId);
          const toRef = toEl?.type === "cto"
            ? (allCtos as any[]).find((c: any) => c.id === toEl?.referenceId)
            : (allCeos as any[]).find((c: any) => c.id === toEl?.referenceId);
          let path: {lat:number;lng:number}[] = [];
          try { if (r.path) path = JSON.parse(r.path); } catch {}
          const lenKm = path.length >= 2 ? calcLen(path) : null;
          return {
            id: r.id,
            nome: r.name ?? `Cabo ${r.id}`,
            tipo: r.cableType ?? "FO",
            fibras: r.fiberCount ?? 0,
            de: fromRef?.name ?? (fromEl ? `${fromEl.type?.toUpperCase()}-${fromEl.referenceId}` : "—"),
            para: toRef?.name ?? (toEl ? `${toEl.type?.toUpperCase()}-${toEl.referenceId}` : "—"),
            comprimento_km: lenKm != null ? lenKm.toFixed(3) : "—",
            status: (!fromEl || !toEl) ? "Solto" : "Conectado",
            pontos: path.length,
            notas: r.notes ?? "",
          };
        });

        if (input.format === "csv") {
          const header = ["ID","Nome","Tipo","Fibras","De","Para","Comprimento (km)","Status","Pontos no Traçado","Notas"];
          const lines = rows.map((r: any) => [
            r.id, `"${r.nome}"`, r.tipo, r.fibras,
            `"${r.de}"`, `"${r.para}"`, r.comprimento_km,
            r.status, r.pontos, `"${r.notas}"`
          ].join(","));
          const csv = [header.join(","), ...lines].join("\n");
          return { format: "csv", csv, rows: null };
        }

        // PDF: retorna dados para o frontend gerar
        return { format: "pdf", csv: null, rows };
      }),
    routesOccupancy: protectedProcedure
      .query(async () => {
        const dbMod = await import("./db");
        return dbMod.getRoutesOccupancy();
      }),
    tubesByElement: protectedProcedure
      .input(z.object({ elementId: z.number() }))
      .query(async ({ input }) => {
        const dbMod = await import("./db");
        return dbMod.getTubesByMapElement(input.elementId);
      }),
  }),
  // ─── SGP Config ───────────────────────────────────────────────────────────────
  sgp: router({
    config: protectedProcedure.query(() => getSgpConfig()),
    saveConfig: adminProcedure
      .input(z.object({
        baseUrl: z.string().url(),
        token: z.string().min(1),
        app: z.string().min(1),
        active: z.boolean().default(true),
      }))
      .mutation(async ({ input }) => {
        await saveSgpConfig(input);
        sgpCacheInvalidateAll(); // invalidar cache ao alterar configuração
        return { ok: true };
      }),
    queryClientsByCto: protectedProcedure
      .input(z.object({ ctoName: z.string(), sgpId: z.number().nullable().optional() }))
      .query(async ({ input }) => {
        const cfg = await getSgpConfig();
        if (!cfg || !cfg.active) return { clients: [], error: "SGP não configurado" };
        try {
          const base = cfg.baseUrl.replace(/\/$/, "");
          // Endpoint oficial: /api/fttx/splitter/{cto_id}/onu/all/?signal=1&connection=1
          if (input.sgpId != null) {
            const url = `${base}/api/fttx/splitter/${input.sgpId}/onu/all/`;
            const res = await sgpFetch(url, cfg, {
              extraFields: { signal: "1", connection: "1", address: "1" },
              timeoutMs: 15000,
            });
            if (res.ok) {
              const json = await res.json() as any;
              const onus = Array.isArray(json) ? json : (json?.data ?? json?.results ?? []);
              const clients = onus.map((o: any) => ({
                // Nome do cliente vinculado à ONU
                name: o.service_cliente ?? (o.description?.trim() || null),
                login: o.service_login ?? o.login ?? null,
                // Status: service_status 1=Ativo, connection pode ser "Online"/"Offline"
                status: o.connection ?? (o.service_status === 1 ? "Ativo" : o.service_status != null ? "Inativo" : null),
                phy_addr: o.phy_addr ?? null,          // MAC da ONU
                onu: o.onuid ?? o.id ?? null,           // número da ONU na PON
                slot: o.slot ?? null,
                pon: o.pon ?? null,
                olt: o.olt_name ?? null,
                rx: o.info_rx ?? null,                  // sinal RX ONU (dBm)
                tx: o.info_tx ?? null,                  // sinal TX ONU (dBm)
                olt_rx: o.info_olt_rx ?? null,          // sinal RX na OLT (dBm)
                signal_date: o.info_date ?? null,       // data da última leitura de sinal
                contrato: o.service_contrato ?? null,
                ctoport: o.ctoport ?? null,             // porta da CTO
                raw: o,
              }));
              return { clients, error: null };
            }
            console.log("[SGP queryClientsByCto] onu/all endpoint failed, status:", res.status);
          }
          // Sem sgpId: retornar vazio
          return { clients: [], error: null };
        } catch (e: any) {
          return { clients: [], error: e.message ?? "Erro ao consultar SGP" };
        }
      }),

    // ─── Testar conexão ─────────────────────────────────────────────────────────
    testConnection: adminProcedure
      .mutation(async () => {
        const cfg = await getSgpConfig();
        if (!cfg || !cfg.active) return { ok: false, error: "SGP não configurado" };
        try {
          const base = cfg.baseUrl.replace(/\/$/, "");
          // Testar conexão invalida o cache para forçar dados frescos
          sgpCacheInvalidateAll();
          const res = await sgpFetch(`${base}/api/fttx/splitter/all/`, cfg, { timeoutMs: 8000 });
          if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
          return { ok: true, error: null };
        } catch (e: any) {
          return { ok: false, error: e.message ?? "Erro de conexão" };
        }
      }),

    // ─── Listar CTOs do SGP ───────────────────────────────────────────────────────
    listCtos: protectedProcedure
      .query(async () => {
        const cfg = await getSgpConfig();
        if (!cfg || !cfg.active) return { ctos: [], error: "SGP não configurado" };
        try {
          const base = cfg.baseUrl.replace(/\/$/, "");
          const ctos = await sgpCacheGet("sgp:ctos", async () => {
            const res = await sgpFetch(`${base}/api/fttx/splitter/all/`, cfg, { timeoutMs: 15000 });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json() as any;
            return Array.isArray(data) ? data : (data.results ?? data.data ?? []);
          });
          return { ctos, error: null };
        } catch (e: any) {
          return { ctos: [], error: e.message ?? "Erro ao listar CTOs" };
        }
      }),

    // ─── Sincronizar CTO do SGP para FiberDoc ────────────────────────────────────
    syncCtoFromSgp: adminProcedure
      .input(z.object({
        sgpId: z.number(),
        ident: z.string(),
        note: z.string().optional(),
        lat: z.number().nullable().optional(),
        lng: z.number().nullable().optional(),
        unPorts: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        // Verifica se já existe uma CTO com esse identificador
        const existing = await getCtos();
        const found = existing.find(c => c.name === input.ident || c.sgpId === input.sgpId);
        if (found) return { id: found.id, created: false, message: "CTO já existe no FiberDoc" };
        const id = await createCto({
          name: input.ident,
          sgpId: input.sgpId,
          notes: input.note ?? "",
          lat: input.lat ?? null,
          lng: input.lng ?? null,
          capacity: input.unPorts ?? 8,
          status: "active",
        });
        return { id, created: true, message: "CTO importada com sucesso" };
      }),

    // ─── Criar CTO no SGP ao criar no FiberDoc ────────────────────────────────────
    createCtoInSgp: adminProcedure
      .input(z.object({
        ident: z.string().min(1),
        note: z.string().optional(),
        lat: z.string().optional(),
        lng: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const cfg = await getSgpConfig();
        if (!cfg || !cfg.active) return { ok: false, sgpId: null, error: "SGP não configurado" };
        try {
          const base = cfg.baseUrl.replace(/\/$/, "");
          const createFields: Record<string, string> = { ident: input.ident };
          if (input.note) createFields.note = input.note;
          if (input.lat) createFields.lat = input.lat;
          if (input.lng) createFields.lng = input.lng;
          const res = await sgpFetch(`${base}/api/fttx/splitter/create/`, cfg, {
            method: "POST",
            extraFields: createFields,
            timeoutMs: 10000,
          });
          if (!res.ok) return { ok: false, sgpId: null, error: `HTTP ${res.status}` };
          const data = await res.json() as any;
          const sgpId = data?.id ?? data?.splitter_id ?? null;
          return { ok: true, sgpId, error: null };
        } catch (e: any) {
          return { ok: false, sgpId: null, error: e.message ?? "Erro ao criar CTO no SGP" };
        }
      }),

    // ─── ONUs vinculadas a uma CTO ────────────────────────────────────────────────
    onusByCto: protectedProcedure
      .input(z.object({ sgpCtoId: z.number() }))
      .query(async ({ input }) => {
        const cfg = await getSgpConfig();
        if (!cfg || !cfg.active) return { onus: [], error: "SGP não configurado" };
        try {
          const base = cfg.baseUrl.replace(/\/$/, "");
          const res = await sgpFetch(`${base}/api/fttx/splitter/${input.sgpCtoId}/onu/list/`, cfg, { timeoutMs: 10000 });
          if (!res.ok) return { onus: [], error: `HTTP ${res.status}` };
          const data = await res.json() as any;
          const onus = Array.isArray(data) ? data : (data.results ?? data.data ?? []);
          return { onus, error: null };
        } catch (e: any) {
          return { onus: [], error: e.message ?? "Erro ao listar ONUs" };
        }
      }),

    // ─── Autorizar ONU ────────────────────────────────────────────────────────────
    authorizeOnu: adminProcedure
      .input(z.object({
        oltId: z.number(),
        onu: z.number(),
        slot: z.number(),
        pon: z.number(),
        contrato: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const cfg = await getSgpConfig();
        if (!cfg || !cfg.active) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "SGP não configurado" });
        try {
          const base = cfg.baseUrl.replace(/\/$/, "");
          const res = await sgpFetch(`${base}/api/fttx/olt/${input.oltId}/onu/authorize/`, cfg, {
            method: "POST",
            extraFields: {
              onu: String(input.onu),
              slot: String(input.slot),
              pon: String(input.pon),
              ...(input.contrato ? { contrato: String(input.contrato) } : {}),
            },
            timeoutMs: 15000,
          });
          if (!res.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `HTTP ${res.status}` });
          const data = await res.json();
          return { ok: true, data };
        } catch (e: any) {
          if (e instanceof TRPCError) throw e;
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e.message });
        }
      }),

    // ─── Resetar ONU ─────────────────────────────────────────────────────────────
    resetOnu: adminProcedure
      .input(z.object({
        oltId: z.number(),
        onu: z.number(),
        slot: z.number(),
        pon: z.number(),
      }))
      .mutation(async ({ input }) => {
        const cfg = await getSgpConfig();
        if (!cfg || !cfg.active) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "SGP não configurado" });
        try {
          const base = cfg.baseUrl.replace(/\/$/, "");
          const res = await sgpFetch(`${base}/api/fttx/olt/${input.oltId}/onu/reset/`, cfg, {
            extraFields: { onu: String(input.onu), slot: String(input.slot), pon: String(input.pon) },
            timeoutMs: 15000,
          });
          if (!res.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `HTTP ${res.status}` });
          const data = await res.json();
          return { ok: true, data };
        } catch (e: any) {
          if (e instanceof TRPCError) throw e;
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e.message });
        }
      }),

    // ─── Pesquisar clientes no SGP ────────────────────────────────────────────────
    searchClients: protectedProcedure
      .input(z.object({ query: z.string().min(2) }))
      .query(async ({ input }) => {
        const cfg = await getSgpConfig();
        if (!cfg || !cfg.active) return { clients: [], error: "SGP não configurado" };
        try {
          const base = cfg.baseUrl.replace(/\/$/, "");
          // Tenta endpoint de busca de clientes
          const res = await sgpFetch(`${base}/api/clientes/`, cfg, { extraFields: { q: input.query }, timeoutMs: 8000 });
          if (res.ok) {
            const data = await res.json() as any;
            const clients = Array.isArray(data) ? data : (data.results ?? data.data ?? []);
            return { clients, error: null };
          }
          // Fallback: endpoint de assinante
          const res2 = await sgpFetch(`${base}/api/assinante/`, cfg, { extraFields: { q: input.query }, timeoutMs: 8000 });
          if (res2.ok) {
            const data2 = await res2.json() as any;
            const clients = Array.isArray(data2) ? data2 : (data2.results ?? data2.data ?? []);
            return { clients, error: null };
          }
          return { clients: [], error: `HTTP ${res.status}` };
        } catch (e: any) {
          return { clients: [], error: e.message ?? "Erro ao pesquisar clientes" };
        }
      }),
    // ─── Sincronizar Labels de ONUs ───────────────────────────────────────────────
    syncOnuLabels: adminProcedure
      .input(z.object({ ctoId: z.number(), sgpCtoId: z.number() }))
      .mutation(async ({ input }) => {
        const cfg = await getSgpConfig();
        if (!cfg || !cfg.active) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "SGP não configurado" });
        try {
          // Buscar ONUs da CTO no SGP
          const base = cfg.baseUrl.replace(/\/$/, "");
          const res = await sgpFetch(`${base}/api/fttx/splitter/${input.sgpCtoId}/onu/list/`, cfg, { timeoutMs: 15000 });
          if (!res.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `SGP HTTP ${res.status}` });
          const data = await res.json() as any;
          const onus: any[] = Array.isArray(data) ? data : (data.results ?? data.data ?? []);
          if (onus.length === 0) return { updated: 0, message: "Nenhuma ONU encontrada no SGP para esta CTO" };

          // Buscar tubos e vias da CTO no FiberDoc
          const tubes = await getTubesByCto(input.ctoId);
          const allVias = await getViasByCto(input.ctoId);

          let updated = 0;
          for (const onu of onus) {
            // Tentar identificar a via pela posição/porta da ONU (campo pon, slot, onu)
            const clientName: string = onu.cliente_nome ?? onu.nome ?? onu.login ?? onu.contrato_login ?? "";
            const portaOnu: number | null = onu.onu ?? onu.porta ?? null;
            if (!clientName || portaOnu === null) continue;

            // Procurar via com número correspondente à porta da ONU
            const via = allVias.find((v: any) => v.number === portaOnu && !v.label);
            if (!via) continue;

            // Actualizar label da via com nome do cliente
            await updateCtoVia(via.id, { label: clientName });
            // Propagar para via fundida se existir
            if (via.fusedToViaId) {
              await updateCtoVia(via.fusedToViaId, { label: clientName });
            }
            updated++;
          }
          return { updated, message: `${updated} via(s) actualizadas com nomes de clientes SGP` };
        } catch (e: any) {
          if (e instanceof TRPCError) throw e;
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e.message ?? "Erro ao sincronizar ONUs" });
        }
      }),

      // ─── Vincular CTO FiberDoc a uma CTO do SGP ──────────────────────────────
    linkCtoToSgp: adminProcedure
      .input(z.object({ ctoId: z.number(), sgpId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const cto = await getCtoById(input.ctoId);
        await updateCto(input.ctoId, { sgpId: input.sgpId });
        await addSgpLinkHistory({
          ctoId: input.ctoId,
          ctoName: cto?.name ?? `CTO #${input.ctoId}`,
          sgpId: input.sgpId,
          action: "linked",
          performedBy: ctx.user?.name ?? ctx.user?.email ?? undefined,
        }).catch(() => {}); // não bloquear em caso de falha no histórico
        return { ok: true };
      }),
    // ─── Desvincular CTO FiberDoc do SGP ───────────────────────────────────
    unlinkCtoFromSgp: adminProcedure
      .input(z.object({ ctoId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const cto = await getCtoById(input.ctoId);
        const prevSgpId = cto?.sgpId ?? null;
        await updateCto(input.ctoId, { sgpId: null });
        await addSgpLinkHistory({
          ctoId: input.ctoId,
          ctoName: cto?.name ?? `CTO #${input.ctoId}`,
          sgpId: prevSgpId,
          action: "unlinked",
          performedBy: ctx.user?.name ?? ctx.user?.email ?? undefined,
        }).catch(() => {});
        return { ok: true };
      }),
    // ─── Histórico de vínculos SGP ──────────────────────────────────────────────────────
    linkHistory: protectedProcedure
      .input(z.object({ ctoId: z.number().optional() }))
      .query(async ({ input }) => {
        const rows = await getSgpLinkHistory(input.ctoId);
        return { history: rows };
      }),
    // ─── Sugestões de vínculo automático por semelhança de nome ─────────────────────────────
    suggestLinks: adminProcedure
      .query(async () => {
        const cfg = await getSgpConfig();
        if (!cfg || !cfg.active) return { suggestions: [], error: "SGP não configurado" };
        try {
          const base = cfg.baseUrl.replace(/\/$/, "");
          // Reutilizar cache da lista de CTOs (partilhado com listCtos)
          const sgpCtos: any[] = await sgpCacheGet("sgp:ctos", async () => {
            const res = await sgpFetch(`${base}/api/fttx/splitter/all/`, cfg, { timeoutMs: 15000 });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json() as any;
            return Array.isArray(data) ? data : (data.results ?? data.data ?? []);
          });
          const localCtos = await getCtos();
          // Normalizar nome para comparação: remover espaços, maiúsculas, caracteres especiais
          const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
          const suggestions: Array<{
            localCtoId: number; localCtoName: string;
            sgpId: number; sgpName: string; score: number;
          }> = [];
          for (const local of localCtos) {
            if (local.sgpId != null) continue; // já vinculada
            const localNorm = norm(local.name);
            let bestScore = 0;
            let bestSgp: any = null;
            for (const sgp of sgpCtos) {
              const sgpName = sgp.ident ?? sgp.nome ?? sgp.name ?? "";
              const sgpNorm = norm(sgpName);
              // Score: 100 se igual, proporcional ao prefixo comum
              let score = 0;
              if (localNorm === sgpNorm) {
                score = 100;
              } else if (localNorm.length > 0 && sgpNorm.length > 0) {
                let common = 0;
                const minLen = Math.min(localNorm.length, sgpNorm.length);
                for (let i = 0; i < minLen; i++) {
                  if (localNorm[i] === sgpNorm[i]) common++; else break;
                }
                score = Math.round((common / Math.max(localNorm.length, sgpNorm.length)) * 100);
                // Bonus se um contém o outro
                if (localNorm.includes(sgpNorm) || sgpNorm.includes(localNorm)) {
                  score = Math.max(score, 70);
                }
              }
              if (score > bestScore) { bestScore = score; bestSgp = sgp; }
            }
            if (bestSgp && bestScore >= 50) {
              suggestions.push({
                localCtoId: local.id,
                localCtoName: local.name,
                sgpId: bestSgp.id,
                sgpName: bestSgp.ident ?? bestSgp.nome ?? bestSgp.name ?? `SGP #${bestSgp.id}`,
                score: bestScore,
              });
            }
          }
          // Ordenar por score desc
          suggestions.sort((a, b) => b.score - a.score);
          return { suggestions, error: null };
        } catch (e: any) {
          return { suggestions: [], error: e.message ?? "Erro ao gerar sugestões" };
        }
      }),
    // ─── Vincular múltiplas CTOs ao SGP de uma vez (bulk) ──────────────────────────────
    bulkLink: adminProcedure
      .input(z.object({
        links: z.array(z.object({ ctoId: z.number(), sgpId: z.number() })),
      }))
      .mutation(async ({ ctx, input }) => {
        let linked = 0;
        for (const link of input.links) {
          const cto = await getCtoById(link.ctoId);
          await updateCto(link.ctoId, { sgpId: link.sgpId });
          await addSgpLinkHistory({
            ctoId: link.ctoId,
            ctoName: cto?.name ?? `CTO #${link.ctoId}`,
            sgpId: link.sgpId,
            action: "linked",
            performedBy: ctx.user?.name ?? ctx.user?.email ?? undefined,
          }).catch(() => {});
          linked++;
        }
        return { ok: true, linked };
      }),
    // ─── IDs SGP já vinculados a CTOs locais (com nome da CTO local) ───────────────
    linkedSgpIds: protectedProcedure
      .query(async () => {
        const all = await getCtos();
        const linked = all.filter(c => c.sgpId != null);
        const ids = linked.map(c => c.sgpId as number);
        // mapa sgpId → nome da CTO local para tooltip
        const nameMap: Record<number, string> = {};
        for (const c of linked) {
          if (c.sgpId != null) nameMap[c.sgpId] = c.name;
        }
        return { ids, nameMap };
      }),
  }),
  // ─── Racks ────────────────────────────────────────────────────────────────────
  racks: router({
    list: protectedProcedure
      .input(z.object({ roomId: z.number().optional() }))
      .query(({ input }) => getRacks(input.roomId)),
    byId: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getRackById(input.id)),
    create: adminProcedure
      .input(z.object({
        name: z.string().min(1),
        roomId: z.number().int(),
        totalU: z.number().int().min(1).default(44),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const id = await createRack(input);
        return { id };
      }),
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        roomId: z.number().int().optional(),
        totalU: z.number().int().min(1).optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateRack(id, data);
        return { ok: true };
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteRack(input.id);
        return { ok: true };
      }),
  }),
  // ─── Alertas de CTOs ─────────────────────────────────────────────────────────
  ctoAlerts: router({
    list: protectedProcedure
      .input(z.object({ onlyActive: z.boolean().optional(), limit: z.number().optional() }))
      .query(({ input }) => getCtoAlerts(input)),
    activeCount: publicProcedure
      .query(() => countActiveCtoAlerts()),
    getConfig: protectedProcedure
      .query(() => getCtoAlertConfig()),
    saveConfig: adminProcedure
      .input(z.object({
        enabled: z.boolean(),
        warningThreshold: z.number().min(1).max(100),
        criticalThreshold: z.number().min(1).max(100),
        checkIntervalMinutes: z.number().min(1).max(1440),
      }))
      .mutation(async ({ input }) => {
        await saveCtoAlertConfig(input);
        return { ok: true };
      }),
    acknowledge: adminProcedure
      .input(z.object({ id: z.number(), by: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        await acknowledgeCtoAlert(input.id, input.by ?? ctx.user.name ?? 'admin');
        return { ok: true };
      }),
    resolve: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await resolveCtoAlert(input.id);
        return { ok: true };
      }),
    check: adminProcedure
      .mutation(async () => {
        const created = await checkAndCreateCtoAlerts();
        return { created };
      }),
  }),
  mapGroups: router({
    list: protectedProcedure
      .query(async () => {
        const groups = await getMapGroups();
        const allElements = await getAllElementGroupMemberships();
        const allRoutes = await getAllRouteGroupMemberships();
        return groups.map(g => ({
          ...g,
          elements: allElements.filter((e: any) => e.groupId === g.id),
          routes: allRoutes.filter((r: any) => r.groupId === g.id),
        }));
      }),
    memberships: protectedProcedure
      .query(async () => {
        const elements = await getAllElementGroupMemberships();
        const routes = await getAllRouteGroupMemberships();
        return { elements, routes };
      }),
    members: protectedProcedure
      .input(z.object({ groupId: z.number() }))
      .query(({ input }) => getGroupMembers(input.groupId)),
    create: adminProcedure
      .input(z.object({ name: z.string().min(1), color: z.string().optional(), description: z.string().optional() }))
      .mutation(async ({ input }) => {
        const id = await createMapGroup(input);
        return { id };
      }),
    update: adminProcedure
      .input(z.object({ id: z.number(), name: z.string().optional(), color: z.string().optional(), description: z.string().optional() }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateMapGroup(id, data);
        return { ok: true };
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteMapGroup(input.id);
        return { ok: true };
      }),
    addElement: adminProcedure
      .input(z.object({ elementId: z.number(), groupId: z.number() }))
      .mutation(async ({ input }) => {
        await addElementToGroup(input.elementId, input.groupId);
        return { ok: true };
      }),
    removeElement: adminProcedure
      .input(z.object({ elementId: z.number(), groupId: z.number() }))
      .mutation(async ({ input }) => {
        await removeElementFromGroup(input.elementId, input.groupId);
        return { ok: true };
      }),
    addRoute: adminProcedure
      .input(z.object({ routeId: z.number(), groupId: z.number() }))
      .mutation(async ({ input }) => {
        await addRouteToGroup(input.routeId, input.groupId);
        return { ok: true };
      }),
    removeRoute: adminProcedure
      .input(z.object({ routeId: z.number(), groupId: z.number() }))
      .mutation(async ({ input }) => {
        await removeRouteFromGroup(input.routeId, input.groupId);
        return { ok: true };
      }),
  }),
  fusionReport: router({
    byCeo: protectedProcedure
      .input(z.object({ ceoId: z.number() }))
      .query(async ({ input }) => {
        const tubes = await getTubesByCeo(input.ceoId);
        const allVias = await getViasByCeo(input.ceoId);
        return tubes.map(tube => ({
          ...tube,
          vias: allVias
            .filter(v => v.tubeId === tube.id)
            .sort((a, b) => a.viaNumber - b.viaNumber)
            .map(via => ({
              ...via,
              fusedToLabel: via.fusedToViaId
                ? (() => {
                    const dest = allVias.find(v => v.id === via.fusedToViaId);
                    const destTube = dest ? tubes.find(t => t.id === dest.tubeId) : null;
                    return dest
                      ? `Via ${dest.viaNumber}${dest.label ? ` — ${dest.label}` : ""}${destTube ? ` (${destTube.identifier})` : ""}`
                      : null;
                  })()
                : null,
            })),
        }));
      }),
    byCto: protectedProcedure
      .input(z.object({ ctoId: z.number() }))
      .query(async ({ input }) => {
        const tubes = await getTubesByCto(input.ctoId);
        const allVias = await getViasByCto(input.ctoId);
        return tubes.map(tube => ({
          ...tube,
          vias: allVias
            .filter(v => v.tubeId === tube.id)
            .sort((a, b) => a.viaNumber - b.viaNumber)
            .map(via => ({
              ...via,
              fusedToLabel: via.fusedToViaId
                ? (() => {
                    const dest = allVias.find(v => v.id === via.fusedToViaId);
                    const destTube = dest ? tubes.find(t => t.id === dest.tubeId) : null;
                    return dest
                      ? `Via ${dest.viaNumber}${dest.label ? ` — ${dest.label}` : ""}${destTube ? ` (${destTube.identifier})` : ""}`
                      : null;
                  })()
                : null,
            })),
        }));
      }),
  }),
});
export type AppRouter = typeof appRouter;

