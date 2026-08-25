import L from "leaflet";
import { haversineDistance } from "./geo";

/**
 * Cálculos de medição do mapa: régua (distância acumulada) e área.
 *
 * Ficam fora do componente porque são aritmética pura e, sendo assim,
 * testáveis. A régua reaproveita o haversineDistance já extraído.
 */

/** Distância total de uma sequência de pontos, em metros. */
export function distanciaTotal(pontos: L.LatLng[]): number {
  if (pontos.length < 2) return 0;
  return haversineDistance(pontos);
}

/** Distância de cada trecho isolado, em metros — para rotular segmento a segmento. */
export function distanciasPorTrecho(pontos: L.LatLng[]): number[] {
  const saida: number[] = [];
  for (let i = 0; i < pontos.length - 1; i++) {
    saida.push(haversineDistance([pontos[i], pontos[i + 1]]));
  }
  return saida;
}

/**
 * Área de um polígono em metros quadrados, pela fórmula do excesso esférico.
 *
 * Usa o mesmo método da biblioteca geodésica do Google Maps. Para as escalas
 * de um projeto FTTH — quarteirões, bairros — o erro é desprezível.
 */
export function areaPoligono(pontos: L.LatLng[]): number {
  if (pontos.length < 3) return 0;
  const R = 6378137; // raio equatorial da Terra, em metros (WGS-84)
  const rad = (g: number) => (g * Math.PI) / 180;
  let total = 0;
  for (let i = 0; i < pontos.length; i++) {
    const p1 = pontos[i];
    const p2 = pontos[(i + 1) % pontos.length];
    total += (rad(p2.lng) - rad(p1.lng)) * (2 + Math.sin(rad(p1.lat)) + Math.sin(rad(p2.lat)));
  }
  return Math.abs((total * R * R) / 2);
}

/** Formata distância para leitura humana: metros abaixo de 1 km, senão km. */
export function formatarDistancia(metros: number): string {
  if (metros < 1000) return `${Math.round(metros)} m`;
  return `${(metros / 1000).toFixed(2).replace(".", ",")} km`;
}

/** Formata área: m² abaixo de 1 hectare, hectares abaixo de 1 km², senão km². */
export function formatarArea(m2: number): string {
  if (m2 < 10000) return `${Math.round(m2).toLocaleString("pt-BR")} m²`;
  if (m2 < 1_000_000) return `${(m2 / 10000).toFixed(2).replace(".", ",")} ha`;
  return `${(m2 / 1_000_000).toFixed(2).replace(".", ",")} km²`;
}
