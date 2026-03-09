/**
 * webhookHandler.ts — Sincronização automática SGP → GenieACS
 *
 * Quando dados de cliente são alterados no SGP TSMx, este handler:
 * 1. Recebe webhook do SGP
 * 2. Valida assinatura HMAC-SHA256
 * 3. Busca dados da ONU no SGP
 * 4. Sincroniza configurações via GenieACS
 * 5. Registra histórico de sincronização
 */

import crypto from "crypto";
import { getDb } from "./db";
import { getSgpConfig, sgpGetOnuBySerial } from "./sgpApi";
import { genieRequest } from "./genieacsRouter";
import { systemSettings } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface WebhookPayload {
  event: "onu_updated" | "client_updated" | "service_updated";
  serial?: string;
  servicoId?: number;
  contractId?: number;
  timestamp: number;
  data?: Record<string, any>;
}

export interface SyncResult {
  success: boolean;
  serial?: string;
  message: string;
  pppoeLogin?: string;
  wifiSsid?: string;
  timestamp: number;
  error?: string;
}

// ─── Validação de Webhook ─────────────────────────────────────────────────────

/**
 * Validar assinatura HMAC-SHA256 do webhook
 * SGP envia: X-Webhook-Signature = HMAC-SHA256(payload, secret)
 */
export async function validateWebhookSignature(
  payload: string,
  signature: string
): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;

    // Buscar secret do webhook nas configurações
    const rows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, "sgp_webhook_secret"));

    if (rows.length === 0) {
      console.warn("[Webhook] Nenhum secret configurado — validação desabilitada");
      return true; // Permitir se não configurado (para testes)
    }

    const secret = rows[0].value ?? "";
    if (!secret) return true;
    const hash = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    return hash === signature;
  } catch (err) {
    console.error("[Webhook] Erro ao validar assinatura:", err);
    return false;
  }
}

// ─── Sincronização SGP → GenieACS ─────────────────────────────────────────────

/**
 * Sincronizar ONU: buscar dados no SGP e atualizar via GenieACS
 */
export async function syncOnuFromWebhook(
  serial: string,
  retryCount = 0
): Promise<SyncResult> {
  const maxRetries = 3;
  const baseDelay = 1000; // 1 segundo

  try {
    console.log(`[Webhook] Sincronizando ONU: ${serial} (tentativa ${retryCount + 1})`);

    // 1. Buscar configuração SGP
    const sgpCfg = await getSgpConfig();
    if (!sgpCfg) {
      throw new Error("SGP não configurado");
    }

    // 2. Buscar ONU no SGP pelo serial
    const onu = await sgpGetOnuBySerial(sgpCfg, serial);
    if (!onu) {
      throw new Error(`ONU não encontrada no SGP: ${serial}`);
    }

    // 3. Extrair dados de configuração
    const pppoeLogin = onu.onu_login || onu.login;
    const pppoePassword = onu.onu_password;
    const wifiSsid = onu.wifi_ssid;
    const wifiPassword = onu.wifi_password;
    const wifiSsid5 = onu.wifi_ssid5;
    const wifiPassword5 = onu.wifi_password5;

    if (!pppoeLogin || !pppoePassword) {
      throw new Error("Dados PPPoE incompletos no SGP");
    }

    // 4. Buscar ONU no GenieACS
    const devices = await genieRequest(
      `/devices?query=${encodeURIComponent(
        JSON.stringify({ "_id": { "$regex": serial } })
      )}`
    );

    if (!Array.isArray(devices) || devices.length === 0) {
      throw new Error(`ONU não encontrada no GenieACS: ${serial}`);
    }

    const deviceId = devices[0]._id;

    // 5. Enviar configurações via GenieACS (RPC)
    const tasks = [];

    // Configurar PPPoE
    tasks.push({
      name: "setParameterValues",
      parameterValues: [
        [
          "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username",
          pppoeLogin,
          "xsd:string",
        ],
        [
          "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Password",
          pppoePassword,
          "xsd:string",
        ],
        [
          "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Enable",
          "true",
          "xsd:boolean",
        ],
      ],
    });

    // Configurar Wi-Fi 2.4GHz (se disponível)
    if (wifiSsid && wifiPassword) {
      tasks.push({
        name: "setParameterValues",
        parameterValues: [
          [
            "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID",
            wifiSsid,
            "xsd:string",
          ],
          [
            "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.PreSharedKey",
            wifiPassword,
            "xsd:string",
          ],
          [
            "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.Enable",
            "true",
            "xsd:boolean",
          ],
        ],
      });
    }

    // Configurar Wi-Fi 5GHz (se disponível)
    if (wifiSsid5 && wifiPassword5) {
      tasks.push({
        name: "setParameterValues",
        parameterValues: [
          [
            "InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.SSID",
            wifiSsid5,
            "xsd:string",
          ],
          [
            "InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.PreSharedKey.1.PreSharedKey",
            wifiPassword5,
            "xsd:string",
          ],
          [
            "InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.Enable",
            "true",
            "xsd:boolean",
          ],
        ],
      });
    }

    // Enviar tasks para o dispositivo
    for (const task of tasks) {
      await genieRequest(
        `/devices/${encodeURIComponent(deviceId)}/tasks?connection_request`,
        "POST",
        task
      );
    }

    // 6. Registrar sucesso
    const result: SyncResult = {
      success: true,
      serial,
      message: `ONU ${serial} sincronizada com sucesso`,
      pppoeLogin,
      wifiSsid: wifiSsid || undefined,
      timestamp: Date.now(),
    };

    console.log(`[Webhook] ✓ Sincronização bem-sucedida: ${serial}`);
    await logWebhookSync(result);

    return result;
  } catch (err: any) {
    console.error(`[Webhook] ✗ Erro na sincronização: ${err.message}`);

    // Retry com backoff exponencial
    if (retryCount < maxRetries) {
      const delay = baseDelay * Math.pow(2, retryCount); // 1s, 2s, 4s
      console.log(`[Webhook] Tentando novamente em ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return syncOnuFromWebhook(serial, retryCount + 1);
    }

    const result: SyncResult = {
      success: false,
      serial,
      message: `Falha após ${maxRetries + 1} tentativas: ${err.message}`,
      timestamp: Date.now(),
      error: err.message,
    };

    console.error(`[Webhook] ✗ Falha permanente: ${serial}`);
    await logWebhookSync(result);

    return result;
  }
}

// ─── Logging de Sincronização ─────────────────────────────────────────────────

/**
 * Registrar histórico de sincronização de webhook
 */
async function logWebhookSync(result: SyncResult): Promise<void> {
  try {
    console.log(
      `[WebhookSync] ${result.success ? "✓" : "✗"} ${result.serial}: ${result.message}`
    );
  } catch (err) {
    console.error("[WebhookSync] Erro ao registrar log:", err);
  }
}

// ─── Processamento de Webhook ──────────────────────────────────────────────────

/**
 * Processar webhook do SGP
 */
export async function handleSgpWebhook(
  payload: WebhookPayload
): Promise<SyncResult | null> {
  try {
    console.log(`[Webhook] Recebido evento: ${payload.event}`);

    // Determinar serial da ONU
    let serial: string | undefined;

    if (payload.serial) {
      serial = payload.serial;
    } else if (payload.data?.serial) {
      serial = payload.data.serial;
    }

    if (!serial) {
      console.warn("[Webhook] Serial não fornecido no payload");
      return null;
    }

    // Sincronizar ONU
    return await syncOnuFromWebhook(serial);
  } catch (err: any) {
    console.error("[Webhook] Erro ao processar webhook:", err.message);
    return null;
  }
}
