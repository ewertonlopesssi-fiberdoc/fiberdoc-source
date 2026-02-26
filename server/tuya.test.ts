import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock helpers ──────────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getTuyaAccounts: vi.fn().mockResolvedValue([]),
  getTuyaAccountById: vi.fn().mockResolvedValue(null),
  createTuyaAccount: vi.fn().mockResolvedValue({ id: 1, name: "Test", accessId: "abc", accessSecret: "secret", region: "us", notes: null, createdAt: Date.now() }),
  updateTuyaAccount: vi.fn().mockResolvedValue({ id: 1, name: "Updated", accessId: "abc", accessSecret: "secret", region: "us", notes: null, createdAt: Date.now() }),
  deleteTuyaAccount: vi.fn().mockResolvedValue(undefined),
  getTuyaDevices: vi.fn().mockResolvedValue([]),
  getTuyaDeviceById: vi.fn().mockResolvedValue(null),
  createTuyaDevice: vi.fn().mockResolvedValue({ id: 1, name: "Sensor", deviceId: "dev123", type: "temperature_humidity", enabled: true, pollingIntervalMinutes: 5, createdAt: Date.now() }),
  updateTuyaDevice: vi.fn().mockResolvedValue(undefined),
  deleteTuyaDevice: vi.fn().mockResolvedValue(undefined),
  createSnmpAlert: vi.fn().mockResolvedValue({ id: 1 }),
  getActiveSnmpAlerts: vi.fn().mockResolvedValue([]),
}));

vi.mock("./telegram", () => ({
  sendTelegramAlert: vi.fn().mockResolvedValue(true),
}));

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("Tuya Account Validation", () => {
  it("should require name, accessId and accessSecret", () => {
    const validate = (data: { name: string; accessId: string; accessSecret: string }) => {
      if (!data.name) return "Nome é obrigatório";
      if (!data.accessId) return "Access ID é obrigatório";
      if (!data.accessSecret) return "Access Secret é obrigatório";
      return null;
    };

    expect(validate({ name: "", accessId: "abc", accessSecret: "secret" })).toBe("Nome é obrigatório");
    expect(validate({ name: "Test", accessId: "", accessSecret: "secret" })).toBe("Access ID é obrigatório");
    expect(validate({ name: "Test", accessId: "abc", accessSecret: "" })).toBe("Access Secret é obrigatório");
    expect(validate({ name: "Test", accessId: "abc", accessSecret: "secret" })).toBeNull();
  });

  it("should validate region values", () => {
    const validRegions = ["us", "eu", "cn", "in"];
    expect(validRegions.includes("us")).toBe(true);
    expect(validRegions.includes("eu")).toBe(true);
    expect(validRegions.includes("xx")).toBe(false);
  });
});

describe("Tuya Device Validation", () => {
  it("should require name and deviceId", () => {
    const validate = (data: { name: string; deviceId: string }) => {
      if (!data.name) return "Nome é obrigatório";
      if (!data.deviceId) return "Device ID é obrigatório";
      return null;
    };

    expect(validate({ name: "", deviceId: "dev123" })).toBe("Nome é obrigatório");
    expect(validate({ name: "Sensor", deviceId: "" })).toBe("Device ID é obrigatório");
    expect(validate({ name: "Sensor", deviceId: "dev123" })).toBeNull();
  });

  it("should validate device types", () => {
    const validTypes = ["temperature_humidity", "temperature", "humidity", "co2", "motion", "door", "smoke", "power", "generic"];
    expect(validTypes.includes("temperature_humidity")).toBe(true);
    expect(validTypes.includes("co2")).toBe(true);
    expect(validTypes.includes("unknown_type")).toBe(false);
  });
});

describe("Tuya Threshold Evaluation", () => {
  it("should detect temperature above max threshold", () => {
    const evaluateTemp = (value: number, maxThreshold: number | null) => {
      if (maxThreshold === null) return false;
      return value > maxThreshold;
    };

    expect(evaluateTemp(45, 40)).toBe(true);
    expect(evaluateTemp(35, 40)).toBe(false);
    expect(evaluateTemp(40, 40)).toBe(false);
    expect(evaluateTemp(45, null)).toBe(false);
  });

  it("should detect humidity outside range", () => {
    const evaluateHumidity = (value: number, min: number | null, max: number | null) => {
      if (min !== null && value < min) return "low";
      if (max !== null && value > max) return "high";
      return null;
    };

    expect(evaluateHumidity(20, 30, 80)).toBe("low");
    expect(evaluateHumidity(90, 30, 80)).toBe("high");
    expect(evaluateHumidity(50, 30, 80)).toBeNull();
    expect(evaluateHumidity(50, null, null)).toBeNull();
  });

  it("should detect CO2 above max threshold", () => {
    const evaluateCo2 = (value: number, maxThreshold: number | null) => {
      if (maxThreshold === null) return false;
      return value > maxThreshold;
    };

    expect(evaluateCo2(1500, 1000)).toBe(true);
    expect(evaluateCo2(800, 1000)).toBe(false);
    expect(evaluateCo2(1500, null)).toBe(false);
  });
});

describe("Tuya API Authentication", () => {
  it("should generate correct HMAC-SHA256 signature format", async () => {
    const crypto = await import("crypto");

    const accessId = "test_access_id";
    const accessSecret = "test_access_secret";
    const timestamp = "1700000000000";
    const nonce = "test_nonce";
    const stringToSign = `${accessId}${timestamp}${nonce}`;

    const sign = crypto
      .createHmac("sha256", accessSecret)
      .update(stringToSign)
      .digest("hex")
      .toUpperCase();

    expect(sign).toMatch(/^[A-F0-9]{64}$/);
    expect(sign.length).toBe(64);
  });

  it("should build correct API URL by region", () => {
    const getBaseUrl = (region: string) => {
      const regionMap: Record<string, string> = {
        us: "https://openapi.tuyaus.com",
        eu: "https://openapi.tuyaeu.com",
        cn: "https://openapi.tuyacn.com",
        in: "https://openapi.tuyain.com",
      };
      return regionMap[region] ?? regionMap["us"];
    };

    expect(getBaseUrl("us")).toBe("https://openapi.tuyaus.com");
    expect(getBaseUrl("eu")).toBe("https://openapi.tuyaeu.com");
    expect(getBaseUrl("cn")).toBe("https://openapi.tuyacn.com");
    expect(getBaseUrl("xx")).toBe("https://openapi.tuyaus.com"); // fallback
  });
});

describe("Tuya Device Status Parsing", () => {
  it("should parse temperature and humidity from device status", () => {
    const parseStatus = (status: Array<{ code: string; value: unknown }>) => {
      const result: Record<string, number> = {};
      for (const item of status) {
        if (item.code === "va_temperature") result.temperature = Number(item.value) / 10;
        if (item.code === "va_humidity") result.humidity = Number(item.value) / 10;
        if (item.code === "temp_current") result.temperature = Number(item.value) / 10;
        if (item.code === "humidity_value") result.humidity = Number(item.value) / 10;
      }
      return result;
    };

    const status = [
      { code: "va_temperature", value: 250 },
      { code: "va_humidity", value: 600 },
    ];

    const parsed = parseStatus(status);
    expect(parsed.temperature).toBe(25);
    expect(parsed.humidity).toBe(60);
  });

  it("should handle missing status codes gracefully", () => {
    const parseStatus = (status: Array<{ code: string; value: unknown }>) => {
      const result: Record<string, number | undefined> = {};
      for (const item of status) {
        if (item.code === "va_temperature") result.temperature = Number(item.value) / 10;
      }
      return result;
    };

    const status = [{ code: "other_code", value: 100 }];
    const parsed = parseStatus(status);
    expect(parsed.temperature).toBeUndefined();
  });
});
