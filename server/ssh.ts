import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { Client as SshClient } from "ssh2";
import { getDb } from "./db";
import { sshCredentials, sshCommands, sshExecutionLog } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import type { Response } from "express";

const SSH_ENC_KEY = (() => {
  const k = process.env.JWT_SECRET ?? "fiberdoc-ssh-default-key-32bytes!";
  const buf = Buffer.alloc(32, 0);
  Buffer.from(k).copy(buf);
  return buf;
})();

// ─── Encriptação AES-256-GCM ─────────────────────────────────────────────────
export function encryptPassword(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", SSH_ENC_KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), enc.toString("hex")].join(":");
}

export function decryptPassword(enc: string): string {
  const [ivHex, tagHex, dataHex] = enc.split(":");
  const decipher = createDecipheriv("aes-256-gcm", SSH_ENC_KEY, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return decipher.update(Buffer.from(dataHex, "hex")).toString("utf8") + decipher.final("utf8");
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

          // Enviar via SSE se disponível
          if (sseRes) {
            sendSseEvent(sseRes, { type: "output", data: chunk });
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
          if (sseRes) sendSseEvent(sseRes, { type: "output", data: chunk });
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
          await new Promise(r => setTimeout(r, Math.max(sleepMs * 2, 800)));
          stream.write("exit\n");
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
