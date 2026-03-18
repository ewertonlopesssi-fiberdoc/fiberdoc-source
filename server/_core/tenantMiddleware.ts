/**
 * tenantMiddleware.ts
 * Middleware Express que detecta o slug do tenant na URL e
 * adiciona o banco de dados do tenant ao objeto request.
 *
 * URLs suportadas:
 *   /:slug/api/trpc/...   → tenant slug
 *   /:slug/api/...        → tenant slug
 *   /:slug               → serve o frontend do tenant
 *   /api/...             → sem tenant (banco padrão)
 */
import type { Request, Response, NextFunction } from "express";
import { getTenantBySlug } from "./masterDb";
import { getTenantDb } from "./tenantPool";

// Slugs reservados que não são tenants
const RESERVED_SLUGS = new Set([
  "api", "admin", "static", "public", "assets", "favicon.ico",
  "robots.txt", "sitemap.xml", "health", "status",
]);

declare global {
  namespace Express {
    interface Request {
      tenantSlug?: string;
      tenantDbName?: string;
      tenantDb?: ReturnType<typeof getTenantDb>;
    }
  }
}

// Cache simples de slugs válidos para evitar consultas repetidas ao banco master
const slugCache = new Map<string, { dbName: string; active: boolean; ts: number }>();
const CACHE_TTL_MS = 60_000; // 1 minuto

async function resolveTenantSlug(slug: string): Promise<{ dbName: string } | null> {
  const cached = slugCache.get(slug);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.active ? { dbName: cached.dbName } : null;
  }

  const tenant = await getTenantBySlug(slug);
  if (tenant) {
    slugCache.set(slug, { dbName: tenant.dbName, active: tenant.active, ts: Date.now() });
    return tenant.active ? { dbName: tenant.dbName } : null;
  }

  return null;
}

/**
 * Invalida o cache de um slug (após criar/atualizar/deletar tenant).
 */
export function invalidateTenantCache(slug: string) {
  slugCache.delete(slug);
}

/**
 * Middleware que extrai o slug do tenant da URL e adiciona ao request.
 * Deve ser registrado ANTES dos outros middlewares de rota.
 */
export async function tenantMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Extrair o primeiro segmento da URL
  const parts = req.path.split("/").filter(Boolean);
  const firstSegment = parts[0];

  // Se não há segmento ou é reservado, continuar sem tenant
  if (!firstSegment || RESERVED_SLUGS.has(firstSegment)) {
    return next();
  }

  // Verificar se parece um slug válido (letras, números, hífens)
  if (!/^[a-zA-Z0-9-_]+$/.test(firstSegment)) {
    return next();
  }

  // Tentar resolver o slug como tenant
  try {
    const tenant = await resolveTenantSlug(firstSegment);
    if (tenant) {
      req.tenantSlug = firstSegment;
      req.tenantDbName = tenant.dbName;
      req.tenantDb = getTenantDb(tenant.dbName);

      // Reescrever a URL removendo o slug para os handlers downstream
      // Importante: reescrever tanto req.url quanto req.baseUrl para que
      // express.static e o fallback de SPA funcionem corretamente
      const slugPrefix = `/${firstSegment}`;
      req.url = req.url.replace(slugPrefix, "") || "/";
      if (!req.url.startsWith("/")) req.url = "/" + req.url;

      // Também atualizar originalUrl para que o express.static resolva corretamente
      if (req.originalUrl.startsWith(slugPrefix)) {
        req.originalUrl = req.originalUrl.replace(slugPrefix, "") || "/";
        if (!req.originalUrl.startsWith("/")) req.originalUrl = "/" + req.originalUrl;
      }
    }
  } catch (err) {
    console.warn("[TenantMiddleware] Erro ao resolver tenant:", err);
  }

  next();
}
