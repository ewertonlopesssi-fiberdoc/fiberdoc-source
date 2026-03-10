/**
 * SSH Commander Router — Gestão remota de dispositivos via SSH
 * Inclui: dispositivos, comandos rápidos, BGP peers, histórico
 */
import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, sql, desc } from "drizzle-orm";
import { getDb } from "./db";
import {
  sshDevices,
  sshQuickCommands,
  sshExecutions,
  sshDeviceCommands,
  bgpPeers,
} from "../drizzle/schema";
import { executeSSH, testSSHConnection } from "./sshExecutor";

export const sshCommanderRouter = router({
  // ─── Dispositivos ─────────────────────────────────────────────────────────
  listDevices: protectedProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const devices = await db.select().from(sshDevices).orderBy(sshDevices.name);
      return devices.map(d => ({
        ...d,
        password: d.password ? "***" : null,
        privateKey: d.privateKey ? "***" : null,
      }));
    }),

  createDevice: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      host: z.string().min(1),
      port: z.number().default(22),
      username: z.string().min(1),
      authType: z.enum(["password", "key"]),
      password: z.string().optional(),
      privateKey: z.string().optional(),
      deviceType: z.string().default("generic"),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [result] = await db.insert(sshDevices).values(input as any);
      return { id: (result as any).insertId };
    }),

  updateDevice: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      host: z.string().optional(),
      port: z.number().optional(),
      username: z.string().optional(),
      authType: z.enum(["password", "key"]).optional(),
      password: z.string().optional(),
      privateKey: z.string().optional(),
      deviceType: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...data } = input;
      const updateData = Object.fromEntries(
        Object.entries(data).filter(([_, v]) => v !== undefined)
      );
      await db.update(sshDevices).set(updateData).where(eq(sshDevices.id, id));
      return { updated: true };
    }),

  deleteDevice: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(sshDevices).where(eq(sshDevices.id, input.id));
      return { deleted: true };
    }),

  testConnection: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [device] = await db.select().from(sshDevices).where(eq(sshDevices.id, input.id));
      if (!device) throw new TRPCError({ code: "NOT_FOUND", message: "Dispositivo não encontrado" });
      const result = await testSSHConnection({
        host: device.host,
        port: device.port,
        username: device.username,
        authType: device.authType,
        password: device.password || undefined,
        privateKey: device.privateKey || undefined,
        deviceType: device.deviceType || "generic",
      });
      return result;
    }),

  // ─── Execução SSH ─────────────────────────────────────────────────────────
  execute: protectedProcedure
    .input(z.object({
      deviceId: z.number(),
      commands: z.array(z.string()).min(1),
      commandName: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [device] = await db.select().from(sshDevices).where(eq(sshDevices.id, input.deviceId));
      if (!device) throw new TRPCError({ code: "NOT_FOUND", message: "Dispositivo não encontrado" });
      const result = await executeSSH(
        {
          host: device.host,
          port: device.port,
          username: device.username,
          authType: device.authType,
          password: device.password || undefined,
          privateKey: device.privateKey || undefined,
          deviceType: device.deviceType || "generic",
        },
        input.commands
      );
      await db.insert(sshExecutions).values({
        deviceId: input.deviceId,
        commandName: input.commandName || null,
        commandText: input.commands.join("\n"),
        output: result.output,
        status: result.success ? "success" : "error",
        durationMs: result.durationMs,
        executedBy: (ctx as any).user?.id || null,
      } as any);
      return result;
    }),

  listExecutions: protectedProcedure
    .input(z.object({ deviceId: z.number(), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select().from(sshExecutions)
        .where(eq(sshExecutions.deviceId, input.deviceId))
        .orderBy(desc(sshExecutions.executedAt))
        .limit(input.limit);
    }),

  clearHistory: protectedProcedure
    .input(z.object({ deviceId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(sshExecutions).where(eq(sshExecutions.deviceId, input.deviceId));
      return { cleared: true };
    }),

  // ─── Comandos Rápidos ─────────────────────────────────────────────────────
  listQuickCommands: protectedProcedure
    .input(z.object({ deviceType: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const all = await db.select().from(sshQuickCommands).orderBy(sshQuickCommands.category, sshQuickCommands.name);
      if (input.deviceType && input.deviceType !== "all") {
        return all.filter(c => !c.deviceType || c.deviceType === input.deviceType || c.deviceType === "generic");
      }
      return all;
    }),

  createQuickCommand: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      command: z.string().min(1),
      category: z.string().default("diagnostico"),
      deviceType: z.string().default("generic"),
      isDangerous: z.number().default(0),
      color: z.string().default("#3B82F6"),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [result] = await db.insert(sshQuickCommands).values(input as any);
      return { id: (result as any).insertId };
    }),

  updateQuickCommand: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      description: z.string().optional(),
      command: z.string().optional(),
      category: z.string().optional(),
      deviceType: z.string().optional(),
      isDangerous: z.number().optional(),
      color: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...data } = input;
      await db.update(sshQuickCommands).set(data as any).where(eq(sshQuickCommands.id, id));
      return { updated: true };
    }),

  deleteQuickCommand: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(sshQuickCommands).where(eq(sshQuickCommands.id, input.id));
      return { deleted: true };
    }),

  seedQuickCommands: protectedProcedure
    .input(z.object({ deviceType: z.string().default("all"), overwrite: z.boolean().default(false) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const existing = await db.select().from(sshQuickCommands);
      if (existing.length > 0 && !input.overwrite) {
        return { inserted: 0, skipped: existing.length, message: "Comandos já existem. Use overwrite=true para substituir." };
      }
      const s6730 = [
        { name: "Display Version", description: "Versão do VRP e informações do switch", command: "display version", category: "diagnostico", deviceType: "switch", isDangerous: 0, color: "#3B82F6" },
        { name: "Display Interface Brief", description: "Resumo de todas as interfaces", command: "display interface brief", category: "diagnostico", deviceType: "switch", isDangerous: 0, color: "#3B82F6" },
        { name: "Display IP Routing Table", description: "Tabela de roteamento IP", command: "display ip routing-table", category: "diagnostico", deviceType: "switch", isDangerous: 0, color: "#06B6D4" },
        { name: "Display VLAN", description: "Lista todas as VLANs configuradas", command: "display vlan", category: "vlan", deviceType: "switch", isDangerous: 0, color: "#F59E0B" },
        { name: "Display MAC Address Table", description: "Tabela de endereços MAC", command: "display mac-address", category: "diagnostico", deviceType: "switch", isDangerous: 0, color: "#3B82F6" },
        { name: "Display CPU Usage", description: "Uso actual da CPU", command: "display cpu-usage", category: "diagnostico", deviceType: "switch", isDangerous: 0, color: "#10B981" },
        { name: "Display Memory Usage", description: "Uso actual da memória", command: "display memory-usage", category: "diagnostico", deviceType: "switch", isDangerous: 0, color: "#10B981" },
        { name: "Display BGP Peer", description: "Resumo dos peers BGP", command: "display bgp peer", category: "bgp", deviceType: "switch", isDangerous: 0, color: "#8B5CF6" },
        { name: "Salvar Configuração", description: "Guarda a configuração actual na flash", command: "save\ny", category: "manutencao", deviceType: "switch", isDangerous: 0, color: "#10B981" },
        { name: "Display Current Configuration", description: "Mostra a configuração actual completa", command: "display current-configuration", category: "manutencao", deviceType: "switch", isDangerous: 0, color: "#10B981" },
        { name: "Reiniciar Switch", description: "Reinicia o equipamento imediatamente", command: "reboot\ny", category: "manutencao", deviceType: "switch", isDangerous: 1, color: "#EF4444" },
      ];
      const ne8000 = [
        { name: "Display Version", description: "Versão do VRP e informações do NE8000", command: "display version", category: "diagnostico", deviceType: "ne8000", isDangerous: 0, color: "#3B82F6" },
        { name: "Display BGP Peer", description: "Resumo de todos os peers BGP", command: "display bgp peer", category: "bgp", deviceType: "ne8000", isDangerous: 0, color: "#8B5CF6" },
        { name: "Display BGP Peer Verbose", description: "Detalhes completos de todos os peers BGP", command: "display bgp peer verbose", category: "bgp", deviceType: "ne8000", isDangerous: 0, color: "#8B5CF6" },
        { name: "Display IP Routing Table", description: "Tabela de roteamento IP completa", command: "display ip routing-table", category: "diagnostico", deviceType: "ne8000", isDangerous: 0, color: "#06B6D4" },
        { name: "Display Interface Brief", description: "Resumo de todas as interfaces", command: "display interface brief", category: "diagnostico", deviceType: "ne8000", isDangerous: 0, color: "#3B82F6" },
        { name: "Display MPLS LDP Session", description: "Sessões LDP activas", command: "display mpls ldp session", category: "diagnostico", deviceType: "ne8000", isDangerous: 0, color: "#8B5CF6" },
        { name: "Display MPLS LSP", description: "Label Switched Paths activos", command: "display mpls lsp", category: "diagnostico", deviceType: "ne8000", isDangerous: 0, color: "#8B5CF6" },
        { name: "Salvar Configuração", description: "Guarda a configuração actual", command: "save\ny", category: "manutencao", deviceType: "ne8000", isDangerous: 0, color: "#10B981" },
        { name: "Reiniciar NE8000", description: "Reinicia o roteador imediatamente", command: "reboot\ny", category: "manutencao", deviceType: "ne8000", isDangerous: 1, color: "#EF4444" },
      ];
      let templates: typeof s6730 = [];
      const dt = input.deviceType.toLowerCase();
      if (dt === "switch" || dt === "all") templates = [...templates, ...s6730];
      if (dt === "ne8000" || dt === "all") templates = [...templates, ...ne8000];
      if (templates.length === 0) templates = [...s6730, ...ne8000];
      if (input.overwrite && existing.length > 0) {
        await db.delete(sshQuickCommands);
      }
      await db.insert(sshQuickCommands).values(templates as any[]);
      return { inserted: templates.length, skipped: 0, message: `${templates.length} templates inseridos com sucesso` };
    }),

  // ─── BGP Peers ────────────────────────────────────────────────────────────
  listBgpPeers: protectedProcedure
    .input(z.object({ deviceId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select().from(bgpPeers).where(eq(bgpPeers.deviceId, input.deviceId));
    }),

  createBgpPeer: protectedProcedure
    .input(z.object({
      deviceId: z.number(),
      peerIp: z.string().min(1),
      remoteAs: z.number(),
      description: z.string().optional(),
      peerType: z.enum(["ebgp", "ibgp"]).default("ebgp"),
      localAs: z.number().optional(),
      activateScript: z.string().optional(),
      deactivateScript: z.string().optional(),
      peerIpv6: z.string().optional(),
      activateScriptV6: z.string().optional(),
      deactivateScriptV6: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [result] = await db.insert(bgpPeers).values(input as any);
      return { id: (result as any).insertId };
    }),

  updateBgpPeer: protectedProcedure
    .input(z.object({
      id: z.number(),
      peerIp: z.string().optional(),
      remoteAs: z.number().optional(),
      description: z.string().optional(),
      peerType: z.enum(["ebgp", "ibgp"]).optional(),
      localAs: z.number().optional(),
      activateScript: z.string().optional(),
      deactivateScript: z.string().optional(),
      peerIpv6: z.string().optional().nullable(),
      activateScriptV6: z.string().optional().nullable(),
      deactivateScriptV6: z.string().optional().nullable(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...data } = input;
      await db.update(bgpPeers).set(data as any).where(eq(bgpPeers.id, id));
      return { updated: true };
    }),

  deleteBgpPeer: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(bgpPeers).where(eq(bgpPeers.id, input.id));
      return { deleted: true };
    }),

  executeBgpAction: protectedProcedure
    .input(z.object({
      deviceId: z.number(),
      peerId: z.number(),
      action: z.enum(["activate", "deactivate", "status", "activate_v6", "deactivate_v6"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [device] = await db.select().from(sshDevices).where(eq(sshDevices.id, input.deviceId));
      if (!device) throw new TRPCError({ code: "NOT_FOUND", message: "Dispositivo não encontrado" });
      const [peer] = await db.select().from(bgpPeers).where(eq(bgpPeers.id, input.peerId));
      if (!peer) throw new TRPCError({ code: "NOT_FOUND", message: "BGP Peer não encontrado" });
      // Substituir variáveis nos scripts
      const replacePeerVars = (script: string, ip: string) =>
        script
          .replace(/\{PEER_IP\}/g, ip)
          .replace(/\{LOCAL_AS\}/g, String(peer.localAs ?? ""))
          .replace(/\{REMOTE_AS\}/g, String(peer.remoteAs ?? ""));

      let commands: string[] = [];
      if (input.action === "status") {
        const ipv6Part = peer.peerIpv6 ? `\ndisplay bgp ipv6 peer ${peer.peerIpv6} verbose` : "";
        commands = [`display bgp peer ${peer.peerIp} verbose${ipv6Part}`].flatMap(s => s.split("\n"));
      } else if (input.action === "activate" && peer.activateScript) {
        commands = replacePeerVars(peer.activateScript, peer.peerIp).split("\n").filter(Boolean);
      } else if (input.action === "deactivate" && peer.deactivateScript) {
        commands = replacePeerVars(peer.deactivateScript, peer.peerIp).split("\n").filter(Boolean);
      } else if (input.action === "activate_v6" && peer.activateScriptV6 && peer.peerIpv6) {
        commands = replacePeerVars(peer.activateScriptV6, peer.peerIpv6).split("\n").filter(Boolean);
      } else if (input.action === "deactivate_v6" && peer.deactivateScriptV6 && peer.peerIpv6) {
        commands = replacePeerVars(peer.deactivateScriptV6, peer.peerIpv6).split("\n").filter(Boolean);
      } else {
        commands = [`display bgp peer ${peer.peerIp}`];
      }
      const result = await executeSSH(
        {
          host: device.host,
          port: device.port,
          username: device.username,
          authType: device.authType,
          password: device.password || undefined,
          privateKey: device.privateKey || undefined,
          deviceType: device.deviceType || "generic",
        },
        commands
      );
      await db.insert(sshExecutions).values({
        deviceId: input.deviceId,
        commandName: `BGP ${input.action} — ${peer.peerIp}`,
        commandText: commands.join("\n"),
        output: result.output,
        status: result.success ? "success" : "error",
        durationMs: result.durationMs,
        executedBy: (ctx as any).user?.id || null,
      } as any);
      return result;
    }),

  // ─── Comandos por Dispositivo ────────────────────────────────────────────────
  listDeviceCommands: protectedProcedure
    .input(z.object({ deviceId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select().from(sshDeviceCommands)
        .where(eq(sshDeviceCommands.deviceId, input.deviceId))
        .orderBy(sshDeviceCommands.sortOrder, sshDeviceCommands.name);
    }),

  createDeviceCommand: protectedProcedure
    .input(z.object({
      deviceId: z.number(),
      name: z.string().min(1),
      description: z.string().optional(),
      command: z.string().min(1),
      category: z.string().default("diagnostico"),
      isDangerous: z.number().default(0),
      color: z.string().default("#3B82F6"),
      sortOrder: z.number().default(0),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [result] = await db.insert(sshDeviceCommands).values(input as any);
      return { id: (result as any).insertId };
    }),

  updateDeviceCommand: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      description: z.string().optional(),
      command: z.string().optional(),
      category: z.string().optional(),
      isDangerous: z.number().optional(),
      color: z.string().optional(),
      sortOrder: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...data } = input;
      const updateData = Object.fromEntries(
        Object.entries(data).filter(([_, v]) => v !== undefined)
      );
      await db.update(sshDeviceCommands).set(updateData as any).where(eq(sshDeviceCommands.id, id));
      return { updated: true };
    }),

  deleteDeviceCommand: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(sshDeviceCommands).where(eq(sshDeviceCommands.id, input.id));
      return { deleted: true };
    }),
});
