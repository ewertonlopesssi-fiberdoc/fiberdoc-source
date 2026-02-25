import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
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
  type BulkEquipmentRow,
  type BulkFiberRow,
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
});
export type AppRouter = typeof appRouter;
