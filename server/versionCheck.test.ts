/**
 * Testes da comparação de versão entre a aba e o servidor.
 *
 * O que importa aqui não é o caso feliz — é a regra de não incomodar. Um
 * aviso "nova versão disponível" que aparece à toa treina a pessoa a
 * ignorá-lo, e aí ele não serve para nada no dia em que for verdadeiro.
 */
import { describe, expect, it } from "vitest";

import { precisaRecarregar, VERSAO_DESCONHECIDA } from "../shared/versionCheck";

describe("precisaRecarregar", () => {
  it("avisa quando as versões diferem", () => {
    expect(precisaRecarregar("5.96.53", "5.96.55")).toBe(true);
  });

  it("não avisa quando são iguais", () => {
    expect(precisaRecarregar("5.96.55", "5.96.55")).toBe(false);
  });

  it("avisa também quando o servidor voltou para trás", () => {
    // Rollback: o bundle da aba sumiu do servidor do mesmo jeito.
    expect(precisaRecarregar("5.96.55", "5.96.53")).toBe(true);
  });

  it("cala a boca quando algum dos lados é desconhecido", () => {
    expect(precisaRecarregar(VERSAO_DESCONHECIDA, "5.96.55")).toBe(false);
    expect(precisaRecarregar("5.96.55", VERSAO_DESCONHECIDA)).toBe(false);
  });

  it("cala a boca quando falta informação", () => {
    // data ainda não chegou, consulta falhou, build sem carimbo.
    expect(precisaRecarregar(null, "5.96.55")).toBe(false);
    expect(precisaRecarregar("5.96.55", undefined)).toBe(false);
    expect(precisaRecarregar("", "5.96.55")).toBe(false);
    expect(precisaRecarregar("5.96.55", "")).toBe(false);
    expect(precisaRecarregar(undefined, undefined)).toBe(false);
  });

  it("ignora espaço em volta", () => {
    expect(precisaRecarregar(" 5.96.55 ", "5.96.55")).toBe(false);
    expect(precisaRecarregar("  ", "5.96.55")).toBe(false);
  });

  it("não tenta ordenar versões, só compara texto", () => {
    // Nada de semver aqui: qualquer diferença exige recarga, e tentar
    // decidir "mais nova" só criaria um caso a errar.
    expect(precisaRecarregar("5.96.9", "5.96.10")).toBe(true);
  });
});
