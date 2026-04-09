/**
 * masterDb.ts
 * Gerencia o banco de dados master (fiberdoc_master) que contém
 * a lista de provedores/tenants cadastrados.
 */
import mysql from "mysql2";
import { drizzle } from "drizzle-orm/mysql2";
import { mysqlTable, int, varchar, boolean, timestamp, text } from "drizzle-orm/mysql-core";
import { eq } from "drizzle-orm";
import { parseDatabaseUrl } from "./tenantPool";

// ── Schema do banco master ────────────────────────────────────────────────────

export const tenants = mysqlTable("tenants", {
  id: int("id").primaryKey().autoincrement(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  dbName: varchar("dbName", { length: 128 }).notNull(),
  logoUrl: text("logoUrl"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow(),
});

export type Tenant = typeof tenants.$inferSelect;
export type InsertTenant = typeof tenants.$inferInsert;

// ── Conexão com o banco master ────────────────────────────────────────────────

let _masterPool: mysql.Pool | null = null;
let _masterDb: ReturnType<typeof drizzle> | null = null;

function getMasterDbName(): string {
  const baseUrl = process.env.DATABASE_URL ?? "";
  if (!baseUrl) return "fiberdoc_master";
  const { dbName } = parseDatabaseUrl(baseUrl);
  // O banco master é o banco padrão configurado no DATABASE_URL
  return dbName;
}

export function getMasterDb() {
  if (_masterDb) return _masterDb;

  const baseUrl = process.env.DATABASE_URL ?? "";
  if (!baseUrl) throw new Error("DATABASE_URL não configurada");

  const { user, pass, host, port, dbName } = parseDatabaseUrl(baseUrl);

  _masterPool = mysql.createPool({
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

  _masterPool.on("connection", (conn: any) => {
    conn.on("error", (err: any) => {
      if (
        err.code === "ECONNRESET" ||
        err.code === "PROTOCOL_CONNECTION_LOST" ||
        err.code === "ENOTFOUND"
      ) {
        console.warn("[MasterDB] Conexão perdida:", err.code);
        _masterDb = null;
        _masterPool = null;
      }
    });
  });

  _masterDb = drizzle(_masterPool.promise() as any);
  return _masterDb;
}

// ── Funções de acesso ao banco master ────────────────────────────────────────

export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  try {
    const db = getMasterDb();
    const rows = await db.select().from(tenants).where(eq(tenants.slug, slug));
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function getAllTenants(): Promise<Tenant[]> {
  try {
    const db = getMasterDb();
    return await db.select().from(tenants);
  } catch {
    return [];
  }
}

export async function createTenant(data: InsertTenant): Promise<number> {
  const db = getMasterDb();
  const result = await db.insert(tenants).values(data);
  return (result[0] as any).insertId;
}

export async function updateTenant(id: number, data: Partial<InsertTenant>) {
  const db = getMasterDb();
  await db.update(tenants).set(data).where(eq(tenants.id, id));
}

export async function deleteTenant(id: number) {
  const db = getMasterDb();
  await db.delete(tenants).where(eq(tenants.id, id));
}

/**
 * Inicializa a tabela tenants no banco master se não existir.
 * Chamado na inicialização do servidor.
 */
export async function initMasterDb() {
  try {
    const baseUrl = process.env.DATABASE_URL ?? "";
    if (!baseUrl) return;

    const { user, pass, host, port, dbName } = parseDatabaseUrl(baseUrl);

    // Criar tabela tenants se não existir
    const pool = mysql.createPool({
      host, port, user, password: pass, database: dbName,
      waitForConnections: true, connectionLimit: 2,
    });

    await new Promise<void>((resolve, reject) => {
      pool.query(`
        CREATE TABLE IF NOT EXISTS tenants (
          id INT AUTO_INCREMENT PRIMARY KEY,
          slug VARCHAR(64) NOT NULL UNIQUE,
          name VARCHAR(128) NOT NULL,
          dbName VARCHAR(128) NOT NULL,
          logoUrl TEXT,
          active BOOLEAN NOT NULL DEFAULT TRUE,
          createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        pool.end();
        if (err) reject(err);
        else resolve();
      });
    });

    console.log("[MasterDB] Tabela tenants inicializada.");
  } catch (err) {
    console.warn("[MasterDB] Falha ao inicializar tabela tenants:", err);
  }
}
