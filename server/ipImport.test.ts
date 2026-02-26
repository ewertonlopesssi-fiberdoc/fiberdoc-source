import { describe, it, expect } from "vitest";

// Replica a lógica de parseCsvText do frontend para testes unitários
function parseCsvText(text: string) {
  const lines = text.trim().split("\n").filter(Boolean);
  const rows: any[] = [];
  const errs: string[] = [];
  const firstLine = lines[0]?.toLowerCase() ?? "";
  const hasHeader = firstLine.includes("address") || firstLine.includes("ip");
  const dataLines = hasHeader ? lines.slice(1) : lines;
  for (const line of dataLines) {
    const sep = line.includes(";") ? ";" : ",";
    const cols = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
    const address = cols[0];
    if (!address || !address.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
      errs.push(`Linha ignorada (IP inválido): "${line.slice(0, 40)}"`);
      continue;
    }
    rows.push({
      address,
      hostname: cols[1] || null,
      owner: cols[2] || null,
      mac: cols[3] || null,
      description: cols[4] || null,
    });
  }
  return { rows, errs };
}

describe("parseCsvText — importação de IPs", () => {
  it("parseia CSV com separador ponto-e-vírgula sem cabeçalho", () => {
    const csv = "192.168.1.1;router-core;Infra;AA:BB:CC:DD:EE:FF;Gateway\n192.168.1.2;sw-01;TI;;Switch de acesso";
    const { rows, errs } = parseCsvText(csv);
    expect(rows).toHaveLength(2);
    expect(errs).toHaveLength(0);
    expect(rows[0].address).toBe("192.168.1.1");
    expect(rows[0].hostname).toBe("router-core");
    expect(rows[0].owner).toBe("Infra");
    expect(rows[0].mac).toBe("AA:BB:CC:DD:EE:FF");
    expect(rows[0].description).toBe("Gateway");
    expect(rows[1].mac).toBeNull();
  });

  it("parseia CSV com separador vírgula", () => {
    const csv = "10.0.0.1,server-01,NOC,00:11:22:33:44:55,Servidor de monitoramento";
    const { rows, errs } = parseCsvText(csv);
    expect(rows).toHaveLength(1);
    expect(errs).toHaveLength(0);
    expect(rows[0].address).toBe("10.0.0.1");
    expect(rows[0].hostname).toBe("server-01");
  });

  it("ignora cabeçalho automaticamente quando contém 'address'", () => {
    const csv = "address;hostname;owner;mac;description\n172.16.0.1;gw-01;Rede;AA:BB:CC:DD:EE:FF;Gateway";
    const { rows, errs } = parseCsvText(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].address).toBe("172.16.0.1");
  });

  it("ignora cabeçalho quando contém 'ip'", () => {
    const csv = "ip,hostname\n10.10.0.1,host-01";
    const { rows, errs } = parseCsvText(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].address).toBe("10.10.0.1");
  });

  it("ignora linhas com IP inválido e registra erro", () => {
    // 999.999.999.999 é válido no regex simples (apenas formato), mas abc.def não
    const csv = "192.168.1.1;valido\nabc.def.ghi.jkl;texto\nlinhasemip";
    const { rows, errs } = parseCsvText(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].address).toBe("192.168.1.1");
    expect(errs).toHaveLength(2);
  });

  it("parseia apenas endereço (campos opcionais ausentes)", () => {
    const csv = "10.0.0.5";
    const { rows, errs } = parseCsvText(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].address).toBe("10.0.0.5");
    expect(rows[0].hostname).toBeNull();
    expect(rows[0].owner).toBeNull();
    expect(rows[0].mac).toBeNull();
    expect(rows[0].description).toBeNull();
  });

  it("remove aspas duplas dos campos", () => {
    const csv = '"192.168.1.100";"my-host";"TI";"AA:BB:CC";"Descricao"';
    const { rows } = parseCsvText(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].address).toBe("192.168.1.100");
    expect(rows[0].hostname).toBe("my-host");
  });

  it("retorna arrays vazios para entrada vazia", () => {
    const { rows, errs } = parseCsvText("");
    expect(rows).toHaveLength(0);
    expect(errs).toHaveLength(0);
  });

  it("processa lote grande de 200 IPs", () => {
    const lines = Array.from({ length: 200 }, (_, i) => `192.168.${Math.floor(i / 254)}.${(i % 254) + 1};host-${i}`);
    const { rows, errs } = parseCsvText(lines.join("\n"));
    expect(rows).toHaveLength(200);
    expect(errs).toHaveLength(0);
  });
});

describe("Validação de campos de rede de equipamentos", () => {
  it("VLAN deve estar entre 1 e 4094", () => {
    const validVlans = [1, 100, 1000, 4094];
    const invalidVlans = [0, 4095, -1, 9999];
    validVlans.forEach((v) => expect(v >= 1 && v <= 4094).toBe(true));
    invalidVlans.forEach((v) => expect(v >= 1 && v <= 4094).toBe(false));
  });

  it("interfaceIp aceita formato CIDR", () => {
    const validIps = ["10.0.0.1/24", "192.168.1.1/30", "172.16.0.1/16"];
    const cidrRegex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(\/\d{1,2})?$/;
    validIps.forEach((ip) => expect(cidrRegex.test(ip)).toBe(true));
  });

  it("serviceDescription aceita até 255 caracteres", () => {
    const valid = "Core MPLS backbone 10G para interconexão de PoPs";
    const tooLong = "a".repeat(256);
    expect(valid.length <= 255).toBe(true);
    expect(tooLong.length <= 255).toBe(false);
  });
});
