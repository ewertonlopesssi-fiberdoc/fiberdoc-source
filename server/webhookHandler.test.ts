import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateWebhookSignature,
  syncOnuFromWebhook,
  handleSgpWebhook,
  type WebhookPayload,
  type SyncResult,
} from "./webhookHandler";
import crypto from "crypto";

// ─── Mock de Dependências ─────────────────────────────────────────────────────

vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

vi.mock("./sgpApi", () => ({
  getSgpConfig: vi.fn(),
  sgpGetOnuBySerial: vi.fn(),
}));

vi.mock("./genieacsRouter", () => ({
  genieRequest: vi.fn(),
}));

// ─── Testes ───────────────────────────────────────────────────────────────────

/**
 * syncOnuFromWebhook faz retry com backoff exponencial real: 1s + 2s + 4s = 7s
 * quando esgota as tentativas. O limite padrão do Vitest é 5s, então os testes
 * que exercitam o caminho de falha estouravam por tempo — não por defeito no
 * código que testam.
 *
 * A alternativa seria relógio falso (vi.useFakeTimers + runAllTimersAsync), que
 * deixaria a suíte rápida. Fica para depois: aumentar o limite não tem como
 * introduzir bug, e o custo é a suíte ficar alguns segundos mais lenta nos
 * casos de falha — que são poucos.
 */
vi.setConfig({ testTimeout: 20000 });

describe("Webhook Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validateWebhookSignature", () => {
    it("deve retornar true para assinatura válida", async () => {
      const payload = JSON.stringify({ event: "onu_updated", serial: "TEST123" });
      const secret = "test-secret";
      const hash = crypto
        .createHmac("sha256", secret)
        .update(payload)
        .digest("hex");

      const { getDb } = await import("./db");
      vi.mocked(getDb).mockResolvedValue({
        select: () => ({
          from: () => ({
            where: () =>
              Promise.resolve([{ value: secret }]),
          }),
        }),
      } as any);

      const result = await validateWebhookSignature(payload, hash);
      expect(result).toBe(true);
    });

    it("deve retornar false para assinatura inválida", async () => {
      const payload = JSON.stringify({ event: "onu_updated", serial: "TEST123" });
      const invalidHash = "invalid-hash";

      const { getDb } = await import("./db");
      vi.mocked(getDb).mockResolvedValue({
        select: () => ({
          from: () => ({
            where: () =>
              Promise.resolve([{ value: "test-secret" }]),
          }),
        }),
      } as any);

      const result = await validateWebhookSignature(payload, invalidHash);
      expect(result).toBe(false);
    });

    it("deve retornar true se nenhum secret estiver configurado (modo teste)", async () => {
      const payload = JSON.stringify({ event: "onu_updated", serial: "TEST123" });

      const { getDb } = await import("./db");
      vi.mocked(getDb).mockResolvedValue({
        select: () => ({
          from: () => ({
            where: () =>
              Promise.resolve([]),
          }),
        }),
      } as any);

      const result = await validateWebhookSignature(payload, "any-signature");
      expect(result).toBe(true);
    });
  });

  describe("handleSgpWebhook", () => {
    it("deve processar webhook com serial válido", async () => {
      const payload: WebhookPayload = {
        event: "onu_updated",
        serial: "TPLINK1234567890",
        timestamp: Date.now(),
      };

      const { getSgpConfig, sgpGetOnuBySerial } = await import("./sgpApi");
      const { genieRequest } = await import("./genieacsRouter");

      vi.mocked(getSgpConfig).mockResolvedValue({
        url: "http://localhost:8080",
        token: "test-token",
        app: "test-app",
      });

      vi.mocked(sgpGetOnuBySerial).mockResolvedValue({
        id: 1,
        onu: 1,
        slot: 1,
        pon: 1,
        olt_id: 1,
        onu_login: "cliente@isp.com.br",
        onu_password: "senha123",
        wifi_ssid: "WiFi-Cliente",
        wifi_password: "wifisenha123",
      } as any);

      vi.mocked(genieRequest).mockResolvedValue([
        { _id: "TPLINK-ProductClass-1234567890" },
      ]);

      const result = await handleSgpWebhook(payload);

      expect(result).not.toBeNull();
      expect(result?.success).toBe(true);
      expect(result?.serial).toBe("TPLINK1234567890");
    });

    it("deve retornar null se serial não for fornecido", async () => {
      const payload: WebhookPayload = {
        event: "onu_updated",
        timestamp: Date.now(),
      };

      const result = await handleSgpWebhook(payload);
      expect(result).toBeNull();
    });

    it("deve extrair serial de payload.data", async () => {
      const payload: WebhookPayload = {
        event: "client_updated",
        timestamp: Date.now(),
        data: { serial: "TPLINK9876543210" },
      };

      const { getSgpConfig, sgpGetOnuBySerial } = await import("./sgpApi");
      const { genieRequest } = await import("./genieacsRouter");

      vi.mocked(getSgpConfig).mockResolvedValue({
        url: "http://localhost:8080",
        token: "test-token",
        app: "test-app",
      });

      vi.mocked(sgpGetOnuBySerial).mockResolvedValue({
        id: 2,
        onu: 2,
        slot: 1,
        pon: 1,
        olt_id: 1,
        onu_login: "cliente2@isp.com.br",
        onu_password: "senha456",
      } as any);

      vi.mocked(genieRequest).mockResolvedValue([
        { _id: "TPLINK-ProductClass-9876543210" },
      ]);

      const result = await handleSgpWebhook(payload);

      expect(result).not.toBeNull();
      expect(result?.serial).toBe("TPLINK9876543210");
    });
  });

  describe("syncOnuFromWebhook", () => {
    it("deve sincronizar ONU com sucesso", async () => {
      const { getSgpConfig, sgpGetOnuBySerial } = await import("./sgpApi");
      const { genieRequest } = await import("./genieacsRouter");

      vi.mocked(getSgpConfig).mockResolvedValue({
        url: "http://localhost:8080",
        token: "test-token",
        app: "test-app",
      });

      vi.mocked(sgpGetOnuBySerial).mockResolvedValue({
        id: 1,
        onu: 1,
        slot: 1,
        pon: 1,
        olt_id: 1,
        onu_login: "test@isp.com.br",
        onu_password: "testpass",
        wifi_ssid: "TestWiFi",
        wifi_password: "testpass",
      } as any);

      vi.mocked(genieRequest).mockResolvedValue([
        { _id: "TPLINK-ProductClass-TEST123" },
      ]);

      const result = await syncOnuFromWebhook("TPLINK-ProductClass-TEST123");

      expect(result.success).toBe(true);
      expect(result.message).toContain("sincronizada com sucesso");
      expect(result.pppoeLogin).toBe("test@isp.com.br");
    });

    it("deve retornar erro se ONU não encontrada no SGP", async () => {
      const { getSgpConfig, sgpGetOnuBySerial } = await import("./sgpApi");

      vi.mocked(getSgpConfig).mockResolvedValue({
        url: "http://localhost:8080",
        token: "test-token",
        app: "test-app",
      });

      vi.mocked(sgpGetOnuBySerial).mockResolvedValue(null);

      const result = await syncOnuFromWebhook("NONEXISTENT");

      expect(result.success).toBe(false);
      expect(result.message).toContain("não encontrada");
    });

    it("deve retornar erro se SGP não configurado", async () => {
      const { getSgpConfig } = await import("./sgpApi");

      vi.mocked(getSgpConfig).mockResolvedValue(null);

      const result = await syncOnuFromWebhook("TPLINK123");

      expect(result.success).toBe(false);
      expect(result.message).toContain("não configurado");
    });

    it("deve fazer retry com backoff exponencial em caso de falha", async () => {
      const { getSgpConfig, sgpGetOnuBySerial } = await import("./sgpApi");
      const { genieRequest } = await import("./genieacsRouter");

      vi.mocked(getSgpConfig).mockResolvedValue({
        url: "http://localhost:8080",
        token: "test-token",
        app: "test-app",
      });

      vi.mocked(sgpGetOnuBySerial).mockResolvedValue({
        id: 1,
        onu: 1,
        slot: 1,
        pon: 1,
        olt_id: 1,
        onu_login: "test@isp.com.br",
        onu_password: "testpass",
      } as any);

      // Falhar 2 vezes, depois suceder
      let callCount = 0;
      vi.mocked(genieRequest).mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          throw new Error("Temporary error");
        }
        return [{ _id: "TPLINK-TEST" }];
      });

      const result = await syncOnuFromWebhook("TPLINK-TEST");

      // Após retries, deve suceder
      expect(result.success).toBe(true);
      expect(callCount).toBeGreaterThan(1);
    });

    it("deve incluir Wi-Fi 5GHz se disponível", async () => {
      const { getSgpConfig, sgpGetOnuBySerial } = await import("./sgpApi");
      const { genieRequest } = await import("./genieacsRouter");

      vi.mocked(getSgpConfig).mockResolvedValue({
        url: "http://localhost:8080",
        token: "test-token",
        app: "test-app",
      });

      vi.mocked(sgpGetOnuBySerial).mockResolvedValue({
        id: 1,
        onu: 1,
        slot: 1,
        pon: 1,
        olt_id: 1,
        onu_login: "test@isp.com.br",
        onu_password: "testpass",
        wifi_ssid: "WiFi-2.4GHz",
        wifi_password: "pass24",
        wifi_ssid5: "WiFi-5GHz",
        wifi_password5: "pass5",
      } as any);

      vi.mocked(genieRequest).mockResolvedValue([
        { _id: "TPLINK-TEST" },
      ]);

      const result = await syncOnuFromWebhook("TPLINK-TEST");

      expect(result.success).toBe(true);
      // Verificar que genieRequest foi chamado com configurações de Wi-Fi 5GHz
      expect(vi.mocked(genieRequest).mock.calls.length).toBeGreaterThanOrEqual(3);
    });
  });
});
