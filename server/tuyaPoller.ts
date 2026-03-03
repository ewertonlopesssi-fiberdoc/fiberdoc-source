/**
 * tuyaPoller.ts
 * Integração com a Tuya IoT Cloud API para coleta de dados de sensores.
 *
 * Documentação oficial:
 *   https://developer.tuya.com/en/docs/iot/new-singnature?id=Kbw0q34cs2e5g
 *   https://developer.tuya.com/en/docs/cloud/device-management?id=K9g6rfntdnkhe
 *
 * Fluxo de autenticação:
 *   1. Gerar token via POST /v1.0/token?grant_type=1
 *   2. Usar o access_token em todas as requisições seguintes
 *   3. Renovar o token quando expirar (expire_time em segundos)
 */

import crypto from "crypto";
import {
  getTuyaDevices,
  getTuyaDeviceById,
  updateTuyaDeviceStatus,
  createSnmpAlert,
  getSystemSettings,
  getTuyaAccountById,
  createTuyaReading,
} from "./db";
import { sendTelegramMessage, TelegramConfig } from "./telegram";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface TuyaConfig {
  accessId: string;
  accessSecret: string;
  region: "us" | "eu" | "cn" | "in"; // us=América, eu=Europa, cn=China, in=Índia
}

interface TuyaTokenResponse {
  result: {
    access_token: string;
    expire_time: number;
    refresh_token: string;
    uid: string;
  };
  success: boolean;
  t: number;
}

interface TuyaDeviceStatus {
  code: string;  // ex: "temp_current", "humidity_value", "co2_value"
  value: number | string | boolean;
}

interface TuyaDeviceStatusResponse {
  result: TuyaDeviceStatus[];
  success: boolean;
  t: number;
  msg?: string;
}

// ─── Cache de token por região ────────────────────────────────────────────────

const tokenCache: Record<string, { token: string; expiresAt: number }> = {};

// ─── Endpoints por região ─────────────────────────────────────────────────────

const REGION_ENDPOINTS: Record<string, string> = {
  us: "https://openapi.tuyaus.com",
  eu: "https://openapi.tuyaeu.com",
  cn: "https://openapi.tuyacn.com",
  in: "https://openapi.tuyain.com",
};

// ─── Geração de assinatura HMAC-SHA256 ───────────────────────────────────────

function generateSign(
  accessId: string,
  accessSecret: string,
  t: number,
  nonce: string,
  token: string,
  method: string,
  path: string,
  body: string = ""
): string {
  const contentHash = crypto.createHash("sha256").update(body).digest("hex");
  const stringToSign = [method, contentHash, "", path].join("\n");
  const signStr = accessId + token + t + nonce + stringToSign;
  return crypto
    .createHmac("sha256", accessSecret)
    .update(signStr)
    .digest("hex")
    .toUpperCase();
}

// ─── Obter token de acesso ────────────────────────────────────────────────────

async function getAccessToken(config: TuyaConfig): Promise<string> {
  const cacheKey = `${config.accessId}:${config.region}`;
  const cached = tokenCache[cacheKey];

  if (cached && Date.now() < cached.expiresAt - 60_000) {
    return cached.token;
  }

  const baseUrl = REGION_ENDPOINTS[config.region] ?? REGION_ENDPOINTS.us;
  const t = Date.now();
  const nonce = crypto.randomBytes(8).toString("hex");
  const path = "/v1.0/token?grant_type=1";
  const sign = generateSign(config.accessId, config.accessSecret, t, nonce, "", "GET", path);

  const res = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers: {
      "client_id": config.accessId,
      "sign": sign,
      "t": String(t),
      "sign_method": "HMAC-SHA256",
      "nonce": nonce,
    },
  });

  const data: TuyaTokenResponse = await res.json();

  if (!data.success || !data.result?.access_token) {
    throw new Error(`Falha ao obter token Tuya: ${JSON.stringify(data)}`);
  }

  const expiresAt = Date.now() + data.result.expire_time * 1000;
  tokenCache[cacheKey] = { token: data.result.access_token, expiresAt };

  return data.result.access_token;
}

// ─── Consultar status do dispositivo ─────────────────────────────────────────

export async function getTuyaDeviceStatus(
  config: TuyaConfig,
  deviceId: string
): Promise<TuyaDeviceStatus[]> {
  const token = await getAccessToken(config);
  const baseUrl = REGION_ENDPOINTS[config.region] ?? REGION_ENDPOINTS.us;
  const t = Date.now();
  const nonce = crypto.randomBytes(8).toString("hex");
  const path = `/v1.0/devices/${deviceId}/status`;
  const sign = generateSign(config.accessId, config.accessSecret, t, nonce, token, "GET", path);

  const res = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers: {
      "client_id": config.accessId,
      "access_token": token,
      "sign": sign,
      "t": String(t),
      "sign_method": "HMAC-SHA256",
      "nonce": nonce,
    },
  });

  const data: TuyaDeviceStatusResponse = await res.json();

  if (!data.success) {
    throw new Error(`Erro ao consultar dispositivo ${deviceId}: ${data.msg ?? JSON.stringify(data)}`);
  }

  return data.result ?? [];
}

// ─── Testar conexão com a Tuya Cloud API ─────────────────────────────────────

export async function testTuyaConnection(config: TuyaConfig): Promise<{ ok: boolean; error?: string }> {
  try {
    await getAccessToken(config);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message ?? "Erro desconhecido" };
  }
}

// ─── Extrair valores dos DPs (Data Points) ───────────────────────────────────

function extractValues(statuses: TuyaDeviceStatus[]) {
  const values: Record<string, number | null> = {
    temperature: null,
    humidity: null,
    co2: null,
    power: null,
    voltage: null,
    current: null,
  };

  for (const s of statuses) {
    const v = typeof s.value === "number" ? s.value : null;
    // Temperatura — DPs comuns: temp_current, va_temperature
    if (["temp_current", "va_temperature", "temperature"].includes(s.code)) {
      // Alguns sensores retornam em décimos de grau (ex: 235 = 23.5°C)
      values.temperature = v !== null ? (v > 100 ? v / 10 : v) : null;
    }
    // Umidade — DPs comuns: humidity_value, va_humidity
    if (["humidity_value", "va_humidity", "humidity"].includes(s.code)) {
      values.humidity = v !== null ? (v > 100 ? v / 10 : v) : null;
    }
    // CO₂
    if (["co2_value", "co2"].includes(s.code)) {
      values.co2 = v;
    }
    // Potência (tomada inteligente)
    if (["cur_power", "power"].includes(s.code)) {
      values.power = v !== null ? v / 10 : null; // geralmente em décimos de W
    }
    // Tensão
    if (["cur_voltage", "voltage"].includes(s.code)) {
      values.voltage = v !== null ? v / 10 : null;
    }
    // Corrente
    if (["cur_current", "current"].includes(s.code)) {
      values.current = v !== null ? v / 1000 : null; // mA → A
    }
    // Medidores ETU-IOT / trifásicos Tuya: DP phase_a/phase_b/phase_c com valor base64
    // Formato: bytes 0-1 (BE uint16) = tensão /10 (V)
    //          bytes 2-3 (BE uint16) = corrente /1000 (A)
    //          bytes 4-5 (LE uint16) = potência /10 (W)
    if (["phase_a", "phase_b", "phase_c"].includes(s.code) && typeof s.value === "string") {
      try {
        const buf = Buffer.from(s.value, "base64");
        if (buf.length >= 6) {
          const vRaw = (buf[0] << 8) | buf[1];       // big-endian
          const cRaw = (buf[2] << 8) | buf[3];       // big-endian
          const pRaw = buf[4] | (buf[5] << 8);       // little-endian
          // Usar phase_a como referência principal (ou qualquer fase se ainda não tiver dados)
          if (s.code === "phase_a" || values.voltage === null) {
            values.voltage = vRaw / 10;              // ex: 2150 → 215.0 V
            values.current = cRaw / 1000;            // ex: 1500 → 1.500 A
            values.power   = pRaw / 10;              // ex: 220 → 22.0 W
          }
        }
      } catch (_) { /* ignorar erro de decodificação */ }
    }
  }

  return values;
}

// ─── Avaliar thresholds e gerar alertas ───────────────────────────────────────

async function evaluateAlerts(
  device: NonNullable<Awaited<ReturnType<typeof getTuyaDeviceById>>>,
  values: ReturnType<typeof extractValues>,
  telegramConfig: { botToken: string; chatId: string } | null
) {
  if (!device.alertsEnabled) return;

  const checks: Array<{
    condition: boolean;
    type: string;
    message: string;
    currentValue: number | null;
    thresholdValue: number | null;
  }> = [
    {
      condition: values.temperature !== null && device.alertTempMax !== null && values.temperature > device.alertTempMax!,
      type: "temp_high",
      message: `🌡️ Temperatura alta: ${values.temperature?.toFixed(1)}°C (limite: ${device.alertTempMax}°C)`,
      currentValue: values.temperature,
      thresholdValue: device.alertTempMax,
    },
    {
      condition: values.temperature !== null && device.alertTempMin !== null && values.temperature < device.alertTempMin!,
      type: "temp_low",
      message: `🌡️ Temperatura baixa: ${values.temperature?.toFixed(1)}°C (mínimo: ${device.alertTempMin}°C)`,
      currentValue: values.temperature,
      thresholdValue: device.alertTempMin,
    },
    {
      condition: values.humidity !== null && device.alertHumidityMax !== null && values.humidity > device.alertHumidityMax!,
      type: "humidity_high",
      message: `💧 Umidade alta: ${values.humidity?.toFixed(0)}% (limite: ${device.alertHumidityMax}%)`,
      currentValue: values.humidity,
      thresholdValue: device.alertHumidityMax,
    },
    {
      condition: values.humidity !== null && device.alertHumidityMin !== null && values.humidity < device.alertHumidityMin!,
      type: "humidity_low",
      message: `💧 Umidade baixa: ${values.humidity?.toFixed(0)}% (mínimo: ${device.alertHumidityMin}%)`,
      currentValue: values.humidity,
      thresholdValue: device.alertHumidityMin,
    },
    {
      condition: values.co2 !== null && device.alertCo2Max !== null && values.co2 > device.alertCo2Max!,
      type: "co2_high",
      message: `🏭 CO₂ alto: ${values.co2} ppm (limite: ${device.alertCo2Max} ppm)`,
      currentValue: values.co2,
      thresholdValue: device.alertCo2Max,
    },
    {
      condition: values.power !== null && device.alertPowerMax !== null && values.power > device.alertPowerMax!,
      type: "power_high",
      message: `⚡ Potência alta: ${values.power?.toFixed(1)}W (limite: ${device.alertPowerMax}W)`,
      currentValue: values.power,
      thresholdValue: device.alertPowerMax,
    },
  ];

  for (const check of checks) {
    if (!check.condition) continue;

    const fullMessage = `🔔 <b>Alerta Tuya — ${device.name}</b>\n${check.message}\n🕐 ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`;

    // Salvar alerta na tabela snmp_alerts (reutilizando a mesma tabela)
    try {
      await createSnmpAlert({
        powerSourceId: device.powerSourceId ?? 0,
        alertType: "temp_high" as any, // mapeamento genérico
        severity: "warning",
        message: check.message,
        currentValue: check.currentValue ?? undefined,
        thresholdValue: check.thresholdValue ?? undefined,
      });
    } catch {
      // Ignora erro de FK se powerSourceId for null
    }

    // Enviar notificação Telegram
    if (telegramConfig) {
      await sendTelegramMessage(telegramConfig, fullMessage);
    }
  }
}

// ─── Coletar dados de um dispositivo ─────────────────────────────────────────

export async function pollSingleTuyaDevice(deviceId: number): Promise<void> {
  const device = await getTuyaDeviceById(deviceId);
  if (!device) return;

  const settings = await getSystemSettings();

  // Prioridade: conta vinculada ao dispositivo → configuração global
  let accessId: string | undefined;
  let accessSecret: string | undefined;
  let region: TuyaConfig["region"] = "us";

  if (device.tuyaAccountId) {
    const account = await getTuyaAccountById(device.tuyaAccountId);
    if (account) {
      accessId = account.accessId;
      accessSecret = account.accessSecret;
      region = account.region as TuyaConfig["region"];
    }
  }

  // Fallback para configuração global
  if (!accessId || !accessSecret) {
    accessId = settings.tuya_access_id;
    accessSecret = settings.tuya_access_secret;
    region = (settings.tuya_region ?? "us") as TuyaConfig["region"];
  }

  if (!accessId || !accessSecret) {
    await updateTuyaDeviceStatus(deviceId, {
      status: "unknown",
      lastPolledAt: new Date(),
      lastPollError: "Credenciais Tuya não configuradas. Vincule uma conta ao dispositivo ou configure a conta global em Sistema → Tuya IoT.",
    });
    return;
  }

  const config: TuyaConfig = { accessId, accessSecret, region };

  try {
    const statuses = await getTuyaDeviceStatus(config, device.deviceId);
    const values = extractValues(statuses);
    const rawData = JSON.stringify(statuses);

    await updateTuyaDeviceStatus(deviceId, {
      status: "online",
      lastPolledAt: new Date(),
      lastPollError: null,
      lastTemperature: values.temperature,
      lastHumidity: values.humidity,
      lastCo2: values.co2,
      lastPower: values.power,
      lastVoltage: values.voltage,
      lastCurrent: values.current,
      lastRawData: rawData,
    });

    // Salvar leitura no histórico
    await createTuyaReading({
      deviceId,
      temperature: values.temperature ?? undefined,
      humidity: values.humidity ?? undefined,
      co2: values.co2 ?? undefined,
      power: values.power ?? undefined,
      voltage: values.voltage ?? undefined,
      current: values.current ?? undefined,
      rawData,
    }).catch(console.error);

    // Avaliar alertas
    const telegramConfig: TelegramConfig | null =
      settings.telegram_bot_token && settings.telegram_chat_id
        ? { botToken: settings.telegram_bot_token, chatId: settings.telegram_chat_id }
        : null;
    await evaluateAlerts(device, values, telegramConfig);

  } catch (err: any) {
    await updateTuyaDeviceStatus(deviceId, {
      status: "offline",
      lastPolledAt: new Date(),
      lastPollError: err.message ?? "Erro desconhecido",
    });
  }
}

// ─── Sincronização automática de dispositivos da conta Tuya Cloud ────────────

/**
 * Mapeia os DPs (data points) de um dispositivo para inferir o tipo.
 */
function inferDeviceType(category: string, dps: string[]): string {
  const cat = (category ?? "").toLowerCase();
  if (["wsdcg", "mcs", "ldcg", "wsd"].includes(cat)) return "temperature_humidity";
  if (["co2bj", "co2"].includes(cat)) return "co2";
  if (["ywbj", "smoke"].includes(cat)) return "smoke";
  if (["pir", "motion"].includes(cat)) return "motion";
  if (["mc", "door", "mcs2"].includes(cat)) return "door";
  if (["cz", "kg", "pc", "dlq", "dlq2", "tdq", "socket", "plug"].includes(cat)) return "power_meter";
  // Fallback por DPs
  if (dps.some(d => ["co2_value", "co2"].includes(d))) return "co2";
  if (dps.some(d => ["cur_power", "phase_a", "power"].includes(d))) return "power_meter";
  if (dps.some(d => ["temp_current", "va_temperature"].includes(d)) &&
      dps.some(d => ["humidity_value", "va_humidity"].includes(d))) return "temperature_humidity";
  if (dps.some(d => ["temp_current", "va_temperature"].includes(d))) return "temperature";
  if (dps.some(d => ["humidity_value", "va_humidity"].includes(d))) return "humidity";
  return "other";
}

export interface SyncResult {
  total: number;
  imported: number;
  updated: number;
  skipped: number;
  errors: number;
  details: Array<{
    deviceId: string;
    name: string;
    action: "imported" | "updated" | "skipped" | "error";
    reason?: string;
  }>;
}

/**
 * Busca todos os dispositivos da conta Tuya Cloud e sincroniza com a BD local.
 * Dispositivos novos são criados; dispositivos existentes têm o nome actualizado se mudou.
 */
export async function syncDevicesFromTuya(
  accountId: number
): Promise<SyncResult> {
  const account = await getTuyaAccountById(accountId);
  if (!account) throw new Error(`Conta Tuya #${accountId} não encontrada`);

  const config: TuyaConfig = {
    accessId: account.accessId,
    accessSecret: account.accessSecret,
    region: account.region as TuyaConfig["region"],
  };

  const token = await getAccessToken(config);
  const baseUrl = REGION_ENDPOINTS[config.region] ?? REGION_ENDPOINTS.us;

  // Buscar lista de dispositivos paginada
  const allDevices: Array<{ id: string; name: string; category: string; online: boolean; dps?: string[] }> = [];
  let lastRowKey = "";
  let hasMore = true;

  while (hasMore) {
    const path = `/v1.0/iot-01/associated-users/devices?last_row_key=${encodeURIComponent(lastRowKey)}&page_size=100`;
    const t = Date.now();
    const nonce = crypto.randomBytes(8).toString("hex");
    const sign = generateSign(config.accessId, config.accessSecret, t, nonce, token, "GET", path.split("?")[0]);

    const res = await fetch(`${baseUrl}${path}`, {
      method: "GET",
      headers: {
        "client_id": config.accessId,
        "access_token": token,
        "sign": sign,
        "t": String(t),
        "sign_method": "HMAC-SHA256",
        "nonce": nonce,
      },
    });

    const data: any = await res.json();

    if (!data.success) {
      // Tentar endpoint alternativo /v1.0/devices/mine
      const path2 = `/v1.0/devices/mine?page_no=1&page_size=100`;
      const t2 = Date.now();
      const nonce2 = crypto.randomBytes(8).toString("hex");
      const sign2 = generateSign(config.accessId, config.accessSecret, t2, nonce2, token, "GET", path2.split("?")[0]);
      const res2 = await fetch(`${baseUrl}${path2}`, {
        method: "GET",
        headers: {
          "client_id": config.accessId,
          "access_token": token,
          "sign": sign2,
          "t": String(t2),
          "sign_method": "HMAC-SHA256",
          "nonce": nonce2,
        },
      });
      const data2: any = await res2.json();
      if (data2.success && data2.result?.list) {
        allDevices.push(...(data2.result.list ?? []));
      } else if (data2.success && Array.isArray(data2.result)) {
        allDevices.push(...data2.result);
      }
      break; // endpoint alternativo não tem paginação
    }

    const list = data.result?.devices ?? data.result?.list ?? data.result ?? [];
    allDevices.push(...list);

    const nextKey = data.result?.last_row_key ?? "";
    if (!nextKey || list.length < 100) {
      hasMore = false;
    } else {
      lastRowKey = nextKey;
    }
  }

  // Buscar dispositivos já cadastrados localmente
  const existingDevices = await getTuyaDevices();
  const existingByDeviceId = new Map(existingDevices.map(d => [d.deviceId, d]));

  const result: SyncResult = { total: allDevices.length, imported: 0, updated: 0, skipped: 0, errors: 0, details: [] };

  for (const remote of allDevices) {
    try {
      const existing = existingByDeviceId.get(remote.id);
      const dps = remote.dps ?? [];
      const type = inferDeviceType(remote.category ?? "", dps) as any;

      if (!existing) {
        // Importar novo dispositivo
        const { createTuyaDevice } = await import("./db");
        const newId = await createTuyaDevice({
          name: remote.name ?? `Dispositivo ${remote.id}`,
          deviceId: remote.id,
          type,
          tuyaAccountId: accountId,
          pollInterval: 300,
          alertsEnabled: false,
          status: remote.online ? "online" : "offline",
        } as any);
        scheduleTuyaDevice(newId, 300);
        result.imported++;
        result.details.push({ deviceId: remote.id, name: remote.name ?? remote.id, action: "imported" });
      } else {
        // Actualizar nome se mudou
        const { updateTuyaDevice } = await import("./db");
        const nameChanged = remote.name && remote.name !== existing.name;
        const statusChanged = (remote.online ? "online" : "offline") !== existing.status;
        if (nameChanged || statusChanged) {
          await updateTuyaDevice(existing.id, {
            ...(nameChanged ? { name: remote.name } : {}),
            ...(statusChanged ? { status: remote.online ? "online" : "offline" } : {}),
          } as any);
          result.updated++;
          result.details.push({ deviceId: remote.id, name: remote.name ?? remote.id, action: "updated" });
        } else {
          result.skipped++;
          result.details.push({ deviceId: remote.id, name: remote.name ?? remote.id, action: "skipped", reason: "Sem alterações" });
        }
      }
    } catch (err: any) {
      result.errors++;
      result.details.push({ deviceId: remote.id, name: remote.name ?? remote.id, action: "error", reason: err.message });
    }
  }

  return result;
}

// ─── Scheduler de polling ─────────────────────────────────────────────────────

const pollTimers: Map<number, NodeJS.Timeout> = new Map();

export function scheduleTuyaDevice(deviceId: number, intervalSeconds: number): void {
  if (pollTimers.has(deviceId)) {
    clearInterval(pollTimers.get(deviceId)!);
  }
  const timer = setInterval(() => {
    pollSingleTuyaDevice(deviceId).catch(console.error);
  }, intervalSeconds * 1000);
  pollTimers.set(deviceId, timer);
}

export function unscheduleTuyaDevice(deviceId: number): void {
  if (pollTimers.has(deviceId)) {
    clearInterval(pollTimers.get(deviceId)!);
    pollTimers.delete(deviceId);
  }
}

// ─── Inicializar polling de todos os dispositivos cadastrados ─────────────────

export async function initTuyaPoller(): Promise<void> {
  try {
    const devices = await getTuyaDevices();
    for (const device of devices) {
      scheduleTuyaDevice(device.id, device.pollInterval);
    }
    console.log(`[Tuya] Poller iniciado para ${devices.length} dispositivo(s)`);
  } catch (err) {
    console.error("[Tuya] Erro ao inicializar poller:", err);
  }
}
