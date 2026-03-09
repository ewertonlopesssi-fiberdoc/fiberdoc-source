/**
 * updateDistributionServer.ts — Servidor Central de Distribuição de Atualizações
 *
 * Este servidor funciona como um "app store" para o FiberDoc
 * Gerencia pacotes de atualização e fornece informações sobre versões disponíveis
 *
 * Pode ser instalado em um servidor central (ex: updates.fiberdoc.com)
 * Todos os FiberDocs fazem "pull" deste servidor
 */

import express, { Router } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const router = Router();

// ─── Configurações ────────────────────────────────────────────────────────────

const PACKAGES_DIR = process.env.PACKAGES_DIR || "./packages";
const RELEASES_FILE = path.join(PACKAGES_DIR, "releases.json");

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Release {
  version: string;
  releaseDate: string;
  description: string;
  changelog: string;
  minVersion?: string; // Versão mínima para fazer upgrade
  maxVersion?: string; // Versão máxima (se houver limite)
  critical: boolean; // Se é atualização crítica/obrigatória
  downloadUrl: string;
  checksum: string;
  size: number;
  platform: "all" | "linux" | "windows" | "macos";
  prerelease: boolean;
}

interface ReleaseInfo {
  releases: Release[];
  latestVersion: string;
  latestStableVersion: string;
  updateAvailable: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Carregar informações de releases
 */
function loadReleases(): Release[] {
  try {
    if (!fs.existsSync(RELEASES_FILE)) {
      return [];
    }
    const data = fs.readFileSync(RELEASES_FILE, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    console.error("[UpdateDistribution] Erro ao carregar releases:", err);
    return [];
  }
}

/**
 * Salvar informações de releases
 */
function saveReleases(releases: Release[]): void {
  try {
    fs.mkdirSync(PACKAGES_DIR, { recursive: true });
    fs.writeFileSync(RELEASES_FILE, JSON.stringify(releases, null, 2));
  } catch (err) {
    console.error("[UpdateDistribution] Erro ao salvar releases:", err);
  }
}

/**
 * Calcular checksum MD5 de arquivo
 */
function calculateChecksum(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath);
    return crypto.createHash("md5").update(content).digest("hex");
  } catch (err) {
    console.error("[UpdateDistribution] Erro ao calcular checksum:", err);
    return "unknown";
  }
}

/**
 * Comparar versões (retorna true se v1 > v2)
 */
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split(".").map(Number);
  const parts2 = v2.split(".").map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

/**
 * Verificar se versão atende aos requisitos
 */
function meetsRequirements(
  currentVersion: string,
  release: Release
): boolean {
  if (release.minVersion && compareVersions(currentVersion, release.minVersion) < 0) {
    return false;
  }
  if (release.maxVersion && compareVersions(currentVersion, release.maxVersion) > 0) {
    return false;
  }
  return true;
}

// ─── Endpoints ────────────────────────────────────────────────────────────────

/**
 * GET /api/distribution/releases
 * Obter lista de todas as releases
 */
router.get("/releases", (req, res) => {
  try {
    const releases = loadReleases();
    const latestStable = releases.find((r) => !r.prerelease);
    const latest = releases[0];

    res.json({
      releases,
      latestVersion: latest?.version || "unknown",
      latestStableVersion: latestStable?.version || "unknown",
    } as ReleaseInfo);
  } catch (err: any) {
    console.error("[UpdateDistribution] Erro ao listar releases:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/distribution/check-update
 * Verificar se há atualização disponível para versão atual
 *
 * Query params:
 *   - currentVersion: versão atual (ex: 1.0.0)
 *   - includePrerelease: incluir pre-releases (default: false)
 *   - includeCritical: incluir apenas críticas (default: false)
 */
router.get("/check-update", (req, res) => {
  try {
    const currentVersion = req.query.currentVersion as string;
    const includePrerelease = req.query.includePrerelease === "true";
    const includeCritical = req.query.includeCritical === "true";

    if (!currentVersion) {
      return res.status(400).json({ error: "currentVersion é obrigatório" });
    }

    const releases = loadReleases();

    // Filtrar releases
    let available = releases.filter((r) => {
      if (includeCritical && !r.critical) return false;
      if (!includePrerelease && r.prerelease) return false;
      if (compareVersions(r.version, currentVersion) <= 0) return false;
      if (!meetsRequirements(currentVersion, r)) return false;
      return true;
    });

    // Ordenar por versão (mais recente primeiro)
    available.sort((a, b) => compareVersions(b.version, a.version));

    const hasUpdate = available.length > 0;
    const nextVersion = available[0];
    const criticalUpdate = available.find((r) => r.critical);

    res.json({
      currentVersion,
      hasUpdate,
      nextVersion: nextVersion?.version || null,
      nextRelease: nextVersion || null,
      criticalUpdate: criticalUpdate || null,
      availableReleases: available,
    });
  } catch (err: any) {
    console.error("[UpdateDistribution] Erro ao verificar atualização:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/distribution/download/:version
 * Download de pacote específico
 */
router.get("/download/:version", (req, res) => {
  try {
    const version = req.params.version;
    const releases = loadReleases();
    const release = releases.find((r) => r.version === version);

    if (!release) {
      return res.status(404).json({ error: "Versão não encontrada" });
    }

    // Extrair nome do arquivo da URL
    const filename = path.basename(release.downloadUrl);
    const filePath = path.join(PACKAGES_DIR, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Arquivo não encontrado no servidor" });
    }

    const stat = fs.statSync(filePath);

    // Enviar arquivo
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", stat.size);
    res.setHeader("X-Checksum", release.checksum);
    res.setHeader("X-Version", release.version);

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);

    stream.on("error", (err) => {
      console.error("[UpdateDistribution] Erro ao enviar arquivo:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Erro ao enviar arquivo" });
      }
    });
  } catch (err: any) {
    console.error("[UpdateDistribution] Erro no download:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

/**
 * POST /api/distribution/register-release
 * Registrar nova release (admin only)
 */
router.post("/register-release", (req: any, res) => {
  try {
    // Verificar autenticação (em produção, usar JWT)
    const apiKey = req.headers["x-api-key"];
    if (!apiKey || apiKey !== process.env.DISTRIBUTION_API_KEY) {
      return res.status(401).json({ error: "API key inválida" });
    }

    const {
      version,
      description,
      changelog,
      critical,
      prerelease,
      filename,
      minVersion,
      maxVersion,
      platform,
    } = req.body;

    if (!version || !filename) {
      return res.status(400).json({ error: "version e filename são obrigatórios" });
    }

    const filePath = path.join(PACKAGES_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(400).json({ error: "Arquivo não encontrado" });
    }

    const releases = loadReleases();
    const existingIndex = releases.findIndex((r) => r.version === version);

    const release: Release = {
      version,
      releaseDate: new Date().toISOString(),
      description: description || "",
      changelog: changelog || "",
      critical: critical || false,
      prerelease: prerelease || false,
      minVersion,
      maxVersion,
      platform: platform || "all",
      downloadUrl: `/api/distribution/download/${version}`,
      checksum: calculateChecksum(filePath),
      size: fs.statSync(filePath).size,
    };

    if (existingIndex >= 0) {
      releases[existingIndex] = release;
    } else {
      releases.unshift(release); // Adicionar no início (mais recente)
    }

    saveReleases(releases);

    console.log(`[UpdateDistribution] Release registrada: ${version}`);

    res.json({
      success: true,
      release,
      message: `Release ${version} registrada com sucesso`,
    });
  } catch (err: any) {
    console.error("[UpdateDistribution] Erro ao registrar release:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/distribution/releases/:version
 * Deletar release (admin only)
 */
router.delete("/releases/:version", (req: any, res) => {
  try {
    const apiKey = req.headers["x-api-key"];
    if (!apiKey || apiKey !== process.env.DISTRIBUTION_API_KEY) {
      return res.status(401).json({ error: "API key inválida" });
    }

    const version = req.params.version;
    const releases = loadReleases();
    const index = releases.findIndex((r) => r.version === version);

    if (index < 0) {
      return res.status(404).json({ error: "Release não encontrada" });
    }

    const deleted = releases.splice(index, 1)[0];
    saveReleases(releases);

    console.log(`[UpdateDistribution] Release deletada: ${version}`);

    res.json({
      success: true,
      message: `Release ${version} deletada`,
      deleted,
    });
  } catch (err: any) {
    console.error("[UpdateDistribution] Erro ao deletar release:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/distribution/health
 * Health check do servidor de distribuição
 */
router.get("/health", (req, res) => {
  try {
    const releases = loadReleases();
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      totalReleases: releases.length,
      latestVersion: releases[0]?.version || "unknown",
    });
  } catch (err: any) {
    res.status(500).json({
      status: "error",
      error: err.message,
    });
  }
});

export default router;
