import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { TRPCError } from "@trpc/server";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  getCeos, getCeoById, createCeo, updateCeo, deleteCeo,
  getTubesByCeo, createCeoTube, updateCeoTube, deleteCeoTube,
  getViasByTube, getViasByCeo, setViaFusion, clearViaFusion, updateVia, setViaFiber,
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
} from "./ipdb";

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
      }).optional())
      .query(({ input }) => getEquipments(input?.search, input?.type, input?.roomId, input?.status)),

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
        ipAddress: z.string().optional(),
        macAddress: z.string().optional(),
        totalPorts: z.number().optional(),
        notes: z.string().optional(),
        status: equipmentStatusEnum.optional(),
        imageUrl: z.string().optional(),
        powerType: z.enum(["ac", "dc"]).optional().nullable(),
        powerSource: z.enum(["rectifier", "inverter", "ups", "grid", "other"]).optional().nullable(),
        powerSourceLabel: z.string().optional().nullable(),
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
  }),

  // ─── Ports ─────────────────────────────────────────────────────────────────
  ports: router({
    byEquipment: publicProcedure.input(z.object({ equipmentId: z.number() })).query(({ input }) => getPortsByEquipment(input.equipmentId)),

    byId: publicProcedure.input(z.object({ id: z.number() })).query(({ input }) => getPortById(input.id)),

    create: protectedProcedure
      .input(z.object({
        equipmentId: z.number(),
        portNumber: z.string().min(1),
        label: z.string().optional(),
        type: portTypeEnum.optional(),
        speed: portSpeedEnum.optional(),
        status: portStatusEnum.optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await createPort(input);
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
        label: z.string().optional(),
        type: portTypeEnum.optional(),
        speed: portSpeedEnum.optional(),
        status: portStatusEnum.optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await updatePort(id, data);
        await createMaintenanceRecord({
          entityType: "port", entityId: id, action: "updated",
          description: `Porta #${id} atualizada`, performedBy: ctx.user.name ?? undefined, userId: ctx.user.id,
        });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await deletePort(input.id);
        return { success: true };
      }),
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
        await createCeo({
          name: input.name,
          location: input.location ?? null,
          roomId: input.roomId ?? null,
          notes: input.notes ?? null,
          status: input.status ?? "active",
        });
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
        color: z.string().optional(),
        notes: z.string().optional(),
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

  // ─── Gerenciamento de Usuários (apenas admin) ─────────────────────────────
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
      }))
      .mutation(async ({ input }) => {
        const settings: Record<string, string> = {};
        if (input.systemName !== undefined) settings.systemName = input.systemName;
        if (input.logoUrl !== undefined) settings.logoUrl = input.logoUrl;
        if (input.theme !== undefined) settings.theme = input.theme;
        if (input.capacityAlertThreshold !== undefined) settings.capacityAlertThreshold = String(input.capacityAlertThreshold);
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
        const { storagePut } = await import("./storage");
        const buffer = Buffer.from(input.base64, "base64");
        const key = `system/logo-${Date.now()}.${input.filename.split(".").pop()}`;
        const { url } = await storagePut(key, buffer, input.mimeType);
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
        const { storagePut } = await import("./storage");
        const buffer = Buffer.from(input.base64, "base64");
        const ext = input.filename.split(".").pop() ?? "jpg";
        const key = `equipments/${input.equipmentId}-${Date.now()}.${ext}`;
        const { url } = await storagePut(key, buffer, input.mimeType);
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
      .mutation(async ({ input }) => {
        const id = await allocateIpAddress(input);
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
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateIpAddress(id, data);
        return { success: true };
      }),

    releaseAddress: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await releaseIpAddress(input.id);
        return { success: true };
      }),

    deleteAddress: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
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
      .mutation(async ({ input }) => {
        let imported = 0;
        let skipped = 0;
        const errors: string[] = [];
        for (const row of input.rows) {
          try {
            await allocateIpAddress({
              blockId: input.blockId,
              address: row.address.trim(),
              status: row.status ?? "allocated",
              hostname: row.hostname ?? null,
              owner: row.owner ?? null,
              macAddress: row.mac ?? null,
              description: row.description ?? null,
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
  }),
});
export type AppRouter = typeof appRouter;

