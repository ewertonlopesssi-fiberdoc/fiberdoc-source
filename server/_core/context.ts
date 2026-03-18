import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { jwtVerify } from "jose";
import { ENV } from "./env";
import { getUserById } from "../db";
import type { getTenantDb } from "./tenantPool";
import { runWithTenantDb } from "./tenantContext";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  tenantSlug?: string;
  tenantDbName?: string;
  tenantDb?: ReturnType<typeof getTenantDb>;
};

async function authenticateBearer(authHeader: string): Promise<User | null> {
  try {
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const secret = new TextEncoder().encode(ENV.cookieSecret);
    const { payload } = await jwtVerify(token, secret, { issuer: "fiberdoc-mobile" });
    const userId = payload.sub ? parseInt(payload.sub) : null;
    if (!userId) return null;
    return await getUserById(userId);
  } catch {
    return null;
  }
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  // Pegar informações do tenant do request (adicionadas pelo tenantMiddleware)
  const req = opts.req as any;
  const tenantDb = req.tenantDb as ReturnType<typeof getTenantDb> | undefined;

  let user: User | null = null;

  try {
    const authHeader = opts.req.headers.authorization;

    if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
      // Suporte a Bearer token JWT para o app mobile
      // Bearer token usa getUserById — precisa do banco do tenant se houver
      if (tenantDb) {
        user = await runWithTenantDb(tenantDb, () => authenticateBearer(authHeader));
      } else {
        user = await authenticateBearer(authHeader);
      }
    } else {
      // Autenticação via cookie de sessão
      // Se há banco de tenant, autenticar dentro do contexto do tenant
      if (tenantDb) {
        user = await runWithTenantDb(tenantDb, () => sdk.authenticateRequest(opts.req));
      } else {
        user = await sdk.authenticateRequest(opts.req);
      }
    }
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    tenantSlug: req.tenantSlug,
    tenantDbName: req.tenantDbName,
    tenantDb,
  };
}
