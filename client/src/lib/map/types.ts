/** Tipos de domínio do mapa, compartilhados entre a página e os sub-componentes. */

export type MapElement = {
  id: number; type: "ceo" | "cto"; referenceId: number;
  lat: number; lng: number; name?: string; status?: string;
  capacity?: number; usedPorts?: number; sgpId?: number | null;
  color?: string | null;
};
export type MapRoute = {
  id: number; fromElementId: number; toElementId: number;
  fromTubeId?: number | null; toTubeId?: number | null;
  name?: string | null; cableType?: string | null; fiberCount?: number | null;
  color?: string | null; notes?: string | null; path?: string | null;
};
export type MapPoi = { id: number; name: string; category: string; lat: number | string; lng: number | string; color: string | null; notes: string | null; groups?: number[] };
export type SidePanelContent = { kind: "element"; element: MapElement } | { kind: "route"; route: MapRoute } | { kind: "poi"; poi: MapPoi } | null;

