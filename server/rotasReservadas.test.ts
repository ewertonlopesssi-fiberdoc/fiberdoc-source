/**
 * Guarda contra o bug que quebrou o login quando a rota /mapa2 foi criada.
 *
 * O frontend descobre o tenant pelo primeiro segmento da URL. Se esse segmento
 * não estiver em RESERVED_SLUGS, ele é tratado como nome de provedor e TODAS as
 * chamadas de API passam a sair prefixadas com ele. O sintoma não aponta para a
 * causa: a aplicação responde HTML onde o cliente espera JSON, e o erro que
 * aparece é "Unexpected token '<', "<!doctype "... is not valid JSON" — inclusive
 * no login, deixando a instalação inteira inacessível por aquela URL.
 *
 * Aconteceu com /mapa2 e custou uma sessão de investigação. O teste de fumaça
 * reproduziu o mesmo mecanismo por acidente depois, ao visitar /ctos em vez de
 * /cto. É um erro fácil de repetir e caro de diagnosticar, então fica travado
 * aqui: acrescentar uma rota em App.tsx sem a registar em RESERVED_SLUGS passa a
 * ser um teste vermelho, não um mistério em produção.
 *
 * Ler o App.tsx com expressão regular não é elegante. A alternativa seria uma
 * tabela de rotas partilhada entre o Wouter e a lista de slugs, que é o desenho
 * certo mas mexe no ficheiro mais central da aplicação. Este teste dá a mesma
 * garantia hoje, sem esse risco.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { RESERVED_SLUGS } from "../client/src/const";

// O vitest.config define root como a raiz do repositório.
const APP_TSX = path.join(process.cwd(), "client", "src", "App.tsx");

function primeirosSegmentosDasRotas(): string[] {
  const fonte = readFileSync(APP_TSX, "utf-8");
  const segmentos = new Set<string>();
  for (const m of fonte.matchAll(/path="\/([^"]*)"/g)) {
    const primeiro = m[1].split("/")[0];
    // path="/" é a raiz e não tem segmento; :id e :rest* são parâmetros.
    if (!primeiro || primeiro.startsWith(":")) continue;
    segmentos.add(primeiro);
  }
  return [...segmentos].sort();
}

describe("RESERVED_SLUGS acompanha as rotas de App.tsx", () => {
  it("encontra rotas no App.tsx", () => {
    // Se a forma de declarar rotas mudar, este teste deixa de ver qualquer uma
    // e passaria a aprovar tudo em silêncio. Esta asserção é o alarme disso.
    const segmentos = primeirosSegmentosDasRotas();
    expect(segmentos.length).toBeGreaterThan(20);
    expect(segmentos).toContain("mapa");
  });

  it("tem toda rota de topo registada", () => {
    const faltando = primeirosSegmentosDasRotas().filter(s => !RESERVED_SLUGS.has(s));
    expect(
      faltando,
      `Rotas em App.tsx que faltam em RESERVED_SLUGS (client/src/const.ts): ${faltando.join(", ")}.\n` +
      `Sem elas, abrir essas URLs trata o segmento como slug de tenant e quebra a aplicação inteira.`
    ).toEqual([]);
  });

  it("reserva também os prefixos que o servidor usa", () => {
    // Não são rotas do Wouter, mas colidem do mesmo jeito se alguém as remover.
    for (const s of ["api", "assets", "static", "public"]) {
      expect(RESERVED_SLUGS.has(s), `"${s}" precisa continuar reservado`).toBe(true);
    }
  });
});
