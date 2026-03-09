/**
 * updateClient.ts — Cliente de Atualização Automática do FiberDoc
 *
 * Este módulo funciona como um "cliente de app store"
 * Verifica periodicamente por atualizações no servidor central
 * Baixa e instala automaticamente quando disponível
 */

import fs from "fs";
import path from "path";
import https from "https";
import { exec } from "child_process";
import { promisify } from "util";
import { getDb } from "./db";
import { systemSettings } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const execAsync = promisify(exec);

// ─── Configurações ────────────────────────────────────────────────────────────

const UPDATE_CHECK_INTERVAL = process.env.UPDATE_CHECK_INTERVAL || "86400000"; // 24 horas
const DISTRIBUTION_SERVER = process.env.DISTRIBUTION_SERVER || "https://updates.fiberdoc.com";
const UPDATES_DIR = path.join(process.cwd(), "updates");
const CURRENT_VERSION = process.env.FIBERDOC_VERSION || "1.0.0";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  nextVersion?: string;
  nextRelease?: {
    version: string;
    description: string;
    changelog: string;
    critical: boolean;
    downloadUrl: string;
    checksum: string;
    size: number;
  };
  criticalUpdate?: boolean;
}

interface UpdateStatus {
  status: "idle" | "checking" | "downloading" | "installing" | "completed" | "failed";
  currentVersion: string;
  latestVersion?: string;
  progress?: number;
  error?: string;
  lastCheck?: string;
  nextCheck?: string;
}

// ─── State ────────────────────────────────────────────────────────────────────

let updateStatus: UpdateStatus = {
  status: "idle",
  currentVersion: CURRENT_VERSION,
};

let updateCheckInterval: NodeJS.Timeout | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Fazer download de arquivo via HTTPS
 */
async function downloadFile(url: string, filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filePath);

    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        const totalSize = parseInt(response.headers["content-length"] || "0", 10);
        let downloadedSize = 0;

        response.on("data", (chunk) => {
          downloadedSize += chunk.length;
          const progress = totalSize > 0 ? (downloadedSize / totalSize) * 100 : 0;
          updateStatus.progress = Math.round(progress);
        });

        response.pipe(file);

        file.on("finish", () => {
          file.close();
          resolve();
        });

        file.on("error", (err) => {
          fs.unlink(filePath, () => {});
          reject(err);
        });
      })
      .on("error", (err) => {
        fs.unlink(filePath, () => {});
        reject(err);
      });
  });
}

/**
 * Verificar integridade do arquivo via checksum
 */
async function verifyChecksum(filePath: string, expectedChecksum: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync(`md5sum "${filePath}"`);
    const actualChecksum = stdout.split(" ")[0];
    return actualChecksum === expectedChecksum;
  } catch (err) {
    console.error("[UpdateClient] Erro ao verificar checksum:", err);
    return false;
  }
}

/**
 * Extrair pacote ZIP
 */
async function extractPackage(zipPath: string, extractDir: string): Promise<void> {
  try {
    await execAsync(`unzip -q "${zipPath}" -d "${extractDir}"`);
  } catch (err) {
    throw new Error(`Erro ao extrair pacote: ${err}`);
  }
}

/**
 * Executar script de instalação
 */
async function runInstallScript(scriptPath: string): Promise<void> {
  try {
    await execAsync(`bash "${scriptPath}"`);
  } catch (err) {
    throw new Error(`Erro ao executar instalação: ${err}`);
  }
}

/**
 * Salvar status de atualização no banco de dados
 */
async function saveUpdateStatus(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    await db
      .insert(systemSettings)
      .values({
        key: "update_status",
        value: JSON.stringify(updateStatus),
      })
      .onDuplicateKeyUpdate({
        set: { value: JSON.stringify(updateStatus) },
      });
  } catch (err) {
    console.error("[UpdateClient] Erro ao salvar status:", err);
  }
}

/**
 * Carregar status de atualização do banco de dados
 */
async function loadUpdateStatus(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    const rows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, "update_status"));

    if (rows[0]) {
      updateStatus = JSON.parse(rows[0].value ?? "{}");
    }
  } catch (err) {
    console.error("[UpdateClient] Erro ao carregar status:", err);
  }
}

// ─── API Pública ──────────────────────────────────────────────────────────────

/**
 * Verificar se há atualização disponível
 */
export async function checkForUpdates(): Promise<UpdateCheckResult> {
  try {
    updateStatus.status = "checking";
    updateStatus.lastCheck = new Date().toISOString();
    await saveUpdateStatus();

    console.log("[UpdateClient] Verificando atualizações...");

    const url = `${DISTRIBUTION_SERVER}/api/distribution/check-update?currentVersion=${CURRENT_VERSION}&includePrerelease=false`;

    const result = await new Promise<UpdateCheckResult>((resolve, reject) => {
      https.get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(err);
          }
        });
      });
    });

    updateStatus.status = "idle";
    if (result.hasUpdate) {
      updateStatus.latestVersion = result.nextVersion;
    }
    updateStatus.nextCheck = new Date(Date.now() + 86400000).toISOString(); // Próxima em 24h
    await saveUpdateStatus();

    console.log(`[UpdateClient] Verificação concluída. Atualização disponível: ${result.hasUpdate}`);

    return result;
  } catch (err: any) {
    console.error("[UpdateClient] Erro ao verificar atualizações:", err.message);
    updateStatus.status = "idle";
    updateStatus.error = err.message;
    await saveUpdateStatus();

    return {
      hasUpdate: false,
      currentVersion: CURRENT_VERSION,
    };
  }
}

/**
 * Baixar e instalar atualização
 */
export async function downloadAndInstallUpdate(version: string): Promise<boolean> {
  try {
    updateStatus.status = "downloading";
    updateStatus.progress = 0;
    await saveUpdateStatus();

    console.log(`[UpdateClient] Iniciando download da versão ${version}...`);

    // Criar diretório de updates
    if (!fs.existsSync(UPDATES_DIR)) {
      fs.mkdirSync(UPDATES_DIR, { recursive: true });
    }

    // Download
    const downloadUrl = `${DISTRIBUTION_SERVER}/api/distribution/download/${version}`;
    const zipPath = path.join(UPDATES_DIR, `fiberdoc-update-${version}.zip`);

    await downloadFile(downloadUrl, zipPath);
    console.log(`[UpdateClient] Download concluído: ${zipPath}`);

    // Verificar integridade
    // Nota: Em produção, obter checksum do servidor
    // const checksum = await getChecksumFromServer(version);
    // const isValid = await verifyChecksum(zipPath, checksum);
    // if (!isValid) throw new Error("Checksum inválido");

    // Extrair
    updateStatus.status = "installing";
    await saveUpdateStatus();

    const extractDir = path.join(UPDATES_DIR, `build-${version}`);
    await extractPackage(zipPath, extractDir);
    console.log(`[UpdateClient] Pacote extraído: ${extractDir}`);

    // Executar instalação
    const installScript = path.join(extractDir, "INSTALL.sh");
    if (!fs.existsSync(installScript)) {
      throw new Error("Script de instalação não encontrado");
    }

    await runInstallScript(installScript);
    console.log(`[UpdateClient] Instalação concluída`);

    // Atualizar status
    updateStatus.status = "completed";
    updateStatus.currentVersion = version;
    updateStatus.latestVersion = version;
    updateStatus.progress = 100;
    await saveUpdateStatus();

    return true;
  } catch (err: any) {
    console.error("[UpdateClient] Erro durante atualização:", err.message);
    updateStatus.status = "failed";
    updateStatus.error = err.message;
    await saveUpdateStatus();

    return false;
  }
}

/**
 * Obter status atual de atualização
 */
export async function getUpdateStatus(): Promise<UpdateStatus> {
  await loadUpdateStatus();
  return updateStatus;
}

/**
 * Iniciar verificação periódica de atualizações
 */
export async function startUpdateChecker(): Promise<void> {
  console.log("[UpdateClient] Iniciando verificador de atualizações...");

  // Carregar status anterior
  await loadUpdateStatus();

  // Verificação inicial
  await checkForUpdates();

  // Agendar verificações periódicas
  const interval = parseInt(UPDATE_CHECK_INTERVAL);
  updateCheckInterval = setInterval(async () => {
    console.log("[UpdateClient] Verificação periódica de atualizações...");
    await checkForUpdates();
  }, interval);
}

/**
 * Parar verificação periódica
 */
export function stopUpdateChecker(): void {
  if (updateCheckInterval) {
    clearInterval(updateCheckInterval);
    updateCheckInterval = null;
    console.log("[UpdateClient] Verificador de atualizações parado");
  }
}

/**
 * Forçar verificação imediata
 */
export async function forceCheckNow(): Promise<UpdateCheckResult> {
  console.log("[UpdateClient] Verificação forçada...");
  return await checkForUpdates();
}

/**
 * Instalar atualização específica (manual)
 */
export async function installUpdate(version: string): Promise<boolean> {
  console.log(`[UpdateClient] Instalação manual da versão ${version}`);
  return await downloadAndInstallUpdate(version);
}

/**
 * Cancelar atualização em progresso
 */
export function cancelUpdate(): void {
  if (updateStatus.status === "downloading" || updateStatus.status === "installing") {
    updateStatus.status = "idle";
    console.log("[UpdateClient] Atualização cancelada");
  }
}

export default {
  checkForUpdates,
  downloadAndInstallUpdate,
  getUpdateStatus,
  startUpdateChecker,
  stopUpdateChecker,
  forceCheckNow,
  installUpdate,
  cancelUpdate,
};
