/**
 * Cache em memória para respostas do SGP externo.
 * Evita pedidos repetidos ao servidor SGP e reduz o risco de bloqueio por rate-limit.
 * TTL padrão: 5 minutos (300 000 ms).
 */

/**
 * Faz um pedido HTTP ao SGP com o formato correcto:
 * - Header: Authorization: <token>
 * - Body: multipart/form-data com token e app
 * Suporta GET e POST. Para GET, os campos form são enviados como query params.
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
  const { method = "GET", extraFields = {}, timeoutMs = 15000 } = options;
  const fields: Record<string, string> = { token: cfg.token, app: cfg.app, ...extraFields };

  if (method === "GET") {
    // Para GET: envia campos como query params na URL
    const qs = new URLSearchParams(fields).toString();
    const sep = url.includes("?") ? "&" : "?";
    return fetch(`${url}${sep}${qs}`, {
      method: "GET",
      headers: { Authorization: cfg.token },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } else {
    // Para POST: envia campos como multipart/form-data
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    return fetch(url, {
      method: "POST",
      headers: { Authorization: cfg.token },
      body: form,
      signal: AbortSignal.timeout(timeoutMs),
    });
  }
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
