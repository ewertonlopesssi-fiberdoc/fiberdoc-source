import { describe, it, expect } from "vitest";
import { parseCidr } from "./ipdb";

describe("parseCidr", () => {
  it("parseia corretamente um /24", () => {
    const result = parseCidr("192.168.1.0/24");
    expect(result.networkAddress).toBe("192.168.1.0");
    expect(result.broadcastAddress).toBe("192.168.1.255");
    expect(result.totalHosts).toBe(254);
    expect(result.firstUsable).toBe("192.168.1.1");
    expect(result.lastUsable).toBe("192.168.1.254");
    expect(result.prefixLength).toBe(24);
  });

  it("parseia corretamente um /16", () => {
    const result = parseCidr("10.0.0.0/16");
    expect(result.networkAddress).toBe("10.0.0.0");
    expect(result.broadcastAddress).toBe("10.0.255.255");
    expect(result.totalHosts).toBe(65534);
    expect(result.firstUsable).toBe("10.0.0.1");
    expect(result.lastUsable).toBe("10.0.255.254");
  });

  it("parseia corretamente um /8", () => {
    const result = parseCidr("172.16.0.0/12");
    expect(result.networkAddress).toBe("172.16.0.0");
    expect(result.broadcastAddress).toBe("172.31.255.255");
    expect(result.totalHosts).toBe(1048574);
  });

  it("parseia corretamente um /30 (link ponto-a-ponto)", () => {
    const result = parseCidr("192.168.100.0/30");
    expect(result.networkAddress).toBe("192.168.100.0");
    expect(result.broadcastAddress).toBe("192.168.100.3");
    expect(result.totalHosts).toBe(2);
    expect(result.firstUsable).toBe("192.168.100.1");
    expect(result.lastUsable).toBe("192.168.100.2");
  });

  it("parseia corretamente um /32 (host único)", () => {
    const result = parseCidr("10.0.0.1/32");
    expect(result.networkAddress).toBe("10.0.0.1");
    expect(result.broadcastAddress).toBe("10.0.0.1");
    expect(result.totalHosts).toBe(1);
  });

  it("parseia corretamente um /31 (ponto-a-ponto RFC 3021)", () => {
    const result = parseCidr("192.168.1.0/31");
    expect(result.networkAddress).toBe("192.168.1.0");
    expect(result.broadcastAddress).toBe("192.168.1.1");
    expect(result.totalHosts).toBe(2);
  });

  it("lança erro para prefixo inválido", () => {
    expect(() => parseCidr("192.168.1.0/33")).toThrow("Prefixo inválido");
    expect(() => parseCidr("192.168.1.0/-1")).toThrow("Prefixo inválido");
    expect(() => parseCidr("192.168.1.0/abc")).toThrow("Prefixo inválido");
  });

  it("lança erro para IP inválido", () => {
    expect(() => parseCidr("999.168.1.0/24")).toThrow("IP inválido");
    expect(() => parseCidr("192.168.1/24")).toThrow("IP inválido");
  });

  it("parseia CIDR com host não-zero (normaliza para rede)", () => {
    // 192.168.1.5/24 deve normalizar para rede 192.168.1.0
    const result = parseCidr("192.168.1.5/24");
    expect(result.networkAddress).toBe("192.168.1.0");
    expect(result.broadcastAddress).toBe("192.168.1.255");
    expect(result.totalHosts).toBe(254);
  });
});
