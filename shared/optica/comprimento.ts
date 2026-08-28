/**
 * O comprimento de um cabo, num sítio só.
 *
 * Estava calculado em quatro lugares independentes: no balanço óptico
 * (`calcRouteDistanceKm`), no traço OTDR (`haversineMeters`), no comprimento
 * total da rede do painel, e no cliente (`lib/map/geo.ts`). Os quatro usam
 * R = 6371 e a mesma fórmula de haversine, portanto juntá-los **não muda
 * nenhum número** — foi conferido linha a linha antes de escrever isto. O que
 * variava era só o invólucro, e é isso que aqui fica explícito.
 *
 * Três decisões que valem a pena estar escritas:
 *
 * 1. Este ficheiro não sabe o que é Leaflet nem o que é Drizzle. Recebe pontos
 *    simples e devolve metros. É o que permite servir o servidor e o cliente.
 *
 * 2. `metrosDoCabo` devolve DE ONDE veio o número. Um cabo sem traçado era
 *    medido em linha recta e ninguém ficava a saber — subestima sempre, e o
 *    OTDR compara isso com metros de fibra reais. Agora quem chama pode avisar.
 *
 * 3. Pontos inválidos são descartados em vez de contaminarem a conta. Hoje um
 *    `path` malformado produz NaN, que se propaga até "NaN dBm" no ecrã. Um
 *    ponto a menos e um aviso são melhores do que um resultado que não é um
 *    número.
 */

export interface Ponto { lat: number; lng: number }

const RAIO_TERRA_M = 6371000;

/** Metros entre dois pontos, pela fórmula de haversine. */
export function metrosEntre(a: Ponto, b: Ponto): number {
  const rad = (v: number) => (v * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return RAIO_TERRA_M * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/** Metros ao longo de uma sequência de pontos. Menos de dois pontos = zero. */
export function metrosDoTracado(pontos: Ponto[]): number {
  let total = 0;
  for (let i = 1; i < pontos.length; i++) total += metrosEntre(pontos[i - 1], pontos[i]);
  return total;
}

/**
 * Lê o `path` de um cabo, que no banco é texto com JSON.
 *
 * Nunca lança. Um `path` corrompido devolve lista vazia, e quem chama trata
 * isso como "sem traçado" — que é a verdade — em vez de rebentar a meio de um
 * rastreio que atravessa dezenas de caixas.
 */
export function lerTracado(path: string | null | undefined): Ponto[] {
  if (!path) return [];
  let cru: unknown;
  try { cru = JSON.parse(path); } catch { return []; }
  if (!Array.isArray(cru)) return [];
  const pontos: Ponto[] = [];
  for (const p of cru) {
    if (!p || typeof p !== "object") continue;
    const lat = Number((p as any).lat);
    const lng = Number((p as any).lng);
    // Number.isFinite apanha NaN e Infinity de uma vez. Coordenadas fora do
    // planeta são dados errados, não pontos: entram na conta como um desvio
    // enorme e silencioso.
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
    pontos.push({ lat, lng });
  }
  return pontos;
}

export type OrigemComprimento =
  /** Medido no traçado desenhado no mapa. */
  | "tracado"
  /** Medido manualmente e gravado — ganha ao traçado. */
  | "medido"
  /** Linha recta entre as duas caixas: o cabo não tem traçado. Subestima. */
  | "reta"
  /** Não há traçado nem as duas pontas. Zero, e quem chama que avise. */
  | "sem-dados";

export interface ComprimentoDoCabo {
  metros: number;
  origem: OrigemComprimento;
}

export interface EntradaCabo {
  path?: string | null;
  /** Comprimento medido em campo, quando existir. Ganha a tudo o resto. */
  metrosMedidos?: number | null;
  /** As duas pontas, para a linha recta de recurso. */
  pontaA?: Ponto | null;
  pontaB?: Ponto | null;
  /** Metros de reserva técnica vinculados a este cabo. Somam-se sempre. */
  metrosDeReserva?: number;
}

/**
 * O comprimento de um cabo, com a proveniência à vista.
 *
 * A reserva técnica soma-se em qualquer dos casos: ela é fibra que existe no
 * caminho, independentemente de como o resto foi medido.
 */
export function metrosDoCabo(cabo: EntradaCabo): ComprimentoDoCabo {
  const reserva = Number.isFinite(cabo.metrosDeReserva) ? (cabo.metrosDeReserva as number) : 0;

  if (cabo.metrosMedidos != null && Number.isFinite(cabo.metrosMedidos) && cabo.metrosMedidos > 0) {
    return { metros: cabo.metrosMedidos + reserva, origem: "medido" };
  }

  const pontos = lerTracado(cabo.path);
  if (pontos.length >= 2) {
    return { metros: metrosDoTracado(pontos) + reserva, origem: "tracado" };
  }

  if (cabo.pontaA && cabo.pontaB) {
    return { metros: metrosEntre(cabo.pontaA, cabo.pontaB) + reserva, origem: "reta" };
  }

  return { metros: reserva, origem: "sem-dados" };
}

/** Metros para texto curto, como o resto do sistema já mostra. */
export function formatarMetros(metros: number): string {
  if (!Number.isFinite(metros)) return "—";
  if (metros >= 1000) return `${(metros / 1000).toFixed(2)} km`;
  return `${Math.round(metros)} m`;
}
