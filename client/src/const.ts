export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

/**
 * Slugs reservados: primeiros segmentos de URL que são rotas do sistema, e não
 * nomes de tenant.
 *
 * TODA rota de topo registrada em App.tsx precisa estar aqui. Esquecer uma faz
 * o getTenantSlug() tratá-la como tenant e prefixar todas as chamadas de API
 * com ela — o que quebra a aplicação inteira para quem abrir aquela URL,
 * inclusive o login, e sem nenhuma mensagem que aponte para a causa.
 *
 * Esta é a única definição: main.tsx importa daqui. Antes havia uma segunda
 * cópia lá, com um comentário pedindo que fossem mantidas iguais à mão.
 */
export const RESERVED_SLUGS = new Set([
  "api", "admin", "static", "public", "assets", "mobile",
  "login", "bem-vindo", "alterar-senha", "relatorio-sala",
  // Rotas internas do sistema que não são slugs de tenant
  "mapa", "equipamentos", "fibras", "portas", "conexoes", "topologia",
  "historico", "salas", "importar", "relatorio-ocupacao", "ceo", "cto",
  "busca-porta", "usuarios", "backup", "sistema", "rede", "ip-doc",
  "fontes-energia", "alertas", "sensores-tuya", "sgp", "ssh-commander",
  "cpe-manager", "monitor-rede", "404", "mapa2", "diagrama",
]);

/**
 * Detecta o slug do tenant na URL atual.
 * Exemplo: /netfibra/mapa → "netfibra"
 */
export function getTenantSlug(): string | null {
  const parts = window.location.pathname.split("/").filter(Boolean);
  const first = parts[0];
  if (!first) return null;
  if (RESERVED_SLUGS.has(first)) return null;
  if (!/^[a-zA-Z0-9-_]+$/.test(first)) return null;
  return first;
}

// Generate login URL at runtime so redirect URI reflects the current origin.
export const getLoginUrl = () => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const slug = getTenantSlug();

  // When running in standalone/local mode (no OAuth configured), redirect to local login page
  if (!oauthPortalUrl) {
    // Preservar o slug do tenant na URL de login
    return slug ? `/${slug}/login` : "/login";
  }

  const appId = import.meta.env.VITE_APP_ID;
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  try {
    const url = new URL(`${oauthPortalUrl}/app-auth`);
    url.searchParams.set("appId", appId);
    url.searchParams.set("redirectUri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("type", "signIn");
    return url.toString();
  } catch {
    return slug ? `/${slug}/login` : "/login";
  }
};
