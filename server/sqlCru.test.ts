import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  lerDivergencias, extrairConsultas, aliasesDeTabelas, analisarFonte,
} from "./lib/sqlCru";

// A partir da pasta deste ficheiro, não do cwd: assim o teste corre igual
// venha de onde vier o vitest.
const RAIZ = resolve(import.meta.dirname, "..");

/**
 * Um esquema de mentira com os três casos que interessam: uma tabela que
 * diverge, uma que não, e outra que diverge no mesmo nome de propriedade.
 */
const ESQUEMA = `
export const dgoSlotCableLinks = mysqlTable("dgo_slot_cable_links", {
  id: int("id").autoincrement().primaryKey(),
  side: mysqlEnum("dgo_link_side", ["in", "out"]).notNull(),
  routeId: int("routeId").notNull(),
});
export const equipments = mysqlTable("equipments", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 64 }),
  type: varchar("type", { length: 32 }),
});
export const ports = mysqlTable("ports", {
  id: int("id").autoincrement().primaryKey(),
  type: mysqlEnum("port_type", ["sc","lc"]).notNull(),
});
`;
const D = lerDivergencias(ESQUEMA);

describe("SQL escrito à mão contra o modelo", () => {
  describe("lerDivergencias", () => {
    it("acha a propriedade cujo nome não é o da coluna", () => {
      // `side: mysqlEnum("dgo_link_side", ...)` — no Drizzle o primeiro
      // argumento É o nome da coluna.
      expect(D.get("dgo_slot_cable_links")?.get("side")).toBe("dgo_link_side");
      expect(D.get("ports")?.get("type")).toBe("port_type");
    });

    it("ignora as tabelas onde os dois nomes coincidem", () => {
      expect(D.get("equipments")).toBeUndefined();
    });
  });

  describe("o defeito de 28/08/2026", () => {
    it("apanha `dscl.side`", () => {
      // As duas consultas que faziam isto rebentavam em todos os tenants desde
      // sempre, e nem o `pnpm check` nem o `conferir-schema.mjs` as viam: o
      // modelo e o banco concordavam um com o outro.
      const fonte = "const x = `SELECT dscl.routeId, dscl.side FROM dgo_slot_cable_links dscl WHERE dscl.side = 'out'`;";
      const achados = analisarFonte(fonte, D);
      expect(achados).toHaveLength(2);
      expect(achados[0].coluna).toBe("dgo_link_side");
    });

    it("a correcção não é acusada", () => {
      // `dscl.dgo_link_side AS side` é a forma certa: a coluna real, com o
      // rótulo que o JavaScript espera. Acusá-la seria acusar o remédio.
      const fonte = "const w = `SELECT dscl.dgo_link_side AS side FROM dgo_slot_cable_links dscl WHERE dscl.dgo_link_side = 'out'`;";
      expect(analisarFonte(fonte, D)).toHaveLength(0);
    });
  });

  describe("saber de que tabela é cada referência", () => {
    it("`eq.type` não é acusado quando `eq` é equipments", () => {
      // O falso positivo da primeira versão: `ports` está na consulta e tem
      // `type` divergente, mas a referência é ao equipamento, que não diverge.
      const fonte = "const y = `SELECT eq.type, eq.name FROM ports p LEFT JOIN equipments eq ON eq.id = p.equipmentId`;";
      expect(analisarFonte(fonte, D)).toHaveLength(0);
    });

    it("`p.type` é acusado na mesma consulta", () => {
      const fonte = "const z = `SELECT p.type FROM ports p LEFT JOIN equipments eq ON eq.id = p.equipmentId`;";
      expect(analisarFonte(fonte, D)).toHaveLength(1);
    });

    it("resolve alias com e sem AS", () => {
      expect(Array.from(aliasesDeTabelas("FROM a x JOIN b AS y ON 1=1").entries()).sort())
        .toEqual([["a", "a"], ["b", "b"], ["x", "a"], ["y", "b"]]);
    });

    it("uma tabela sem alias continua a servir de prefixo", () => {
      expect(Array.from(aliasesDeTabelas("FROM tabela WHERE 1=1").entries())).toEqual([["tabela", "tabela"]]);
    });
  });

  describe("referência sem prefixo", () => {
    it("é acusada quando a consulta tem uma tabela só", () => {
      expect(analisarFonte("const q = `SELECT id, side FROM dgo_slot_cable_links`;", D)).toHaveLength(1);
    });

    it("não é acusada quando a coluna certa está lá", () => {
      expect(analisarFonte("const q = `SELECT id, dgo_link_side FROM dgo_slot_cable_links`;", D)).toHaveLength(0);
    });
  });

  it("um template literal que não é SQL passa ao lado", () => {
    expect(analisarFonte("const s = `olá ${nome}, tudo bem?`;", D)).toHaveLength(0);
    expect(extrairConsultas("`SELECT 1` `nada` `DELETE FROM t`")).toHaveLength(2);
  });

  describe("o repositório a sério", () => {
    const raizes = ["server", "shared"];
    const ficheiros: string[] = [];
    const andar = (dir: string) => {
      for (const e of readdirSync(dir)) {
        const p = join(dir, e);
        if (statSync(p).isDirectory()) { if (e !== "node_modules") andar(p); }
        else if (p.endsWith(".ts") && !p.endsWith(".test.ts")) ficheiros.push(p);
      }
    };
    for (const r of raizes) { try { andar(resolve(RAIZ, r)); } catch { /* pasta ausente */ } }

    it("há mesmo divergências para procurar", () => {
      // Se isto der zero, o analisador deixou de ler o schema e o teste de
      // baixo passaria por vazio em vez de por limpo.
      const divs = lerDivergencias(readFileSync(resolve(RAIZ, "drizzle/schema.ts"), "utf8"));
      expect(divs.size).toBeGreaterThan(10);
    });

    it("encontra ficheiros para analisar", () => {
      expect(ficheiros.length).toBeGreaterThan(10);
    });

    it("nenhum SQL escrito à mão usa o nome da propriedade em vez do da coluna", () => {
      const divs = lerDivergencias(readFileSync(resolve(RAIZ, "drizzle/schema.ts"), "utf8"));
      const achados = ficheiros.flatMap(f =>
        analisarFonte(readFileSync(f, "utf8"), divs).map(a => `${f.slice(RAIZ.length + 1)}:${a.linha}  ${a.trecho} → ${a.tabela}.${a.coluna}`)
      );
      expect(achados).toEqual([]);
    });
  });
});
