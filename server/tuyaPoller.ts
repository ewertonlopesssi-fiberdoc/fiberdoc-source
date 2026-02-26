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
