/**
 * telegram.ts — Integração com Telegram Bot API
 *
 * Envia notificações de alertas SNMP via bot do Telegram.
 * Não requer dependências externas — usa fetch nativo do Node.js 18+.
 */

const TELEGRAM_API = "https://api.telegram.org";

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

/**
 * Envia uma mensagem de texto para um chat do Telegram.
 * Suporta formatação HTML (negrito, itálico, código, links).
 */
export async function sendTelegramMessage(
  config: TelegramConfig,
  text: string,
  parseMode: "HTML" | "Markdown" = "HTML"
): Promise<{ ok: boolean; error?: string }> {
  if (!config.botToken || !config.chatId) {
    return { ok: false, error: "Bot token ou Chat ID não configurado" };
  }

  try {
    const url = `${TELEGRAM_API}/bot${config.botToken}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.chatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: true,
      }),
    });

    const data = await res.json() as any;
    if (!data.ok) {
      console.error("[Telegram] Erro ao enviar mensagem:", data.description);
      return { ok: false, error: data.description };
    }
    return { ok: true };
  } catch (e: any) {
    console.error("[Telegram] Falha na requisição:", e.message);
    return { ok: false, error: e.message };
  }
}

// ─── Mensagens formatadas para alertas SNMP ───────────────────────────────────

const SEVERITY_EMOJI: Record<string, string> = {
  warning: "⚠️",
  critical: "🚨",
};

const ALERT_TYPE_LABEL: Record<string, string> = {
  temp_high:        "Temperatura alta",
  voltage_low:      "Tensão de saída baixa",
  voltage_high:     "Tensão de saída alta",
  battery_low:      "Bateria baixa",
  battery_high:     "Bateria alta",
  current_high:     "Corrente alta",
  load_high:        "Carga alta",
  ac_fail:          "Falta de tensão AC",
  snmp_unreachable: "Equipamento inacessível via SNMP",
};

const ALERT_TYPE_UNIT: Record<string, string> = {
  temp_high:    "°C",
  voltage_low:  "V",
  voltage_high: "V",
  battery_low:  "V",
  battery_high: "V",
  current_high: "A",
  load_high:    "%",
  ac_fail:      "",
  snmp_unreachable: "",
};

export function buildAlertMessage(opts: {
  sourceName: string;
  sourceLocation?: string | null;
  alertType: string;
  severity: string;
  currentValue?: number | null;
  thresholdValue?: number | null;
  message: string;
}): string {
  const emoji = SEVERITY_EMOJI[opts.severity] ?? "⚠️";
  const label = ALERT_TYPE_LABEL[opts.alertType] ?? opts.alertType;
  const unit = ALERT_TYPE_UNIT[opts.alertType] ?? "";
  const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  let lines = [
    `${emoji} <b>ALERTA SNMP — ${label.toUpperCase()}</b>`,
    ``,
    `📍 <b>Fonte:</b> ${opts.sourceName}`,
  ];

  if (opts.sourceLocation) {
    lines.push(`🏢 <b>Local:</b> ${opts.sourceLocation}`);
  }

  if (opts.currentValue != null && unit) {
    lines.push(`📊 <b>Valor atual:</b> ${opts.currentValue}${unit}`);
  }

  if (opts.thresholdValue != null && unit) {
    const direction = ["voltage_low", "battery_low"].includes(opts.alertType) ? "Mínimo" : "Máximo";
    lines.push(`🎯 <b>${direction} configurado:</b> ${opts.thresholdValue}${unit}`);
  }

  lines.push(`🕐 <b>Horário:</b> ${now}`);
  lines.push(``);
  lines.push(`<i>${opts.message}</i>`);

  return lines.join("\n");
}

export function buildResolvedMessage(opts: {
  sourceName: string;
  alertType: string;
  currentValue?: number | null;
}): string {
  const label = ALERT_TYPE_LABEL[opts.alertType] ?? opts.alertType;
  const unit = ALERT_TYPE_UNIT[opts.alertType] ?? "";
  const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  let lines = [
    `✅ <b>ALERTA RESOLVIDO — ${label.toUpperCase()}</b>`,
    ``,
    `📍 <b>Fonte:</b> ${opts.sourceName}`,
  ];

  if (opts.currentValue != null && unit) {
    lines.push(`📊 <b>Valor atual:</b> ${opts.currentValue}${unit}`);
  }

  lines.push(`🕐 <b>Horário:</b> ${now}`);
  lines.push(``);
  lines.push(`<i>O valor voltou ao intervalo normal.</i>`);

  return lines.join("\n");
}
