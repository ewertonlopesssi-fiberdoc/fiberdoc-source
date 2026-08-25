import L from "leaflet";

// Calcula distância em metros entre dois pontos (Haversine)
export function haversineDistance(latlngs: L.LatLngExpression[]): number {
  let total = 0;
  const toRad = (v: number) => (v * Math.PI) / 180;
  for (let i = 0; i < latlngs.length - 1; i++) {
    const [a, b] = [latlngs[i] as [number, number], latlngs[i + 1] as [number, number]];
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

