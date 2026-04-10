/**
 * localAuth.ts — Login local por email/senha para instalações sem OAuth
 * Usado quando OAUTH_SERVER_URL não está configurado.
 *
 * Fluxo:
 *  1. Na inicialização, seedDefaultAdmin() cria automaticamente admin@fiberdoc.local / fiberdoc2025
 *     com mustChangePassword=true.
 *  2. O operador acessa o sistema com as credenciais padrão.
 *  3. Após o login, o sistema detecta mustChangePassword=true e redireciona para /alterar-senha.
 *  4. O operador define uma nova senha e o flag é removido.
 */
import type { Express, Request } from "express";
import { compare, hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import { getUserByEmail, upsertUser, getDb } from "./db";
import { runWithTenantDb } from "./_core/tenantContext";
import { users } from "../drizzle/schema";

/** Retorna o banco correto: tenant se disponível, senão padrão */
async function getDbForRequest(req: Request) {
  const tenantDb = (req as any).tenantDb;
  if (tenantDb) return tenantDb;
  return getDb();
}

export function registerLocalAuthRoutes(app: Express) {
  // POST /api/local-login — autentica por email+senha e define cookie de sessão
  app.post("/api/local-login", async (req, res) => {
    try {
      const { email, password } = req.body as { email?: string; password?: string };
      if (!email || !password) {
        return res.status(400).json({ error: "Email e senha são obrigatórios" });
      }

      const tenantDb = (req as any).tenantDb;

      const tenantSlug = (req as any).tenantSlug ?? "(sem tenant)";

      // Usar banco do tenant se disponível
      const doLogin = async () => {
        // 1. Buscar usuário
        let user: any;
        try {
          user = await getUserByEmail(email.trim().toLowerCase());
        } catch (dbErr: any) {
          console.error(`[local-login][${tenantSlug}] Erro ao buscar usuário:`, dbErr?.message ?? dbErr);
          return res.status(500).json({ error: "Erro ao acessar o banco de dados" });
        }

        // Auto-seed: se o banco do tenant não tem usuários, criar o admin padrão
        if (!user && tenantDb) {
          console.warn(`[local-login][${tenantSlug}] Nenhum usuário encontrado. Tentando criar admin padrão...`);
          try {
            const { hash } = await import("bcryptjs");
            const { getDb } = await import("./db");
            const { users: usersTable } = await import("../drizzle/schema");
            const db = await getDb();
            if (db) {
              const passwordHash = await hash("fiberdoc2025", 12);
              const openId = "local:admin@fiberdoc.local";
              await db.insert(usersTable).values({
                openId,
                name: "Administrador",
                email: "admin@fiberdoc.local",
                role: "admin",
                loginMethod: "local",
                passwordHash,
                mustChangePassword: true,
                lastSignedIn: new Date(),
              } as any).onDuplicateKeyUpdate({ set: { lastSignedIn: new Date() } });
              user = await getUserByEmail(email.trim().toLowerCase());
              console.log(`[local-login][${tenantSlug}] Admin padrão criado com sucesso.`);
            }
          } catch (seedErr: any) {
            console.error(`[local-login][${tenantSlug}] Falha ao criar admin padrão:`, seedErr?.message);
          }
        }

        if (!user || !user.passwordHash) {
          console.warn(`[local-login][${tenantSlug}] Usuário não encontrado ou sem senha: ${email}`);
          return res.status(401).json({ error: "Usuário ou senha inválidos" });
        }

        // 2. Verificar senha
        const valid = await compare(password, user.passwordHash);
        if (!valid) {
          return res.status(401).json({ error: "Usuário ou senha inválidos" });
        }

        // 3. Gerar token de sessão
        let sessionToken: string;
        try {
          sessionToken = await sdk.signSession(
            { openId: user.openId, appId: "local", name: user.name || user.email || "usuario" },
            { expiresInMs: ONE_YEAR_MS }
          );
        } catch (jwtErr: any) {
          console.error(`[local-login][${tenantSlug}] Erro ao gerar token JWT:`, jwtErr?.message ?? jwtErr);
          return res.status(500).json({ error: "Erro ao gerar sessão" });
        }

        // 4. Atualizar lastSignedIn (não crítico — não bloquear login se falhar)
        try {
          await upsertUser({ openId: user.openId, lastSignedIn: new Date() });
        } catch (upsertErr: any) {
          console.warn(`[local-login][${tenantSlug}] Aviso: não foi possível atualizar lastSignedIn:`, upsertErr?.message);
        }

        const cookieOptions = getSessionCookieOptions(req);
        res.cookie(COOKIE_NAME, sessionToken, {
          ...cookieOptions,
          maxAge: ONE_YEAR_MS,
        });

        return res.json({
          ok: true,
          mustChangePassword: user.mustChangePassword === true || user.mustChangePassword === 1,
          user: { id: user.id, name: user.name, email: user.email, role: user.role },
        });
      };

      if (tenantDb) {
        return await runWithTenantDb(tenantDb, doLogin);
      } else {
        return await doLogin();
      }
    } catch (err) {
      console.error("[local-login] erro:", err);
      return res.status(500).json({ error: "Erro interno no servidor" });
    }
  });

  // POST /api/local-change-password — altera a senha do usuário autenticado
  app.post("/api/local-change-password", async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body as {
        currentPassword?: string;
        newPassword?: string;
      };

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: "Senha atual e nova senha são obrigatórias" });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ error: "A nova senha deve ter pelo menos 6 caracteres" });
      }

      // Obter o usuário a partir do cookie de sessão
      const cookieHeader = req.headers.cookie ?? "";
      const cookieMatch = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
      if (!cookieMatch) {
        return res.status(401).json({ error: "Não autenticado" });
      }

      let sessionData: { openId: string } | null = null;
      try {
        sessionData = await sdk.verifySession(cookieMatch[1]) as { openId: string };
      } catch {
        return res.status(401).json({ error: "Sessão inválida" });
      }

      const tenantDb = (req as any).tenantDb;

      const doChangePassword = async () => {
        const db = await getDb();
        if (!db) return res.status(503).json({ error: "Banco de dados indisponível" });

        const rows = await db.select().from(users).where(eq(users.openId, sessionData!.openId)).limit(1);
        const user = rows[0];
        if (!user || !user.passwordHash) {
          return res.status(404).json({ error: "Usuário não encontrado" });
        }

        const valid = await compare(currentPassword, user.passwordHash);
        if (!valid) {
          return res.status(401).json({ error: "Senha atual incorreta" });
        }

        const newHash = await hash(newPassword, 12);
        await db.update(users)
          .set({ passwordHash: newHash, mustChangePassword: false })
          .where(eq(users.id, user.id));

        return res.json({ ok: true });
      };

      if (tenantDb) {
        return await runWithTenantDb(tenantDb, doChangePassword);
      } else {
        return await doChangePassword();
      }
    } catch (err) {
      console.error("[local-change-password] erro:", err);
      return res.status(500).json({ error: "Erro interno no servidor" });
    }
  });

  // GET /api/local-auth-enabled — indica se o modo local está ativo
  // Registrado em ambas as formas para funcionar com e sem slug de tenant
  // (o tenantMiddleware pode falhar ao resolver o slug, mas este endpoint
  //  não precisa do banco do tenant para responder)
  const localAuthEnabledHandler = (_req: import("express").Request, res: import("express").Response) => {
    const isLocal = !process.env.OAUTH_SERVER_URL;
    res.json({ enabled: isLocal });
  };
  app.get("/api/local-auth-enabled", localAuthEnabledHandler);
  app.get("/:slug/api/local-auth-enabled", localAuthEnabledHandler);
}

/**
 * seedDefaultAdmin — cria o usuário admin padrão se não existir nenhum usuário local.
 * Chamado na inicialização do servidor quando OAUTH_SERVER_URL não está configurado.
 *
 * IMPORTANTE: Não sobrescreve a senha se o admin já existir.
 * Isso evita que a senha personalizada seja apagada a cada restart do servidor.
 */
export async function seedDefaultAdmin(): Promise<void> {
  if (process.env.OAUTH_SERVER_URL) return; // Modo OAuth: não criar admin local

  const DEFAULT_EMAIL = "admin@fiberdoc.local";
  const DEFAULT_PASSWORD = "fiberdoc2025";
  const DEFAULT_NAME = "Administrador";
  const openId = `local:${DEFAULT_EMAIL}`;

  try {
    const db = await getDb();
    if (!db) {
      console.warn("[localAuth] seedDefaultAdmin: banco de dados indisponível");
      return;
    }

    // Verificar se já existe algum usuário local
    const existing = await db.select({ id: users.id })
      .from(users)
      .where(eq(users.loginMethod, "local"))
      .limit(1);

    if (existing.length > 0) {
      // Admin já existe — preservar a senha personalizada, não sobrescrever
      console.log("[localAuth] Admin local já existe, senha preservada.");
      return;
    }

    // Primeiro acesso: criar admin com senha padrão
    const passwordHash = await hash(DEFAULT_PASSWORD, 12);

    await db.insert(users).values({
      openId,
      name: DEFAULT_NAME,
      email: DEFAULT_EMAIL,
      role: "admin",
      loginMethod: "local",
      passwordHash,
      mustChangePassword: true,
      lastSignedIn: new Date(),
    });

    console.log("[localAuth] ✅ Usuário admin padrão criado:");
    console.log(`[localAuth]   Email: ${DEFAULT_EMAIL}`);
    console.log(`[localAuth]   Senha: ${DEFAULT_PASSWORD}`);
    console.log("[localAuth]   ⚠️  Altere a senha no primeiro acesso!");
  } catch (err) {
    console.error("[localAuth] Erro ao criar admin padrão:", err);
  }
}
