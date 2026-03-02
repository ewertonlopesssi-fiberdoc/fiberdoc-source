/**
 * Cache em memória para respostas do SGP externo.
 * Evita pedidos repetidos ao servidor SGP e reduz o risco de bloqueio por rate-limit.
 * TTL padrão: 5 minutos (300 000 ms).
 */

/**
 * Faz um pedido HTTP ao SGP com o formato confirmado pelo suporte:
 * - Header: Authorization: <token>
 * - Body: multipart/form-data com campos token e app (sempre, mesmo em GET via --request GET)
 * O cURL do suporte usa --request GET com --form, o que equivale a POST com body.
 * Por isso todos os pedidos ao SGP usam POST com FormData.
 */
export async function sgpFetch(
  url: string,
  cfg: { token: string; app: string },
  options: {
    method?: "GET" | "POST";
    extraFields?: Record<string, string>;
    timeoutMs?: number;
  } = {},
): Promise<Response> {
  const { extraFields = {}, timeoutMs = 15000 } = options;
  // O SGP usa sempre POST com multipart/form-data (o --request GET do cURL com --form é na prática um POST)
  const form = new FormData();
  form.append("token", cfg.token);
  form.append("app", cfg.app);
  for (const [k, v] of Object.entries(extraFields)) form.append(k, v);
  return fetch(url, {
    method: "POST",
    headers: { Authorization: cfg.token },
    body: form,
    signal: AbortSignal.timeout(timeoutMs),
  });
}

const SGP_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

/**
 * Obtém um valor do cache ou executa o fetcher se expirado/ausente.
 * @param key   Chave única para identificar o recurso (ex: "sgp:ctos")
 * @param fetcher Função assíncrona que faz o pedido real ao SGP
 * @param ttlMs TTL em milissegundos (padrão: 5 minutos)
 */
export async function sgpCacheGet<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = SGP_CACHE_TTL_MS,
): Promise<T> {
  const now = Date.now();
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (entry && entry.expiresAt > now) {
    return entry.data;
  }
  const data = await fetcher();
  cache.set(key, { data, expiresAt: now + ttlMs });
  return data;
}

/**
 * Invalida uma entrada específica do cache (ex: após salvar nova configuração).
 */
export function sgpCacheInvalidate(key: string): void {
  cache.delete(key);
}

/**
 * Invalida todas as entradas do cache SGP.
 * Deve ser chamado quando a configuração SGP é alterada.
 */
export function sgpCacheInvalidateAll(): void {
  for (const key of Array.from(cache.keys())) {
    if (key.startsWith("sgp:")) cache.delete(key);
  }
}
