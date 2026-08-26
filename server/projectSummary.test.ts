/**
 * Testes do resumo de execução por projeto.
 *
 * A conta é aritmética simples, mas as decisões dentro dela são de produto e
 * é nelas que os testes insistem: projeto vazio vale 0 e não 100, tipo sem
 * itens não aparece na contagem, e estado nulo (linha anterior à v22) conta
 * como implantado porque tudo o que já estava cadastrado existe em campo.
 */
import { describe, expect, it } from "vitest";

import { PROJECT_TIPOS, PROJECT_TIPO_LABEL } from "../shared/projectStatus";
import { resumirProjeto, formatarContagem } from "../shared/projectSummary";

describe("resumirProjeto", () => {
  it("soma os cinco tipos num percentual só", () => {
    const r = resumirProjeto({
      cto: { deployed: 8, planned: 4 },
      cabo: { deployed: 2, planned: 3 },
    });
    expect(r.total).toBe(17);
    expect(r.feitos).toBe(10);
    expect(r.percentual).toBe(59);
    expect(r.vazio).toBe(false);
  });

  it("conta certificado como executado, junto com implantado", () => {
    const r = resumirProjeto({ cto: { deployed: 1, certified: 1, planned: 2 } });
    expect(r.feitos).toBe(2);
    expect(r.percentual).toBe(50);
  });

  it("não conta pendente como executado", () => {
    // "Não implantado" é aprovado mas ainda não executado — não entra.
    const r = resumirProjeto({ cto: { pending: 3, deployed: 1 } });
    expect(r.feitos).toBe(1);
    expect(r.percentual).toBe(25);
  });

  it("projeto vazio devolve 0, não 100", () => {
    // 100 diria "concluído"; vazio significa que ainda não começou.
    for (const entrada of [undefined, null, {}, { cto: {} }, { cto: { deployed: 0 } }]) {
      const r = resumirProjeto(entrada as any);
      expect(r.percentual).toBe(0);
      expect(r.total).toBe(0);
      expect(r.vazio).toBe(true);
      expect(r.porTipo).toEqual([]);
    }
  });

  it("omite tipo sem itens em vez de mostrar 0/0", () => {
    const r = resumirProjeto({ cto: { deployed: 2 }, reserva: {}, poste: { deployed: 0 } });
    expect(r.porTipo.map(l => l.tipo)).toEqual(["cto"]);
  });

  it("respeita a ordem de leitura de PROJECT_TIPOS", () => {
    // Entrada fora de ordem de propósito: a saída é que precisa ser estável.
    const r = resumirProjeto({ reserva: { deployed: 1 }, cto: { deployed: 1 }, cabo: { deployed: 1 } });
    expect(r.porTipo.map(l => l.tipo)).toEqual(["cto", "cabo", "reserva"]);
  });

  it("trata estado desconhecido ou nulo como implantado", () => {
    // Linhas anteriores à migração v22 vêm sem projectStatus, e tudo o que já
    // estava cadastrado existe em campo.
    const r = resumirProjeto({ cto: { null: 2, implantado: 1 } } as any);
    expect(r.feitos).toBe(3);
    expect(r.percentual).toBe(100);
  });

  it("ignora contagens inválidas em vez de propagar NaN", () => {
    const r = resumirProjeto({ cto: { deployed: NaN, planned: 2 } });
    expect(r.total).toBe(2);
    expect(r.feitos).toBe(0);
    expect(Number.isFinite(r.percentual)).toBe(true);
    expect(r.percentual).toBe(0);
  });

  it("arredonda o percentual", () => {
    expect(resumirProjeto({ cto: { deployed: 1, planned: 2 } }).percentual).toBe(33);
    expect(resumirProjeto({ cto: { deployed: 2, planned: 1 } }).percentual).toBe(67);
  });

  it("cobre todos os tipos declarados", () => {
    // Se alguém acrescentar um tipo em PROJECT_TIPOS e esquecer o resto, este
    // teste é o primeiro a reclamar.
    const entrada = Object.fromEntries(PROJECT_TIPOS.map(t => [t, { deployed: 1 }]));
    const r = resumirProjeto(entrada as any);
    expect(r.total).toBe(PROJECT_TIPOS.length);
    expect(r.porTipo).toHaveLength(PROJECT_TIPOS.length);
  });
});

describe("formatarContagem", () => {
  it("monta a linha do painel", () => {
    const r = resumirProjeto({ cto: { deployed: 8, planned: 4 }, cabo: { deployed: 2, planned: 3 } });
    expect(formatarContagem(r, PROJECT_TIPO_LABEL)).toBe("8/12 CTOs · 2/5 cabos");
  });

  it("devolve string vazia para projeto sem itens", () => {
    expect(formatarContagem(resumirProjeto({}), PROJECT_TIPO_LABEL)).toBe("");
  });

  it("tem rótulo para todo tipo declarado", () => {
    for (const t of PROJECT_TIPOS) expect(PROJECT_TIPO_LABEL[t]).toBeTruthy();
  });
});
