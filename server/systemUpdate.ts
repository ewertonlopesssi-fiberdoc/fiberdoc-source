import fs from "fs";
import path from "path";
import { execSync, spawn } from "child_process";
import { getDb } from "./db";
import { systemSettings } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// ─── Tipos ────────────────────────────────────────────────────────────────────
export interface UpdateStatus {
  running: boolean;
  progress: number; // 0-100
  step: string;
  log: string[];
  error?: string;
  completedAt?: number;
}

export interface VersionInfo {
  version: string;
  buildDate: string;
  description: string;
}

// ─── Estado em memória do progresso ──────────────────────────────────────────
let updateStatus: UpdateStatus = {
  running: false,
  progress: 0,
  step: "idle",
  log: [],
};

export function getUpdateStatus(): UpdateStatus {
  return { ...updateStatus, log: [...updateStatus.log] };
}

function setStatus(progress: number, step: string, logLine?: string) {
  updateStatus.progress = progress;
  updateStatus.step = step;
  if (logLine) updateStatus.log.push(`[${new Date().toLocaleTimeString("pt-BR")}] ${logLine}`);
}

// ─── Versão atual ─────────────────────────────────────────────────────────────
export async function getCurrentVersion(): Promise<VersionInfo> {
  try {
    const pkgPath = path.join(process.cwd(), "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    return {
      version: pkg.version ?? "3.0.0",
      buildDate: pkg.buildDate ?? new Date().toISOString().split("T")[0],
      description: pkg.description ?? "FiberDoc — Sistema de Documentação de Fibras e Equipamentos",
    };
  } catch {
    return { version: "3.0.0", buildDate: "2026-02-26", description: "FiberDoc" };
  }
}

// ─── Histórico de atualizações (salvo em system_settings) ────────────────────
export async function getUpdateHistory(): Promise<Array<{ version: string; appliedAt: string; description: string }>> {
  try {
    const db = await getDb();
    if (!db) return [];
    const row = await db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, "update_history"))
      .limit(1);
    if (row[0]?.value) return JSON.parse(row[0].value);
  } catch {}
  return [];
}

async function saveUpdateHistory(entry: { version: string; appliedAt: string; description: string }) {
  try {
    const db = await getDb();
    if (!db) return;
    const history = await getUpdateHistory();
    history.unshift(entry);
    const trimmed = history.slice(0, 20); // manter últimas 20
    const existing = await db
      .select({ id: systemSettings.id })
      .from(systemSettings)
      .where(eq(systemSettings.key, "update_history"))
      .limit(1);
    if (existing[0]) {
      await db.update(systemSettings).set({ value: JSON.stringify(trimmed) }).where(eq(systemSettings.key, "update_history"));
    } else {
      await db.insert(systemSettings).values({ key: "update_history", value: JSON.stringify(trimmed) });
    }
  } catch (e) {
    console.error("Erro ao salvar histórico de atualização:", e);
  }
}

// ─── Validar pacote ZIP ───────────────────────────────────────────────────────
function validateUpdatePackage(zipPath: string): { valid: boolean; error?: string; version?: string } {
  try {
    // Verificar se é um ZIP válido
    const output = execSync(`unzip -l "${zipPath}" 2>&1`, { encoding: "utf-8" });

    // Verificar se contém arquivos esperados do FiberDoc
    const hasPackageJson = output.includes("package.json");
    const hasClientOrServer = output.includes("client/") || output.includes("server/") || output.includes("drizzle/");

    if (!hasPackageJson && !hasClientOrServer) {
      return { valid: false, error: "Pacote inválido: não contém arquivos do FiberDoc (package.json, client/ ou server/)" };
    }

    // Tentar extrair versão do package.json dentro do ZIP
    try {
      const pkgContent = execSync(`unzip -p "${zipPath}" package.json 2>/dev/null || unzip -p "${zipPath}" "*/package.json" 2>/dev/null`, {
        encoding: "utf-8",
      });
      const pkg = JSON.parse(pkgContent.trim());
      return { valid: true, version: pkg.version ?? "desconhecida" };
    } catch {
      return { valid: true, version: "desconhecida" };
    }
  } catch (e: any) {
    return { valid: false, error: `Arquivo ZIP inválido ou corrompido: ${e.message}` };
  }
}

// ─── Aplicar atualização ──────────────────────────────────────────────────────
export async function applyUpdate(zipPath: string, originalName: string): Promise<void> {
  if (updateStatus.running) throw new Error("Já existe uma atualização em andamento");

  updateStatus = { running: true, progress: 0, step: "validating", log: [] };
  setStatus(5, "validating", `Iniciando atualização: ${originalName}`);

  const isProduction = process.env.NODE_ENV === "production";
  const appDir = process.cwd();
  const tmpDir = path.join("/tmp", `fiberdoc-update-${Date.now()}`);
  const backupDir = path.join("/tmp", `fiberdoc-backup-${Date.now()}`);

  try {
    // 1. Validar
    setStatus(10, "validating", "Validando pacote ZIP...");
    const validation = validateUpdatePackage(zipPath);
    if (!validation.valid) throw new Error(validation.error);
    setStatus(15, "validating", `Pacote válido. Versão detectada: ${validation.version}`);

    // 2. Criar backup dos arquivos críticos
    setStatus(20, "backup", "Criando backup dos arquivos atuais...");
    fs.mkdirSync(backupDir, { recursive: true });
    const criticalFiles = ["server", "client/src", "drizzle", "package.json", "tsconfig.json"];
    for (const f of criticalFiles) {
      const src = path.join(appDir, f);
      if (fs.existsSync(src)) {
        execSync(`cp -r "${src}" "${backupDir}/" 2>/dev/null || true`);
      }
    }
    setStatus(30, "backup", "Backup criado com sucesso");

    // 3. Extrair ZIP
    setStatus(35, "extracting", "Extraindo pacote de atualização...");
    fs.mkdirSync(tmpDir, { recursive: true });
    execSync(`unzip -q "${zipPath}" -d "${tmpDir}"`, { timeout: 60000 });

    // Detectar se há subdiretório raiz no ZIP
    const entries = fs.readdirSync(tmpDir);
    const extractDir = entries.length === 1 && fs.statSync(path.join(tmpDir, entries[0])).isDirectory()
      ? path.join(tmpDir, entries[0])
      : tmpDir;
    setStatus(45, "extracting", `Extraído em: ${extractDir}`);

    // 4. Copiar arquivos (exceto .env, node_modules, dados)
    setStatus(50, "copying", "Aplicando arquivos atualizados...");
    const excludes = ["node_modules", ".env", "fiberdoc.env", "storage", ".manus-logs"];
    const updateFiles = fs.readdirSync(extractDir);
    let copied = 0;
    for (const file of updateFiles) {
      if (excludes.includes(file)) continue;
      const src = path.join(extractDir, file);
      const dst = path.join(appDir, file);
      execSync(`cp -r "${src}" "${dst}" 2>/dev/null || true`);
      copied++;
    }
    setStatus(65, "copying", `${copied} itens copiados`);

    // 5. Instalar dependências (apenas em produção)
    if (isProduction) {
      setStatus(70, "installing", "Instalando dependências...");
      execSync(`cd "${appDir}" && pnpm install --frozen-lockfile 2>&1 | tail -3`, {
        timeout: 120000,
        encoding: "utf-8",
      });
      setStatus(80, "installing", "Dependências instaladas");

      // 6. Build
      setStatus(82, "building", "Compilando aplicação...");
      execSync(`cd "${appDir}" && pnpm run build 2>&1 | tail -5`, {
        timeout: 180000,
        encoding: "utf-8",
      });
      setStatus(92, "building", "Build concluído");
    }

    // 7. Salvar histórico
    setStatus(95, "saving", "Salvando histórico de atualização...");
    await saveUpdateHistory({
      version: validation.version ?? "desconhecida",
      appliedAt: new Date().toISOString(),
      description: originalName,
    });

    // 8. Atualizar versão no package.json se necessário
    try {
      const newPkgPath = path.join(extractDir, "package.json");
      if (fs.existsSync(newPkgPath)) {
        const newPkg = JSON.parse(fs.readFileSync(newPkgPath, "utf-8"));
        const curPkgPath = path.join(appDir, "package.json");
        const curPkg = JSON.parse(fs.readFileSync(curPkgPath, "utf-8"));
        curPkg.version = newPkg.version ?? curPkg.version;
        curPkg.buildDate = new Date().toISOString().split("T")[0];
        fs.writeFileSync(curPkgPath, JSON.stringify(curPkg, null, 2));
      }
    } catch {}

    setStatus(100, "done", "Atualização aplicada com sucesso!");
    updateStatus.running = false;
    updateStatus.completedAt = Date.now();

    // 9. Reiniciar serviço em produção
    if (isProduction) {
      setTimeout(() => {
        try {
          execSync("systemctl restart fiberdoc 2>/dev/null || pm2 restart fiberdoc 2>/dev/null || true");
        } catch {}
      }, 2000);
    }
  } catch (err: any) {
    updateStatus.running = false;
    updateStatus.error = err.message;
    setStatus(updateStatus.progress, "error", `ERRO: ${err.message}`);

    // Tentar restaurar backup em produção
    if (isProduction && fs.existsSync(backupDir)) {
      try {
        setStatus(updateStatus.progress, "rollback", "Restaurando backup após erro...");
        execSync(`cp -r "${backupDir}/." "${appDir}/" 2>/dev/null || true`);
        setStatus(updateStatus.progress, "rollback", "Backup restaurado");
      } catch {}
    }
    throw err;
  } finally {
    // Limpar arquivos temporários
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(zipPath, { force: true }); } catch {}
    if (!isProduction) {
      try { fs.rmSync(backupDir, { recursive: true, force: true }); } catch {}
    }
  }
}
