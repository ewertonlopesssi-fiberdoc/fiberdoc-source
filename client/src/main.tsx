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

// ─── Service Worker: desregistrar SEMPRE (PWA desativado) ───────────────────
// O Service Worker causava interferência com o fetch de /api/local-auth-enabled
// em modo multi-tenant, exibindo "Entrar com Manus" em vez do login local.
// O PWA foi desativado permanentemente. O sw.js no servidor também se
// auto-desregistra para limpar caches de browsers que ainda têm o SW antigo.
if ("serviceWorker" in navigator) {
  // Desregistrar IMEDIATAMENTE (não esperar pelo evento load)
  // para garantir que o SW não intercepte nenhuma requisição nesta sessão
  navigator.serviceWorker.getRegistrations().then((regs) => {
    if (regs.length > 0) {
      console.log(`[PWA] Desregistrando ${regs.length} Service Worker(s) antigo(s)...`);
      regs.forEach((reg) => reg.unregister());
    }
  });
}

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
