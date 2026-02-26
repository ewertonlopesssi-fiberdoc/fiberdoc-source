/**
 * snmpPoller.ts — Coleta SNMP para fontes de energia cadastradas
 *
 * Suporta SNMPv1, v2c e v3 (auth + priv).
 * Lê os OIDs configurados por fonte e salva os valores no banco.
 */
import * as snmp from "net-snmp";
import { getPowerSources, updatePowerSourceSnmpData } from "./db";

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

// ─── Helpers ──────────────────────────────────────────────────────────────────
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
      // Tenta converter para número; se falhar, retorna string
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
      { key: "voltage", oid: ps.oidOutputVoltage ?? null },
      { key: "current", oid: ps.oidOutputCurrent ?? null },
      { key: "temperature", oid: ps.oidTemperature ?? null },
      { key: "alarmStatus", oid: ps.oidAlarmStatus ?? null },
      { key: "batteryLevel", oid: ps.oidBatteryLevel ?? null },
      { key: "loadPercent", oid: ps.oidLoadPercent ?? null },
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

// ─── Polling de uma fonte específica ─────────────────────────────────────────
export async function pollSinglePowerSource(psId: number): Promise<SnmpResult & { success: boolean }> {
  const sources = await getPowerSources();
  const ps = sources.find((s) => s.id === psId);
  if (!ps) return { success: false, error: "Fonte não encontrada" };

  const result = await pollPowerSource(ps);
  await updatePowerSourceSnmpData(psId, {
    lastPollAt: new Date(),
    lastVoltage: typeof result.voltage === "number" ? result.voltage : null,
    lastCurrent: typeof result.current === "number" ? result.current : null,
    lastTemperature: typeof result.temperature === "number" ? result.temperature : null,
    lastAlarmStatus: result.alarmStatus != null ? String(result.alarmStatus) : null,
    lastBatteryLevel: typeof result.batteryLevel === "number" ? result.batteryLevel : null,
    lastLoadPercent: typeof result.loadPercent === "number" ? result.loadPercent : null,
    lastPollError: result.error ?? null,
  });

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
        if (Date.now() - lastPoll < pollInterval) continue; // ainda não é hora
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
