#!/usr/bin/env node
/**
 * FiberDoc — Teste de fumaça de renderização
 *
 * Por que existe
 *   Todos os bugs de frontend desta semana — um import esquecido numa
 *   extração, uma rota fora da lista de slugs reservados, um tipo que não
 *   batia, dependências de efeito erradas, um campo de formulário não
 *   preenchido em um dos cinco pontos de entrada — passaram pelo `pnpm check`
 *   e pelos testes. Nenhum foi apanhado antes de produção. `tsc` não abre
 *   tela e o Vitest não renderiza; a única coisa que pega esta classe de
 *   defeito é carregar a página de verdade e olhar o console.
 *
 * Como
 *   Fala CDP (Chrome DevTools Protocol) direto com um Chromium headless, por
 *   WebSocket. Sem Playwright, sem Puppeteer, sem dependência nova no
 *   projeto: o Node 22 já traz WebSocket, e o Chromium do sistema serve.
 *   Instalar Playwright num servidor de produção custaria uns 300 MB para
 *   fazer o mesmo que 200 linhas fazem aqui.
 *
 * Uso
 *   node scripts/smoke-test.mjs [URL_BASE]
 *
 *   SMOKE_EMAIL / SMOKE_PASSWORD  credenciais; sem elas só testa rotas públicas
 *   SMOKE_CHROME                  caminho do chromium, se não estiver no PATH
 *   SMOKE_ROTAS                   rotas separadas por vírgula
 *   SMOKE_ESPERA_MS               tempo de acomodação por rota (padrão 3500)
 *
 * Saída
 *   0 se nenhuma rota acusou erro; 1 caso contrário, listando o quê e onde.
 */

import { spawn, spawnSync } from "node:child_process";

const URL_BASE = (process.argv[2] ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
const ESPERA_MS = Number(process.env.SMOKE_ESPERA_MS ?? 3500);
const EMAIL = process.env.SMOKE_EMAIL ?? "";
const SENHA = process.env.SMOKE_PASSWORD ?? "";

/**
 * Rotas reais de App.tsx. Os nomes são no SINGULAR (/cto, /ceo) — a primeira
 * versão desta lista usava o plural, que não é rota, e o resultado foi
 * instrutivo: um primeiro segmento desconhecido é tratado como slug de tenant,
 * as chamadas de API saem prefixadas com ele e a página inteira falha com
 * "Unexpected token '<'". É o mesmo mecanismo do bug do /mapa2, e serve de
 * lembrete de que esta lista tem de acompanhar as rotas.
 */
const ROTAS_PADRAO = ["/login", "/", "/mapa", "/mapa2", "/cto", "/ceo", "/equipamentos"];
const ROTAS = (process.env.SMOKE_ROTAS ?? "").trim()
  ? process.env.SMOKE_ROTAS.split(",").map(r => r.trim()).filter(Boolean)
  : ROTAS_PADRAO;

/**
 * Ruído que não indica defeito. Mantido curto de propósito: cada entrada aqui
 * é um erro que deixamos de ver, e a tentação de calar o console em vez de
 * consertar a causa é exactamente como se chega a uma suíte que ninguém lê.
 */
const RUIDO = [
  /favicon\.ico/i,
  /net::ERR_INTERNET_DISCONNECTED/i,
  /Download the React DevTools/i,
];

const TEXTO_ERRO_BOUNDARY = "Ocorreu um erro inesperado";

/**
 * Interacções guiadas.
 *
 * Carregar a página apanha o que quebra ao montar. A maior parte dos defeitos
 * desta aplicação, porém, só aparece ao mexer: dependências de efeito erradas,
 * handler preso a uma instância antiga, campo de formulário não preenchido.
 * Isto é o começo dessa cobertura.
 *
 * Regra: nada aqui pode ESCREVER. Seleccionar é estado local e não toca no
 * banco; clicar em "Aplicar" tocaria, e por isso não está aqui. Um teste de
 * fumaça que altera dados de produção seria pior do que não ter teste.
 */
const INTERACOES = [
  {
    rota: "/mapa2",
    nome: "clicar num marcador selecciona",
    acao: `(() => {
      const el = document.querySelector(".leaflet-marker-icon");
      if (!el) return "sem-marcador";
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      return "ok";
    })()`,
    esperar: "selecionado",
  },
  {
    rota: "/mapa2",
    nome: "botão direito abre o menu de criação",
    // Abrir o menu não escreve nada — quem escreve é o diálogo que vem
    // depois, e esse não é tocado aqui.
    acao: `(() => {
      const el = document.querySelector(".leaflet-container");
      if (!el) return "sem-mapa";
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true, cancelable: true, view: window,
        clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
      }));
      return "ok";
    })()`,
    // Só aparece para operador/admin. Com um utilizador sem permissão o menu
    // abre apenas com "Copiar coordenadas", e este teste acusaria — de
    // propósito: o smoke deve correr com a conta que a equipa usa de facto.
    esperar: "Criar neste ponto",
  },
  {
    rota: "/mapa2",
    nome: "seletor de projeto abre",
    // Aponta para um data-attribute, não para a estrutura do DOM: mexer no
    // desenho da barra não deve partir o teste sem nada de errado ter
    // acontecido. Abrir a lista não escreve nada.
    acao: `(() => {
      const el = document.querySelector('[data-smoke="seletor-projeto"]');
      if (!el) return "sem-seletor";
      el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, isPrimary: true, button: 0 }));
      el.click();
      return "ok";
    })()`,
    esperar: "Projeto activo",
  },
  {
    rota: "/mapa2",
    nome: "modo cabo entra em traçado",
    // Entrar no modo não desenha nem grava nada; o cabo só existe depois de
    // vértices e de um "Gravar" explícito, e nada disso acontece aqui.
    acao: `(() => {
      const el = document.querySelector('[data-smoke="modo-cabo"]');
      if (!el) return "sem-modo-cabo";
      el.click();
      return "ok";
    })()`,
    esperar: "Clique para traçar o cabo",
  },
  {
    rota: "/mapa2",
    nome: "seleccionar um item oferece Editar",
    // Volta ao modo Selecionar (a interacção anterior deixou o modo cabo
    // activo), clica no primeiro marcador e confirma que o botão aparece.
    // Abrir o diálogo não grava — quem grava é o "Salvar", que não é tocado.
    acao: `(() => {
      const sel = document.querySelector('[data-smoke="modo-selecionar"]');
      if (!sel) return "sem-modo-selecionar";
      sel.click();
      const m = document.querySelector(".leaflet-marker-icon");
      if (!m) return "sem-marcador";
      m.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      return "ok";
    })()`,
    // Expressão, e não texto: "Editar" no corpo inteiro casaria com qualquer
    // outra ocorrência da palavra e daria um falso OK.
    esperar: "js:!!document.querySelector('[data-smoke=btn-editar]')",
  },
];

function eRuido(texto) {
  return RUIDO.some(re => re.test(texto));
}

function acharChromium() {
  if (process.env.SMOKE_CHROME) return process.env.SMOKE_CHROME;
  // chromium-shell primeiro: é o pacote headless, ~500 MB contra os 680 MB do
  // chromium completo, que arrasta GTK, CUPS e configurador de impressora para
  // um servidor que não tem ecrã.
  const candidatos = [
    "chromium-shell",
    "chrome-headless-shell",
    "chromium",
    "chromium-browser",
    "google-chrome",
    "google-chrome-stable",
  ];
  for (const c of candidatos) {
    const r = spawnSync("sh", ["-c", `command -v ${c} || test -x ${c} && echo ${c}`], { encoding: "utf8" });
    const achado = (r.stdout ?? "").trim().split("\n").filter(Boolean).pop();
    if (achado) return achado;
  }
  return null;
}

/** Sobe o Chromium e devolve { proc, wsUrl }. */
function iniciarChromium(caminho) {
  return new Promise((resolve, reject) => {
    const proc = spawn(caminho, [
      "--headless=new",
      "--remote-debugging-port=0",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--window-size=1440,900",
      "about:blank",
    ], { stdio: ["ignore", "pipe", "pipe"] });

    let buffer = "";
    const aoSair = code => reject(new Error(`Chromium saiu antes de abrir o depurador (código ${code}).\n${buffer}`));
    proc.on("exit", aoSair);

    const prazo = setTimeout(() => {
      proc.off("exit", aoSair);
      proc.kill();
      reject(new Error(`Chromium não anunciou o depurador em 20s.\n${buffer}`));
    }, 20000);

    proc.stderr.on("data", pedaco => {
      buffer += pedaco.toString();
      const m = buffer.match(/ws:\/\/[^\s]+/);
      if (m) {
        clearTimeout(prazo);
        proc.off("exit", aoSair);
        resolve({ proc, wsUrl: m[0] });
      }
    });
  });
}

/** Cliente CDP mínimo sobre o WebSocket nativo do Node. */
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pendentes = new Map();
    this.ouvintes = [];
    ws.addEventListener("message", ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id != null && this.pendentes.has(msg.id)) {
        const { resolver, rejeitar } = this.pendentes.get(msg.id);
        this.pendentes.delete(msg.id);
        msg.error ? rejeitar(new Error(msg.error.message)) : resolver(msg.result);
      } else if (msg.method) {
        for (const fn of this.ouvintes) fn(msg.method, msg.params);
      }
    });
  }

  static async conectar(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((ok, erro) => {
      ws.addEventListener("open", ok, { once: true });
      ws.addEventListener("error", () => erro(new Error(`Falha ao conectar em ${wsUrl}`)), { once: true });
    });
    return new Cdp(ws);
  }

  enviar(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((resolver, rejeitar) => {
      this.pendentes.set(id, { resolver, rejeitar });
      this.ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    });
  }

  ao(fn) { this.ouvintes.push(fn); }
  fechar() { try { this.ws.close(); } catch { /* já fechado */ } }
}

function textoDeArgs(params) {
  return (params.args ?? [])
    .map(a => a.value ?? a.description ?? a.unserializableValue ?? "")
    .join(" ");
}

async function main() {
  const chromium = acharChromium();
  if (!chromium) {
    console.error("Chromium não encontrado. Instale com: apt-get install -y chromium");
    console.error("Ou aponte o caminho em SMOKE_CHROME.");
    process.exit(2);
  }

  console.log(`Chromium: ${chromium}`);
  console.log(`Alvo:     ${URL_BASE}`);
  console.log(`Rotas:    ${ROTAS.join(", ")}`);
  console.log(EMAIL ? `Login:    ${EMAIL}` : "Login:    (sem credenciais — só rotas públicas)");
  console.log("");

  const { proc, wsUrl } = await iniciarChromium(chromium);
  const navegador = await Cdp.conectar(wsUrl);

  // Uma aba, uma sessão. Tudo o que segue acontece nela.
  const { targetId } = await navegador.enviar("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await navegador.enviar("Target.attachToTarget", { targetId, flatten: true });

  let coletados = [];
  navegador.ao((method, params) => {
    if (method === "Runtime.exceptionThrown") {
      const d = params.exceptionDetails ?? {};
      const texto = d.exception?.description ?? d.text ?? "exceção sem descrição";
      if (!eRuido(texto)) coletados.push({ tipo: "exceção", texto });
    } else if (method === "Runtime.consoleAPICalled" && params.type === "error") {
      const texto = textoDeArgs(params);
      if (texto && !eRuido(texto)) coletados.push({ tipo: "console.error", texto });
    } else if (method === "Log.entryAdded" && params.entry?.level === "error") {
      const texto = `${params.entry.text ?? ""} ${params.entry.url ?? ""}`.trim();
      if (!eRuido(texto)) coletados.push({ tipo: params.entry.source ?? "log", texto });
    }
  });

  await navegador.enviar("Page.enable", {}, sessionId);
  await navegador.enviar("Runtime.enable", {}, sessionId);
  await navegador.enviar("Log.enable", {}, sessionId);

  const avaliar = async expressao => {
    const r = await navegador.enviar("Runtime.evaluate", {
      expression: expressao, awaitPromise: true, returnByValue: true,
    }, sessionId);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "erro ao avaliar");
    return r.result?.value;
  };

  const irPara = async caminho => {
    coletados = [];
    await navegador.enviar("Page.navigate", { url: `${URL_BASE}${caminho}` }, sessionId);
    await new Promise(r => setTimeout(r, ESPERA_MS));
  };

  const falhas = [];

  // Login por API, não pela tela: seletores de formulário mudam com o
  // desenho, e uma quebra no login estragaria o diagnóstico de todas as
  // outras rotas. O endpoint devolve o cookie de sessão.
  if (EMAIL && SENHA) {
    await irPara("/login");
    const resposta = await avaliar(`
      fetch(${JSON.stringify(`${URL_BASE}/api/local-login`)}, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: ${JSON.stringify(EMAIL)}, password: ${JSON.stringify(SENHA)} }),
      }).then(r => r.status)
    `);
    if (resposta !== 200) {
      console.error(`Login falhou (HTTP ${resposta}). Sem sessão, as rotas internas só redirecionam.`);
      navegador.fechar(); proc.kill();
      process.exit(2);
    }
    console.log("Login OK\n");
  }

  for (const rota of ROTAS) {
    await irPara(rota);

    const corpo = await avaliar("document.body ? document.body.innerText.slice(0, 400) : ''");
    const problemas = [...coletados];
    if ((corpo ?? "").includes(TEXTO_ERRO_BOUNDARY)) {
      problemas.push({ tipo: "ErrorBoundary", texto: corpo.split("\n").slice(0, 4).join(" | ") });
    }
    // Página em branco costuma significar que o React nem montou.
    if (!(corpo ?? "").trim()) {
      problemas.push({ tipo: "página vazia", texto: "document.body sem texto após a espera" });
    }

    // Interacções desta rota, só se o carregamento já estiver limpo: mexer
    // numa tela que já está a estourar só produz ruído em cima de ruído.
    let interagiu = false;
    if (problemas.length === 0) {
      for (const inter of INTERACOES.filter(i => i.rota === rota)) {
        interagiu = true;
        const antes = coletados.length;
        const r = await avaliar(inter.acao);
        // Qualquer "sem-…" significa que o alvo não existe nesta página: não é
        // defeito, é falta de dado ou de elemento para exercitar.
        if (typeof r === "string" && r.startsWith("sem-")) {
          console.log(`  ok    ${rota}  (interacção "${inter.nome}" ignorada: ${r})`);
          continue;
        }
        await new Promise(res => setTimeout(res, 900));
        // innerText devolve o texto COMO RENDERIZADO, e isso inclui
        // text-transform. Um cabeçalho com a classe `uppercase` chega aqui em
        // maiúsculas, e uma comparação sensível a caixa nunca casaria — foi
        // exactamente o que aconteceu com "Criar neste ponto", que o innerText
        // entrega como "CRIAR NESTE PONTO". O textContent não transforma, mas
        // também não respeita elementos escondidos, e um menu fechado passaria
        // por aberto. Fica o innerText, comparado sem caixa.
        const novos = coletados.slice(antes);

        // `esperar` aceita duas formas. Texto simples é procurado no innerText,
        // sem distinguir caixa. Prefixado com "js:", é uma expressão avaliada
        // na página — para quando o texto seria ambíguo demais: procurar a
        // palavra "Editar" no corpo inteiro casaria com qualquer outra coisa
        // escrita "editar" e daria um falso OK.
        let cumpriu;
        if (inter.esperar.startsWith("js:")) {
          cumpriu = Boolean(await avaliar(inter.esperar.slice(3)));
        } else {
          const texto = ((await avaliar("document.body.innerText")) ?? "").toLowerCase();
          cumpriu = texto.includes(inter.esperar.toLowerCase());
        }

        if (novos.length > 0) {
          problemas.push(...novos.map(p => ({ ...p, tipo: `${p.tipo} após "${inter.nome}"` })));
        } else if (!cumpriu) {
          problemas.push({
            tipo: "interacção sem efeito",
            texto: `"${inter.nome}": esperava ${inter.esperar.startsWith("js:") ? "que " + inter.esperar.slice(3) + " fosse verdadeiro" : `ver "${inter.esperar}" na página`} e não foi`,
          });
        } else {
          console.log(`  ok    ${rota}  → ${inter.nome}`);
        }
      }
    }

    if (problemas.length === 0) {
      if (!interagiu) console.log(`  ok    ${rota}`);
    } else {
      console.log(`  FALHA ${rota} — ${problemas.length} problema(s)`);
      for (const p of problemas.slice(0, 6)) {
        console.log(`          [${p.tipo}] ${String(p.texto).replace(/\s+/g, " ").slice(0, 220)}`);
      }
      falhas.push({ rota, problemas });
    }
  }

  navegador.fechar();
  proc.kill();

  console.log("");
  if (falhas.length === 0) {
    console.log(`Nenhum erro em ${ROTAS.length} rota(s).`);
    process.exit(0);
  }
  console.log(`${falhas.length} de ${ROTAS.length} rota(s) com erro: ${falhas.map(f => f.rota).join(", ")}`);
  process.exit(1);
}

main().catch(err => {
  console.error("Teste de fumaça abortou:", err.message);
  process.exit(2);
});
