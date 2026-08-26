import fs from "fs";
import path from "path";
import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";
import { VERSAO_DESCONHECIDA } from "../../shared/versionCheck";

/**
 * Versão do build, lida uma única vez.
 *
 * Cachear é correto aqui: uma atualização troca os arquivos e reinicia o
 * processo, então não existe caso em que a versão mude sem este módulo ser
 * recarregado. E como o cliente consulta isto de tempos em tempos, ler o
 * disco a cada chamada seria desperdício puro.
 */
const VERSAO_DO_BUILD: string = (() => {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8"));
    return typeof pkg.version === "string" && pkg.version ? pkg.version : VERSAO_DESCONHECIDA;
  } catch {
    return VERSAO_DESCONHECIDA;
  }
})();

export const systemRouter = router({
  /**
   * Versão que o servidor está servindo agora. Público de propósito: a
   * comparação acontece antes de qualquer coisa depender de sessão, e o
   * número da versão já é visível no sw.js de todo jeito.
   */
  appVersion: publicProcedure.query(() => ({ version: VERSAO_DO_BUILD })),

  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),
});
