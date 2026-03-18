/**
 * tenantContext.ts
 * Usa AsyncLocalStorage para injetar o banco do tenant de forma transparente.
 *
 * Isso permite que todas as funções do db.ts usem automaticamente o banco
 * correto do tenant sem precisar modificar cada função individualmente.
 *
 * Uso:
 *   // No middleware tRPC (antes de chamar o handler):
 *   await runWithTenantDb(tenantDb, async () => {
 *     return next();
 *   });
 *
 *   // No db.ts (getDb):
 *   const tenantDb = getTenantDbFromContext();
 *   if (tenantDb) return tenantDb;
 *   // ... fallback para banco padrão
 */
import { AsyncLocalStorage } from "async_hooks";
import type { drizzle } from "drizzle-orm/mysql2";

type DrizzleDb = ReturnType<typeof drizzle>;

// Storage global para o banco do tenant atual
const tenantDbStorage = new AsyncLocalStorage<DrizzleDb>();

/**
 * Executa uma função no contexto do banco do tenant.
 * Todas as chamadas a getTenantDbFromContext() dentro dessa função
 * retornarão o banco do tenant.
 */
export function runWithTenantDb<T>(
  tenantDb: DrizzleDb,
  fn: () => Promise<T>
): Promise<T> {
  return tenantDbStorage.run(tenantDb, fn);
}

/**
 * Retorna o banco do tenant atual (se estiver em contexto de tenant).
 * Retorna null se não estiver em contexto de tenant.
 */
export function getTenantDbFromContext(): DrizzleDb | null {
  return tenantDbStorage.getStore() ?? null;
}
