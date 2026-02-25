import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { jwtVerify } from "jose";
import { ENV } from "./env";
import { getUserById } from "../db";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
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
  let user: User | null = null;

  try {
    // Suporte a Bearer token JWT para o app mobile
    const authHeader = opts.req.headers.authorization;
    if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
      user = await authenticateBearer(authHeader);
    } else {
      user = await sdk.authenticateRequest(opts.req);
    }
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
