import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import path from "path";
import fs from "fs";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerLocalAuthRoutes, seedDefaultAdmin } from "../localAuth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic } from "./serve-static";
import { startBackupScheduler, LOCAL_BACKUP_DIR } from "../backupScheduler";

import { startSnmpPoller } from "../snmpPoller";
import { startNetworkSnmpPoller } from "../networkSnmpPoller";
import type { WebhookPayload } from "../webhookHandler";
import { generateIpReportPdf } from "../ipReportPdf";
import { generateEquipmentReportPdf } from "../equipmentReportPdf";
import { generateFusionReportPdf } from "../fusionReportPdf";
import multer from "multer";
import { applyUpdate, getUpdateStatus, getCurrentVersion, getUpdateHistory } from "../systemUpdate";
import { getCtos, updateCto } from "../db";
import { sdk } from "./sdk";
import { getMapElements, getMapRoutes, getCeos } from "../db";

// Diretório local para uploads de imagens (logo, etc.) em servidores sem S3
const LOCAL_UPLOADS_DIR = process.env.BACKUP_LOCAL_DIR
  ? path.join(path.dirname(process.env.BACKUP_LOCAL_DIR), "uploads")
  : "/opt/fiberdoc/uploads";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

  // Local login (for standalone installations without OAuth)
  registerLocalAuthRoutes(app);

  // Webhook do SGP TSMx para sincronização automática
  app.post("/api/webhooks/sgp", async (req, res) => {
    try {
      const { handleSgpWebhook, validateWebhookSignature } = await import(
        "../webhookHandler"
      );

      // Validar assinatura do webhook
      const payload = JSON.stringify(req.body);
      const signature = req.headers["x-webhook-signature"] as string;

      if (signature) {
        const isValid = await validateWebhookSignature(payload, signature);
        if (!isValid) {
          console.warn("[Webhook] Assinatura inválida");
          return res.status(401).json({ error: "Assinatura inválida" });
        }
      }

      // Processar webhook
      const result = await handleSgpWebhook(req.body);

      if (result) {
        res.json({
          success: result.success,
          serial: result.serial,
          message: result.message,
        });
      } else {
        res.status(400).json({ error: "Falha ao processar webhook" });
      }
    } catch (err: any) {
      console.error("[Webhook] Erro:", err.message);
      res.status(500).json({ error: err.message || "Erro ao processar webhook" });
    }
  });
  // Relatório de IPs em PDF
  app.get("/api/ip-report-pdf", async (req, res) => {
    try {
      await generateIpReportPdf(res);
    } catch (err) {
      console.error("[ip-report-pdf] erro:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Erro ao gerar PDF" });
      }
    }
  });

  // Relatório de Equipamentos em PDF
  app.get("/api/equipment-report-pdf", async (req, res) => {
    try {
      const pdfBuffer = await generateEquipmentReportPdf();
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="FiberDoc_Equipamentos_${new Date().toISOString().slice(0,10)}.pdf"`);
      res.send(pdfBuffer);
    } catch (err) {
      console.error("[equipment-report-pdf] erro:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Erro ao gerar PDF" });
      }
    }
  });

  // Relatório de Fusões em PDF (CEO ou CTO)
  app.get("/api/fusion-report/:type/:id", async (req, res) => {
    try {
      const type = req.params.type as "ceo" | "cto";
      const id = parseInt(req.params.id);
      if (!id || !Number.isFinite(id) || (type !== "ceo" && type !== "cto")) {
        return res.status(400).json({ error: "Parâmetros inválidos" });
      }
      const pdfBuffer = await generateFusionReportPdf(type, id);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="FiberDoc_Fusoes_${type.toUpperCase()}_${id}_${new Date().toISOString().slice(0,10)}.pdf"`);
      res.send(pdfBuffer);
    } catch (err) {
      console.error("[fusion-report-pdf] erro:", err);
      if (!res.headersSent) res.status(500).json({ error: "Erro ao gerar PDF" });
    }
  });

  // ─── Atualização Remota ───────────────────────────────────────────────────
  const uploadStorage = multer({ dest: "/tmp/fiberdoc-uploads/", limits: { fileSize: 500 * 1024 * 1024 } });

  // Versão atual
  app.get("/api/system/version", async (_req, res) => {
    try {
      const [version, history] = await Promise.all([getCurrentVersion(), getUpdateHistory()]);
      res.json({ version, history });
    } catch (err) {
      res.status(500).json({ error: "Erro ao obter versão" });
    }
  });

  // Status da atualização em andamento (SSE)
  app.get("/api/system/update-status", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const send = () => {
      const status = getUpdateStatus();
      res.write(`data: ${JSON.stringify(status)}\n\n`);
      if (!status.running && (status.completedAt || status.error)) {
        clearInterval(timer);
        res.end();
      }
    };
    send();
    const timer = setInterval(send, 800);
    req.on("close", () => clearInterval(timer));
  });

  // Upload e aplicação de atualização
  app.post("/api/system/update", uploadStorage.single("update"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado" });
    try {
      // Aplicar em background
      applyUpdate(req.file.path, req.file.originalname).catch(console.error);
      res.json({ ok: true, message: "Atualização iniciada" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Servir uploads locais de imagens (logo, etc.) para servidores sem S3
  app.get("/api/uploads/:filename", (req, res) => {
    try {
      const filename = req.params.filename;
      if (!filename || filename.includes("..") || filename.includes("/")) {
        return res.status(400).json({ error: "Nome de arquivo inválido" });
      }
      const filePath = path.join(LOCAL_UPLOADS_DIR, filename);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Arquivo não encontrado" });
      }
      const ext = path.extname(filename).toLowerCase();
      const mimeTypes: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml" };
      res.setHeader("Content-Type", mimeTypes[ext] ?? "application/octet-stream");
      res.setHeader("Cache-Control", "public, max-age=86400");
      fs.createReadStream(filePath).pipe(res);
    } catch (err: any) {
      console.error("[uploads] erro:", err);
      if (!res.headersSent) res.status(500).json({ error: "Erro ao servir arquivo" });
    }
  });

  // Download de backup local (para servidores sem S3)
  app.get("/api/backup/download/:filename", (req, res) => {
    try {
      const filename = req.params.filename;
      // Sanitizar nome do arquivo para evitar path traversal
      if (!filename || filename.includes("..") || filename.includes("/") || !filename.endsWith(".json")) {
        return res.status(400).json({ error: "Nome de arquivo inválido" });
      }
      const filePath = path.join(LOCAL_BACKUP_DIR, filename);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Arquivo não encontrado" });
      }
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      fs.createReadStream(filePath).pipe(res);
    } catch (err: any) {
      console.error("[backup-download] erro:", err);
      if (!res.headersSent) res.status(500).json({ error: "Erro ao baixar backup" });
    }
  });

  // ─── API REST: Vínculo CTO ↔ SGP (para automação/cURL) ──────────────────────
  // GET  /api/cto/sgp-links          → lista todos os vínculos CTO local ↔ SGP
  // POST /api/cto/:ctoId/link-sgp    → { sgpId: number } vincula CTO ao SGP
  // DELETE /api/cto/:ctoId/link-sgp  → remove vínculo SGP da CTO
  app.get("/api/cto/sgp-links", async (_req, res) => {
    try {
      const all = await getCtos();
      const links = all
        .filter(c => c.sgpId != null)
        .map(c => ({ ctoId: c.id, ctoName: c.name, sgpId: c.sgpId }));
      res.json({ ok: true, links });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message ?? "Erro interno" });
    }
  });

  app.post("/api/cto/:ctoId/link-sgp", async (req, res) => {
    try {
      const ctoId = parseInt(req.params.ctoId);
      const sgpId = parseInt(req.body?.sgpId);
      if (!Number.isFinite(ctoId) || !Number.isFinite(sgpId)) {
        return res.status(400).json({ ok: false, error: "ctoId e sgpId devem ser números inteiros válidos" });
      }
      await updateCto(ctoId, { sgpId });
      res.json({ ok: true, ctoId, sgpId });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message ?? "Erro interno" });
    }
  });

  app.delete("/api/cto/:ctoId/link-sgp", async (req, res) => {
    try {
      const ctoId = parseInt(req.params.ctoId);
      if (!Number.isFinite(ctoId)) {
        return res.status(400).json({ ok: false, error: "ctoId deve ser um número inteiro válido" });
      }
      await updateCto(ctoId, { sgpId: null });
      res.json({ ok: true, ctoId, sgpId: null });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message ?? "Erro interno" });
    }
  });

  // tRPC API
  // Endpoint dedicado de exportação KML/KMZ (evita limite de URL do httpBatchLink)
  app.post("/api/export-kml", async (req, res) => {
    try {
      // Verificar autenticação via cookie
      let user: any = null;
      try { user = await sdk.authenticateRequest(req as any); } catch {}
      if (!user) { res.status(401).json({ error: "Não autenticado" }); return; }

      const {
        format = "kml",
        elementIds,
        routeIds,
        includeFibers = false,
        fiberIds,
        exportTypes,
        exportGroupId,       // se definido, exportar apenas elementos deste grupo
        includePoles = true,
        includeReserves = true,
        includeFusions = true,
      } = req.body ?? {};
      const typeCto = exportTypes?.cto !== false;
      const typeCeo = exportTypes?.ceo !== false;
      const typeCabo = exportTypes?.cabo !== false;

      const { zipSync, strToU8 } = await import("fflate");
      const dbMod = await import("../db");

      // ── Carregar todos os dados em paralelo ──────────────────────────────────
      const [allElements, allRoutes, allCtos, allCeos, allPoles, allReserves, allGroups,
             allElementMemberships, allRouteMemberships, allPoleMemberships, allReserveMemberships] = await Promise.all([
        getMapElements(),
        getMapRoutes(),
        getCtos(),
        dbMod.getCeos(),
        dbMod.getMapPoles(),
        dbMod.getMapTechnicalReserves(),
        dbMod.getMapGroups(),
        dbMod.getAllElementGroupMemberships(),
        dbMod.getAllRouteGroupMemberships(),
        dbMod.getAllPoleGroupMemberships(),
        dbMod.getAllReserveGroupMemberships(),
      ]);

      // ── Filtrar por grupo se solicitado ─────────────────────────────────────
      const filterByGroup = (id: number, memberships: any[], key: string) =>
        exportGroupId ? memberships.some((m: any) => m.groupId === exportGroupId && m[key] === id) : true;

      let elements = (allElements as any[]).filter((e: any) => e.type === "cto" ? typeCto : typeCeo);
      if (elementIds?.length) elements = elements.filter((e: any) => elementIds.includes(e.id));
      if (exportGroupId) elements = elements.filter((e: any) => filterByGroup(e.id, allElementMemberships as any[], "elementId"));

      let routes = typeCabo ? (allRoutes as any[]) : [];
      if (routeIds?.length) routes = routes.filter((r: any) => routeIds.includes(r.id));
      if (exportGroupId) routes = routes.filter((r: any) => filterByGroup(r.id, allRouteMemberships as any[], "routeId"));

      let poles = includePoles ? (allPoles as any[]) : [];
      if (exportGroupId) poles = poles.filter((p: any) => filterByGroup(p.id, allPoleMemberships as any[], "poleId"));

      let reserves = includeReserves ? (allReserves as any[]) : [];
      if (exportGroupId) reserves = reserves.filter((r: any) => filterByGroup(r.id, allReserveMemberships as any[], "reserveId"));

      const ctoMap = new Map(allCtos.map((c: any) => [c.id, c]));
      const ceoMap = new Map((allCeos as any[]).map((c: any) => [c.id, c]));
      const groupMap = new Map((allGroups as any[]).map((g: any) => [g.id, g]));

      // ── Helpers ─────────────────────────────────────────────────────────────
      const esc = (s: string) => (s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
      const hexToKml = (hex: string | null | undefined, alpha = "ff") => {
        if (!hex) return null;
        const h = hex.replace("#","");
        if (h.length !== 6) return null;
        // KML usa AABBGGRR
        return alpha + h.slice(4,6) + h.slice(2,4) + h.slice(0,2);
      };
      const statusColor = (status: string | null | undefined, type: "cto" | "ceo") => {
        const s = status ?? "active";
        if (type === "cto") return s === "active" ? "ff00ff00" : s === "maintenance" ? "ff00ffff" : "ff0000ff";
        return s === "active" ? "ff00ffff" : s === "maintenance" ? "ff00ff00" : "ff0000ff";
      };

      // ── Construir descrição rica de fusões para CEO ──────────────────────────
      const buildCeoDescription = async (ceoId: number, ref: any): Promise<string> => {
        if (!includeFusions) return "";
        try {
          const [tubes, vias, splitters, splitterVias, associations] = await Promise.all([
            dbMod.getTubesByCeo(ceoId),
            dbMod.getViasByCeo(ceoId),
            dbMod.getSplittersByCeo(ceoId),
            dbMod.getSplitterViasByCeo(ceoId),
            dbMod.getViaAssociationsByCeo(ceoId),
          ]);
          const lines: string[] = [];
          const totalVias = vias.length;
          const fusedVias = vias.filter((v: any) => v.fusedToViaId || v.fusedToSplitterId).length;
          const fusedAssoc = associations.length;
          lines.push(`Status: ${ref?.status ?? "active"}`);
          if (ref?.location) lines.push(`Localização: ${ref.location}`);
          lines.push(`Tubos: ${tubes.length} | Splitters: ${splitters.length}`);
          lines.push(`Vias: ${totalVias} total | ${fusedVias + fusedAssoc} fusionadas | ${totalVias - fusedVias - fusedAssoc} livres`);
          lines.push("");
          // Tubos
          for (const tube of tubes) {
            const tubeVias = vias.filter((v: any) => v.tubeId === tube.id).sort((a: any, b: any) => a.viaNumber - b.viaNumber);
            const fusedCount = tubeVias.filter((v: any) => v.fusedToViaId || v.fusedToSplitterId).length;
            lines.push(`▶ ${tube.identifier} (${tubeVias.length} vias, ${fusedCount} fusionadas)`);
            for (const via of tubeVias) {
              let dest = "livre";
              if (via.fusedToViaId) {
                const destVia = vias.find((v: any) => v.id === via.fusedToViaId);
                const destTube = destVia ? tubes.find((t: any) => t.id === destVia.tubeId) : null;
                dest = destVia ? `→ ${destTube?.identifier ?? "?"} / Via ${destVia.viaNumber}${destVia.label ? " (" + destVia.label + ")" : ""}` : "→ ?";
              } else if (via.fusedToSplitterId) {
                const destSpl = splitters.find((s: any) => s.id === via.fusedToSplitterId);
                const destSplVia = via.fusedToSplitterViaId ? splitterVias.find((sv: any) => sv.id === via.fusedToSplitterViaId) : null;
                dest = `→ ${destSpl?.identifier ?? "SPL"} / ${destSplVia ? (destSplVia.viaNumber === 0 ? "ENT" : "Via " + destSplVia.viaNumber) : "?"}` ;
              } else {
                // Verificar associações
                const assoc = associations.find((a: any) => a.sourceType === "tube" && a.sourceViaId === via.id);
                if (assoc) {
                  const destSpl = splitters.find((s: any) => s.id === assoc.targetViaId || splitterVias.some((sv: any) => sv.id === assoc.targetViaId && sv.splitterId === s.id));
                  const destSplVia = splitterVias.find((sv: any) => sv.id === assoc.targetViaId);
                  const spl = destSplVia ? splitters.find((s: any) => s.id === destSplVia.splitterId) : null;
                  dest = spl ? `→ ${spl.identifier} / ${destSplVia?.viaNumber === 0 ? "ENT" : "Via " + destSplVia?.viaNumber}` : "→ SPL";
                }
              }
              const label = via.label ? ` [${via.label}]` : "";
              lines.push(`  Via ${via.viaNumber}${label}: ${dest}`);
            }
          }
          // Splitters
          for (const spl of splitters) {
            const splVias = splitterVias.filter((sv: any) => sv.splitterId === spl.id).sort((a: any, b: any) => a.viaNumber - b.viaNumber);
            lines.push("");
            lines.push(`▶ ${spl.identifier} (${spl.ratio}, ${spl.splitterType === "balanced" ? "balanceado" : "desbalanceado"})`);
            for (const sv of splVias) {
              const assoc = associations.find((a: any) => (a.sourceType === "splitter" && a.sourceViaId === sv.id) || (a.targetType === "splitter" && a.targetViaId === sv.id));
              let dest = "livre";
              if (assoc) {
                const tubeViaId = assoc.sourceType === "splitter" ? assoc.targetViaId : assoc.sourceViaId;
                const tubeVia = vias.find((v: any) => v.id === tubeViaId);
                const tube = tubeVia ? tubes.find((t: any) => t.id === tubeVia.tubeId) : null;
                dest = tubeVia ? `→ ${tube?.identifier ?? "?"} / Via ${tubeVia.viaNumber}` : "→ ?";
              }
              const viaLabel = sv.viaNumber === 0 ? "ENT" : `Via ${sv.viaNumber}`;
              lines.push(`  ${viaLabel}: ${dest}`);
            }
          }
          if (ref?.notes) { lines.push(""); lines.push(`Notas: ${ref.notes}`); }
          return lines.join("&#10;");
        } catch { return ""; }
      };

      // ── Construir descrição rica de fusões para CTO ──────────────────────────
      const buildCtoDescription = async (ctoId: number, ref: any): Promise<string> => {
        if (!includeFusions) return "";
        try {
          const [tubes, vias, associations] = await Promise.all([
            dbMod.getTubesByCto(ctoId),
            dbMod.getViasByCto(ctoId),
            dbMod.getViaAssociationsByCto(ctoId),
          ]);
          const lines: string[] = [];
          const fusedVias = vias.filter((v: any) => v.fusedToViaId).length;
          const fusedAssoc = associations.length;
          lines.push(`Status: ${ref?.status ?? "active"}`);
          if (ref?.address) lines.push(`Endereço: ${ref.address}`);
          lines.push(`Capacidade: ${ref?.capacity ?? 0} portas | Usadas: ${ref?.usedPorts ?? 0} | Livres: ${(ref?.capacity ?? 0) - (ref?.usedPorts ?? 0)}`);
          lines.push(`Tubos/Splitters: ${tubes.length}`);
          lines.push(`Vias: ${vias.length} total | ${fusedVias + fusedAssoc} fusionadas | ${vias.length - fusedVias - fusedAssoc} livres`);
          lines.push("");
          for (const tube of tubes) {
            const tubeVias = vias.filter((v: any) => v.tubeId === tube.id).sort((a: any, b: any) => a.viaNumber - b.viaNumber);
            const fusedCount = tubeVias.filter((v: any) => v.fusedToViaId).length;
            const typeLabel = tube.type === "splitter" ? `Splitter ${tube.ratio ?? ""}` : "Tubo";
            lines.push(`▶ ${tube.identifier} [${typeLabel}] (${tubeVias.length} vias, ${fusedCount} fusionadas)`);
            for (const via of tubeVias) {
              let dest = "livre";
              if (via.fusedToViaId) {
                const destVia = vias.find((v: any) => v.id === via.fusedToViaId);
                const destTube = destVia ? tubes.find((t: any) => t.id === destVia.tubeId) : null;
                const viaLabel = destVia?.viaNumber === 0 ? "ENT" : `Via ${destVia?.viaNumber}`;
                dest = destVia ? `→ ${destTube?.identifier ?? "?"} / ${viaLabel}${destVia.label ? " (" + destVia.label + ")" : ""}` : "→ ?";
              } else {
                const assoc = associations.find((a: any) => (a.sourceType === "tube" && a.sourceViaId === via.id) || (a.targetType === "tube" && a.targetViaId === via.id));
                if (assoc) {
                  const otherViaId = assoc.sourceType === "tube" && assoc.sourceViaId === via.id ? assoc.targetViaId : assoc.sourceViaId;
                  const otherVia = vias.find((v: any) => v.id === otherViaId);
                  const otherTube = otherVia ? tubes.find((t: any) => t.id === otherVia.tubeId) : null;
                  const viaLabel = otherVia?.viaNumber === 0 ? "ENT" : `Via ${otherVia?.viaNumber}`;
                  dest = otherVia ? `→ ${otherTube?.identifier ?? "SPL"} / ${viaLabel}` : "→ SPL";
                }
              }
              const label = via.label ? ` [${via.label}]` : "";
              const viaNum = via.viaNumber === 0 ? "ENT" : `Via ${via.viaNumber}`;
              lines.push(`  ${viaNum}${label}: ${dest}`);
            }
          }
          if (ref?.notes) { lines.push(""); lines.push(`Notas: ${ref.notes}`); }
          return lines.join("&#10;");
        } catch { return ""; }
      };

      // ── Haversine para comprimento de cabos ─────────────────────────────────
      const haversineM = (a: {lat:number;lng:number}, b: {lat:number;lng:number}) => {
        const R = 6371000;
        const dLat = (b.lat - a.lat) * Math.PI / 180;
        const dLng = (b.lng - a.lng) * Math.PI / 180;
        const s = Math.sin(dLat/2)**2 + Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2;
        return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1-s));
      };
      const calcRouteLen = (route: any, fromEl: any, toEl: any): number => {
        const pts: {lat:number;lng:number}[] = [];
        if (fromEl) pts.push({lat: fromEl.lat, lng: fromEl.lng});
        if (route.path) { try { pts.push(...JSON.parse(route.path)); } catch {} }
        if (toEl) pts.push({lat: toEl.lat, lng: toEl.lng});
        let d = 0;
        for (let i = 1; i < pts.length; i++) d += haversineM(pts[i-1], pts[i]);
        return d;
      };

      // ── Construir placemarks de cabos ────────────────────────────────────────
      const allElementsMap = new Map((allElements as any[]).map((e: any) => [e.id, e]));
      const linemarks = routes.map((r: any) => {
        const fromEl = allElementsMap.get(r.fromElementId);
        const toEl = allElementsMap.get(r.toElementId);
        let coords = "";
        if (fromEl) coords += `${fromEl.lng},${fromEl.lat},0`;
        if (r.path) { try { const pts = JSON.parse(r.path); if (pts.length > 0) { if (coords) coords += " "; coords += pts.map((p: any) => `${p.lng},${p.lat},0`).join(" "); } } catch {} }
        if (toEl) coords += (coords ? " " : "") + `${toEl.lng},${toEl.lat},0`;
        if (!coords) return "";
        const rawColor = (r.color ?? "#22d3ee");
        const kmlColor = hexToKml(rawColor) ?? ("ff" + rawColor.replace("#",""));
        const name = esc(r.name ?? `Cabo ${r.id}`);
        const lenM = calcRouteLen(r, fromEl, toEl);
        const lenStr = lenM > 0 ? `${Math.round(lenM)} m` : "";
        const fromName = fromEl ? esc((fromEl.type === "cto" ? ctoMap.get(fromEl.referenceId)?.name : ceoMap.get(fromEl.referenceId)?.name) ?? fromEl.type.toUpperCase() + "-" + fromEl.referenceId) : "";
        const toName = toEl ? esc((toEl.type === "cto" ? ctoMap.get(toEl.referenceId)?.name : ceoMap.get(toEl.referenceId)?.name) ?? toEl.type.toUpperCase() + "-" + toEl.referenceId) : "";
        const desc = [
          r.cableType ? `Tipo: ${r.cableType}` : "",
          `Fibras: ${r.fiberCount ?? 12}`,
          lenStr ? `Comprimento: ${lenStr}` : "",
          fromName ? `De: ${fromName}` : "",
          toName ? `Para: ${toName}` : "",
          r.notes ? `Notas: ${esc(r.notes)}` : "",
        ].filter(Boolean).join("&#10;");
        return `    <Placemark>\n      <name>${name}</name>\n      <description>${desc}</description>\n      <Style><LineStyle><color>${kmlColor}</color><width>3</width></LineStyle></Style>\n      <LineString><tessellate>1</tessellate><coordinates>${coords}</coordinates></LineString>\n    </Placemark>`;
      }).filter(Boolean).join("\n");

      // ── Construir placemarks de CTOs ─────────────────────────────────────────
      const ctoPlacemarksList: string[] = [];
      for (const el of elements.filter((e: any) => e.type === "cto")) {
        const ref = ctoMap.get(el.referenceId);
        const name = esc(ref?.name ?? `CTO-${el.referenceId}`);
        const elColor = el.color ? hexToKml(el.color) : null;
        const iconColor = elColor ?? statusColor(ref?.status, "cto");
        const desc = await buildCtoDescription(el.referenceId, ref);
        ctoPlacemarksList.push(`    <Placemark>\n      <name>${name}</name>\n      <description>${desc}</description>\n      <Style><IconStyle><color>${iconColor}</color><scale>1.2</scale><Icon><href>icons/cto.png</href></Icon></IconStyle></Style>\n      <Point><coordinates>${el.lng},${el.lat},0</coordinates></Point>\n    </Placemark>`);
      }

      // ── Construir placemarks de CEOs ─────────────────────────────────────────
      const ceoPlacemarksList: string[] = [];
      for (const el of elements.filter((e: any) => e.type === "ceo")) {
        const ref = ceoMap.get(el.referenceId);
        const name = esc(ref?.name ?? `CEO-${el.referenceId}`);
        const elColor = el.color ? hexToKml(el.color) : null;
        const iconColor = elColor ?? statusColor(ref?.status, "ceo");
        const desc = await buildCeoDescription(el.referenceId, ref);
        ceoPlacemarksList.push(`    <Placemark>\n      <name>${name}</name>\n      <description>${desc}</description>\n      <Style><IconStyle><color>${iconColor}</color><scale>1.2</scale><Icon><href>icons/ceo.png</href></Icon></IconStyle></Style>\n      <Point><coordinates>${el.lng},${el.lat},0</coordinates></Point>\n    </Placemark>`);
      }

      // ── Construir placemarks de Postes ───────────────────────────────────────
      const polePlacemarks = poles.map((p: any) => {
        const name = esc(p.name ?? `Poste-${p.id}`);
        const desc = [
          p.reference ? `Referência: ${esc(p.reference)}` : "",
          p.effort ? `Esforço: ${esc(p.effort)}` : "",
          p.notes ? `Notas: ${esc(p.notes)}` : "",
        ].filter(Boolean).join("&#10;");
        return `    <Placemark>\n      <name>${name}</name>\n      <description>${desc}</description>\n      <Style><IconStyle><color>ff0088ff</color><scale>0.9</scale><Icon><href>icons/pole.png</href></Icon></IconStyle></Style>\n      <Point><coordinates>${p.lng},${p.lat},0</coordinates></Point>\n    </Placemark>`;
      }).join("\n");

      // ── Construir placemarks de Reservas ─────────────────────────────────────
      const reservePlacemarks = reserves.map((r: any) => {
        const name = esc(r.name ?? `Reserva-${r.id}`);
        const routeRef = r.routeId ? (allRoutes as any[]).find((rt: any) => rt.id === r.routeId) : null;
        const desc = [
          `Tamanho: ${r.sizeMeters ?? 0} m`,
          routeRef ? `Rota: ${esc(routeRef.name ?? `Cabo ${routeRef.id}`)}` : "",
          r.notes ? `Notas: ${esc(r.notes)}` : "",
        ].filter(Boolean).join("&#10;");
        return `    <Placemark>\n      <name>${name}</name>\n      <description>${desc}</description>\n      <Style><IconStyle><color>ff00aaff</color><scale>0.9</scale><Icon><href>icons/reserve.png</href></Icon></IconStyle></Style>\n      <Point><coordinates>${r.lng},${r.lat},0</coordinates></Point>\n    </Placemark>`;
      }).join("\n");

      // ── Organizar em pastas por grupo ────────────────────────────────────────
      const buildGroupFolders = () => {
        if (!exportGroupId && (allGroups as any[]).length === 0) return null;
        // Mapear cada elemento ao(s) seu(s) grupo(s)
        const elGroupMap = new Map<number, number[]>();
        (allElementMemberships as any[]).forEach((m: any) => {
          if (!elGroupMap.has(m.elementId)) elGroupMap.set(m.elementId, []);
          elGroupMap.get(m.elementId)!.push(m.groupId);
        });
        const routeGroupMap = new Map<number, number[]>();
        (allRouteMemberships as any[]).forEach((m: any) => {
          if (!routeGroupMap.has(m.routeId)) routeGroupMap.set(m.routeId, []);
          routeGroupMap.get(m.routeId)!.push(m.groupId);
        });
        const poleGroupMap = new Map<number, number[]>();
        (allPoleMemberships as any[]).forEach((m: any) => {
          if (!poleGroupMap.has(m.poleId)) poleGroupMap.set(m.poleId, []);
          poleGroupMap.get(m.poleId)!.push(m.groupId);
        });
        const reserveGroupMap = new Map<number, number[]>();
        (allReserveMemberships as any[]).forEach((m: any) => {
          if (!reserveGroupMap.has(m.reserveId)) reserveGroupMap.set(m.reserveId, []);
          reserveGroupMap.get(m.reserveId)!.push(m.groupId);
        });
        return { elGroupMap, routeGroupMap, poleGroupMap, reserveGroupMap };
      };
      const groupMaps = buildGroupFolders();

      // ── Montar estrutura de pastas ───────────────────────────────────────────
      let folders = "";

      if ((allGroups as any[]).length > 0 && !exportGroupId) {
        // Organizar por grupo
        const groupFolders: string[] = [];
        const assignedElIds = new Set<number>();
        const assignedRouteIds = new Set<number>();
        const assignedPoleIds = new Set<number>();
        const assignedReserveIds = new Set<number>();

        for (const group of (allGroups as any[])) {
          const gColor = group.color ? hexToKml(group.color) : "ff4488ff";
          const groupItems: string[] = [];

          // CTOs do grupo
          if (typeCto) {
            for (let i = 0; i < ctoPlacemarksList.length; i++) {
              const el = elements.filter((e: any) => e.type === "cto")[i];
              if (!el) continue;
              if (groupMaps?.elGroupMap.get(el.id)?.includes(group.id)) {
                groupItems.push(ctoPlacemarksList[i]);
                assignedElIds.add(el.id);
              }
            }
          }
          // CEOs do grupo
          if (typeCeo) {
            const ceoEls = elements.filter((e: any) => e.type === "ceo");
            for (let i = 0; i < ceoPlacemarksList.length; i++) {
              const el = ceoEls[i];
              if (!el) continue;
              if (groupMaps?.elGroupMap.get(el.id)?.includes(group.id)) {
                groupItems.push(ceoPlacemarksList[i]);
                assignedElIds.add(el.id);
              }
            }
          }
          // Cabos do grupo
          if (typeCabo) {
            routes.forEach((r: any, i: number) => {
              if (groupMaps?.routeGroupMap.get(r.id)?.includes(group.id)) {
                const pm = linemarks.split("\n    <Placemark>")[i+1];
                if (pm) { groupItems.push("    <Placemark>" + pm.split("</Placemark>")[0] + "</Placemark>"); }
                assignedRouteIds.add(r.id);
              }
            });
          }
          // Postes do grupo
          if (includePoles) {
            poles.forEach((p: any, i: number) => {
              if (groupMaps?.poleGroupMap.get(p.id)?.includes(group.id)) {
                const pm = polePlacemarks.split("\n    <Placemark>")[i+1];
                if (pm) { groupItems.push("    <Placemark>" + pm.split("</Placemark>")[0] + "</Placemark>"); }
                assignedPoleIds.add(p.id);
              }
            });
          }
          // Reservas do grupo
          if (includeReserves) {
            reserves.forEach((r: any, i: number) => {
              if (groupMaps?.reserveGroupMap.get(r.id)?.includes(group.id)) {
                const pm = reservePlacemarks.split("\n    <Placemark>")[i+1];
                if (pm) { groupItems.push("    <Placemark>" + pm.split("</Placemark>")[0] + "</Placemark>"); }
                assignedReserveIds.add(r.id);
              }
            });
          }

          if (groupItems.length > 0) {
            groupFolders.push(`  <Folder>\n    <name>${esc(group.name)}</name>${group.description ? `\n    <description>${esc(group.description)}</description>` : ""}\n${groupItems.join("\n")}\n  </Folder>`);
          }
        }

        // Pasta "Sem Grupo" para elementos não atribuídos
        const semGrupoItems: string[] = [];
        if (typeCto) {
          const ctoEls = elements.filter((e: any) => e.type === "cto");
          ctoEls.forEach((el: any, i: number) => {
            if (!assignedElIds.has(el.id)) semGrupoItems.push(ctoPlacemarksList[i]);
          });
        }
        if (typeCeo) {
          const ceoEls = elements.filter((e: any) => e.type === "ceo");
          ceoEls.forEach((el: any, i: number) => {
            if (!assignedElIds.has(el.id)) semGrupoItems.push(ceoPlacemarksList[i]);
          });
        }
        if (typeCabo) {
          routes.forEach((r: any, i: number) => {
            if (!assignedRouteIds.has(r.id)) {
              const pm = linemarks.split("\n    <Placemark>")[i+1];
              if (pm) semGrupoItems.push("    <Placemark>" + pm.split("</Placemark>")[0] + "</Placemark>");
            }
          });
        }
        if (includePoles) {
          poles.forEach((p: any, i: number) => {
            if (!assignedPoleIds.has(p.id)) {
              const pm = polePlacemarks.split("\n    <Placemark>")[i+1];
              if (pm) semGrupoItems.push("    <Placemark>" + pm.split("</Placemark>")[0] + "</Placemark>");
            }
          });
        }
        if (includeReserves) {
          reserves.forEach((r: any, i: number) => {
            if (!assignedReserveIds.has(r.id)) {
              const pm = reservePlacemarks.split("\n    <Placemark>")[i+1];
              if (pm) semGrupoItems.push("    <Placemark>" + pm.split("</Placemark>")[0] + "</Placemark>");
            }
          });
        }
        if (semGrupoItems.length > 0) {
          groupFolders.push(`  <Folder>\n    <name>Sem Grupo</name>\n${semGrupoItems.join("\n")}\n  </Folder>`);
        }

        folders = groupFolders.join("\n");
      } else {
        // Sem grupos — pastas planas por tipo
        const ctoFolder = (typeCto && ctoPlacemarksList.length > 0) ? `  <Folder>\n    <name>CTOs</name>\n${ctoPlacemarksList.join("\n")}\n  </Folder>` : "";
        const ceoFolder = (typeCeo && ceoPlacemarksList.length > 0) ? `  <Folder>\n    <name>CEOs</name>\n${ceoPlacemarksList.join("\n")}\n  </Folder>` : "";
        const cableFolder = (typeCabo && linemarks) ? `  <Folder>\n    <name>Cabos de Fibra</name>\n${linemarks}\n  </Folder>` : "";
        const poleFolder = (includePoles && polePlacemarks) ? `  <Folder>\n    <name>Postes</name>\n${polePlacemarks}\n  </Folder>` : "";
        const reserveFolder = (includeReserves && reservePlacemarks) ? `  <Folder>\n    <name>Reservas Técnicas</name>\n${reservePlacemarks}\n  </Folder>` : "";
        folders = [ctoFolder, ceoFolder, cableFolder, poleFolder, reserveFolder].filter(Boolean).join("\n");
      }

      const kml = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n  <name>FiberDoc — Infraestrutura de Rede</name>\n  <description>Exportado em ${new Date().toLocaleString("pt-BR")}</description>\n${folders}\n</Document>\n</kml>`;

      const filename = `fiberdoc-infraestrutura-${new Date().toISOString().slice(0,10)}`;
      if (format === "kmz") {
        const kmlU8 = strToU8(kml);
        // Incluir ícones PNG embutidos para funcionamento offline no Google Earth Desktop
        const { KMZ_ICONS } = await import("../kmzIcons");
        const iconEntries: Record<string, [Uint8Array, { level: number }]> = {};
        for (const [iconPath, b64] of Object.entries(KMZ_ICONS)) {
          iconEntries[iconPath] = [Buffer.from(b64, "base64") as unknown as Uint8Array, { level: 0 }];
        }
        const zipped = zipSync({ "doc.kml": [kmlU8, { level: 0 }], ...iconEntries });
        res.setHeader("Content-Type", "application/vnd.google-earth.kmz");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}.kmz"`);
        res.send(Buffer.from(zipped));
      } else {
        res.setHeader("Content-Type", "application/vnd.google-earth.kml+xml; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}.kml"`);
        res.send(kml);
      }
    } catch (err: any) {
      console.error("[export-kml] erro:", err);
      if (!res.headersSent) res.status(500).json({ error: err.message ?? "Erro ao exportar" });
    }
  });

  // ─── SSH Commander: execução em streaming (SSE) ────────────────────────────────────
  app.get("/api/ssh/execute-stream", async (req, res) => {
    const { equipmentId, commandId, params, sessionId } = req.query as Record<string, string>;
    if (!equipmentId || !commandId || !sessionId) {
      return res.status(400).json({ error: "Parâmetros obrigatórios em falta" });
    }
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    try {
      const sshMod = await import("../ssh");
      const { getDb } = await import("../db");
      const schema = await import("../../drizzle/schema");
      const { eq: eqD } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) { res.write(`data: ${JSON.stringify({ type: "error", data: "DB indisponível" })}\n\n`); return res.end(); }
      const cred = await sshMod.getSshCredential(parseInt(equipmentId));
      if (!cred) { res.write(`data: ${JSON.stringify({ type: "error", data: "Credenciais SSH não configuradas" })}\n\n`); return res.end(); }
      const cmdRows = await db.select().from(schema.sshCommands).where(eqD(schema.sshCommands.id, parseInt(commandId)));
      const cmd = cmdRows[0];
      if (!cmd) { res.write(`data: ${JSON.stringify({ type: "error", data: "Comando não encontrado" })}\n\n`); return res.end(); }
      const equipRows = await db.select().from(schema.equipments).where(eqD(schema.equipments.id, parseInt(equipmentId)));
      const equip = equipRows[0];
      if (!equip) { res.write(`data: ${JSON.stringify({ type: "error", data: "Equipamento não encontrado" })}\n\n`); return res.end(); }
      let password: string;
      try { password = sshMod.decryptPassword(cred.sshPasswordEnc); }
      catch { res.write(`data: ${JSON.stringify({ type: "error", data: "Erro ao desencriptar credenciais" })}\n\n`); return res.end(); }
      const rawLines = JSON.parse(cmd.commandLines) as string[];
      const parsedParams: Record<string, string> = params ? JSON.parse(decodeURIComponent(params)) : {};
      const lines = sshMod.applyParams(rawLines, parsedParams);
      const host = (equip as any).ipAddress ?? equip.name;
      const confirmMode = (cmd as any).confirmMode ?? "none";
      req.on("close", () => {
        const sess = sshMod.getActiveSession(sessionId);
        if (sess) { try { sess.conn.end(); } catch {} }
      });
      const result = await sshMod.executeSshCommand(host, cred.sshPort, cred.sshUser, password, lines, cmd.sleepMs, confirmMode as any, sessionId, res);
      if (confirmMode !== "manual") {
        await db.insert(schema.sshExecutionLog).values({
          equipmentId: parseInt(equipmentId), commandId: parseInt(commandId),
          commandName: cmd.name, params: params ?? null,
          output: result.output, success: result.success, executedBy: "stream",
        }).catch(() => {});
      }
    } catch (err: any) {
      if (!res.writableEnded) { res.write(`data: ${JSON.stringify({ type: "error", data: err.message })}\n\n`); res.end(); }
    }
  });
  // Responder confirmação interactiva (Y/N)
  app.post("/api/ssh/confirm", express.json(), async (req, res) => {
    const { sessionId, answer } = req.body as { sessionId: string; answer: "y" | "n" };
    if (!sessionId || !answer) return res.status(400).json({ error: "sessionId e answer são obrigatórios" });
    const { respondToConfirm } = await import("../ssh");
    const ok = respondToConfirm(sessionId, answer);
    res.json({ ok });
  });
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    // Dynamic import so vite (devDependency) is never loaded in production
    const { setupVite } = await import("./vite.js");
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    // Start backup scheduler after server is ready
    startBackupScheduler();
    // Start SNMP poller for power sources
    startSnmpPoller();
    // Start SNMP poller for network equipment (switches, routers, OLTs)
    startNetworkSnmpPoller();
    // Seed admin padrão para instalações locais sem OAuth
    seedDefaultAdmin().catch(console.error);
  });
}

startServer().catch(console.error);
