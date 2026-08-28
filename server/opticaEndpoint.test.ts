import { describe, it, expect } from "vitest";
import {
  chaveEndpoint, lerChaveEndpoint, mesmoEndpoint, chaveLigacao,
  familiaDoEndpoint, podeLigar, TIPOS_ENDPOINT,
} from "@shared/optica/endpoint";

describe("OpticalEndpoint", () => {
  it("o id sozinho não é identidade — o par (tipo, id) é", () => {
    // Quatro tabelas, quatro espaços de ids. O id 7 existe quatro vezes.
    const chaves = TIPOS_ENDPOINT.map(tipo => chaveEndpoint({ tipo, id: 7 }));
    expect(new Set(chaves).size).toBe(TIPOS_ENDPOINT.length);
  });

  it("a chave vai e volta", () => {
    for (const tipo of TIPOS_ENDPOINT) {
      const e = { tipo, id: 4242 };
      expect(lerChaveEndpoint(chaveEndpoint(e))).toEqual(e);
    }
  });

  it("recusa chave inválida em vez de lançar", () => {
    // Estas chaves vêm de atributos do DOM e da rede. Confiar nelas é um erro.
    expect(lerChaveEndpoint("")).toBeNull();
    expect(lerChaveEndpoint("ceoVia")).toBeNull();
    expect(lerChaveEndpoint(":12")).toBeNull();
    expect(lerChaveEndpoint("inventado:12")).toBeNull();
    expect(lerChaveEndpoint("ceoVia:abc")).toBeNull();
    expect(lerChaveEndpoint("ceoVia:0")).toBeNull();
    expect(lerChaveEndpoint("ceoVia:-3")).toBeNull();
    expect(lerChaveEndpoint("ceoVia:1.5")).toBeNull();
  });

  it("mesmoEndpoint distingue o tipo", () => {
    expect(mesmoEndpoint({ tipo: "ceoVia", id: 1 }, { tipo: "ceoVia", id: 1 })).toBe(true);
    expect(mesmoEndpoint({ tipo: "ceoVia", id: 1 }, { tipo: "ctoVia", id: 1 })).toBe(false);
  });

  describe("chaveLigacao", () => {
    it("A—B e B—A são a mesma ligação", () => {
      const a = { tipo: "ceoVia" as const, id: 10 };
      const b = { tipo: "ceoVia" as const, id: 20 };
      expect(chaveLigacao(a, b)).toBe(chaveLigacao(b, a));
    });

    it("ligações diferentes dão chaves diferentes", () => {
      const a = { tipo: "ceoVia" as const, id: 10 };
      const b = { tipo: "ceoVia" as const, id: 20 };
      const c = { tipo: "ceoSplitterVia" as const, id: 20 };
      expect(chaveLigacao(a, b)).not.toBe(chaveLigacao(a, c));
    });

    it("não confunde via 1—via 20 com via 12—via 0", () => {
      // Sem o separador, "1"+"20" e "12"+"0" colidiriam.
      const x = chaveLigacao({ tipo: "ceoVia", id: 1 }, { tipo: "ceoVia", id: 20 });
      const y = chaveLigacao({ tipo: "ceoVia", id: 12 }, { tipo: "ceoVia", id: 100 });
      expect(x).not.toBe(y);
    });
  });

  describe("familia e podeLigar", () => {
    it("agrupa por onde o endpoint vive", () => {
      expect(familiaDoEndpoint("ceoVia")).toBe("ceo");
      expect(familiaDoEndpoint("ceoSplitterVia")).toBe("ceo");
      expect(familiaDoEndpoint("ctoVia")).toBe("cto");
      expect(familiaDoEndpoint("port")).toBe("equipamento");
    });

    it("tubo de CEO liga a splitter de CEO", () => {
      expect(podeLigar({ tipo: "ceoVia", id: 1 }, { tipo: "ceoSplitterVia", id: 1 })).toBe(true);
    });

    it("fibra de CEO não funde com fibra de CTO — o que as liga é um cabo", () => {
      expect(podeLigar({ tipo: "ceoVia", id: 1 }, { tipo: "ctoVia", id: 2 })).toBe(false);
    });

    it("nada liga a si próprio", () => {
      expect(podeLigar({ tipo: "ceoVia", id: 1 }, { tipo: "ceoVia", id: 1 })).toBe(false);
    });

    it("duas vias do mesmo CEO podem ligar", () => {
      expect(podeLigar({ tipo: "ceoVia", id: 1 }, { tipo: "ceoVia", id: 2 })).toBe(true);
    });
  });
});
