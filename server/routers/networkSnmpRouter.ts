/**
 * networkSnmpRouter.ts
 * tRPC router para configuração e consulta de monitoramento SNMP de equipamentos de rede
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  networkSnmpConfig,
  networkSnmpPorts,
  networkSnmpReadings,
  networkPortReadings,
  networkSnmpAlerts,
  equipments,
} from "../../drizzle/schema";
import { eq, and, desc, gte, isNull, lt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  pollNetworkEquipment,
  createSession,
  snmpGet,
  varbindValue,
  ticksToSeconds,
  SNMP_OID,
} from "../networkSnmpPoller";

// ─── Schemas ─────────────────────────────────────────────────────────────────

const snmpConfigSchema = z.object({
  enabled: z.boolean().optional(),
  snmpHost: z.string().max(128).optional(),
  snmpPort: z.number().int().min(1).max(65535).optional(),
  snmpVersion: z.enum(["v1", "v2c", "v3"]).optional(),
  snmpCommunity: z.string().max(128).optional(),
  snmpV3User: z.string().max(128).optional(),
  snmpV3AuthProto: z.enum(["MD5", "SHA"]).optional(),
  snmpV3AuthKey: z.string().max(255).optional(),
  snmpV3PrivProto: z.enum(["DES", "AES"]).optional(),
  snmpV3PrivKey: z.string().max(255).optional(),
  pollInterval: z.number().int().min(30).max(86400).optional(),
  alertsEnabled: z.boolean().optional(),
  alertCpuMax: z.number().min(0).max(100).optional().nullable(),
  alertMemMax: z.number().min(0).max(100).optional().nullable(),
  alertTempMax: z.number().min(0).max(200).optional().nullable(),
});

// Períodos disponíveis em minutos
// 5min, 15min, 30min, 1h, 3h, 6h, 12h, 24h, 2d, 7d, 30d
const PERIOD_MINUTES = [5, 15, 30, 60, 180, 360, 720, 1440, 2880, 10080, 43200] as const;

// Calcular limite de pontos com base no período e intervalo de polling
function calcLimit(periodMinutes: number): number {
  // Máximo de 1000 pontos por gráfico; para períodos longos, retorna menos pontos
  if (periodMinutes <= 60) return 500;
  if (periodMinutes <= 1440) return 720;
  return 1000;
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const networkSnmpRouter = router({

  // Obter configuração SNMP de um equipamento
  getConfig: protectedProcedure
    .input(z.object({ equipmentId: z.number().int() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [cfg] = await db
        .select()
        .from(networkSnmpConfig)
        .where(eq(networkSnmpConfig.equipmentId, input.equipmentId));
      return cfg ?? null;
    }),

  // Criar ou atualizar configuração SNMP
  upsertConfig: protectedProcedure
    .input(z.object({ equipmentId: z.number().int() }).merge(snmpConfigSchema))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB não disponível" });
      const { equipmentId, ...data } = input;

      // Verificar se equipamento existe
      const [eq_] = await db
        .select({ id: equipments.id })
        .from(equipments)
        .where(eq(equipments.id, equipmentId));
      if (!eq_) throw new TRPCError({ code: "NOT_FOUND", message: "Equipamento não encontrado" });

      const [existing] = await db
        .select({ id: networkSnmpConfig.id })
        .from(networkSnmpConfig)
        .where(eq(networkSnmpConfig.equipmentId, equipmentId));

      if (existing) {
        await db
          .update(networkSnmpConfig)
          .set(data as any)
          .where(eq(networkSnmpConfig.equipmentId, equipmentId));
      } else {
        await db.insert(networkSnmpConfig).values({ equipmentId, ...data } as any);
      }

      const [cfg] = await db
        .select()
        .from(networkSnmpConfig)
        .where(eq(networkSnmpConfig.equipmentId, equipmentId));
      return cfg;
    }),

  // Forçar poll imediato
  pollNow: protectedProcedure
    .input(z.object({ equipmentId: z.number().int() }))
    .mutation(async ({ input }) => {
      await pollNetworkEquipment(input.equipmentId);
      const db = await getDb();
      if (!db) return null;
      const [cfg] = await db
        .select()
        .from(networkSnmpConfig)
        .where(eq(networkSnmpConfig.equipmentId, input.equipmentId));
      return cfg ?? null;
    }),

  // Listar portas de um equipamento
  getPorts: protectedProcedure
    .input(z.object({ equipmentId: z.number().int() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(networkSnmpPorts)
        .where(eq(networkSnmpPorts.equipmentId, input.equipmentId))
        .orderBy(networkSnmpPorts.ifIndex);
    }),

  // Atualizar configuração de alertas de porta (GBIC + threshold de tráfego)
  updatePortAlerts: protectedProcedure
    .input(z.object({
      portId: z.number().int(),
      alertRxMin: z.number().optional().nullable(),
      alertRxMax: z.number().optional().nullable(),
      alertBpsMax: z.number().min(0).optional().nullable(), // threshold de tráfego em bps
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB não disponível" });
      await db
        .update(networkSnmpPorts)
        .set({
          alertRxMin: input.alertRxMin ?? undefined,
          alertRxMax: input.alertRxMax ?? undefined,
          alertBpsMax: input.alertBpsMax ?? undefined,
        })
        .where(eq(networkSnmpPorts.id, input.portId));
      return { ok: true };
    }),

  // Histórico de leituras gerais (CPU, memória, temperatura)
  // periodMinutes: 5, 15, 30, 60, 180, 360, 720, 1440, 2880, 10080, 43200
  getReadings: protectedProcedure
    .input(z.object({
      equipmentId: z.number().int(),
      periodMinutes: z.number().int().min(5).max(43200).default(60),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const since = new Date(Date.now() - input.periodMinutes * 60 * 1000);
      return db
        .select()
        .from(networkSnmpReadings)
        .where(
          and(
            eq(networkSnmpReadings.equipmentId, input.equipmentId),
            gte(networkSnmpReadings.collectedAt, since)
          )
        )
        .orderBy(networkSnmpReadings.collectedAt)
        .limit(calcLimit(input.periodMinutes));
    }),

  // Histórico de tráfego e GBIC por porta
  // periodMinutes: 5, 15, 30, 60, 180, 360, 720, 1440, 2880, 10080, 43200
  getPortReadings: protectedProcedure
    .input(z.object({
      portId: z.number().int(),
      periodMinutes: z.number().int().min(5).max(43200).default(60),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const since = new Date(Date.now() - input.periodMinutes * 60 * 1000);
      return db
        .select()
        .from(networkPortReadings)
        .where(
          and(
            eq(networkPortReadings.portId, input.portId),
            gte(networkPortReadings.collectedAt, since)
          )
        )
        .orderBy(networkPortReadings.collectedAt)
        .limit(calcLimit(input.periodMinutes));
    }),

  // Detalhe completo de um equipamento monitorado (config + portas + últimas leituras + alertas)
  getEquipmentDetail: protectedProcedure
    .input(z.object({ equipmentId: z.number().int() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      // Equipamento
      const [equipment] = await db
        .select()
        .from(equipments)
        .where(eq(equipments.id, input.equipmentId));
      if (!equipment) return null;

      // Configuração SNMP
      const [config] = await db
        .select()
        .from(networkSnmpConfig)
        .where(eq(networkSnmpConfig.equipmentId, input.equipmentId));

      // Portas
      const ports = await db
        .select()
        .from(networkSnmpPorts)
        .where(eq(networkSnmpPorts.equipmentId, input.equipmentId))
        .orderBy(networkSnmpPorts.ifIndex);

      // Última leitura geral
      const [lastReading] = await db
        .select()
        .from(networkSnmpReadings)
        .where(eq(networkSnmpReadings.equipmentId, input.equipmentId))
        .orderBy(desc(networkSnmpReadings.collectedAt))
        .limit(1);

      // Alertas ativos
      const activeAlerts = await db
        .select()
        .from(networkSnmpAlerts)
        .where(
          and(
            eq(networkSnmpAlerts.equipmentId, input.equipmentId),
            isNull(networkSnmpAlerts.resolvedAt)
          )
        )
        .orderBy(desc(networkSnmpAlerts.createdAt))
        .limit(20);

      return {
        equipment,
        config: config ?? null,
        ports,
        lastReading: lastReading ?? null,
        activeAlerts,
      };
    }),

  // Listar alertas ativos
  getAlerts: protectedProcedure
    .input(z.object({
      equipmentId: z.number().int().optional(),
      onlyActive: z.boolean().default(true),
      limit: z.number().int().min(1).max(200).default(50),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [];
      if (input.equipmentId) {
        conditions.push(eq(networkSnmpAlerts.equipmentId, input.equipmentId));
      }
      if (input.onlyActive) {
        conditions.push(isNull(networkSnmpAlerts.resolvedAt));
      }

      return db
        .select({
          alert: networkSnmpAlerts,
          equipmentName: equipments.name,
        })
        .from(networkSnmpAlerts)
        .leftJoin(equipments, eq(networkSnmpAlerts.equipmentId, equipments.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(networkSnmpAlerts.createdAt))
        .limit(input.limit);
    }),

  // Reconhecer alerta
  acknowledgeAlert: protectedProcedure
    .input(z.object({
      alertId: z.number().int(),
      acknowledgedBy: z.string().max(128).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB não disponível" });
      await db
        .update(networkSnmpAlerts)
        .set({
          acknowledgedAt: new Date(),
          acknowledgedBy: input.acknowledgedBy ?? ctx.user?.name ?? "sistema",
        })
        .where(eq(networkSnmpAlerts.id, input.alertId));
      return { ok: true };
    }),

  // Resolver alerta
  resolveAlert: protectedProcedure
    .input(z.object({ alertId: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB não disponível" });
      await db
        .update(networkSnmpAlerts)
        .set({ resolvedAt: new Date() })
        .where(eq(networkSnmpAlerts.id, input.alertId));
      return { ok: true };
    }),

  // Testar conexão SNMP em tempo real
  testConnection: protectedProcedure
    .input(z.object({ equipmentId: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB não disponível" });

      const [cfg] = await db
        .select()
        .from(networkSnmpConfig)
        .where(eq(networkSnmpConfig.equipmentId, input.equipmentId));

      if (!cfg || !cfg.snmpHost) {
        return {
          ok: false,
          error: "Equipamento sem configuração SNMP. Configure o host e community primeiro.",
          details: null,
        };
      }

      const session = createSession(cfg as any);
      const startMs = Date.now();

      try {
        // Consultar OIDs básicos: sysDescr, sysName, sysUpTime
        const vbs = await snmpGet(session, [
          SNMP_OID.sysDescr,
          SNMP_OID.sysName,
          SNMP_OID.sysUpTime,
        ]);

        const rttMs = Date.now() - startMs;
        const sysDescr = String(varbindValue(vbs[SNMP_OID.sysDescr]) ?? "");
        const sysName  = String(varbindValue(vbs[SNMP_OID.sysName])  ?? "");
        const uptimeTicks = varbindValue(vbs[SNMP_OID.sysUpTime]);
        const uptimeSec = uptimeTicks !== null ? ticksToSeconds(Number(uptimeTicks)) : null;

        // Formatar uptime legível
        let uptimeStr: string | null = null;
        if (uptimeSec !== null) {
          const d = Math.floor(uptimeSec / 86400);
          const h = Math.floor((uptimeSec % 86400) / 3600);
          const m = Math.floor((uptimeSec % 3600) / 60);
          const s = uptimeSec % 60;
          uptimeStr = `${d}d ${h}h ${m}m ${s}s`;
        }

        session.close();
        return {
          ok: true,
          error: null,
          details: {
            host: cfg.snmpHost,
            port: cfg.snmpPort ?? 161,
            version: cfg.snmpVersion ?? "v2c",
            rttMs,
            sysDescr: sysDescr || null,
            sysName: sysName || null,
            uptimeStr,
            uptimeSec,
            respondedAt: new Date().toISOString(),
          },
        };
      } catch (err: any) {
        session.close();
        const rttMs = Date.now() - startMs;
        return {
          ok: false,
          error: err?.message ?? "Timeout ou equipamento inacessível",
          details: {
            host: cfg.snmpHost,
            port: cfg.snmpPort ?? 161,
            version: cfg.snmpVersion ?? "v2c",
            rttMs,
            sysDescr: null,
            sysName: null,
            uptimeStr: null,
            uptimeSec: null,
            respondedAt: null,
          },
        };
      }
    }),

  // Redescobrir interfaces: apaga portas existentes e força novo poll
  rediscoverPorts: protectedProcedure
    .input(z.object({ equipmentId: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB não disponível" });

      // Apagar histórico de leituras de portas
      const ports = await db
        .select({ id: networkSnmpPorts.id })
        .from(networkSnmpPorts)
        .where(eq(networkSnmpPorts.equipmentId, input.equipmentId));

      for (const port of ports) {
        await db.delete(networkPortReadings).where(eq(networkPortReadings.portId, port.id));
      }

      // Apagar portas existentes
      await db.delete(networkSnmpPorts).where(eq(networkSnmpPorts.equipmentId, input.equipmentId));

      // Forçar novo poll imediatamente
      pollNetworkEquipment(input.equipmentId).catch((e) =>
        console.error(`[NetworkSNMP] Erro ao redescobrir portas do equipamento ${input.equipmentId}:`, e)
      );

      return { ok: true, message: "Interfaces apagadas. Novo poll iniciado — aguarde 30 segundos." };
    }),

  // Limpar histórico antigo (network_port_readings e network_snmp_readings)
  cleanupHistory: protectedProcedure
    .input(z.object({
      equipmentId: z.number().int(),
      olderThanDays: z.number().int().min(1).max(365).default(30),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB não disponível" });

      const cutoff = new Date(Date.now() - input.olderThanDays * 86400 * 1000);

      // Apagar leituras gerais antigas
      await db.delete(networkSnmpReadings)
        .where(and(
          eq(networkSnmpReadings.equipmentId, input.equipmentId),
          lt(networkSnmpReadings.collectedAt, cutoff)
        ));

      // Apagar leituras de portas antigas
      const ports = await db
        .select({ id: networkSnmpPorts.id })
        .from(networkSnmpPorts)
        .where(eq(networkSnmpPorts.equipmentId, input.equipmentId));

      for (const port of ports) {
        await db.delete(networkPortReadings)
          .where(and(
            eq(networkPortReadings.portId, port.id),
            lt(networkPortReadings.collectedAt, cutoff)
          ));
      }

      return { ok: true, message: `Histórico com mais de ${input.olderThanDays} dias apagado.` };
    }),

  // Resumo de todos os equipamentos com SNMP habilitado
  getSummary: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const configs = await db
      .select({
        config: networkSnmpConfig,
        equipment: {
          id: equipments.id,
          name: equipments.name,
          type: equipments.type,
          manufacturer: equipments.manufacturer,
          ipAddress: equipments.ipAddress,
        },
      })
      .from(networkSnmpConfig)
      .leftJoin(equipments, eq(networkSnmpConfig.equipmentId, equipments.id))
      .where(eq(networkSnmpConfig.enabled, true));

    // Contar alertas ativos por equipamento
    const activeAlerts = await db
      .select()
      .from(networkSnmpAlerts)
      .where(isNull(networkSnmpAlerts.resolvedAt));

    const alertsByEquipment: Record<number, number> = {};
    for (const alert of activeAlerts) {
      alertsByEquipment[alert.equipmentId] = (alertsByEquipment[alert.equipmentId] ?? 0) + 1;
    }

    return configs.map((row) => ({
      ...row,
      activeAlertCount: alertsByEquipment[row.config.equipmentId] ?? 0,
    }));
  }),
});
