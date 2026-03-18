import type { CookieOptions, Request } from "express";

/**
 * Retorna as opções do cookie de sessão.
 *
 * Regras:
 * - secure=true e sameSite=none SOMENTE quando há um domínio real (não IP) com HTTPS real
 * - Em todos os outros casos (IP, localhost, certificado autoassinado, HTTP): secure=false, sameSite=lax
 *
 * Isso garante compatibilidade com instalações em IP privado (ex: 172.31.141.2)
 * onde o browser rejeita cookies secure em contextos "inseguros".
 */

function isIpAddress(host: string): boolean {
  // IPv4
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  // IPv6
  if (host.includes(":")) return true;
  return false;
}

function isLocalHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  const hostname = req.hostname ?? "";

  // Verificar se é um domínio real (não IP, não localhost)
  const hasRealDomain = !isIpAddress(hostname) && !isLocalHost(hostname) && hostname.includes(".");

  // Verificar se a requisição chegou via HTTPS real (não apenas proxy interno)
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : (forwardedProto ?? "").split(",");
  const isHttps = protoList.some(p => p.trim().toLowerCase() === "https") || req.protocol === "https";

  // Usar secure+sameSite=none apenas com domínio real E HTTPS real
  // Em IP ou localhost, sempre usar lax (sem secure) para máxima compatibilidade
  const useSecure = hasRealDomain && isHttps;

  return {
    httpOnly: true,
    path: "/",
    sameSite: useSecure ? "none" : "lax",
    secure: useSecure,
  };
}
