import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerLocalAuthRoutes, seedDefaultAdmin } from "../localAuth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { startBackupScheduler } from "../backupScheduler";
import { startSnmpPoller } from "../snmpPoller";
import { generateIpReportPdf } from "../ipReportPdf";
import { generateEquipmentReportPdf } from "../equipmentReportPdf";
import multer from "multer";
import { applyUpdate, getUpdateStatus, getCurrentVersion, getUpdateHistory } from "../systemUpdate";

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

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
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
