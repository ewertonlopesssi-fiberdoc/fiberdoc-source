/**
 * adminTenantRouter.ts
 * Endpoints REST para o painel de administração de provedores/tenants.
 * Acessível apenas por usuários com role=admin.
 */
import type { Express } from "express";
import { sdk } from "./sdk";
import {
  getAllTenants,
  createTenant,
  updateTenant,
  deleteTenant,
  getTenantBySlug,
} from "./masterDb";
import { provisionTenantDatabase, databaseExists } from "./tenantProvisioner";
import { invalidateTenantCache } from "./tenantMiddleware";
import { removeTenantPool } from "./tenantPool";

export function registerAdminTenantRoutes(app: Express) {
  // Middleware de autenticação admin para todas as rotas /api/admin/tenants
  const requireAdmin = async (req: any, res: any, next: any) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ error: "Acesso negado. Requer role=admin." });
      }
      req.adminUser = user;
      next();
    } catch {
      res.status(401).json({ error: "Não autenticado" });
    }
  };

  // GET /api/admin/tenants — listar todos os provedores
  app.get("/api/admin/tenants", requireAdmin, async (_req, res) => {
    try {
      const list = await getAllTenants();
      res.json({ tenants: list });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Erro interno" });
    }
  });

  // POST /api/admin/tenants — criar novo provedor
  app.post("/api/admin/tenants", requireAdmin, async (req, res) => {
    try {
      const { slug, name, logoUrl } = req.body ?? {};

      if (!slug || !name) {
        return res.status(400).json({ error: "slug e name são obrigatórios" });
      }

      // Validar slug
      if (!/^[a-z0-9-_]+$/.test(slug)) {
        return res.status(400).json({
          error: "Slug inválido. Use apenas letras minúsculas, números, hífens e underscores.",
        });
      }

      // Verificar se já existe
      const existing = await getTenantBySlug(slug);
      if (existing) {
        return res.status(409).json({ error: `Slug '${slug}' já está em uso.` });
      }

      const dbName = `fiberdoc_${slug.replace(/-/g, "_")}`;

      // Verificar se banco já existe
      const dbExists = await databaseExists(dbName);

      // Criar registro no master
      const id = await createTenant({ slug, name, dbName, logoUrl: logoUrl ?? null, active: true });

      // Provisionar banco (criar + migrações)
      const provision = await provisionTenantDatabase(dbName);
      if (!provision.success) {
        // Reverter criação do tenant se provisioning falhou
        await deleteTenant(id);

        // Erro de permissão MySQL: retornar instruções detalhadas
        if (provision.permissionError) {
          return res.status(500).json({
            error: provision.error,
            permissionError: true,
            permissionHelp: provision.permissionHelp,
            fix: {
              description: "Execute o comando abaixo no MySQL como root para conceder permissões ao usuário:",
              sql: `GRANT ALL PRIVILEGES ON \`fiberdoc_%\`.* TO '${provision.permissionHelp?.match(/TO '([^']+)'/)?.[1] ?? "fiberdoc"}'@'${provision.permissionHelp?.match(/@'([^']+)'/)?.[1] ?? "localhost"}';
FLUSH PRIVILEGES;`,
            },
          });
        }

        return res.status(500).json({
          error: `Falha ao provisionar banco de dados: ${provision.error}`,
        });
      }

      res.status(201).json({
        ok: true,
        id,
        slug,
        name,
        dbName,
        dbAlreadyExisted: dbExists,
        message: `Provedor '${name}' criado com sucesso. Acesse em: /${slug}`,
        defaultCredentials: provision.defaultCredentials ?? null,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Erro interno" });
    }
  });

  // PATCH /api/admin/tenants/:id — atualizar provedor
  app.patch("/api/admin/tenants/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ error: "ID inválido" });
      }

      const { name, logoUrl, active } = req.body ?? {};
      const updates: Record<string, any> = {};
      if (name !== undefined) updates.name = name;
      if (logoUrl !== undefined) updates.logoUrl = logoUrl;
      if (active !== undefined) updates.active = active;

      await updateTenant(id, updates);

      // Invalidar cache se slug foi afetado
      const tenants = await getAllTenants();
      const tenant = tenants.find(t => t.id === id);
      if (tenant) {
        invalidateTenantCache(tenant.slug);
        if (!active) {
          removeTenantPool(tenant.dbName);
        }
      }

      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Erro interno" });
    }
  });

  // DELETE /api/admin/tenants/:id — remover provedor (apenas do master, não apaga o banco)
  app.delete("/api/admin/tenants/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ error: "ID inválido" });
      }

      const tenants = await getAllTenants();
      const tenant = tenants.find(t => t.id === id);
      if (!tenant) {
        return res.status(404).json({ error: "Provedor não encontrado" });
      }

      // Fechar pool de conexão
      invalidateTenantCache(tenant.slug);
      removeTenantPool(tenant.dbName);

      await deleteTenant(id);

      res.json({
        ok: true,
        message: `Provedor '${tenant.name}' removido. O banco '${tenant.dbName}' foi preservado.`,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Erro interno" });
    }
  });

  // POST /api/admin/tenants/:id/reprovision — reaplicar migrações em um tenant existente
  app.post("/api/admin/tenants/:id/reprovision", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const tenants = await getAllTenants();
      const tenant = tenants.find(t => t.id === id);
      if (!tenant) {
        return res.status(404).json({ error: "Provedor não encontrado" });
      }

      const result = await provisionTenantDatabase(tenant.dbName);
      if (!result.success) {
        if (result.permissionError) {
          return res.status(500).json({
            error: result.error,
            permissionError: true,
            permissionHelp: result.permissionHelp,
          });
        }
        return res.status(500).json({ error: result.error });
      }

      res.json({ ok: true, message: `Migrações reaplicadas em '${tenant.dbName}'.` });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Erro interno" });
    }
  });

  // GET /api/admin/tenants/check-slug/:slug — verificar disponibilidade de slug
  app.get("/api/admin/tenants/check-slug/:slug", requireAdmin, async (req, res) => {
    try {
      const { slug } = req.params;
      const existing = await getTenantBySlug(slug);
      res.json({ available: !existing, slug });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Erro interno" });
    }
  });
}
