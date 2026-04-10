import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

/**
 * Detecta o slug do tenant na URL.
 * Exemplo: https://servidor/netfibra/mapa → slug = "netfibra"
 *
 * O middleware do servidor reescreve a URL removendo o slug antes de
 * processar a requisição, então o frontend precisa incluir o slug
 * nas chamadas de API para que o servidor saiba qual tenant usar.
 *
 * Slugs reservados que não são tenants:
 */
const RESERVED_SLUGS = new Set([
  "api", "admin", "static", "public", "assets", "mobile",
  "login", "bem-vindo", "alterar-senha", "relatorio-sala",
  // Rotas internas do sistema que não são slugs de tenant
  "mapa", "equipamentos", "fibras", "portas", "conexoes", "topologia",
  "historico", "salas", "importar", "relatorio-ocupacao", "ceo", "cto",
  "busca-porta", "usuarios", "backup", "sistema", "rede", "ip-doc",
  "fontes-energia", "alertas", "sensores-tuya", "sgp", "ssh-commander",
  "cpe-manager", "monitor-rede", "404",
]);

function detectTenantSlug(): string | null {
  const parts = window.location.pathname.split("/").filter(Boolean);
  const first = parts[0];
  if (!first) return null;
  if (RESERVED_SLUGS.has(first)) return null;
  // Verificar se parece um slug válido
  if (!/^[a-zA-Z0-9-_]+$/.test(first)) return null;
  return first;
}

// O slug do tenant é detectado uma vez no carregamento da página
// O middleware do servidor usa o slug para rotear para o banco correto
const tenantSlug = detectTenantSlug();

// URL base para chamadas tRPC — inclui o slug se estiver em modo tenant
// O servidor irá detectar o slug e rotear para o banco correto
const trpcBaseUrl = tenantSlug
  ? `/${tenantSlug}/api/trpc`
  : "/api/trpc";

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: trpcBaseUrl,
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

// ─── Registro do Service Worker (PWA) ───────────────────────────────────────
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    // Em modo multi-tenant (com slug na URL), desregistrar qualquer SW existente
    // para evitar que ele intercepte requisicoes /api/ com o slug errado
    if (tenantSlug) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((reg) => reg.unregister());
      });
      return;
    }
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        console.log("[PWA] Service Worker registrado:", reg.scope);
        // Verificar atualizações imediatamente e a cada 60 segundos
        reg.update();
        setInterval(() => reg.update(), 60_000);
        // Quando um novo SW é instalado e ativado, recarregar a página
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "activated" && navigator.serviceWorker.controller) {
              console.log("[PWA] Nova versão detectada — recarregando...");
              window.location.reload();
            }
          });
        });
      })
      .catch((err) => console.warn("[PWA] Falha ao registrar Service Worker:", err));
    // Quando o SW envia mensagem de atualização, recarregar
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data && event.data.type === "SW_UPDATED") {
        console.log("[PWA] SW atualizado para v" + event.data.version + " — recarregando...");
        window.location.reload();
      }
    });
    // Quando o SW muda (controllerchange), recarregar
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      console.log("[PWA] Service Worker trocado — recarregando...");
      window.location.reload();
    });
  });
}

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
