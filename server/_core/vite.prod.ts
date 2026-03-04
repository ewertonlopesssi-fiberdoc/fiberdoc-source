/**
 * Stub de produção — substitui server/_core/vite.ts no build de produção.
 * Não importa o pacote 'vite' (devDependency), pelo que é seguro em produção.
 * O setupVite nunca é chamado em produção (NODE_ENV !== 'development').
 */
import { type Express } from "express";
import { type Server } from "http";

export async function setupVite(_app: Express, _server: Server): Promise<void> {
  throw new Error("setupVite não deve ser chamado em produção");
}

export { serveStatic } from "./serve-static";
