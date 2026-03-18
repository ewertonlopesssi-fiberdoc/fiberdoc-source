import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { runWithTenantDb } from "./tenantContext";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;

// Middleware que injeta o banco do tenant via AsyncLocalStorage
// Isso garante que todas as chamadas a getDb() dentro do handler
// usem automaticamente o banco correto do tenant
const injectTenantDb = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (ctx.tenantDb) {
    // Executar o handler dentro do contexto do banco do tenant
    return runWithTenantDb(ctx.tenantDb, () => next({ ctx }));
  }

  // Sem tenant: usar banco padrão normalmente
  return next({ ctx });
});

export const publicProcedure = t.procedure.use(injectTenantDb);

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

// protectedProcedure: injeta banco do tenant E exige autenticação
export const protectedProcedure = t.procedure.use(injectTenantDb).use(requireUser);

// adminProcedure: injeta banco do tenant E exige role admin
export const adminProcedure = t.procedure.use(injectTenantDb).use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
