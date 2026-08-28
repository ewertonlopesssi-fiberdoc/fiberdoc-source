import { describe, it, expect } from "vitest";
import {
  metrosEntre, metrosDoTracado, lerTracado, metrosDoCabo, formatarMetros,
} from "@shared/optica/comprimento";

describe("comprimento óptico", () => {
  describe("metrosEntre", () => {
    it("dá zero para o mesmo ponto", () => {
      expect(metrosEntre({ lat: -8.88, lng: -36.49 }, { lat: -8.88, lng: -36.49 })).toBe(0);
    });

    it("bate com a referência de um grau de latitude", () => {
      // Um grau de latitude ≈ 111,19 km com R = 6371 km. Tolerância de 100 m
      // porque o que se testa é a fórmula, não o modelo da Terra.
      const d = metrosEntre({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
      expect(d).toBeGreaterThan(111_100);
      expect(d).toBeLessThan(111_300);
    });

    it("é idêntico à implementação que substitui", () => {
      // A prova de que este refactor não muda nenhum número em produção.
      // Cópia literal do haversineKm que estava em quatro sítios do db.ts.
      const antigoKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
        const R = 6371;
        const dLat = ((b.lat - a.lat) * Math.PI) / 180;
        const dLng = ((b.lng - a.lng) * Math.PI) / 180;
        const s = Math.sin(dLat / 2) ** 2
          + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180)
          * Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
      };
      // Semente fixa: um teste que falha uma vez em cada cem execuções não é
      // um teste, é ruído.
      let semente = 20260828;
      const aleatorio = () => {
        semente = (semente * 1103515245 + 12345) % 2147483648;
        return semente / 2147483648;
      };
      let maiorDiferencaKm = 0;
      for (let i = 0; i < 500; i++) {
        const p1 = { lat: -30 + aleatorio() * 60, lng: -70 + aleatorio() * 60 };
        const p2 = { lat: -30 + aleatorio() * 60, lng: -70 + aleatorio() * 60 };
        maiorDiferencaKm = Math.max(
          maiorDiferencaKm,
          Math.abs(metrosEntre(p1, p2) / 1000 - antigoKm(p1, p2)),
        );
      }
      // 1e-9 km = 1 micrómetro. Acima disto já não é ruído de vírgula flutuante.
      expect(maiorDiferencaKm).toBeLessThan(1e-9);
    });

    it("é simétrico", () => {
      const a = { lat: -8.8837, lng: -36.4936 };
      const b = { lat: -8.8901, lng: -36.4812 };
      expect(metrosEntre(a, b)).toBeCloseTo(metrosEntre(b, a), 9);
    });
  });

  describe("metrosDoTracado", () => {
    it("um ponto ou nenhum dá zero", () => {
      expect(metrosDoTracado([])).toBe(0);
      expect(metrosDoTracado([{ lat: 1, lng: 1 }])).toBe(0);
    });

    it("soma os trechos, e não a recta entre as pontas", () => {
      // Um L: 1 grau para norte, depois 1 grau para leste. O caminho é maior
      // que a diagonal — é a razão de o §38 proibir distância em linha recta.
      const emL = metrosDoTracado([
        { lat: 0, lng: 0 }, { lat: 1, lng: 0 }, { lat: 1, lng: 1 },
      ]);
      const diagonal = metrosEntre({ lat: 0, lng: 0 }, { lat: 1, lng: 1 });
      expect(emL).toBeGreaterThan(diagonal);
    });
  });

  describe("lerTracado", () => {
    it("lê o formato que está no banco", () => {
      const r = lerTracado('[{"lat":-8.88,"lng":-36.49},{"lat":-8.89,"lng":-36.48}]');
      expect(r).toHaveLength(2);
      expect(r[0].lat).toBeCloseTo(-8.88);
    });

    it("nunca lança com lixo — devolve vazio", () => {
      expect(lerTracado(null)).toEqual([]);
      expect(lerTracado("")).toEqual([]);
      expect(lerTracado("nao é json")).toEqual([]);
      expect(lerTracado('{"lat":1}')).toEqual([]);   // objecto, não lista
      expect(lerTracado("[1,2,3]")).toEqual([]);     // lista sem pontos
    });

    it("descarta ponto com coordenada que não é número", () => {
      // Hoje isto vira NaN, propaga-se pela soma e chega ao ecrã como "NaN dBm".
      const r = lerTracado('[{"lat":-8.88,"lng":-36.49},{"lat":"abc","lng":null},{"lat":-8.89,"lng":-36.48}]');
      expect(r).toHaveLength(2);
      expect(Number.isFinite(metrosDoTracado(r))).toBe(true);
    });

    it("descarta coordenada fora do planeta", () => {
      const r = lerTracado('[{"lat":-8.88,"lng":-36.49},{"lat":999,"lng":-36.48}]');
      expect(r).toHaveLength(1);
    });
  });

  describe("metrosDoCabo — a proveniência importa", () => {
    const A = { lat: -8.88, lng: -36.49 };
    const B = { lat: -8.89, lng: -36.48 };

    it("usa o traçado quando existe", () => {
      const r = metrosDoCabo({ path: JSON.stringify([A, B]) });
      expect(r.origem).toBe("tracado");
      expect(r.metros).toBeGreaterThan(0);
    });

    it("cai para a recta quando não há traçado, e diz que caiu", () => {
      const r = metrosDoCabo({ path: null, pontaA: A, pontaB: B });
      expect(r.origem).toBe("reta");
      // É exactamente o mesmo número que o balanço dá hoje em silêncio.
      expect(r.metros).toBeCloseTo(metrosEntre(A, B), 6);
    });

    it("sem traçado e sem pontas devolve zero, marcado", () => {
      const r = metrosDoCabo({ path: null });
      expect(r).toEqual({ metros: 0, origem: "sem-dados" });
    });

    it("o comprimento medido em campo ganha ao traçado", () => {
      const r = metrosDoCabo({ path: JSON.stringify([A, B]), metrosMedidos: 1234 });
      expect(r.origem).toBe("medido");
      expect(r.metros).toBe(1234);
    });

    it("medido igual a zero ou negativo não conta — é ausência, não medição", () => {
      const r = metrosDoCabo({ path: JSON.stringify([A, B]), metrosMedidos: 0 });
      expect(r.origem).toBe("tracado");
    });

    it("a reserva técnica soma em qualquer das origens", () => {
      const semReserva = metrosDoCabo({ path: JSON.stringify([A, B]) }).metros;
      const comReserva = metrosDoCabo({ path: JSON.stringify([A, B]), metrosDeReserva: 25 }).metros;
      expect(comReserva - semReserva).toBeCloseTo(25, 6);

      // Também no caso medido, que é onde seria mais fácil esquecer.
      expect(metrosDoCabo({ metrosMedidos: 100, metrosDeReserva: 25 }).metros).toBe(125);
    });

    it("traçado com um único ponto conta como ausente", () => {
      const r = metrosDoCabo({ path: JSON.stringify([A]), pontaA: A, pontaB: B });
      expect(r.origem).toBe("reta");
    });
  });

  describe("formatarMetros", () => {
    it("troca para km acima de mil", () => {
      expect(formatarMetros(999)).toBe("999 m");
      expect(formatarMetros(1000)).toBe("1.00 km");
      expect(formatarMetros(2430)).toBe("2.43 km");
    });

    it("não escreve NaN no ecrã", () => {
      expect(formatarMetros(NaN)).toBe("—");
      expect(formatarMetros(Infinity)).toBe("—");
    });
  });
});
