/**
 * sgpApi.ts — Helper de comunicação com a API do SGP
 *
 * Credenciais são lidas da tabela app_settings (configuráveis por instalação).
 * Fallback para variáveis de ambiente SGP_URL, SGP_TOKEN, SGP_APP.
 */

import { getDb } from "./db";
import { appSettings } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// ─── Tipos SGP ────────────────────────────────────────────────────────────────

export interface SgpCto {
  id: number;
  ident: string;
  note?: string;
  un_ports?: number;
  busy_ports?: number[];
  lat?: string | null;
  lng?: string | null;
}

export interface SgpOnu {
  id: number;
  onu: number;
  slot: number;
  pon: number;
  olt_id: number;
  olt_name?: string;
  olt_serial?: string;
  onu_login?: string | null;
  cpfcnpj?: string | null;
  contrato?: number | null;
  servico?: number | null;
  status?: number | null;
  login?: string | null;
  address?: string | null;
  signal?: string | null;
  connection?: string | null;
}

export interface SgpClient {
  id: number;
  razaosocial: string;
  cpfcnpj: string;
  contrato?: number;
  status?: string;
  planointernet?: string;
}

export interface SgpConfig {
  url: string;
  token: string;
  app: string;
}

// ─── Ler configuração SGP da BD ───────────────────────────────────────────────

export async function getSgpConfig(): Promise<SgpConfig | null> {
  try {
    const db = await getDb();
    if (!db) throw new Error("DB not ready");
    const rows = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, "sgp_config"));
    if (rows.length > 0 && rows[0].value) {
      const cfg = JSON.parse(rows[0].value) as SgpConfig;
      if (cfg.url && cfg.token && cfg.app) return cfg;
    }
  } catch { /* ignora */ }

  // Fallback para variáveis de ambiente
  const url = process.env.SGP_URL;
  const token = process.env.SGP_TOKEN;
  const app = process.env.SGP_APP;
  if (url && token && app) return { url, token, app };

  return null;
}

// ─── Gravar configuração SGP na BD ───────────────────────────────────────────

export async function saveSgpConfig(cfg: SgpConfig): Promise<void> {
  const value = JSON.stringify(cfg);
  const db = await getDb();
  if (!db) throw new Error("DB not ready");
  await db
    .insert(appSettings)
    .values({ key: "sgp_config", value })
    .onDuplicateKeyUpdate({ set: { value } });
}

// ─── Fetch autenticado ────────────────────────────────────────────────────────

async function sgpFetch(
  cfg: SgpConfig,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${cfg.url.replace(/\/$/, "")}${path}`;
  const headers: Record<string, string> = {
    token: cfg.token,
    app: cfg.app,
    ...(options.headers as Record<string, string> ?? {}),
  };
  return fetch(url, { ...options, headers });
}

// ─── Endpoints FTTH ───────────────────────────────────────────────────────────

/** Listar todas as CTOs do SGP */
export async function sgpListAllCtos(cfg: SgpConfig): Promise<SgpCto[]> {
  const res = await sgpFetch(cfg, "/api/fttx/splitter/all/");
  if (!res.ok) throw new Error(`SGP listAllCtos: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return Array.isArray(data) ? data : (data.results ?? data.data ?? []);
}

/** Listar uma CTO específica do SGP */
export async function sgpGetCto(cfg: SgpConfig, ctoId: number): Promise<SgpCto> {
  const res = await sgpFetch(cfg, `/api/fttx/splitter/${ctoId}/`);
  if (!res.ok) throw new Error(`SGP getCto: ${res.status} ${res.statusText}`);
  return res.json();
}

/** Listar ONUs vinculadas a uma CTO */
export async function sgpOnusByCto(cfg: SgpConfig, ctoId: number): Promise<SgpOnu[]> {
  const res = await sgpFetch(cfg, `/api/fttx/splitter/${ctoId}/onu/list/`);
  if (!res.ok) throw new Error(`SGP onusByCto: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return Array.isArray(data) ? data : (data.results ?? data.data ?? []);
}

/** Listar ONUs de uma OLT com filtros */
export async function sgpListOnus(
  cfg: SgpConfig,
  oltId: number,
  params: Record<string, string | number> = {}
): Promise<SgpOnu[]> {
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)])
  ).toString();
  const path = `/api/fttx/olt/${oltId}/onu/list/${qs ? "?" + qs : ""}`;
  const res = await sgpFetch(cfg, path);
  if (!res.ok) throw new Error(`SGP listOnus: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return Array.isArray(data) ? data : (data.results ?? data.data ?? []);
}

/** Autorizar ONU */
export async function sgpAuthorizeOnu(
  cfg: SgpConfig,
  oltId: number,
  params: Record<string, string | number>
): Promise<unknown> {
  const body = new FormData();
  for (const [k, v] of Object.entries(params)) body.append(k, String(v));
  const res = await sgpFetch(cfg, `/api/fttx/olt/${oltId}/onu/authorize/`, {
    method: "POST",
    body,
  });
  if (!res.ok) throw new Error(`SGP authorizeOnu: ${res.status} ${res.statusText}`);
  return res.json();
}

/** Resetar ONU */
export async function sgpResetOnu(
  cfg: SgpConfig,
  oltId: number,
  params: Record<string, string | number>
): Promise<unknown> {
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)])
  ).toString();
  const res = await sgpFetch(cfg, `/api/fttx/olt/${oltId}/onu/reset/?${qs}`);
  if (!res.ok) throw new Error(`SGP resetOnu: ${res.status} ${res.statusText}`);
  return res.json();
}

/** Cadastrar CTO no SGP */
export async function sgpCreateCto(
  cfg: SgpConfig,
  data: { ident: string; note?: string; lat?: string; lng?: string }
): Promise<SgpCto> {
  const body = new FormData();
  body.append("ident", data.ident);
  if (data.note) body.append("note", data.note);
  if (data.lat) body.append("lat", data.lat);
  if (data.lng) body.append("lng", data.lng);
  const res = await sgpFetch(cfg, "/api/fttx/splitter/create/", {
    method: "POST",
    body,
  });
  if (!res.ok) throw new Error(`SGP createCto: ${res.status} ${res.statusText}`);
  return res.json();
}

/** Pesquisar clientes/contratos no SGP */
export async function sgpSearchClients(
  cfg: SgpConfig,
  query: string
): Promise<SgpClient[]> {
  const qs = new URLSearchParams({ q: query }).toString();
  const res = await sgpFetch(cfg, `/api/clientes/?${qs}`);
  if (!res.ok) {
    // Tenta endpoint alternativo
    const res2 = await sgpFetch(cfg, `/api/assinante/?${qs}`);
    if (!res2.ok) return [];
    const data2 = await res2.json();
    return Array.isArray(data2) ? data2 : (data2.results ?? data2.data ?? []);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : (data.results ?? data.data ?? []);
}

/** Testar conectividade com o SGP */
export async function sgpTestConnection(cfg: SgpConfig): Promise<boolean> {
  try {
    const res = await sgpFetch(cfg, "/api/fttx/splitter/all/", {
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
