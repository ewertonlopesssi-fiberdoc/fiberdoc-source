/**
 * updateServer.ts — Servidor de Atualização do FiberDoc
 *
 * Fornece endpoint para download de pacotes de atualização
 * Integra-se com o servidor Express principal
 */

import express, { Router } from "express";
import fs from "fs";
import path from "path";
import { getDb } from "./db";
import { systemSettings } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const router = Router();

// ─── Configurações ────────────────────────────────────────────────────────────

const UPDATES_DIR = path.join(process.cwd(), "updates");
const MAX_PACKAGE_SIZE = 500 * 1024 * 1024; // 500 MB

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface UpdatePackage {
  version: string;
  filename: string;
  size: number;
  checksum: string;
  timestamp: string;
  url: string;
}

interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  packages: UpdatePackage[];
  changelog: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Obter versão atual do FiberDoc
 */
async function getCurrentVersion(): Promise<string> {
  try {
    const db = await getDb();
    if (!db) return "unknown";

    const rows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, "fiberdoc_version"));

    return rows[0]?.value || "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Listar pacotes de atualização disponíveis
 */
function listUpdatePackages(): UpdatePackage[] {
  try {
    if (!fs.existsSync(UPDATES_DIR)) {
      return [];
    }

    const files = fs.readdirSync(UPDATES_DIR);
    const packages: UpdatePackage[] = [];

    for (const file of files) {
      if (!file.endsWith(".zip")) continue;

      const filePath = path.join(UPDATES_DIR, file);
      const stat = fs.statSync(filePath);
      const infoFile = file.replace(".zip", ".info");
      const infoPath = path.join(UPDATES_DIR, infoFile);

      let info: any = {};
      if (fs.existsSync(infoPath)) {
        try {
          info = JSON.parse(fs.readFileSync(infoPath, "utf-8"));
        } catch {
          // Ignorar erro ao ler info
        }
      }

      packages.push({
        version: info.version || file.replace("fiberdoc-update-", "").replace(".zip", ""),
        filename: file,
        size: stat.size,
        checksum: info.checksum || "unknown",
        timestamp: info.timestamp || stat.mtime.toISOString(),
        url: `/api/updates/download/${file}`,
      });
    }

    // Ordenar por versão (mais recente primeiro)
    packages.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return packages;
  } catch (err) {
    console.error("[UpdateServer] Erro ao listar pacotes:", err);
    return [];
  }
}

/**
 * Obter informações de atualização
 */
async function getUpdateInfo(): Promise<UpdateInfo> {
  const currentVersion = await getCurrentVersion();
  const packages = listUpdatePackages();
  const latestVersion = packages[0]?.version || currentVersion;

  return {
    currentVersion,
    latestVersion,
    packages,
    changelog: "Veja CHANGELOG.md para detalhes das mudanças",
  };
}

// ─── Endpoints ────────────────────────────────────────────────────────────────

/**
 * GET /api/updates/info
 * Obter informações sobre atualizações disponíveis
 */
router.get("/info", async (req, res) => {
  try {
    const info = await getUpdateInfo();
    res.json(info);
  } catch (err: any) {
    console.error("[UpdateServer] Erro ao obter info:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/updates/list
 * Listar todos os pacotes de atualização
 */
router.get("/list", (req, res) => {
  try {
    const packages = listUpdatePackages();
    res.json({ packages });
  } catch (err: any) {
    console.error("[UpdateServer] Erro ao listar pacotes:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/updates/download/:filename
 * Download de pacote de atualização
 */
router.get("/download/:filename", (req, res) => {
  try {
    const filename = req.params.filename;

    // Validar nome do arquivo (segurança)
    if (!filename.match(/^fiberdoc-update-[\w\-\.]+\.zip$/)) {
      return res.status(400).json({ error: "Nome de arquivo inválido" });
    }

    const filePath = path.join(UPDATES_DIR, filename);

    // Verificar se arquivo existe
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Pacote não encontrado" });
    }

    // Verificar tamanho
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_PACKAGE_SIZE) {
      return res.status(413).json({ error: "Pacote muito grande" });
    }

    // Enviar arquivo
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", stat.size);

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);

    stream.on("error", (err) => {
      console.error("[UpdateServer] Erro ao enviar arquivo:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Erro ao enviar arquivo" });
      }
    });
  } catch (err: any) {
    console.error("[UpdateServer] Erro no download:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

/**
 * POST /api/updates/upload
 * Upload de novo pacote de atualização (admin only)
 * Requer multer middleware
 */
router.post("/upload", async (req: any, res) => {
  try {
    // Verificar autenticação (deve ser admin)
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ error: "Acesso negado" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Nenhum arquivo fornecido" });
    }

    // Validar tipo de arquivo
    if (!req.file.originalname.endsWith(".zip")) {
      return res.status(400).json({ error: "Apenas arquivos ZIP são permitidos" });
    }

    // Validar tamanho
    if (req.file.size > MAX_PACKAGE_SIZE) {
      return res.status(413).json({ error: "Arquivo muito grande (máx 500 MB)" });
    }

    // Criar diretório se não existir
    if (!fs.existsSync(UPDATES_DIR)) {
      fs.mkdirSync(UPDATES_DIR, { recursive: true });
    }

    // Mover arquivo
    const filename = `fiberdoc-update-${Date.now()}.zip`;
    const filePath = path.join(UPDATES_DIR, filename);
    fs.renameSync(req.file.path, filePath);

    console.log(`[UpdateServer] Pacote enviado: ${filename}`);

    res.json({
      success: true,
      filename,
      size: req.file.size,
      url: `/api/updates/download/${filename}`,
    });
  } catch (err: any) {
    console.error("[UpdateServer] Erro no upload:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/updates/:filename
 * Deletar pacote de atualização (admin only)
 */
router.delete("/:filename", async (req: any, res) => {
  try {
    // Verificar autenticação
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ error: "Acesso negado" });
    }

    const filename = req.params.filename;

    // Validar nome do arquivo
    if (!filename.match(/^fiberdoc-update-[\w\-\.]+\.zip$/)) {
      return res.status(400).json({ error: "Nome de arquivo inválido" });
    }

    const filePath = path.join(UPDATES_DIR, filename);

    // Verificar se arquivo existe
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Pacote não encontrado" });
    }

    // Deletar arquivo
    fs.unlinkSync(filePath);

    // Deletar arquivo de info se existir
    const infoFile = filename.replace(".zip", ".info");
    const infoPath = path.join(UPDATES_DIR, infoFile);
    if (fs.existsSync(infoPath)) {
      fs.unlinkSync(infoPath);
    }

    console.log(`[UpdateServer] Pacote deletado: ${filename}`);

    res.json({ success: true, message: "Pacote deletado" });
  } catch (err: any) {
    console.error("[UpdateServer] Erro ao deletar:", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
