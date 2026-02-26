/**
 * snmpPoller.ts — Coleta SNMP para fontes de energia cadastradas
 *
 * Suporta SNMPv1, v2c e v3 (auth + priv).
 * Lê os OIDs configurados por fonte, salva os valores no banco e
 * avalia thresholds para gerar alertas com notificação via Telegram.
 */
import * as snmp from "net-snmp";
import {
  getPowerSources,
  updatePowerSourceSnmpData,
  createSnmpAlert,
  resolveAlertsByTypeAndSource,
  hasActiveAlertOfType,
  getSystemSettings,
} from "./db";
import {
  sendTelegramMessage,
  buildAlertMessage,
  buildResolvedMessage,
  TelegramConfig,
} from "./telegram";

// ─── Tipos internos ───────────────────────────────────────────────────────────
interface SnmpResult {
  voltage?: number | null;
  current?: number | null;
  temperature?: number | null;
  alarmStatus?: string | null;
  batteryLevel?: number | null;
  loadPercent?: number | null;
  error?: string | null;
}

// ─── Helpers de sessão SNMP ───────────────────────────────────────────────────
function createSession(ps: any): any {
  const target = ps.snmpHost as string;
  const port = (ps.snmpPort as number) ?? 161;

  if (ps.snmpVersion === "v3") {
    const options: any = {
      port,
      retries: 1,
      timeout: 5000,
      version: snmp.Version3,
    };
    const user: any = {
      name: ps.snmpV3User ?? "admin",
      level: snmp.SecurityLevel.noAuthNoPriv,
    };
    if (ps.snmpV3AuthKey) {
      user.level = ps.snmpV3PrivKey
        ? snmp.SecurityLevel.authPriv
        : snmp.SecurityLevel.authNoPriv;
      user.authProtocol =
        ps.snmpV3AuthProto === "SHA"
          ? snmp.AuthProtocols.sha
          : snmp.AuthProtocols.md5;
      user.authKey = ps.snmpV3AuthKey;
    }
    if (ps.snmpV3PrivKey) {
      user.privProtocol =
        ps.snmpV3PrivProto === "AES"
          ? snmp.PrivProtocols.aes
          : snmp.PrivProtocols.des;
      user.privKey = ps.snmpV3PrivKey;
    }
    return snmp.createV3Session(target, user, options);
  }

  const version =
    ps.snmpVersion === "v1" ? snmp.Version1 : snmp.Version2c;
  const community = (ps.snmpCommunity as string) ?? "public";
  return snmp.createSession(target, community, {
    port,
    retries: 1,
    timeout: 5000,
    version,
  });
}

function oidGet(session: any, oid: string): Promise<number | string | null> {
  return new Promise((resolve) => {
    session.get([oid], (error: any, varbinds: any[]) => {
      if (error) return resolve(null);
      if (!varbinds || varbinds.length === 0) return resolve(null);
      const vb = varbinds[0];
      if (snmp.isVarbindError(vb)) return resolve(null);
      const val = vb.value;
      if (val === null || val === undefined) return resolve(null);
      const num = Number(val);
      return resolve(isNaN(num) ? String(val) : num);
    });
  });
}

async function pollPowerSource(ps: any): Promise<SnmpResult> {
  if (!ps.snmpEnabled || !ps.snmpHost) {
    return { error: "SNMP não habilitado ou host não configurado" };
  }

  let session: any;
  try {
    session = createSession(ps);
  } catch (e: any) {
    return { error: `Erro ao criar sessão SNMP: ${e.message}` };
  }

  const result: SnmpResult = {};

  try {
    const oids: { key: keyof SnmpResult; oid: string | null }[] = [
      { key: "voltage",     oid: ps.oidOutputVoltage ?? null },
      { key: "current",     oid: ps.oidOutputCurrent ?? null },
      { key: "temperature", oid: ps.oidTemperature   ?? null },
      { key: "alarmStatus", oid: ps.oidAlarmStatus   ?? null },
      { key: "batteryLevel",oid: ps.oidBatteryLevel  ?? null },
      { key: "loadPercent", oid: ps.oidLoadPercent   ?? null },
    ];

    for (const { key, oid } of oids) {
      if (!oid) continue;
      const val = await oidGet(session, oid);
      (result as any)[key] = val;
    }
  } catch (e: any) {
    result.error = e.message;
  } finally {
    try { session.close(); } catch (_) { /* ignore */ }
  }

  return result;
}

// ─── Avaliação de thresholds e geração de alertas ─────────────────────────────

interface ThresholdCheck {
  alertType: string;
  severity: "warning" | "critical";
  currentValue: number | null;
  thresholdValue: number | null;
  violated: boolean;
  message: string;
}

function evaluateThresholds(ps: any, result: SnmpResult): ThresholdCheck[] {
  const checks: ThresholdCheck[] = [];

  // Temperatura máxima
  if (ps.alertTempMax != null && typeof result.temperature === "number") {
    const violated = result.temperature > ps.alertTempMax;
    checks.push({
      alertType: "temp_high",
      severity: result.temperature > ps.alertTempMax + 5 ? "critical" : "warning",
      currentValue: result.temperature,
      thresholdValue: ps.alertTempMax,
      violated,
      message: violated
        ? `Temperatura ${result.temperature}°C acima do limite de ${ps.alertTempMax}°C`
        : "",
    });
  }

  // Tensão de saída mínima
  if (ps.alertVoltageMin != null && typeof result.voltage === "number") {
    const violated = result.voltage < ps.alertVoltageMin;
    checks.push({
      alertType: "voltage_low",
      severity: "critical",
      currentValue: result.voltage,
      thresholdValue: ps.alertVoltageMin,
      violated,
      message: violated
        ? `Tensão de saída ${result.voltage}V abaixo do mínimo de ${ps.alertVoltageMin}V`
        : "",
    });
  }

  // Tensão de saída máxima
  if (ps.alertVoltageMax != null && typeof result.voltage === "number") {
    const violated = result.voltage > ps.alertVoltageMax;
    checks.push({
      alertType: "voltage_high",
      severity: "warning",
      currentValue: result.voltage,
      thresholdValue: ps.alertVoltageMax,
      violated,
      message: violated
        ? `Tensão de saída ${result.voltage}V acima do máximo de ${ps.alertVoltageMax}V`
        : "",
    });
  }

  // Bateria mínima
  if (ps.alertBatteryMin != null && typeof result.batteryLevel === "number") {
    const violated = result.batteryLevel < ps.alertBatteryMin;
    checks.push({
      alertType: "battery_low",
      severity: result.batteryLevel < ps.alertBatteryMin - 2 ? "critical" : "warning",
      currentValue: result.batteryLevel,
      thresholdValue: ps.alertBatteryMin,
      violated,
      message: violated
        ? `Bateria ${result.batteryLevel}V abaixo do mínimo de ${ps.alertBatteryMin}V`
        : "",
    });
  }

  // Bateria máxima
  if (ps.alertBatteryMax != null && typeof result.batteryLevel === "number") {
    const violated = result.batteryLevel > ps.alertBatteryMax;
    checks.push({
      alertType: "battery_high",
      severity: "warning",
      currentValue: result.batteryLevel,
      thresholdValue: ps.alertBatteryMax,
      violated,
      message: violated
        ? `Bateria ${result.batteryLevel}V acima do máximo de ${ps.alertBatteryMax}V`
        : "",
    });
  }

  // Corrente máxima
  if (ps.alertCurrentMax != null && typeof result.current === "number") {
    const violated = result.current > ps.alertCurrentMax;
    checks.push({
      alertType: "current_high",
      severity: "warning",
      currentValue: result.current,
      thresholdValue: ps.alertCurrentMax,
      violated,
      message: violated
        ? `Corrente ${result.current}A acima do máximo de ${ps.alertCurrentMax}A`
        : "",
    });
  }

  // Carga máxima
  if (ps.alertLoadMax != null && typeof result.loadPercent === "number") {
    const violated = result.loadPercent > ps.alertLoadMax;
    checks.push({
      alertType: "load_high",
      severity: result.loadPercent > 95 ? "critical" : "warning",
      currentValue: result.loadPercent,
      thresholdValue: ps.alertLoadMax,
      violated,
      message: violated
        ? `Carga ${result.loadPercent}% acima do máximo de ${ps.alertLoadMax}%`
        : "",
    });
  }

  // Falta de tensão AC (alarmStatus = 0 ou valor indicativo de falha AC)
  if (ps.alertAcFailEnabled) {
    // Considera falha AC se: tensão de saída = 0, ou alarmStatus indica falha
    const acFail =
      (typeof result.voltage === "number" && result.voltage < 5) ||
      (result.alarmStatus != null &&
        ["0", "fail", "alarm", "2", "3"].includes(String(result.alarmStatus).toLowerCase()));
    checks.push({
      alertType: "ac_fail",
      severity: "critical",
      currentValue: typeof result.voltage === "number" ? result.voltage : null,
      thresholdValue: null,
      violated: acFail,
      message: acFail
        ? `Falta de tensão AC detectada na fonte ${ps.name}`
        : "",
    });
  }

  return checks;
}

async function processAlerts(
  ps: any,
  result: SnmpResult,
  telegramConfig: TelegramConfig | null
): Promise<void> {
  if (!ps.alertsEnabled) return;

  const checks = evaluateThresholds(ps, result);

  for (const check of checks) {
    const alreadyActive = await hasActiveAlertOfType(ps.id, check.alertType);

    if (check.violated && !alreadyActive) {
      // Novo alerta — criar no banco
      await createSnmpAlert({
        powerSourceId: ps.id,
        alertType: check.alertType as any,
        severity: check.severity,
        message: check.message,
        currentValue: check.currentValue,
        thresholdValue: check.thresholdValue,
      });

      // Enviar notificação Telegram
      if (telegramConfig) {
        const text = buildAlertMessage({
          sourceName: ps.name,
          sourceLocation: ps.location,
          alertType: check.alertType,
          severity: check.severity,
          currentValue: check.currentValue,
          thresholdValue: check.thresholdValue,
          message: check.message,
        });
        await sendTelegramMessage(telegramConfig, text).catch((e) =>
          console.error("[Telegram] Falha ao enviar alerta:", e)
        );
      }

      console.log(`[SNMP Alert] NOVO alerta ${check.alertType} para fonte ${ps.name} (id=${ps.id})`);
    } else if (!check.violated && alreadyActive) {
      // Alerta resolvido — fechar no banco
      await resolveAlertsByTypeAndSource(ps.id, check.alertType);

      // Notificar resolução no Telegram
      if (telegramConfig) {
        const text = buildResolvedMessage({
          sourceName: ps.name,
          alertType: check.alertType,
          currentValue: check.currentValue,
        });
        await sendTelegramMessage(telegramConfig, text).catch((e) =>
          console.error("[Telegram] Falha ao enviar resolução:", e)
        );
      }

      console.log(`[SNMP Alert] RESOLVIDO alerta ${check.alertType} para fonte ${ps.name} (id=${ps.id})`);
    }
  }

  // Alerta de equipamento inacessível
  if (result.error && ps.snmpEnabled) {
    const alreadyActive = await hasActiveAlertOfType(ps.id, "snmp_unreachable");
    if (!alreadyActive) {
      await createSnmpAlert({
        powerSourceId: ps.id,
        alertType: "snmp_unreachable",
        severity: "warning",
        message: `Equipamento não responde via SNMP: ${result.error}`,
        currentValue: null,
        thresholdValue: null,
      });

      if (telegramConfig) {
        const text = buildAlertMessage({
          sourceName: ps.name,
          sourceLocation: ps.location,
          alertType: "snmp_unreachable",
          severity: "warning",
          currentValue: null,
          thresholdValue: null,
          message: `Equipamento não responde via SNMP: ${result.error}`,
        });
        await sendTelegramMessage(telegramConfig, text).catch(() => {});
      }
    }
  } else if (!result.error) {
    // Se voltou a responder, resolver alerta de inacessível
    const alreadyActive = await hasActiveAlertOfType(ps.id, "snmp_unreachable");
    if (alreadyActive) {
      await resolveAlertsByTypeAndSource(ps.id, "snmp_unreachable");
      if (telegramConfig) {
        const text = buildResolvedMessage({ sourceName: ps.name, alertType: "snmp_unreachable", currentValue: null });
        await sendTelegramMessage(telegramConfig, text).catch(() => {});
      }
    }
  }
}

// ─── Polling de uma fonte específica ─────────────────────────────────────────
export async function pollSinglePowerSource(
  psId: number
): Promise<SnmpResult & { success: boolean }> {
  const sources = await getPowerSources();
  const ps = sources.find((s) => s.id === psId);
  if (!ps) return { success: false, error: "Fonte não encontrada" };

  const result = await pollPowerSource(ps);

  await updatePowerSourceSnmpData(psId, {
    lastPollAt: new Date(),
    lastVoltage:      typeof result.voltage      === "number" ? result.voltage      : null,
    lastCurrent:      typeof result.current      === "number" ? result.current      : null,
    lastTemperature:  typeof result.temperature  === "number" ? result.temperature  : null,
    lastAlarmStatus:  result.alarmStatus != null ? String(result.alarmStatus) : null,
    lastBatteryLevel: typeof result.batteryLevel === "number" ? result.batteryLevel : null,
    lastLoadPercent:  typeof result.loadPercent  === "number" ? result.loadPercent  : null,
    lastPollError:    result.error ?? null,
  });

  // Avaliar alertas
  try {
    const settings = await getSystemSettings();
    const telegramConfig: TelegramConfig | null =
      settings.telegram_bot_token && settings.telegram_chat_id
        ? { botToken: settings.telegram_bot_token, chatId: settings.telegram_chat_id }
        : null;
    await processAlerts(ps, result, telegramConfig);
  } catch (e) {
    console.error("[SNMP] Erro ao processar alertas:", e);
  }

  return { success: !result.error, ...result };
}

// ─── Polling automático de todas as fontes habilitadas ───────────────────────
let _pollTimer: ReturnType<typeof setInterval> | null = null;

export function startSnmpPoller(intervalMs = 60_000): void {
  if (_pollTimer) return; // já rodando
  _pollTimer = setInterval(async () => {
    try {
      const sources = await getPowerSources();
      const enabled = sources.filter((s) => s.snmpEnabled && s.snmpHost);
      for (const ps of enabled) {
        const pollInterval = (ps.snmpPollInterval ?? 300) * 1000;
        const lastPoll = ps.lastPollAt ? new Date(ps.lastPollAt).getTime() : 0;
        if (Date.now() - lastPoll < pollInterval) continue;
        await pollSinglePowerSource(ps.id).catch((e) =>
          console.error(`[SNMP] Erro ao coletar fonte ${ps.id}:`, e)
        );
      }
    } catch (e) {
      console.error("[SNMP] Erro no poller:", e);
    }
  }, intervalMs);
  console.log("[SNMP] Poller iniciado (verificação a cada 60s)");
}

export function stopSnmpPoller(): void {
  if (_pollTimer) {
    clearInterval(_pollTimer);
    _pollTimer = null;
  }
}
