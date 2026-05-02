/**
 * tenantContext.ts
 * Usa AsyncLocalStorage para injetar o banco do tenant de forma transparente.
 *
 * Isso permite que todas as funções do db.ts usem automaticamente o banco
 * correto do tenant sem precisar modificar cada função individualmente.
 *
 * Uso:
 *   // No middleware tRPC (antes de chamar o handler):
 *   await runWithTenantDb(tenantDb, tenantDbName, async () => {
 *     return next();
 *   });
 *
 *   // No db.ts (getDb):
 *   const tenantDb = getTenantDbFromContext();
 *   if (tenantDb) return tenantDb;
 *   // ... fallback para banco padrão
 *
 *   // Para SQL raw com NULL (createMapRoute, updateMapRoute):
 *   const dbName = getTenantDbNameFromContext();
 *   if (dbName) { ... usar getTenantRawPool(dbName) ... }
 */
import { AsyncLocalStorage } from "async_hooks";
import type { drizzle } from "drizzle-orm/mysql2";

type DrizzleDb = ReturnType<typeof drizzle>;

// Storage global para o banco do tenant atual
const tenantDbStorage = new AsyncLocalStorage<DrizzleDb>();

// Storage global para o dbName do tenant atual (para SQL raw)
const tenantDbNameStorage = new AsyncLocalStorage<string>();

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
 * Executa uma função no contexto do banco do tenant (com dbName para SQL raw).
 * Todas as chamadas a getTenantDbFromContext() e getTenantDbNameFromContext()
 * dentro dessa função retornarão os valores do tenant.
 */
export function runWithTenantDbAndName<T>(
  tenantDb: DrizzleDb,
  dbName: string,
  fn: () => Promise<T>
): Promise<T> {
  return tenantDbStorage.run(tenantDb, () =>
    tenantDbNameStorage.run(dbName, fn)
  );
}

/**
 * Retorna o banco do tenant atual (se estiver em contexto de tenant).
 * Retorna null se não estiver em contexto de tenant.
 */
export function getTenantDbFromContext(): DrizzleDb | null {
  return tenantDbStorage.getStore() ?? null;
}

/**
 * Retorna o dbName do tenant atual (se estiver em contexto de tenant).
 * Retorna null se não estiver em contexto de tenant.
 * Usado para obter o pool raw do tenant para SQL com NULL.
 */
export function getTenantDbNameFromContext(): string | null {
  return tenantDbNameStorage.getStore() ?? null;
}
