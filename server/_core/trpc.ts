import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { runWithTenantDb, runWithTenantDbAndName } from "./tenantContext";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;

// Middleware que injeta o banco do tenant via AsyncLocalStorage
// Isso garante que todas as chamadas a getDb() dentro do handler
// usem automaticamente o banco correto do tenant.
// Também injeta o dbName para que funções com SQL raw (createMapRoute, updateMapRoute)
// possam obter o pool raw do tenant via getTenantDbNameFromContext().
const injectTenantDb = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (ctx.tenantDb && ctx.tenantDbName) {
    // Executar o handler dentro do contexto do banco do tenant (com dbName)
    return runWithTenantDbAndName(ctx.tenantDb, ctx.tenantDbName, () => next({ ctx }));
  }

  if (ctx.tenantDb) {
    // Fallback: sem dbName (compatibilidade)
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

// operatorProcedure: injeta banco do tenant E exige role admin OU operator
// Usado para operações de criação/edição de infraestrutura e mapa
export const operatorProcedure = t.procedure.use(injectTenantDb).use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'operator')) {
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
