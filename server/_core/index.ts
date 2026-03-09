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

      const { format = "kml", elementIds, routeIds, includeFibers = false, fiberIds, exportTypes } = req.body ?? {};
      const typeCto = exportTypes?.cto !== false;
      const typeCeo = exportTypes?.ceo !== false;
      const typeCabo = exportTypes?.cabo !== false;
      const { zipSync, strToU8 } = await import("fflate");
      const dbMod = await import("../db");
      const [allElements, allRoutes, allCtos, allCeos, allFibers] = await Promise.all([
        getMapElements(),
        getMapRoutes(),
        getCtos(),
        dbMod.getCeos(),
        includeFibers ? dbMod.getFibers?.() ?? [] : [],
      ]);

      const elements = (elementIds?.length
        ? (allElements as any[]).filter((e: any) => elementIds.includes(e.id))
        : allElements as any[]).filter((e: any) => e.type === "cto" ? typeCto : typeCeo);
      const routes = typeCabo ? (routeIds?.length
        ? (allRoutes as any[]).filter((r: any) => routeIds.includes(r.id))
        : allRoutes as any[]) : [];
      const fibers = fiberIds?.length
        ? (allFibers as any[]).filter((f: any) => fiberIds.includes(f.id))
        : allFibers as any[];

      const ctoMap = new Map(allCtos.map((c: any) => [c.id, c]));
      const ceoMap = new Map((allCeos as any[]).map((c: any) => [c.id, c]));

      // placemarks por tipo gerados abaixo (ctoPlacemarks / ceoPlacemarks)

      const linemarks = routes.map((r: any) => {
        const fromEl = (elements as any[]).find((e: any) => e.id === r.fromElementId);
        const toEl = (elements as any[]).find((e: any) => e.id === r.toElementId);
        let coords = "";
        if (fromEl) coords += `${fromEl.lng},${fromEl.lat},0`;
        if (r.path) { try { const pts = JSON.parse(r.path); if (pts.length > 0) { if (coords) coords += " "; coords += pts.map((p: any) => `${p.lng},${p.lat},0`).join(" "); } } catch {} }
        if (toEl) coords += (coords ? " " : "") + `${toEl.lng},${toEl.lat},0`;
        if (!coords) return "";
        const rawColor = (r.color ?? "#22d3ee");
        const color = rawColor.startsWith("#") ? "ff" + rawColor.slice(1) : rawColor;
        const name = (r.name ?? `Cabo ${r.id}`).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
        return `  <Placemark>\n    <name>${name}</name>\n    <Style><LineStyle><color>${color}</color><width>3</width></LineStyle></Style>\n    <LineString><tessellate>1</tessellate><coordinates>${coords}</coordinates></LineString>\n  </Placemark>`;
      }).filter(Boolean).join("\n");

      // Separar CTOs e CEOs em pastas distintas
      const ctoPlacemarks = elements.filter((el: any) => el.type === "cto").map((el: any) => {
        const ref = ctoMap.get(el.referenceId);
        const name = (ref?.name ?? `CTO-${el.referenceId}`).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
        const iconColor = (ref?.status ?? "active") === "active" ? "ff00ff00" : (ref?.status ?? "active") === "maintenance" ? "ff00ffff" : "ff0000ff";
        return `    <Placemark>\n      <name>${name}</name>\n      <Style><IconStyle><color>${iconColor}</color><scale>1.2</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/square.png</href></Icon></IconStyle></Style>\n      <Point><coordinates>${el.lng},${el.lat},0</coordinates></Point>\n    </Placemark>`;
      }).join("\n");
      const ceoPlacemarks = elements.filter((el: any) => el.type === "ceo").map((el: any) => {
        const ref = ceoMap.get(el.referenceId);
        const name = (ref?.name ?? `CEO-${el.referenceId}`).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
        const iconColor = (ref?.status ?? "active") === "active" ? "ff00ffff" : (ref?.status ?? "active") === "maintenance" ? "ff00ff00" : "ff0000ff";
        return `    <Placemark>\n      <name>${name}</name>\n      <Style><IconStyle><color>${iconColor}</color><scale>1.2</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/donut.png</href></Icon></IconStyle></Style>\n      <Point><coordinates>${el.lng},${el.lat},0</coordinates></Point>\n    </Placemark>`;
      }).join("\n");
      // Gerar pastas KML apenas para os tipos com conteúdo (omitir pastas vazias)
      const ctoFolder = (typeCto && ctoPlacemarks) ? `  <Folder>\n    <name>CTOs</name>\n${ctoPlacemarks}\n  </Folder>` : "";
      const ceoFolder = (typeCeo && ceoPlacemarks) ? `  <Folder>\n    <name>CEOs</name>\n${ceoPlacemarks}\n  </Folder>` : "";
      const cableFolder = (typeCabo && linemarks) ? `  <Folder>\n    <name>Cabos de Fibra</name>\n${linemarks}\n  </Folder>` : "";
      const folders = [ctoFolder, ceoFolder, cableFolder].filter(Boolean).join("\n");
      const kml = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n  <name>FiberDoc — Infraestrutura de Rede</name>\n${folders}\n</Document>\n</kml>`;

      const filename = `fiberdoc-infraestrutura-${new Date().toISOString().slice(0,10)}`;
      if (format === "kmz") {
        const kmlU8 = strToU8(kml);
        const zipped = zipSync({ "doc.kml": [kmlU8, { level: 0 }] });
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
    // Seed admin padrão para instalações locais sem OAuth
    seedDefaultAdmin().catch(console.error);
  });
}

startServer().catch(console.error);
