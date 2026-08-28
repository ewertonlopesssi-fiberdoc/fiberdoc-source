import { describe, it, expect } from "vitest";
import {
  lerParametros, resolverParametro, PARAMETROS_PADRAO, LIMITES, CHAVE_PARAMETROS,
} from "@shared/optica/parametros";

describe("parâmetros ópticos", () => {
  describe("os valores por omissão são os literais que estavam no código", () => {
    it("0,35 dB/km e 0,1 dB por fusão", () => {
      // Se algum destes mudar, todos os balanços já apresentados mudam de
      // valor sem ninguém ter pedido. Eram estes os literais no db.ts.
      expect(PARAMETROS_PADRAO.atenuacaoDbPorKm).toBe(0.35);
      expect(PARAMETROS_PADRAO.perdaPorFusaoDb).toBe(0.1);
      expect(PARAMETROS_PADRAO.potenciaTxPadraoDbm).toBe(5.0);
    });

    it("sem configuração nenhuma, devolve-os e não se queixa", () => {
      expect(lerParametros(null)).toEqual({ valores: PARAMETROS_PADRAO, avisos: [] });
      expect(lerParametros("   ")).toEqual({ valores: PARAMETROS_PADRAO, avisos: [] });
    });

    it("a chave em app_settings não muda", () => {
      // O migrate-v28 semeia esta chave. Mudá-la aqui e não lá deixa a
      // configuração órfã, e ninguém dá por isso — o código continua a
      // funcionar, com os valores por omissão.
      expect(CHAVE_PARAMETROS).toBe("optica_parametros");
    });
  });

  describe("leitura", () => {
    it("lê os quatro", () => {
      const r = lerParametros(
        '{"atenuacaoDbPorKm":0.28,"perdaPorFusaoDb":0.05,"perdaPorConectorDb":0.25,"potenciaTxPadraoDbm":7}'
      );
      expect(r.valores).toEqual({
        atenuacaoDbPorKm: 0.28, perdaPorFusaoDb: 0.05,
        perdaPorConectorDb: 0.25, potenciaTxPadraoDbm: 7,
      });
      expect(r.avisos).toEqual([]);
    });

    it("o que não vier fica no valor por omissão", () => {
      expect(lerParametros('{"atenuacaoDbPorKm":0.22}').valores)
        .toEqual({ ...PARAMETROS_PADRAO, atenuacaoDbPorKm: 0.22 });
    });
  });

  describe("o erro de digitação que interessa", () => {
    it("35 em vez de 0,35 é recusado, e diz porquê", () => {
      // Um km a 35 dB mata qualquer enlace. É erro de vírgula, não escolha.
      const r = lerParametros('{"atenuacaoDbPorKm":35}');
      expect(r.valores.atenuacaoDbPorKm).toBe(0.35);
      expect(r.avisos).toHaveLength(1);
      expect(r.avisos[0]).toContain("atenuacaoDbPorKm");
    });

    it("vírgula decimal não é JSON — cai no padrão e avisa", () => {
      const r = lerParametros('{"atenuacaoDbPorKm":0,35}');
      expect(r.valores).toEqual(PARAMETROS_PADRAO);
      expect(r.avisos).toHaveLength(1);
    });

    it("um número em texto não passa por número", () => {
      expect(lerParametros('{"perdaPorFusaoDb":"0.1"}').valores.perdaPorFusaoDb).toBe(0.1);
      expect(lerParametros('{"perdaPorFusaoDb":"0.1"}').avisos).toHaveLength(1);
    });

    it("perda negativa é ganho, e não existe fibra que ganhe", () => {
      expect(lerParametros('{"perdaPorFusaoDb":-1}').valores.perdaPorFusaoDb).toBe(0.1);
    });

    it("nunca rebenta, seja o que for que lá esteja", () => {
      for (const lixo of ["{", "[1,2]", "null", "42", '"texto"', "", "{}"]) {
        expect(() => lerParametros(lixo)).not.toThrow();
        expect(lerParametros(lixo).valores.atenuacaoDbPorKm).toBe(0.35);
      }
    });
  });

  describe("os limites aceitam o que é plausível", () => {
    it("as extremidades do intervalo entram", () => {
      const [min, max] = LIMITES.atenuacaoDbPorKm;
      expect(lerParametros(`{"atenuacaoDbPorKm":${min}}`).valores.atenuacaoDbPorKm).toBe(min);
      expect(lerParametros(`{"atenuacaoDbPorKm":${max}}`).valores.atenuacaoDbPorKm).toBe(max);
    });

    it("zero de perda por fusão é legítimo", () => {
      // Quem quiser desligar a contribuição das fusões do cálculo pode.
      expect(lerParametros('{"perdaPorFusaoDb":0}').valores.perdaPorFusaoDb).toBe(0);
    });

    it("potência TX negativa é legítima", () => {
      expect(lerParametros('{"potenciaTxPadraoDbm":-3}').valores.potenciaTxPadraoDbm).toBe(-3);
    });

    it("0,35 dB/km cabe no intervalo da atenuação", () => {
      // Uma faixa que excluísse o próprio valor por omissão seria absurda.
      const [min, max] = LIMITES.atenuacaoDbPorKm;
      expect(PARAMETROS_PADRAO.atenuacaoDbPorKm).toBeGreaterThanOrEqual(min);
      expect(PARAMETROS_PADRAO.atenuacaoDbPorKm).toBeLessThanOrEqual(max);
    });
  });

  describe("resolverParametro — a OLT ganha ao global quando tem valor", () => {
    it("valor da OLT vence", () => {
      expect(resolverParametro(0.35, 0.28, "atenuacaoDbPorKm")).toBe(0.28);
    });

    it("OLT sem valor cai no global", () => {
      expect(resolverParametro(0.35, null, "atenuacaoDbPorKm")).toBe(0.35);
      expect(resolverParametro(0.35, undefined, "atenuacaoDbPorKm")).toBe(0.35);
    });

    it("valor disparatado na OLT também é recusado", () => {
      // A coluna da OLT é editável no ecrã e não tinha validação nenhuma.
      expect(resolverParametro(0.35, 35, "atenuacaoDbPorKm")).toBe(0.35);
      expect(resolverParametro(0.1, -2, "perdaPorFusaoDb")).toBe(0.1);
    });

    it("zero na OLT é um valor, não uma ausência", () => {
      // `?? ` trata 0 como valor, mas um `||` teria-o descartado. É a
      // diferença entre respeitar a escolha de quem desligou as fusões e
      // ignorá-la em silêncio.
      expect(resolverParametro(0.1, 0, "perdaPorFusaoDb")).toBe(0);
    });
  });
});
