/**
 * Backup Scheduler Service
 * Runs as a background process inside the Express server.
 * Checks every 5 minutes if a scheduled backup is due and executes it.
 *
 * Storage strategy:
 *  1. If BUILT_IN_FORGE_API_URL + BUILT_IN_FORGE_API_KEY are set → upload to S3 (Manus cloud)
 *  2. Otherwise → save to local disk at BACKUP_LOCAL_DIR (default: /opt/fiberdoc/backups)
 *     and serve via /api/backup/download/:filename (authenticated Express route)
 */
import path from "path";
import fs from "fs";
import { storagePut } from "./storage";
import {
  exportFullBackup,
  getBackupSchedule,
  createBackupHistoryEntry,
  updateScheduleNextRun,
  deleteOldBackupEntries,
} from "./db";
import { notifyOwner } from "./_core/notification";
import { ENV } from "./_core/env";

let schedulerInterval: ReturnType<typeof setInterval> | null = null;

/** Directory where local backups are stored when S3 is not configured */
export const LOCAL_BACKUP_DIR =
  process.env.BACKUP_LOCAL_DIR ||
  (process.env.NODE_ENV === "production"
    ? "/opt/fiberdoc/backups"
    : path.join(process.cwd(), ".local-backups"));

/** Returns true if Manus S3 credentials are available */
function hasS3Credentials(): boolean {
  return !!(ENV.forgeApiUrl && ENV.forgeApiKey);
}

/**
 * Calculates the next run Date based on schedule config.
 */
export function calcNextRun(
  frequency: "daily" | "weekly" | "monthly",
  hour: number,
  dayOfWeek?: number | null,
  dayOfMonth?: number | null,
  from: Date = new Date()
): Date {
  const next = new Date(from);
  next.setSeconds(0);
  next.setMilliseconds(0);
  next.setMinutes(0);
  next.setHours(hour);

  if (frequency === "daily") {
    // If today's scheduled hour has already passed, move to tomorrow
    if (next <= from) next.setDate(next.getDate() + 1);
    return next;
  }

  if (frequency === "weekly") {
    const target = dayOfWeek ?? 0; // 0 = Sunday
    const current = next.getDay();
    let daysUntil = (target - current + 7) % 7;
    if (daysUntil === 0 && next <= from) daysUntil = 7;
    next.setDate(next.getDate() + daysUntil);
    return next;
  }

  if (frequency === "monthly") {
    const target = Math.min(dayOfMonth ?? 1, 28);
    next.setDate(target);
    if (next <= from) {
      next.setMonth(next.getMonth() + 1);
      next.setDate(target);
    }
    return next;
  }

  return next;
}

/**
 * Saves backup buffer to local disk.
 * Returns the absolute file path.
 */
function saveLocalBackup(filename: string, buffer: Buffer): string {
  if (!fs.existsSync(LOCAL_BACKUP_DIR)) {
    fs.mkdirSync(LOCAL_BACKUP_DIR, { recursive: true });
  }
  const filePath = path.join(LOCAL_BACKUP_DIR, filename);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

/**
 * Executes a backup: exports data, uploads to S3 or saves locally, saves history entry.
 */
export async function runBackup(trigger: "manual" | "scheduled"): Promise<{
  success: boolean;
  filename: string;
  fileUrl?: string;
  localPath?: string;
  storageMode: "s3" | "local";
  totalRecords: number;
  fileSizeBytes: number;
  error?: string;
}> {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 19).replace(/[T:]/g, "-");
  const filename = `fiberdoc-backup-${dateStr}.json`;

  try {
    const backup = await exportFullBackup();
    const json = JSON.stringify(backup, null, 2);
    const buffer = Buffer.from(json, "utf-8");
    const totalRecords = Object.values(backup.counts).reduce((a, b) => a + b, 0);
    const fileSizeBytes = buffer.byteLength;

    let fileUrl: string | undefined;
    let localPath: string | undefined;
    let storageMode: "s3" | "local";

    if (hasS3Credentials()) {
      // Upload to S3 (Manus cloud storage)
      const fileKey = `backups/${filename}`;
      const result = await storagePut(fileKey, buffer, "application/json");
      fileUrl = result.url;
      storageMode = "s3";
      console.log(`[BackupScheduler] Backup uploaded to S3: ${fileUrl}`);
    } else {
      // Save locally when S3 is not configured (standalone server)
      localPath = saveLocalBackup(filename, buffer);
      storageMode = "local";
      console.log(`[BackupScheduler] Backup saved locally: ${localPath}`);
    }

    await createBackupHistoryEntry({
      filename,
      fileUrl,
      fileKey: fileUrl ? `backups/${filename}` : undefined,
      localPath,
      fileSizeBytes,
      totalRecords,
      status: "success",
      trigger,
    });

    if (trigger === "scheduled") {
      await notifyOwner({
        title: "✅ Backup automático gerado",
        content: `Backup gerado em ${now.toLocaleString("pt-BR")}\nArquivo: ${filename}\nRegistros: ${totalRecords}\nTamanho: ${(fileSizeBytes / 1024).toFixed(1)} KB\nArmazenamento: ${storageMode === "s3" ? "Nuvem (S3)" : "Local (" + localPath + ")"}`,
      }).catch(() => {});
    }

    return { success: true, filename, fileUrl, localPath, storageMode, totalRecords, fileSizeBytes };
  } catch (err: any) {
    const errorMessage = err?.message ?? String(err);
    console.error("[BackupScheduler] Backup failed:", errorMessage);

    await createBackupHistoryEntry({
      filename,
      status: "error",
      trigger,
      errorMessage,
      totalRecords: 0,
      fileSizeBytes: 0,
    }).catch(() => {});

    if (trigger === "scheduled") {
      await notifyOwner({
        title: "❌ Falha no backup automático",
        content: `Erro ao gerar backup em ${now.toLocaleString("pt-BR")}: ${errorMessage}`,
      }).catch(() => {});
    }

    return { success: false, filename, storageMode: "local", totalRecords: 0, fileSizeBytes: 0, error: errorMessage };
  }
}

/**
 * Checks if a scheduled backup is due and runs it.
 */
async function checkAndRunSchedule(): Promise<void> {
  try {
    const schedule = await getBackupSchedule();
    if (!schedule || !schedule.enabled) return;

    const now = new Date();
    if (!schedule.nextRunAt || schedule.nextRunAt > now) return;

    console.log("[BackupScheduler] Running scheduled backup...");
    await runBackup("scheduled");

    // Calculate next run
    const nextRunAt = calcNextRun(
      schedule.frequency,
      schedule.hour,
      schedule.dayOfWeek,
      schedule.dayOfMonth,
      now
    );
    await updateScheduleNextRun(schedule.id, nextRunAt, now);

    // Clean up old backups
    if (schedule.retentionDays > 0) {
      const deleted = await deleteOldBackupEntries(schedule.retentionDays);
      if (deleted > 0) {
        console.log(`[BackupScheduler] Deleted ${deleted} old backup entries.`);
      }
    }
  } catch (err) {
    console.error("[BackupScheduler] Error during scheduled check:", err);
  }
}

/**
 * Starts the background scheduler (checks every 5 minutes).
 */
export function startBackupScheduler(): void {
  if (schedulerInterval) return;
  const mode = hasS3Credentials() ? "S3 (Manus cloud)" : `local (${LOCAL_BACKUP_DIR})`;
  console.log(`[BackupScheduler] Started (checking every 5 minutes). Storage mode: ${mode}`);
  // Run immediately on start to catch any missed backups
  checkAndRunSchedule();
  schedulerInterval = setInterval(checkAndRunSchedule, 5 * 60 * 1000);
}

export function stopBackupScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log("[BackupScheduler] Stopped.");
  }
}
