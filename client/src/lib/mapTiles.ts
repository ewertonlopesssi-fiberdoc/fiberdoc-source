import L from "leaflet";

/**
 * Camadas base do mapa — provedor único para o desktop (InfrastructureMap) e
 * para o mobile (MobileMap), de modo que as duas telas nunca divirjam.
 *
 * ─── Por que existe um provedor de satélite alternativo ─────────────────────
 *
 * A Esri World Imagery é gratuita e sem chave, mas a cobertura de alta
 * resolução acaba cedo fora dos grandes centros. Pior: acima do último nível
 * coberto ela NÃO devolve 404 — devolve um PNG válido escrito "Map data not
 * yet available". Como é HTTP 200 com imagem legítima, o Leaflet não detecta
 * o placeholder e o mapa fica coberto de placas cinzas.
 *
 * Medição no agreste de Pernambuco (-8.8833813, -36.4811775), tamanho do tile
 * retornado em bytes:
 *
 *   zoom │ Esri            │ Mapbox
 *   ─────┼─────────────────┼────────
 *    z18 │ 17.504          │ 51.062
 *    z19 │  2.521 (placa)  │ 35.543
 *    z20 │  2.521 (placa)  │ 25.226
 *    z21 │  2.521 (placa)  │ 16.904
 *    z22 │  2.521 (placa)  │ 12.640
 *
 * Os 2.521 bytes repetidos são o mesmo arquivo de aviso. Por isso a Esri fica
 * limitada a z18 e o Mapbox é preferido quando há token configurado.
 *
 * ─── Configuração ──────────────────────────────────────────────────────────
 *
 * Defina VITE_MAPBOX_TOKEN no .env com um token PÚBLICO (prefixo "pk."),
 * restrito ao domínio da instalação no painel do Mapbox. Sem token, o sistema
 * usa a Esri e continua funcionando normalmente.
 *
 * Nunca use um token secreto (prefixo "sk.") aqui: o valor é embutido no
 * bundle e fica visível para qualquer usuário.
 */

const MAPBOX_TOKEN: string | undefined = import.meta.env.VITE_MAPBOX_TOKEN;

/** OpenStreetMap não publica tiles acima do nível 19. */
export const STREET_MAX_ZOOM = 19;

/**
 * Teto de navegação no satélite. Acima do nível nativo do provedor o Leaflet
 * amplia digitalmente o último tile real — comportamento do Google Earth
 * quando a resolução acaba. Não deixa mais nítido, mas permite continuar
 * aproximando para posicionar elementos, em vez de o mapa travar.
 */
export const SATELLITE_MAX_ZOOM = 22;

/** Último nível com imagem real na Esri fora de áreas metropolitanas. */
const ESRI_MAX_NATIVE_ZOOM = 18;

/** O Mapbox reamostra no próprio servidor e nunca devolve placeholder. */
const MAPBOX_MAX_NATIVE_ZOOM = 22;

const ESRI_ATTRIBUTION =
  "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, " +
  "Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community";

const MAPBOX_ATTRIBUTION =
  '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> ' +
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export type SatelliteProvider = "esri" | "mapbox";

/** Provedor de satélite em uso: Mapbox quando há token, Esri caso contrário. */
export function activeSatelliteProvider(): SatelliteProvider {
  return MAPBOX_TOKEN ? "mapbox" : "esri";
}

/** Nome legível do provedor, para exibir na interface. */
export function satelliteProviderLabel(): string {
  return activeSatelliteProvider() === "mapbox" ? "Mapbox" : "Esri";
}

/** Camada de mapa de ruas (OpenStreetMap). */
export function createStreetLayer(): L.TileLayer {
  return L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: OSM_ATTRIBUTION,
    maxZoom: STREET_MAX_ZOOM,
  });
}

/** Camada de satélite do provedor ativo. */
export function createSatelliteLayer(): L.TileLayer {
  if (MAPBOX_TOKEN) {
    // @2x entrega tiles de 512px em vez de 256, o que rende imagem
    // visivelmente mais definida em telas de alta densidade. Com tileSize 512
    // é obrigatório zoomOffset -1, senão a escala fica deslocada em um nível.
    return L.tileLayer(
      `https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg90?access_token=${MAPBOX_TOKEN}`,
      {
        attribution: MAPBOX_ATTRIBUTION,
        tileSize: 512,
        zoomOffset: -1,
        maxNativeZoom: MAPBOX_MAX_NATIVE_ZOOM,
        maxZoom: SATELLITE_MAX_ZOOM,
      }
    );
  }

  return L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      attribution: ESRI_ATTRIBUTION,
      maxNativeZoom: ESRI_MAX_NATIVE_ZOOM,
      maxZoom: SATELLITE_MAX_ZOOM,
    }
  );
}

/**
 * Recua o zoom ao sair do satélite para o mapa de ruas. O teto do OSM é menor,
 * e o Leaflet não reposiciona sozinho quando o limite da camada ativa baixa.
 */
export function clampZoomForStreet(map: L.Map): void {
  if (map.getZoom() > STREET_MAX_ZOOM) {
    map.setZoom(STREET_MAX_ZOOM);
  }
}
