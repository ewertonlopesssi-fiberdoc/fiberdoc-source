import L from "leaflet";

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

// Calcula distância em metros ao longo de uma sequência de pontos (Haversine)
export function haversineDistance(latlngs: L.LatLngExpression[]): number {
  let total = 0;
  const toRad = (v: number) => (v * Math.PI) / 180;
  for (let i = 0; i < latlngs.length - 1; i++) {
    const a = paraPar(latlngs[i]);
    const b = paraPar(latlngs[i + 1]);
    const R = 6371000;
    const dLat = toRad(b[0] - a[0]); const dLng = toRad(b[1] - a[1]);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
    total += R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }
  return total;
}

export function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters)} m`;
}

