/**
 * SSH Executor — Huawei VRP / Linux
 *
 * Protecções implementadas:
 * 1. screen-length 0 temporary — desactiva paginação --More--
 * 2. Filtro ANSI — remove códigos de escape e caracteres de controlo
 * 3. Detecção de prompt — sabe quando o comando terminou
 * 4. Delay entre comandos — garante que o equipamento processa cada linha
 * 5. Timeout global — evita bloqueio infinito
 */

import { Client } from "ssh2";

export interface SshConnectionConfig {
  host: string;
  port: number;
  username: string;
  authType: "password" | "key";
  password?: string;
  privateKey?: string;
  deviceType?: string; // ne8000, olt, switch, linux, generic
}

export interface SshExecResult {
  output: string;
  success: boolean;
  durationMs: number;
  error?: string;
}

/** Remove códigos ANSI, \r, e outros caracteres de controlo do VRP */
function cleanOutput(raw: string): string {
  return raw
    .replace(/\x1b\[[0-9;]*[mGKHFJABCDEFsuhl]/g, "") // ANSI escape codes
    .replace(/\x1b\[?[0-9;]*[a-zA-Z]/g, "")           // outros escapes
    .replace(/\x08+/g, "")                              // backspace
    .replace(/\r\n/g, "\n")                             // CRLF → LF
    .replace(/\r/g, "\n")                               // CR → LF
    .replace(/[ \t]+$/gm, "")                           // trailing spaces
    .replace(/\n{3,}/g, "\n\n");                        // múltiplas linhas vazias
}

/** Detecta o prompt do equipamento (fim do output) */
function isPrompt(data: string, deviceType: string): boolean {
  const trimmed = data.trimEnd();
  if (deviceType === "linux") {
    // Bash prompt: user@host:~$ ou root@host:~#
    return /[\$#]\s*$/.test(trimmed);
  }
  // Huawei VRP: <NE8000> ou [NE8000] ou [NE8000-bgp] etc.
  return /[<\[]\S+[>\]]\s*$/.test(trimmed);
}

/** Remove linhas que são eco do comando enviado */
function removeEcho(output: string, command: string): string {
  const lines = output.split("\n");
  const cmdTrimmed = command.trim();
  return lines
    .filter((line) => line.trim() !== cmdTrimmed)
    .join("\n");
}

/**
 * Executa uma lista de comandos numa sessão SSH interactiva.
 * Retorna o output limpo de todos os comandos.
 */
export function executeSSH(
  config: SshConnectionConfig,
  commands: string[],
  onData?: (chunk: string) => void,
  timeoutMs = 30000
): Promise<SshExecResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const conn = new Client();
    let fullOutput = "";
    let settled = false;

    const finish = (success: boolean, error?: string) => {
      if (settled) return;
      settled = true;
      conn.end();
      resolve({
        output: cleanOutput(fullOutput),
        success,
        durationMs: Date.now() - startTime,
        error,
      });
    };

    const globalTimeout = setTimeout(() => {
      finish(false, "Timeout: o equipamento não respondeu dentro do prazo");
    }, timeoutMs);

    conn.on("ready", () => {
      const deviceType = config.deviceType || "generic";

      conn.shell({ term: "dumb", cols: 200, rows: 50 }, (err, stream) => {
        if (err) {
          clearTimeout(globalTimeout);
          finish(false, err.message);
          return;
        }

        let buffer = "";
        let cmdIndex = 0;

        // Prepara a lista de comandos:
        // Para VRP Huawei, desactiva paginação primeiro
        const allCommands: string[] = [];
        if (deviceType !== "linux") {
          allCommands.push("screen-length 0 temporary");
        }
        allCommands.push(...commands);

        const sendNextCommand = () => {
          if (cmdIndex >= allCommands.length) {
            // Todos os comandos enviados — aguarda último prompt e termina
            setTimeout(() => {
              clearTimeout(globalTimeout);
              finish(true);
            }, 500);
            return;
          }
          const cmd = allCommands[cmdIndex++];
          stream.write(cmd + "\n");
        };

        stream.on("data", (data: Buffer) => {
          const chunk = data.toString("utf8");
          buffer += chunk;
          fullOutput += chunk;

          // Envia chunk limpo para o WebSocket em tempo real
          if (onData) {
            onData(cleanOutput(chunk));
          }

          // Verifica se chegou um prompt (fim do output do comando)
          if (isPrompt(buffer, deviceType)) {
            buffer = "";
            // Pequeno delay para garantir que o equipamento está pronto
            setTimeout(sendNextCommand, 150);
          }
        });

        stream.stderr.on("data", (data: Buffer) => {
          const chunk = data.toString("utf8");
          fullOutput += chunk;
          if (onData) onData(cleanOutput(chunk));
        });

        stream.on("close", () => {
          clearTimeout(globalTimeout);
          finish(true);
        });

        // Inicia enviando o primeiro comando após conexão estabelecida
        // Aguarda o prompt inicial do equipamento
        setTimeout(() => {
          sendNextCommand();
        }, 800);
      });
    });

    conn.on("error", (err) => {
      clearTimeout(globalTimeout);
      finish(false, `Erro de conexão SSH: ${err.message}`);
    });

    // Conecta
    const connectConfig: Parameters<typeof conn.connect>[0] = {
      host: config.host,
      port: config.port,
      username: config.username,
      readyTimeout: 15000,
      keepaliveInterval: 5000,
      // Aceitar qualquer fingerprint (equivalente a StrictHostKeyChecking=no)
      hostVerifier: () => true,
    };

    if (config.authType === "key" && config.privateKey) {
      connectConfig.privateKey = config.privateKey;
    } else {
      connectConfig.password = config.password || "";
    }

    conn.connect(connectConfig);
  });
}

/**
 * Testa apenas a conectividade SSH (sem executar comandos).
 */
export function testSSHConnection(
  config: SshConnectionConfig
): Promise<{ success: boolean; error?: string; latencyMs?: number }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const conn = new Client();
    let settled = false;

    const finish = (success: boolean, error?: string) => {
      if (settled) return;
      settled = true;
      conn.end();
      resolve({ success, error, latencyMs: Date.now() - start });
    };

    const timeout = setTimeout(() => {
      finish(false, "Timeout: não foi possível conectar em 10s");
    }, 10000);

    conn.on("ready", () => {
      clearTimeout(timeout);
      finish(true);
    });

    conn.on("error", (err) => {
      clearTimeout(timeout);
      finish(false, err.message);
    });

    const connectConfig: Parameters<typeof conn.connect>[0] = {
      host: config.host,
      port: config.port,
      username: config.username,
      readyTimeout: 10000,
      // Aceitar qualquer fingerprint (equivalente a StrictHostKeyChecking=no)
      hostVerifier: () => true,
    };

    if (config.authType === "key" && config.privateKey) {
      connectConfig.privateKey = config.privateKey;
    } else {
      connectConfig.password = config.password || "";
    }

    conn.connect(connectConfig);
  });
}
