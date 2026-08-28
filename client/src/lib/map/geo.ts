import L from "leaflet";
import { metrosDoTracado } from "@shared/optica/comprimento";

/**
 * Normaliza um ponto para o par [lat, lng].
 *
 * L.LatLngExpression tem três formas: a tupla [lat, lng], o objeto L.LatLng
 * com .lat/.lng, e o literal { lat, lng }. A versão anterior desta função
 * declarava aceitar LatLngExpression mas só tratava a tupla, com um
 * `as [number, number]` que calava o TypeScript. Quem passasse um L.LatLng
 * recebia NaN em silêncio — sem erro de tipo, sem exceção, só um número
 * inválido no fim da conta.
 */
function paraPar(p: L.LatLngExpression): [number, number] {
  if (Array.isArray(p)) return [p[0], p[1]];
  return [(p as L.LatLng).lat, (p as L.LatLng).lng];
}

/**
 * Distância em metros ao longo de uma sequência de pontos.
 *
 * A conta vive agora em shared/optica/comprimento.ts, para ser a mesma que o
 * servidor usa. Esta função fica como adaptador: só ela sabe o que é um
 * L.LatLngExpression, e o módulo partilhado não precisa de saber. O resultado
 * é bit a bit o mesmo -- as duas implementações usavam R = 6371 km e a mesma
 * fórmula, conferidas antes da troca.
 */
export function haversineDistance(latlngs: L.LatLngExpression[]): number {
  return metrosDoTracado(latlngs.map(p => {
    const [lat, lng] = paraPar(p);
    return { lat, lng };
  }));
}

export function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters)} m`;
}

