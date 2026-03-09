/**
 * remoteUpdateRouter.ts — Endpoint tRPC para Atualização Remota via SSH
 *
 * Fornece endpoints para:
 * - Verificar atualizações disponíveis
 * - Disparar atualização remota via SSH
 * - Monitorar progresso de atualização
 * - Rollback para versão anterior
 */

import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";

const execAsync = promisify(exec);

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface RemoteUpdateStatus {
  status: "idle" | "checking" | "updating" | "completed" | "failed";
  currentVersion: string;
  targetVersion?: string;
  progress?: number;
  message?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

// ─── State ────────────────────────────────────────────────────────────────────

let updateStatus: RemoteUpdateStatus = {
  status: "idle",
  currentVersion: process.env.FIBERDOC_VERSION || "1.0.0",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Obter versão atual do package.json
 */
function getCurrentVersion(): string {
  try {
    const packagePath = path.join(process.cwd(), "package.json");
    const content = fs.readFileSync(packagePath, "utf-8");
    const pkg = JSON.parse(content);
    return pkg.version || "1.0.0";
  } catch {
    return "1.0.0";
  }
}

/**
 * Validar configuração SSH
 */
function validateSSHConfig(host: string, user: string, port: number): boolean {
  // Validar formato do host
  if (!/^[a-zA-Z0-9.-]+$/.test(host)) {
    return false;
  }
  // Validar usuário
  if (!/^[a-zA-Z0-9_-]+$/.test(user)) {
    return false;
  }
  // Validar porta
  if (port < 1 || port > 65535) {
    return false;
  }
  return true;
}

/**
 * Executar comando SSH
 */
async function executeSSHCommand(
  host: string,
  user: string,
  port: number,
  command: string,
  privateKey?: string
): Promise<{ stdout: string; stderr: string }> {
  try {
    // Construir comando SSH
    let sshCmd = `ssh -p ${port}`;

    if (privateKey) {
      sshCmd += ` -i "${privateKey}"`;
    }

    sshCmd += ` -o ConnectTimeout=10`;
    sshCmd += ` -o StrictHostKeyChecking=no`;
    sshCmd += ` ${user}@${host}`;
    sshCmd += ` "${command}"`;

    console.log(`[RemoteUpdate] Executando SSH: ${sshCmd.replace(privateKey || "", "***")}`);

    const { stdout, stderr } = await execAsync(sshCmd, {
      timeout: 3600000, // 1 hora
      maxBuffer: 10 * 1024 * 1024, // 10 MB
    });

    return { stdout, stderr };
  } catch (err: any) {
    throw new Error(`Erro SSH: ${err.message}`);
  }
}

// ─── Router ────────────────────────────────────────────────────────────────────

export const remoteUpdateRouter = router({
  /**
   * Obter status atual de atualização
   */
  getStatus: publicProcedure.query(async () => {
    return {
      ...updateStatus,
      currentVersion: getCurrentVersion(),
    };
  }),

  /**
   * Verificar atualizações disponíveis no servidor remoto
   */
  checkRemoteUpdates: protectedProcedure
    .input(
      z.object({
        host: z.string().min(1),
        user: z.string().min(1),
        port: z.number().int().min(1).max(65535).default(22),
        privateKey: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        // Validar configuração
        if (!validateSSHConfig(input.host, input.user, input.port)) {
          throw new Error("Configuração SSH inválida");
        }

        updateStatus.status = "checking";

        // Comando para verificar versão no servidor remoto
        const command = `cat /opt/fiberdoc/package.json | grep -oP '"version":\\s*"\\K[^"]+'`;

        const { stdout } = await executeSSHCommand(
          input.host,
          input.user,
          input.port,
          command,
          input.privateKey
        );

        const remoteVersion = stdout.trim();

        updateStatus.status = "idle";

        return {
          success: true,
          remoteVersion,
          localVersion: getCurrentVersion(),
          updateAvailable: remoteVersion !== getCurrentVersion(),
        };
      } catch (err: any) {
        updateStatus.status = "idle";
        console.error("[RemoteUpdate] Erro ao verificar atualizações:", err.message);
        throw new Error(err.message);
      }
    }),

  /**
   * Disparar atualização remota via SSH
   */
  triggerRemoteUpdate: protectedProcedure
    .input(
      z.object({
        host: z.string().min(1),
        user: z.string().min(1),
        port: z.number().int().min(1).max(65535).default(22),
        version: z.string().default("latest"),
        distributionServer: z.string().url().default("https://updates.fiberdoc.com"),
        privateKey: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        // Verificar permissão (admin only)
        if (ctx.user?.role !== "admin") {
          throw new Error("Acesso negado");
        }

        // Validar configuração
        if (!validateSSHConfig(input.host, input.user, input.port)) {
          throw new Error("Configuração SSH inválida");
        }

        updateStatus.status = "updating";
        updateStatus.targetVersion = input.version;
        updateStatus.startedAt = new Date().toISOString();
        updateStatus.message = `Iniciando atualização para ${input.version}...`;

        console.log(
          `[RemoteUpdate] Disparando atualização remota em ${input.host}:${input.port}`
        );

        // Comando para executar script de atualização remota
        const command = `bash /opt/fiberdoc/scripts/remote-update.sh ${input.version} ${input.distributionServer}`;

        // Executar em background (não aguardar conclusão)
        // O cliente pode monitorar o progresso via logs
        executeSSHCommand(
          input.host,
          input.user,
          input.port,
          command,
          input.privateKey
        )
          .then(() => {
            updateStatus.status = "completed";
            updateStatus.completedAt = new Date().toISOString();
            updateStatus.message = `Atualização para ${input.version} concluída com sucesso`;
            console.log("[RemoteUpdate] Atualização concluída");
          })
          .catch((err) => {
            updateStatus.status = "failed";
            updateStatus.error = err.message;
            updateStatus.completedAt = new Date().toISOString();
            console.error("[RemoteUpdate] Erro na atualização:", err.message);
          });

        return {
          success: true,
          status: "updating",
          message: `Atualização iniciada para versão ${input.version}`,
          note: "Monitore o progresso via logs do servidor",
        };
      } catch (err: any) {
        updateStatus.status = "failed";
        updateStatus.error = err.message;
        console.error("[RemoteUpdate] Erro ao disparar atualização:", err.message);
        throw new Error(err.message);
      }
    }),

  /**
   * Obter logs de atualização do servidor remoto
   */
  getRemoteUpdateLogs: protectedProcedure
    .input(
      z.object({
        host: z.string().min(1),
        user: z.string().min(1),
        port: z.number().int().min(1).max(65535).default(22),
        lines: z.number().int().min(1).max(1000).default(50),
        privateKey: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      try {
        // Validar configuração
        if (!validateSSHConfig(input.host, input.user, input.port)) {
          throw new Error("Configuração SSH inválida");
        }

        // Comando para obter últimas linhas do log
        const command = `tail -${input.lines} /var/log/fiberdoc-update.log 2>/dev/null || echo "Log não encontrado"`;

        const { stdout } = await executeSSHCommand(
          input.host,
          input.user,
          input.port,
          command,
          input.privateKey
        );

        return {
          success: true,
          logs: stdout,
        };
      } catch (err: any) {
        console.error("[RemoteUpdate] Erro ao obter logs:", err.message);
        throw new Error(err.message);
      }
    }),

  /**
   * Fazer rollback para versão anterior no servidor remoto
   */
  rollbackRemote: protectedProcedure
    .input(
      z.object({
        host: z.string().min(1),
        user: z.string().min(1),
        port: z.number().int().min(1).max(65535).default(22),
        backupDate: z.string().regex(/^\d{8}-\d{6}$/), // YYYYMMDD-HHMMSS
        privateKey: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        // Verificar permissão (admin only)
        if (ctx.user?.role !== "admin") {
          throw new Error("Acesso negado");
        }

        // Validar configuração
        if (!validateSSHConfig(input.host, input.user, input.port)) {
          throw new Error("Configuração SSH inválida");
        }

        updateStatus.status = "updating";
        updateStatus.message = `Restaurando backup de ${input.backupDate}...`;

        console.log(`[RemoteUpdate] Disparando rollback em ${input.host}:${input.port}`);

        // Comando para restaurar backup
        const command = `
          set -e
          FIBERDOC_HOME=/opt/fiberdoc
          BACKUP_DIR=\${FIBERDOC_HOME}/backups/${input.backupDate}
          
          if [ ! -d "\${BACKUP_DIR}" ]; then
            echo "Backup não encontrado: \${BACKUP_DIR}"
            exit 1
          fi
          
          echo "Parando FiberDoc..."
          systemctl stop fiberdoc || pkill -f "node.*fiberdoc" || true
          sleep 2
          
          echo "Restaurando backup..."
          cp -r \${BACKUP_DIR}/* \${FIBERDOC_HOME}/
          
          echo "Reiniciando FiberDoc..."
          systemctl start fiberdoc
          sleep 3
          
          echo "Rollback concluído"
        `;

        // Executar em background
        executeSSHCommand(input.host, input.user, input.port, command, input.privateKey)
          .then(() => {
            updateStatus.status = "completed";
            updateStatus.message = `Rollback para ${input.backupDate} concluído`;
            console.log("[RemoteUpdate] Rollback concluído");
          })
          .catch((err) => {
            updateStatus.status = "failed";
            updateStatus.error = err.message;
            console.error("[RemoteUpdate] Erro no rollback:", err.message);
          });

        return {
          success: true,
          message: `Rollback iniciado para backup ${input.backupDate}`,
        };
      } catch (err: any) {
        updateStatus.status = "failed";
        updateStatus.error = err.message;
        console.error("[RemoteUpdate] Erro ao disparar rollback:", err.message);
        throw new Error(err.message);
      }
    }),

  /**
   * Listar backups disponíveis no servidor remoto
   */
  listRemoteBackups: protectedProcedure
    .input(
      z.object({
        host: z.string().min(1),
        user: z.string().min(1),
        port: z.number().int().min(1).max(65535).default(22),
        privateKey: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      try {
        // Validar configuração
        if (!validateSSHConfig(input.host, input.user, input.port)) {
          throw new Error("Configuração SSH inválida");
        }

        // Comando para listar backups
        const command = `ls -dt /opt/fiberdoc/backups/*/ 2>/dev/null | head -10 | xargs -I {} basename {}`;

        const { stdout } = await executeSSHCommand(
          input.host,
          input.user,
          input.port,
          command,
          input.privateKey
        );

        const backups = stdout
          .trim()
          .split("\n")
          .filter((b) => b.length > 0)
          .map((backup) => ({
            date: backup,
            timestamp: new Date(
              backup.substring(0, 4) +
                "-" +
                backup.substring(4, 6) +
                "-" +
                backup.substring(6, 8) +
                "T" +
                backup.substring(9, 11) +
                ":" +
                backup.substring(11, 13) +
                ":" +
                backup.substring(13, 15)
            ),
          }));

        return {
          success: true,
          backups,
        };
      } catch (err: any) {
        console.error("[RemoteUpdate] Erro ao listar backups:", err.message);
        throw new Error(err.message);
      }
    }),
});

export default remoteUpdateRouter;
