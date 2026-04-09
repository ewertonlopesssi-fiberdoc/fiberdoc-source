/**
 * tenantPool.ts
 * Gerencia pools de conexão MySQL separados por tenant (provedor).
 * Cada tenant tem seu próprio banco de dados MySQL.
 */
import mysql from "mysql2";
import { drizzle } from "drizzle-orm/mysql2";

type DrizzleDb = ReturnType<typeof drizzle>;

// Pool de conexões por slug do tenant
const tenantPools = new Map<string, mysql.Pool>();
const tenantDbs = new Map<string, DrizzleDb>();

/**
 * Parseia DATABASE_URL e retorna os componentes.
 * Formato: mysql://user:pass@host:port/dbname
 */
export function parseDatabaseUrl(url: string) {
  const clean = url.replace(/^mysql:\/\//, "").replace(/\?.*$/, "");
  const [userPass, hostPortDb] = clean.split("@");
  const [user, pass] = userPass.split(":");
  const [hostPort, dbName] = hostPortDb.split("/");
  const [host, portStr] = hostPort.split(":");
  const port = parseInt(portStr ?? "3306", 10);
  return { user, pass, host, port, dbName };
}

/**
 * Cria ou retorna o pool de conexão para um banco específico.
 */
export function getTenantDb(dbName: string): DrizzleDb {
  if (tenantDbs.has(dbName)) {
    return tenantDbs.get(dbName)!;
  }

  const baseUrl = process.env.DATABASE_URL ?? "";
  if (!baseUrl) throw new Error("DATABASE_URL não configurada");

  const { user, pass, host, port } = parseDatabaseUrl(baseUrl);

  const pool = mysql.createPool({
    host,
    port,
    user,
    password: pass,
    database: dbName,
    waitForConnections: true,
    connectionLimit: 2,
    queueLimit: 50,
    enableKeepAlive: true,
    keepAliveInitialDelay: 60000,
    connectTimeout: 10000,
  });

  pool.on("connection", (conn: any) => {
    conn.on("error", (err: any) => {
      if (
        err.code === "ECONNRESET" ||
        err.code === "PROTOCOL_CONNECTION_LOST" ||
        err.code === "ENOTFOUND"
      ) {
        console.warn(`[TenantPool] Conexão perdida para ${dbName}:`, err.code);
        tenantPools.delete(dbName);
        tenantDbs.delete(dbName);
      }
    });
  });

  const db = drizzle(pool.promise() as any);
  tenantPools.set(dbName, pool);
  tenantDbs.set(dbName, db);
  return db;
}

/**
 * Remove o pool de um tenant (ex: após desativação).
 */
export function removeTenantPool(dbName: string) {
  const pool = tenantPools.get(dbName);
  if (pool) {
    pool.end(() => {});
    tenantPools.delete(dbName);
    tenantDbs.delete(dbName);
  }
}

/**
 * Lista todos os tenants com pool ativo.
 */
export function getActiveTenantPools(): string[] {
  return Array.from(tenantDbs.keys());
}
