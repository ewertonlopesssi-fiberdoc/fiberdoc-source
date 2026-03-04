import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { Client as SshClient } from "ssh2";
import { getDb } from "./db";
import { sshCredentials, sshCommands, sshExecutionLog, equipments as equipmentsTable } from "../drizzle/schema";
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

// ─── Strip de sequências ANSI (cursor/cor) ───────────────────────────────────
// Remove sequências de controlo mas preserva o texto visível
function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\[[0-9;]*[mGKJHABCDEFPSTfhilnpqrsu]/g, "")
    .replace(/\x1b[()][A-Z0-9]/g, "")
    .replace(/\x1b[=>]/g, "")
    .replace(/\x1b\[\?[0-9;]*[hlr]/g, "")
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
    .replace(/\x1b./g, "");
}

// ─── Tipo de equipamento ──────────────────────────────────────────────────────
type DeviceType = "mikrotik" | "huawei_vrp" | "huawei_olt" | "generic";

function detectDeviceType(banner: string): DeviceType {
  const clean = stripAnsi(banner);
  if (/MikroTik|RouterOS/i.test(clean)) return "mikrotik";
  if (/MA5800|MA5600|SmartAX|MA56\d\d/i.test(clean)) return "huawei_olt";
  if (/Huawei|VRP|<\w+>|\[\w+\]/i.test(clean)) return "huawei_vrp";
  return "generic";
}

// ─── Regex de prompt por tipo de equipamento ─────────────────────────────────
function getPromptRegex(deviceType: DeviceType): RegExp {
  switch (deviceType) {
    case "mikrotik":
      // [user@hostname] > ou [user@hostname] /ip>
      return /\[[^\]]+\]\s*[^>]*>\s*$/;
    case "huawei_vrp":
      // <hostname> ou [hostname]
      return /^[<\[]\S+[>\]]\s*$/m;
    case "huawei_olt":
      // MA5800-X17(config)# ou MA5800-X17>
      return /[\w.-]+(?:\([^)]+\))?[>#]\s*$/m;
    default:
      return /[$#>]\s*$/m;
  }
}

// ─── Padrão de paginação ──────────────────────────────────────────────────────
const MORE_PATTERN = /----\s*[Mm]ore\s*(?:\([^)]*\))?\s*----|Press\s+'Q'\s+to\s+break/;

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
  waitingConfirm?: boolean;
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

// ─── Aguardar prompt com timeout ──────────────────────────────────────────────
// Acumula chunks até o prompt aparecer ou timeout expirar
function waitForPrompt(
  stream: any,
  promptRegex: RegExp,
  timeoutMs: number,
  onChunk?: (chunk: string) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    let accumulated = "";
    let timer: ReturnType<typeof setTimeout>;

    const cleanup = () => {
      stream.removeListener("data", onData);
      clearTimeout(timer);
    };

    const onData = (data: Buffer) => {
      const chunk = data.toString();
      accumulated += chunk;
      if (onChunk) onChunk(chunk);

      // Verificar paginação — enviar espaço para continuar
      if (MORE_PATTERN.test(stripAnsi(accumulated))) {
        stream.write(" ");
        accumulated = accumulated.replace(MORE_PATTERN, "");
        return;
      }

      // Verificar se o prompt apareceu no output limpo
      const clean = stripAnsi(accumulated);
      if (promptRegex.test(clean)) {
        cleanup();
        resolve(accumulated);
      }
    };

    timer = setTimeout(() => {
      cleanup();
      // Resolver com o que temos (timeout não é erro fatal)
      resolve(accumulated);
    }, timeoutMs);

    stream.on("data", onData);
  });
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
    let fullOutput = "";
    let timedOut = false;
    let waitingForConfirm = false;
    let deviceType: DeviceType = "generic";

    const globalTimeout = setTimeout(() => {
      timedOut = true;
      if (sessionId) activeSessions.delete(sessionId);
      conn.end();
      resolve({ output: fullOutput + "\n[TIMEOUT: conexão encerrada após 60s]", success: false });
    }, 60000);

    // Helper para enviar output via SSE
    const sendOutput = (raw: string) => {
      const clean = stripAnsi(raw);
      // Normalizar CRLF → LF
      const normalized = clean.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      if (normalized.trim().length > 0 && sseRes) {
        sendSseEvent(sseRes, { type: "output", data: normalized });
      }
    };

    conn.on("ready", () => {
      // PTY com largura grande para evitar quebra de linha e repintura excessiva
      conn.shell({ term: "vt100", cols: 220, rows: 50 }, async (err, stream) => {
        if (err) {
          clearTimeout(globalTimeout);
          conn.end();
          resolve({ output: `[ERRO ao abrir shell: ${err.message}]`, success: false });
          return;
        }

        // Guardar sessão activa para modo manual
        if (sessionId) {
          activeSessions.set(sessionId, { stream, outputSoFar: "", resolve, conn, sseRes });
        }

        stream.stderr.on("data", (data: Buffer) => {
          const chunk = data.toString();
          fullOutput += chunk;
          sendOutput(chunk);
        });

        stream.on("close", () => {
          clearTimeout(globalTimeout);
          if (sessionId) activeSessions.delete(sessionId);
          conn.end();
          if (!timedOut && !waitingForConfirm) {
            if (sseRes) {
              sendSseEvent(sseRes, { type: "done", success: true, output: fullOutput });
              sseRes.end();
            }
            resolve({ output: fullOutput, success: true });
          }
        });

        try {
          // ── FASE 1: Aguardar banner + prompt inicial ──────────────────────
          // Timeout de 8s para o banner inicial (equipamentos lentos)
          const bannerRaw = await waitForPrompt(
            stream,
            /[$#>]\s*$|\]\s*>\s*$/m, // regex genérico para qualquer prompt
            8000,
            (chunk) => {
              fullOutput += chunk;
              sendOutput(chunk);
            }
          );

          // Detectar tipo de equipamento pelo banner
          deviceType = detectDeviceType(bannerRaw);
          const promptRegex = getPromptRegex(deviceType);

          if (sseRes) {
            sendSseEvent(sseRes, { type: "device_type", data: deviceType });
          }

          // ── FASE 2: Preparação por tipo de equipamento ────────────────────
          if (deviceType === "huawei_vrp") {
            // Desactivar paginação no Huawei VRP
            stream.write("screen-length 0 temporary\n");
            const prepRaw = await waitForPrompt(stream, promptRegex, 5000, (chunk) => {
              fullOutput += chunk;
              // Não enviar output de preparação para o utilizador
            });
            void prepRaw;
          } else if (deviceType === "huawei_olt") {
            // MA5800 não suporta screen-length, mas podemos tentar
            stream.write("scroll\n");
            await new Promise(r => setTimeout(r, 500));
          }

          // ── FASE 3: Executar comandos do utilizador ───────────────────────
          for (const line of lines) {
            if (!line.trim()) continue;

            // Enviar o comando
            stream.write(line + "\n");
            if (sseRes) {
              sendSseEvent(sseRes, { type: "input", data: line });
            }

            // Aguardar prompt com gestão de paginação e confirmação
            const cmdOutput = await waitForPromptWithConfirm(
              stream,
              promptRegex,
              confirmMode,
              Math.max(sleepMs * 2, 10000), // timeout por comando: mín 10s
              (chunk) => {
                fullOutput += chunk;
                sendOutput(chunk);
                if (sessionId) {
                  const sess = activeSessions.get(sessionId);
                  if (sess) sess.outputSoFar = fullOutput;
                }
              },
              (waitingConfirm) => {
                if (waitingConfirm && confirmMode === "manual") {
                  waitingForConfirm = true;
                  if (sseRes) {
                    sendSseEvent(sseRes, { type: "confirm_required", data: "" });
                  }
                }
              }
            );
            void cmdOutput;

            if (waitingForConfirm) break;

            // Sleep entre comandos se configurado
            if (sleepMs > 0 && lines.indexOf(line) < lines.length - 1) {
              await new Promise(r => setTimeout(r, sleepMs));
            }
          }

          // ── FASE 4: Sair da sessão ────────────────────────────────────────
          if (!waitingForConfirm) {
            const quitCmd = deviceType === "mikrotik" ? "quit" : "quit";
            stream.write(quitCmd + "\n");
            // Aguardar o stream fechar (max 3s)
            await new Promise(r => setTimeout(r, 3000));
            stream.end();
          }

        } catch (execErr: any) {
          clearTimeout(globalTimeout);
          if (sessionId) activeSessions.delete(sessionId);
          if (sseRes) {
            sendSseEvent(sseRes, { type: "error", data: execErr.message });
            sseRes.end();
          }
          resolve({ output: fullOutput + `\n[ERRO: ${execErr.message}]`, success: false });
        }
      });
    });

    conn.on("error", (err) => {
      clearTimeout(globalTimeout);
      if (sessionId) activeSessions.delete(sessionId);
      if (sseRes) {
        sendSseEvent(sseRes, { type: "error", data: err.message });
        sseRes.end();
      }
      resolve({ output: `[ERRO SSH: ${err.message}]`, success: false });
    });

    conn.connect({ host, port, username, password, readyTimeout: 15000 });
  });
}

// ─── Aguardar prompt com gestão de confirmação ───────────────────────────────
function waitForPromptWithConfirm(
  stream: any,
  promptRegex: RegExp,
  confirmMode: "none" | "auto_y" | "auto_n" | "manual",
  timeoutMs: number,
  onChunk: (chunk: string) => void,
  onConfirm: (waiting: boolean) => void
): Promise<string> {
  return new Promise((resolve) => {
    let accumulated = "";
    let timer: ReturnType<typeof setTimeout>;

    const cleanup = () => {
      stream.removeListener("data", onData);
      clearTimeout(timer);
    };

    const onData = (data: Buffer) => {
      const chunk = data.toString();
      accumulated += chunk;
      onChunk(chunk);

      const clean = stripAnsi(accumulated);

      // Gerir paginação
      if (MORE_PATTERN.test(clean)) {
        stream.write(" ");
        accumulated = accumulated.replace(MORE_PATTERN, "");
        return;
      }

      // Detectar confirmação
      if (detectsConfirmPrompt(clean)) {
        if (confirmMode === "auto_y") {
          setTimeout(() => stream.write("Y\n"), 100);
          return;
        } else if (confirmMode === "auto_n") {
          setTimeout(() => stream.write("N\n"), 100);
          return;
        } else if (confirmMode === "manual") {
          cleanup();
          onConfirm(true);
          resolve(accumulated);
          return;
        }
      }

      // Detectar prompt (fim do output do comando)
      if (promptRegex.test(clean)) {
        cleanup();
        resolve(accumulated);
      }
    };

    timer = setTimeout(() => {
      cleanup();
      resolve(accumulated);
    }, timeoutMs);

    stream.on("data", onData);
  });
}

// ─── Helpers de DB ────────────────────────────────────────────────────────────
export async function getSshCredential(equipmentId: number) {
  const db = await getDb();
  if (!db) return null;

  // 1. Verificar tabela ssh_credentials (credenciais dedicadas)
  const rows = await db.select().from(sshCredentials).where(eq(sshCredentials.equipmentId, equipmentId));
  if (rows[0]) return rows[0];

  // 2. Fallback: usar credenciais guardadas directamente no cadastro do equipamento
  const equipRows = await db
    .select({
      id: equipmentsTable.id,
      sshUser: equipmentsTable.sshUser,
      sshPasswordEnc: equipmentsTable.sshPasswordEnc,
      sshPort: equipmentsTable.sshPort,
    })
    .from(equipmentsTable)
    .where(eq(equipmentsTable.id, equipmentId));

  const equip = equipRows[0];
  if (!equip || !equip.sshUser || !equip.sshPasswordEnc) return null;

  // Retornar no mesmo formato que ssh_credentials
  return {
    id: 0,
    equipmentId,
    sshUser: equip.sshUser,
    sshPasswordEnc: equip.sshPasswordEnc,
    sshPort: equip.sshPort ?? 22,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
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
