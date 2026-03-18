/**
 * tenantProvisioner.ts
 * Provisiona um novo banco de dados para um tenant (provedor).
 * Cria o banco e aplica todas as migrações SQL existentes.
 */
import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";
import { parseDatabaseUrl } from "./tenantPool";

/**
 * Mensagem de ajuda quando o usuário MySQL não tem permissão CREATE DATABASE.
 */
function buildPermissionHelp(user: string, host: string, dbName: string): string {
  return (
    `O usuário MySQL '${user}' não tem permissão para criar bancos de dados. ` +
    `Execute o seguinte comando no MySQL como root para corrigir:\n\n` +
    `GRANT ALL PRIVILEGES ON \`fiberdoc_%\`.* TO '${user}'@'${host}';\n` +
    `FLUSH PRIVILEGES;\n\n` +
    `Ou para conceder permissão apenas para este banco específico:\n\n` +
    `GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO '${user}'@'${host}';\n` +
    `FLUSH PRIVILEGES;`
  );
}

/**
 * Verifica se um erro MySQL é de permissão negada (Access Denied).
 */
function isPermissionError(err: any): boolean {
  return (
    err?.code === "ER_DBACCESS_DENIED_ERROR" ||
    err?.code === "ER_ACCESS_DENIED_ERROR" ||
    (typeof err?.message === "string" && err.message.toLowerCase().includes("access denied"))
  );
}

/**
 * Cria um novo banco de dados para o tenant e aplica as migrações.
 * @param dbName Nome do banco a criar (ex: fiberdoc_netfibra)
 */
export async function provisionTenantDatabase(dbName: string): Promise<{ success: boolean; error?: string; permissionError?: boolean; permissionHelp?: string }> {
  const baseUrl = process.env.DATABASE_URL ?? "";
  if (!baseUrl) return { success: false, error: "DATABASE_URL não configurada" };

  const { user, pass, host, port } = parseDatabaseUrl(baseUrl);

  // Validar nome do banco (apenas letras, números e underscores)
  if (!/^[a-zA-Z0-9_]+$/.test(dbName)) {
    return { success: false, error: "Nome do banco inválido. Use apenas letras, números e underscores." };
  }

  let conn: mysql.Connection | null = null;

  try {
    // Conectar sem selecionar banco (para poder criar)
    conn = await mysql.createConnection({
      host,
      port,
      user,
      password: pass,
      multipleStatements: true,
    });

    // Criar banco se não existir
    try {
      await conn.execute(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      console.log(`[Provisioner] Banco ${dbName} criado.`);
    } catch (createErr: any) {
      if (isPermissionError(createErr)) {
        const help = buildPermissionHelp(user, host, dbName);
        console.error(`[Provisioner] Permissão negada ao criar banco ${dbName}:`, createErr.message);
        return {
          success: false,
          permissionError: true,
          error: `Permissão negada: o usuário MySQL '${user}' não pode criar bancos de dados.`,
          permissionHelp: help,
        };
      }
      throw createErr;
    }

    // Selecionar o banco
    await conn.execute(`USE \`${dbName}\``);

    // Aplicar migrações em ordem
    const migrationsDir = process.env.MIGRATIONS_DIR ?? path.join(process.cwd(), "dist");
    const migrationFiles = [
      // Schema base (todas as tabelas Drizzle consolidadas)
      "schema-base.sql",
      // Migrações incrementais
      "migrate-v7.sql", "migrate-v8.sql", "migrate-v9.sql", "migrate-v10.sql",
      "migrate-v11.sql", "migrate-v11b.sql", "migrate-v12.sql", "migrate-v13.sql",
      "migrate-v14.sql", "migrate-v15.sql", "migrate-v16.sql", "migrate-v17.sql",
      "migrate-v18.sql", "migrate-v19.sql",
    ];

    for (const file of migrationFiles) {
      // Procurar o arquivo em vários locais possíveis
      const candidates = [
        path.join(migrationsDir, file),
        path.join(process.cwd(), file),
        path.join("/opt/fiberdoc", file),
        path.join("/opt/fiberdoc/dist", file),
      ];

      const sqlFile = candidates.find(f => fs.existsSync(f));
      if (!sqlFile) {
        console.log(`[Provisioner] ${file} não encontrado — ignorado.`);
        continue;
      }

      try {
        const sql = fs.readFileSync(sqlFile, "utf-8");
        // Executar cada statement separadamente
        const statements = sql
          .split(";")
          .map(s => s.trim())
          .filter(s => s.length > 0 && !s.startsWith("--"));

        for (const stmt of statements) {
          try {
            await conn.execute(stmt);
          } catch (stmtErr: any) {
            // Ignorar erros de "já existe" (idempotente)
            if (stmtErr.code !== "ER_TABLE_EXISTS_ERROR" &&
                stmtErr.code !== "ER_DUP_FIELDNAME" &&
                stmtErr.code !== "ER_DUP_KEYNAME") {
              console.warn(`[Provisioner] Aviso em ${file}:`, stmtErr.message);
            }
          }
        }
        console.log(`[Provisioner] ${file} aplicado em ${dbName}.`);
      } catch (fileErr) {
        console.warn(`[Provisioner] Erro ao aplicar ${file}:`, fileErr);
      }
    }

    // Criar usuário admin padrão no banco do tenant
    const defaultCredentials = await seedTenantAdmin(conn);

    return { success: true, defaultCredentials };
  } catch (err: any) {
    console.error(`[Provisioner] Erro ao provisionar ${dbName}:`, err);

    if (isPermissionError(err)) {
      const help = buildPermissionHelp(user, host, dbName);
      return {
        success: false,
        permissionError: true,
        error: `Permissão negada: o usuário MySQL '${user}' não pode criar bancos de dados.`,
        permissionHelp: help,
      };
    }

    return { success: false, error: err.message ?? String(err) };
  } finally {
    if (conn) await conn.end();
  }
}

/**
 * Cria o usuário admin padrão no banco do tenant recém-criado.
 * Retorna as credenciais geradas.
 */
async function seedTenantAdmin(conn: mysql.Connection): Promise<{ email: string; password: string } | null> {
  const DEFAULT_EMAIL = "admin@fiberdoc.local";
  const DEFAULT_PASSWORD = "fiberdoc2025";
  const DEFAULT_NAME = "Administrador";
  const openId = `local:${DEFAULT_EMAIL}`;

  try {
    const { hash } = await import("bcryptjs");
    const passwordHash = await hash(DEFAULT_PASSWORD, 12);
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");

    // Verificar se já existe usuário
    const [existing] = await conn.execute(
      `SELECT id FROM users WHERE login_method = 'local' LIMIT 1`
    );
    if ((existing as any[]).length > 0) {
      console.log("[Provisioner] Usuário admin já existe no banco do tenant.");
      return null;
    }

    // Usar camelCase (nomes de coluna do Drizzle/schema-base.sql)
    await conn.execute(
      `INSERT INTO users (openId, name, email, role, loginMethod, passwordHash, mustChangePassword, lastSignedIn)
       VALUES (?, ?, ?, 'admin', 'local', ?, 1, ?)`,
      [openId, DEFAULT_NAME, DEFAULT_EMAIL, passwordHash, now]
    );

    console.log(`[Provisioner] ✅ Usuário admin padrão criado no banco do tenant.`);
    return { email: DEFAULT_EMAIL, password: DEFAULT_PASSWORD };
  } catch (err: any) {
    console.warn("[Provisioner] Não foi possível criar usuário admin:", err.message);
    return null;
  }
}

export async function databaseExists(dbName: string): Promise<boolean> {
  const baseUrl = process.env.DATABASE_URL ?? "";
  if (!baseUrl) return false;

  const { user, pass, host, port } = parseDatabaseUrl(baseUrl);

  let conn: mysql.Connection | null = null;
  try {
    conn = await mysql.createConnection({ host, port, user, password: pass });
    const [rows] = await conn.execute(
      `SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?`,
      [dbName]
    );
    return (rows as any[]).length > 0;
  } catch {
    return false;
  } finally {
    if (conn) await conn.end();
  }
}

/**
 * Extrai o usuário e host do DATABASE_URL para exibir nas mensagens de ajuda.
 */
export function getDatabaseUser(): { user: string; host: string } {
  const baseUrl = process.env.DATABASE_URL ?? "";
  if (!baseUrl) return { user: "fiberdoc", host: "localhost" };
  const { user, host } = parseDatabaseUrl(baseUrl);
  return { user, host };
}
