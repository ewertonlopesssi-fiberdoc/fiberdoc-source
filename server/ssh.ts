import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { Client as SshClient } from "ssh2";
import { getDb } from "./db";
import { sshCredentials, sshCommands, sshExecutionLog } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import type { Response } from "express";

// ─── Codificação de passwords SSH ────────────────────────────────────────────────────────────
// Usa Base64 simples (prefixo "b64:") para evitar dependência de chaves externas.
// Passwords antigas em formato AES (3 segmentos hex separados por ":") são
// detectadas e re-encriptadas na próxima vez que o utilizador guardar.
export function encryptPassword(plain: string): string {
  return "b64:" + Buffer.from(plain, "utf8").toString("base64");
}

export function decryptPassword(enc: string): string {
  // Formato novo: "b64:<base64>"
  if (enc.startsWith("b64:")) {
    return Buffer.from(enc.slice(4), "base64").toString("utf8");
  }

  // Formato antigo AES-256-GCM: "<ivHex>:<tagHex>:<dataHex>"
  // Tentar desencriptar com todas as chaves conhecidas
  const parts = enc.split(":");
  if (parts.length === 3) {
    const [ivHex, tagHex, dataHex] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const data = Buffer.from(dataHex, "hex");

    // Lista de chaves a tentar (JWT_SECRET actual + chave padrão original)
    const candidateKeys: Buffer[] = [];
    const jwtKey = process.env.JWT_SECRET ?? "fiberdoc-ssh-default-key-32bytes!";
    const k1 = Buffer.alloc(32, 0); Buffer.from(jwtKey).copy(k1); candidateKeys.push(k1);
    const k2 = Buffer.alloc(32, 0); Buffer.from("fiberdoc-ssh-default-key-32bytes!").copy(k2); candidateKeys.push(k2);

    for (const key of candidateKeys) {
      try {
        // createDecipheriv já está importado no topo do ficheiro
        const decipher = createDecipheriv("aes-256-gcm", key, iv);
        decipher.setAuthTag(tag);
        return decipher.update(data).toString("utf8") + decipher.final("utf8");
      } catch { /* tentar próxima */ }
    }
  }

  throw new Error("Não foi possível desencriptar as credenciais. Por favor re-introduza a password SSH no cadastro do equipamento.");
}

// ─── Detectar parâmetros variáveis {param} ───────────────────────────────────
export function extractParams(lines: string[]): string[] {
  const set = new Set<string>();
  for (const line of lines) {
    const re = /\{([^}]+)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) set.add(m[1]);
  }
  return Array.from(set);
}

export function applyParams(lines: string[], params: Record<string, string>): string[] {
  return lines.map(line =>
    line.replace(/\{([^}]+)\}/g, (_, key) => params[key] ?? `{${key}}`)
  );
}

// ─── Strip de sequências ANSI (cores, cursor, etc.) ─────────────────────────
// O MikroTik envia sequências ANSI que poluem o output no terminal web
function stripAnsi(text: string): string {
  // Remove: ESC[...m (cores), ESC[...J/K/H/A/B/C/D (cursor), ESC(B, ESC> etc.
  return text
    .replace(/\x1b\[[0-9;]*[mGKJHABCDEFPSTfhilnpqrsu]/g, "")
    .replace(/\x1b[()][A-Z0-9]/g, "")
    .replace(/\x1b[=>]/g, "")
    .replace(/\x1b\[\?[0-9;]*[hlr]/g, "")
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
    .replace(/\x1b./g, "");
}

// ─── Padrões de confirmação interactiva ──────────────────────────────────────
const CONFIRM_PATTERNS = [
  /\[Y\/N\]/i,
  /\[y\/n\]/,
  /\(yes\/no\)/i,
  /Are you sure\?/i,
  /Confirm\?/i,
  /\[confirm\]/i,
  /Press Y to confirm/i,
  /\[Y\]es\/\[N\]o/i,
];

function detectsConfirmPrompt(text: string): boolean {
  return CONFIRM_PATTERNS.some(p => p.test(text));
}

// ─── Resultado de execução ────────────────────────────────────────────────────
export interface SshExecResult {
  output: string;
  success: boolean;
  waitingConfirm?: boolean;  // true quando modo=manual e detectou [Y/N]
}

// ─── Sessões SSH activas (para modo manual) ───────────────────────────────────
interface ActiveSession {
  stream: any;
  outputSoFar: string;
  resolve: (result: SshExecResult) => void;
  conn: SshClient;
  sseRes?: Response;
}
const activeSessions = new Map<string, ActiveSession>();

export function getActiveSession(sessionId: string) {
  return activeSessions.get(sessionId);
}

export function respondToConfirm(sessionId: string, answer: "y" | "n"): boolean {
  const session = activeSessions.get(sessionId);
  if (!session) return false;
  session.stream.write(answer + "\n");
  if (session.sseRes) {
    sendSseEvent(session.sseRes, { type: "input", data: answer });
  }
  return true;
}

function sendSseEvent(res: Response, data: object) {
  try {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch { /* ignore */ }
}

// ─── Execução SSH com suporte a confirmMode ───────────────────────────────────
export async function executeSshCommand(
  host: string,
  port: number,
  username: string,
  password: string,
  lines: string[],
  sleepMs: number,
  confirmMode: "none" | "auto_y" | "auto_n" | "manual" = "none",
  sessionId?: string,
  sseRes?: Response
): Promise<SshExecResult> {
  return new Promise((resolve) => {
    const conn = new SshClient();
    let output = "";
    let timedOut = false;
    let waitingForConfirm = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      if (sessionId) activeSessions.delete(sessionId);
      conn.end();
      resolve({ output: output + "\n[TIMEOUT: conexão encerrada após 30s]", success: false });
    }, 30000);

    conn.on("ready", () => {
      conn.shell((err, stream) => {
        if (err) {
          clearTimeout(timeout);
          conn.end();
          resolve({ output: `[ERRO ao abrir shell: ${err.message}]`, success: false });
          return;
        }

        // Guardar sessão activa para modo manual
        if (sessionId) {
          activeSessions.set(sessionId, { stream, outputSoFar: "", resolve, conn, sseRes });
        }

        stream.on("data", (data: Buffer) => {
          const chunk = data.toString();
          output += chunk;

          // Actualizar sessão activa
          if (sessionId) {
            const sess = activeSessions.get(sessionId);
            if (sess) sess.outputSoFar = output;
          }

          // Enviar via SSE se disponível (com ANSI removido para leitura limpa)
          if (sseRes) {
            const clean = stripAnsi(chunk);
            if (clean.length > 0) {
              sendSseEvent(sseRes, { type: "output", data: clean });
            }
          }

          // Detectar pager "---- More ----" e enviar espaço automaticamente
          if (/----\s*[Mm]ore\s*----/.test(chunk)) {
            setTimeout(() => stream.write(" "), 100);
          }

          // Detectar prompt de confirmação
          if (detectsConfirmPrompt(chunk)) {
            if (confirmMode === "auto_y") {
              setTimeout(() => stream.write("Y\n"), 100);
            } else if (confirmMode === "auto_n") {
              setTimeout(() => stream.write("N\n"), 100);
            } else if (confirmMode === "manual") {
              waitingForConfirm = true;
              if (sseRes) {
                sendSseEvent(sseRes, { type: "confirm_required", data: chunk });
              }
              // Para modo manual, NÃO resolve ainda — aguarda respondToConfirm()
              return;
            }
          }
        });

        stream.stderr.on("data", (data: Buffer) => {
          const chunk = data.toString();
          output += chunk;
          if (sseRes) {
            const clean = stripAnsi(chunk);
            if (clean.length > 0) {
              sendSseEvent(sseRes, { type: "output", data: clean });
            }
          }
        });

        stream.on("close", () => {
          clearTimeout(timeout);
          if (sessionId) activeSessions.delete(sessionId);
          conn.end();
          if (!timedOut && !waitingForConfirm) {
            if (sseRes) {
              sendSseEvent(sseRes, { type: "done", success: true, output });
              sseRes.end();
            }
            resolve({ output, success: true });
          }
        });

          // Enviar linhas com sleep entre elas
        (async () => {
          for (const line of lines) {
            stream.write(line + "\n");
            await new Promise(r => setTimeout(r, sleepMs));
          }
          // Aguardar resposta do equipamento — dar tempo suficiente para o output chegar
          await new Promise(r => setTimeout(r, Math.max(sleepMs * 3, 3000)));
          // Fechar a sessão SSH sem enviar exit (compatível com Huawei, MikroTik, Cisco, etc.)
          stream.end();
        })();
      });
    });

    conn.on("error", (err) => {
      clearTimeout(timeout);
      if (sessionId) activeSessions.delete(sessionId);
      if (sseRes) {
        sendSseEvent(sseRes, { type: "error", data: err.message });
        sseRes.end();
      }
      resolve({ output: `[ERRO SSH: ${err.message}]`, success: false });
    });

    conn.connect({ host, port, username, password, readyTimeout: 10000 });
  });
}

// ─── Helpers de DB ────────────────────────────────────────────────────────────
export async function getSshCredential(equipmentId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(sshCredentials).where(eq(sshCredentials.equipmentId, equipmentId));
  return rows[0] ?? null;
}

export async function upsertSshCredential(data: {
  equipmentId: number;
  sshUser: string;
  sshPassword: string;
  sshPort: number;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const enc = encryptPassword(data.sshPassword);
  const existing = await getSshCredential(data.equipmentId);
  if (existing) {
    await db.update(sshCredentials)
      .set({ sshUser: data.sshUser, sshPasswordEnc: enc, sshPort: data.sshPort, notes: data.notes ?? null })
      .where(eq(sshCredentials.equipmentId, data.equipmentId));
  } else {
    await db.insert(sshCredentials).values({
      equipmentId: data.equipmentId,
      sshUser: data.sshUser,
      sshPasswordEnc: enc,
      sshPort: data.sshPort,
      notes: data.notes ?? null,
    });
  }
}

export async function getSshCommandsByEquipment(equipmentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(sshCommands).where(eq(sshCommands.equipmentId, equipmentId));
}

export async function getRecentExecutionLog(equipmentId: number, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  const { desc } = await import("drizzle-orm");
  return db.select().from(sshExecutionLog)
    .where(eq(sshExecutionLog.equipmentId, equipmentId))
    .orderBy(desc(sshExecutionLog.executedAt))
    .limit(limit);
}
