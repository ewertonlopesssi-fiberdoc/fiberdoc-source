import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

type CookieCall = {
  name: string;
  options: Record<string, unknown>;
};

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

/**
 * Contexto autenticado para o teste.
 *
 * O `hostname` importa: getSessionCookieOptions só usa secure+sameSite=none
 * quando há domínio real com HTTPS real. Em IP ou localhost usa lax sem
 * secure, porque o browser rejeita cookies secure em contexto inseguro — e
 * há instalações do FiberDoc em IP privado.
 *
 * Este teste não passava o hostname, então `req.hostname ?? ""` dava vazio,
 * a regra caía no ramo "sem domínio real" e a expectativa de secure=true
 * falhava. Ficou vermelho por afirmar uma coisa e montar outra.
 */
function createAuthContext(hostname = "fiberdoc.exemplo.com"): { ctx: TrpcContext; clearedCookies: CookieCall[] } {
  const clearedCookies: CookieCall[] = [];

  const user: AuthenticatedUser = {
    id: 1,
    openId: "sample-user",
    email: "sample@example.com",
    name: "Sample User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      hostname,
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };

  return { ctx, clearedCookies };
}

describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    expect(clearedCookies[0]?.options).toMatchObject({
      maxAge: -1,
      secure: true,
      sameSite: "none",
      httpOnly: true,
      path: "/",
    });
  });

  it("uses lax without secure when served from an IP address", async () => {
    // Instalação em IP privado: o browser recusa cookies secure em contexto
    // inseguro, e o utilizador ficaria sem conseguir sair da sessão. Esta
    // metade da regra nunca esteve coberta.
    const { ctx, clearedCookies } = createAuthContext("172.31.141.2");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    expect(clearedCookies[0]?.options).toMatchObject({
      maxAge: -1,
      secure: false,
      sameSite: "lax",
      httpOnly: true,
      path: "/",
    });
  });
});
