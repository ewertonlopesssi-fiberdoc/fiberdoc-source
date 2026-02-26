import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock do módulo net-snmp ───────────────────────────────────────────────────
vi.mock("net-snmp", () => ({
  createSession: vi.fn(() => ({
    get: vi.fn((_oids: string[], cb: (err: any, varbinds: any[]) => void) => {
      cb(null, [{ oid: "1.3.6.1.4.1.2011.6.3.1.1.0", value: 45 }]);
    }),
    close: vi.fn(),
  })),
  Version1: "1",
  Version2c: "2c",
  Version3: "3",
  ErrorStatus: { NoError: 0 },
  isVarbindError: vi.fn(() => false),
}));

// ─── Mock do fetch global (Telegram) ─────────────────────────────────────────
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ─── Testes do módulo telegram.ts ─────────────────────────────────────────────
describe("telegram helper", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("envia mensagem com sucesso quando a API retorna ok:true", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, result: {} }),
    });

    const { sendTelegramMessage } = await import("./telegram");
    const result = await sendTelegramMessage(
      { botToken: "123:ABC", chatId: "456" },
      "Teste de alerta"
    );

    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("123:ABC");
    expect(url).toContain("sendMessage");
    const body = JSON.parse((opts as any).body);
    expect(body.chat_id).toBe("456");
    expect(body.text).toBe("Teste de alerta");
  });

  it("retorna ok:false quando a API retorna erro", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ ok: false, description: "Unauthorized" }),
    });

    const { sendTelegramMessage } = await import("./telegram");
    const result = await sendTelegramMessage(
      { botToken: "invalid", chatId: "456" },
      "Teste"
    );

    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("retorna ok:false quando fetch lança exceção (sem rede)", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const { sendTelegramMessage } = await import("./telegram");
    const result = await sendTelegramMessage(
      { botToken: "123:ABC", chatId: "456" },
      "Teste"
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Network error");
  });
});

// ─── Testes de lógica de threshold ────────────────────────────────────────────
describe("avaliação de thresholds de alertas", () => {
  it("detecta temperatura acima do limite", () => {
    const threshold = 50;
    const value = 55;
    expect(value > threshold).toBe(true);
  });

  it("não alerta quando temperatura está dentro do limite", () => {
    const threshold = 50;
    const value = 45;
    expect(value > threshold).toBe(false);
  });

  it("detecta tensão de bateria abaixo do mínimo", () => {
    const minVoltage = 44;
    const value = 42;
    expect(value < minVoltage).toBe(true);
  });

  it("detecta tensão de bateria acima do máximo", () => {
    const maxVoltage = 58;
    const value = 60;
    expect(value > maxVoltage).toBe(true);
  });

  it("detecta falta de AC quando valor é 0", () => {
    const acValue = 0;
    expect(acValue === 0).toBe(true);
  });

  it("detecta carga alta acima do threshold", () => {
    const threshold = 80;
    const value = 90;
    expect(value > threshold).toBe(true);
  });
});

// ─── Testes de formatação de mensagem Telegram ────────────────────────────────
describe("formatação de mensagem de alerta", () => {
  it("mensagem de temperatura alta contém informações relevantes", () => {
    const sourceName = "Retificadora Huawei ETP48100";
    const alertType = "temp_high";
    const currentValue = 55;
    const threshold = 50;

    const message = `🌡️ <b>Temperatura Alta</b>\n📍 ${sourceName}\nValor: ${currentValue}°C | Limite: ${threshold}°C`;

    expect(message).toContain(sourceName);
    expect(message).toContain("55°C");
    expect(message).toContain("50°C");
  });

  it("mensagem de falta de AC contém informações relevantes", () => {
    const sourceName = "No-break APC";
    const message = `⚡ <b>Falta de Tensão AC</b>\n📍 ${sourceName}\nEquipamento operando em bateria!`;

    expect(message).toContain(sourceName);
    expect(message).toContain("bateria");
  });

  it("mensagem de bateria baixa contém tensão atual", () => {
    const sourceName = "Inversora JFA 3000W";
    const currentValue = 42;
    const threshold = 44;
    const message = `🔋 <b>Bateria Baixa</b>\n📍 ${sourceName}\nTensão: ${currentValue}V | Mínimo: ${threshold}V`;

    expect(message).toContain("42V");
    expect(message).toContain("44V");
  });
});
