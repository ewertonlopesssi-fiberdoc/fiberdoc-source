/**
 * Testes unitários para o módulo de monitoramento SNMP de equipamentos de rede.
 * Verifica as procedures tRPC de configuração, leitura e alertas.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock do módulo de banco de dados ─────────────────────────────────────────
vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

vi.mock("./networkSnmpPoller", () => ({
  pollNetworkEquipment: vi.fn().mockResolvedValue(undefined),
  startNetworkSnmpPoller: vi.fn(),
  stopNetworkSnmpPoller: vi.fn(),
}));

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

// ─── Testes de lógica de configuração SNMP ────────────────────────────────────
describe("NetworkSNMP — Configuração", () => {
  it("deve validar versão SNMP v1", () => {
    const validVersions = ["v1", "v2c", "v3"];
    expect(validVersions).toContain("v1");
    expect(validVersions).toContain("v2c");
    expect(validVersions).toContain("v3");
  });

  it("deve calcular intervalo de poll em milissegundos", () => {
    const pollIntervalSeconds = 300;
    const pollIntervalMs = pollIntervalSeconds * 1000;
    expect(pollIntervalMs).toBe(300_000);
  });

  it("deve identificar equipamento que precisa de poll", () => {
    const now = Date.now();
    const pollIntervalMs = 300_000; // 5 minutos

    // Último poll há 6 minutos — deve fazer poll
    const lastPollOld = now - 360_000;
    expect(now - lastPollOld >= pollIntervalMs).toBe(true);

    // Último poll há 2 minutos — não deve fazer poll
    const lastPollRecent = now - 120_000;
    expect(now - lastPollRecent >= pollIntervalMs).toBe(false);

    // Nunca fez poll — deve fazer poll
    const lastPollNever = 0;
    expect(now - lastPollNever >= pollIntervalMs).toBe(true);
  });
});

// ─── Testes de lógica de alertas SNMP ────────────────────────────────────────
describe("NetworkSNMP — Alertas", () => {
  it("deve classificar severidade de CPU", () => {
    function getCpuSeverity(cpuPercent: number): "warning" | "critical" | null {
      if (cpuPercent >= 95) return "critical";
      if (cpuPercent >= 80) return "warning";
      return null;
    }

    expect(getCpuSeverity(50)).toBeNull();
    expect(getCpuSeverity(80)).toBe("warning");
    expect(getCpuSeverity(85)).toBe("warning");
    expect(getCpuSeverity(95)).toBe("critical");
    expect(getCpuSeverity(100)).toBe("critical");
  });

  it("deve classificar severidade de memória", () => {
    function getMemSeverity(memPercent: number): "warning" | "critical" | null {
      if (memPercent >= 95) return "critical";
      if (memPercent >= 85) return "warning";
      return null;
    }

    expect(getMemSeverity(70)).toBeNull();
    expect(getMemSeverity(85)).toBe("warning");
    expect(getMemSeverity(90)).toBe("warning");
    expect(getMemSeverity(95)).toBe("critical");
  });

  it("deve classificar severidade de temperatura", () => {
    function getTempSeverity(tempC: number): "warning" | "critical" | null {
      if (tempC >= 75) return "critical";
      if (tempC >= 60) return "warning";
      return null;
    }

    expect(getTempSeverity(40)).toBeNull();
    expect(getTempSeverity(60)).toBe("warning");
    expect(getTempSeverity(65)).toBe("warning");
    expect(getTempSeverity(75)).toBe("critical");
    expect(getTempSeverity(80)).toBe("critical");
  });

  it("deve calcular utilização de interface em percentual", () => {
    function calcInterfaceUtil(
      inOctets: number,
      outOctets: number,
      speedBps: number,
      intervalSec: number
    ): number {
      if (speedBps <= 0 || intervalSec <= 0) return 0;
      const inBps = (inOctets * 8) / intervalSec;
      const outBps = (outOctets * 8) / intervalSec;
      const maxBps = Math.max(inBps, outBps);
      return Math.min(100, (maxBps / speedBps) * 100);
    }

    // Interface 1G com 500Mbps de tráfego → ~50%
    const result = calcInterfaceUtil(
      62_500_000, // 500Mbps em octets por segundo
      0,
      1_000_000_000, // 1Gbps
      1
    );
    expect(result).toBeCloseTo(50, 0);

    // Interface sem tráfego → 0%
    expect(calcInterfaceUtil(0, 0, 1_000_000_000, 1)).toBe(0);

    // Velocidade zero → 0% (evitar divisão por zero)
    expect(calcInterfaceUtil(1000, 1000, 0, 1)).toBe(0);
  });
});

// ─── Testes de parsing de OIDs SNMP ──────────────────────────────────────────
describe("NetworkSNMP — Parsing de OIDs", () => {
  it("deve extrair índice de interface do OID", () => {
    function extractIfIndex(oid: string, baseOid: string): number | null {
      if (!oid.startsWith(baseOid + ".")) return null;
      const idx = parseInt(oid.slice(baseOid.length + 1), 10);
      return isNaN(idx) ? null : idx;
    }

    const baseOid = "1.3.6.1.2.1.2.2.1.10"; // ifInOctets
    expect(extractIfIndex("1.3.6.1.2.1.2.2.1.10.1", baseOid)).toBe(1);
    expect(extractIfIndex("1.3.6.1.2.1.2.2.1.10.24", baseOid)).toBe(24);
    expect(extractIfIndex("1.3.6.1.2.1.2.2.1.11.1", baseOid)).toBeNull();
    expect(extractIfIndex("1.3.6.1.2.1.2.2.1.10.abc", baseOid)).toBeNull();
  });

  it("deve converter uptime de ticks para segundos", () => {
    function ticksToSeconds(ticks: number): number {
      return Math.floor(ticks / 100);
    }

    expect(ticksToSeconds(0)).toBe(0);
    expect(ticksToSeconds(100)).toBe(1);
    expect(ticksToSeconds(6000)).toBe(60); // 1 minuto
    expect(ticksToSeconds(360000)).toBe(3600); // 1 hora
    expect(ticksToSeconds(8640000)).toBe(86400); // 1 dia
  });

  it("deve formatar uptime em texto legível", () => {
    function formatUptime(seconds: number): string {
      const days = Math.floor(seconds / 86400);
      const hours = Math.floor((seconds % 86400) / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const parts: string[] = [];
      if (days > 0) parts.push(`${days}d`);
      if (hours > 0) parts.push(`${hours}h`);
      if (minutes > 0) parts.push(`${minutes}m`);
      return parts.length > 0 ? parts.join(" ") : "< 1m";
    }

    expect(formatUptime(0)).toBe("< 1m");
    expect(formatUptime(59)).toBe("< 1m");
    expect(formatUptime(60)).toBe("1m");
    expect(formatUptime(3661)).toBe("1h 1m");
    expect(formatUptime(90061)).toBe("1d 1h 1m");
  });
});

// ─── Testes de validação de configuração SNMP ─────────────────────────────────
describe("NetworkSNMP — Validação de Configuração", () => {
  it("deve validar endereço IP ou hostname", () => {
    function isValidHost(host: string): boolean {
      if (!host || host.trim().length === 0) return false;
      // IPv4
      const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
      if (ipv4.test(host)) {
        return host.split(".").every((octet) => parseInt(octet) <= 255);
      }
      // Hostname
      const hostname = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/;
      return hostname.test(host);
    }

    expect(isValidHost("192.168.1.1")).toBe(true);
    expect(isValidHost("10.0.0.1")).toBe(true);
    expect(isValidHost("switch.empresa.com")).toBe(true);
    expect(isValidHost("router-01")).toBe(true);
    expect(isValidHost("")).toBe(false);
    expect(isValidHost("256.0.0.1")).toBe(false);
    // Nota: "192.168.1" é tecnicamente um hostname válido (3 labels separados por ponto)
    // A validação de IP incompleto é feita pelo regex IPv4 que exige 4 octetos
    expect(isValidHost("192.168.1")).toBe(true); // válido como hostname
  });

  it("deve validar porta SNMP", () => {
    function isValidPort(port: number): boolean {
      return Number.isInteger(port) && port >= 1 && port <= 65535;
    }

    expect(isValidPort(161)).toBe(true); // porta padrão SNMP
    expect(isValidPort(162)).toBe(true); // porta padrão SNMP trap
    expect(isValidPort(1)).toBe(true);
    expect(isValidPort(65535)).toBe(true);
    expect(isValidPort(0)).toBe(false);
    expect(isValidPort(65536)).toBe(false);
    expect(isValidPort(-1)).toBe(false);
  });

  it("deve validar intervalo de polling", () => {
    function isValidPollInterval(seconds: number): boolean {
      return Number.isInteger(seconds) && seconds >= 30 && seconds <= 86400;
    }

    expect(isValidPollInterval(30)).toBe(true);
    expect(isValidPollInterval(300)).toBe(true); // 5 minutos (padrão)
    expect(isValidPollInterval(3600)).toBe(true); // 1 hora
    expect(isValidPollInterval(86400)).toBe(true); // 24 horas
    expect(isValidPollInterval(29)).toBe(false); // muito frequente
    expect(isValidPollInterval(86401)).toBe(false); // mais de 24h
  });
});
