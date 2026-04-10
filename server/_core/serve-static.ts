import express, { type Express, type Request, type Response } from "express";
import fs from "fs";
import path from "path";

/**
 * Serve ficheiros estáticos do build de produção.
 * Este ficheiro NÃO importa o vite, pelo que é seguro em produção.
 *
 * Em modo multi-tenant, o tenantMiddleware já reescreveu req.url removendo
 * o slug antes de chegar aqui. Portanto o express.static e o fallback para
 * index.html funcionam normalmente para todos os tenants.
 */
export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  // sw.js nunca deve ser cacheado pelo browser (garante que o novo SW é sempre baixado)
  app.get("/sw.js", (_req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.sendFile(path.resolve(distPath, "sw.js"));
  });

  // Servir arquivos estáticos (CSS, JS, imagens, etc.)
  app.use(express.static(distPath));

  // Fallback para index.html — necessário para SPA (React Router / Wouter)
  // Captura qualquer rota que não foi tratada pelas rotas anteriores
  // Isso inclui rotas de tenant como /edivaldofibra/ (após reescrita pelo tenantMiddleware)
  app.use((_req: Request, res: Response) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
