/**
 * Cache em memória para respostas do SGP externo.
 * Evita pedidos repetidos ao servidor SGP e reduz o risco de bloqueio por rate-limit.
 * TTL padrão: 5 minutos (300 000 ms).
 */

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
