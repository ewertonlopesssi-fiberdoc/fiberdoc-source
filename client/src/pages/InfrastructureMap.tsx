import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

// ─── Painel de detalhes redimensionável ─────────────────────────────────────
function ResizableDetailPanel({ open, onClose, title, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const [width, setWidth] = useState(700);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWRef = useRef(700);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    draggingRef.current = true;
    startXRef.current = e.clientX;
    startWRef.current = width;
    e.preventDefault();
  }, [width]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const delta = startXRef.current - e.clientX;
      const newW = Math.min(Math.max(startWRef.current + delta, 320), window.innerWidth - 80);
      setWidth(newW);
    };
    const onUp = () => { draggingRef.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  if (!open) return null;
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9999, pointerEvents: "none" }}
    >
      {/* Overlay para fechar ao clicar fora */}
      <div
        style={{ position: "absolute", inset: 0, pointerEvents: "auto" }}
        onClick={onClose}
      />
      {/* Painel */}
      <div
        style={{
          position: "absolute", top: 0, right: 0, bottom: 0,
          width: `${width}px`, maxWidth: "100vw",
          background: "var(--background)",
          borderLeft: "1px solid var(--border)",
          display: "flex", flexDirection: "column",
          pointerEvents: "auto",
          boxShadow: "-4px 0 24px rgba(0,0,0,0.4)",
        }}
      >
        {/* Handle de redimensionamento */}
        <div
          onMouseDown={onMouseDown}
          style={{
            position: "absolute", left: 0, top: 0, bottom: 0, width: "6px",
            cursor: "ew-resize",
            background: "transparent",
            zIndex: 10,
          }}
          title="Arraste para redimensionar"
        >
          <div style={{
            position: "absolute", left: "2px", top: "50%", transform: "translateY(-50%)",
            width: "2px", height: "40px", borderRadius: "2px",
            background: "var(--border)",
            opacity: 0.6,
          }} />
        </div>
        {/* Cabeçalho */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 20px", borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}>
          <span style={{ fontWeight: 600, fontSize: "14px" }}>{title}</span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: "4px" }}
          >
            ✕
          </button>
        </div>
        {/* Conteúdo */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Map as MapIcon, Download, Plus, X, Eye, EyeOff, Loader2,
  Radio, Box, Cable, Navigation, Users, Trash2,
  FileDown, MousePointer2, Search, Layers, Upload,
  Folder, FolderPlus, FolderOpen, ChevronRight, Check, Tag,
  Pencil, Link2, Link2Off, GitMerge, AlertTriangle, FileText, Unlink, RefreshCw,
  Lock, Unlock, ExternalLink, Move, CheckCircle2,
  Zap, Crosshair, MapPin, Copy, Signal, Wifi, FolderTree, ChevronDown, CornerDownRight,
  Milestone, Codesandbox, Wand2, ScanSearch, CircleDot, CheckCircle, XCircle, AlertCircle
} from "lucide-react";
import L from "leaflet";

/** Remove um layer/marker do Leaflet com segurança (evita NotFoundError removeChild) */
function safeLeafletRemove(layer: { remove: () => void } | null | undefined): void {
  if (!layer) return;
  try { layer.remove(); } catch (_e) { /* ignora erros de removeChild do DOM */ }
}

import { unzipSync, strFromU8 } from "fflate";
import { OltCreateDialog, OltDetailPanel } from "./OltMapComponents";
import { DgoCreateDialog, DgoDetailPanel } from "./DgoMapComponents";
import { getTenantSlug } from "@/const";

/** Gera URL com prefixo do tenant quando necessário. Ex: /topnet/ceo/455 */
function tenantUrl(path: string): string {
  const slug = getTenantSlug();
  return slug ? `/${slug}${path}` : path;
}

// Cores padrão de fibras ópticas (norma ABNT/EIA-598)
const FIBER_VIA_COLORS: Record<number, string> = {
  1:  "#00B050",  // verde
  2:  "#FFFF00",  // amarelo
  3:  "#FFFFFF",  // branco
  4:  "#0070C0",  // azul
  5:  "#FF0000",  // vermelho
  6:  "#7030A0",  // violeta
  7:  "#7B3F00",  // marrom
  8:  "#FF99CC",  // rosa
  9:  "#111827",  // preto
  10: "#808080",  // cinza
  11: "#FF6600",  // laranja
  12: "#00B0F0",  // aqua/turquesa
};

// Sub-componente para seletores de tubo (evita hooks em IIFE)
function TubeSelectors({ fromElId, toElId, fromTubeId, toTubeId, onChange }: {
  fromElId: number | null;
  toElId: number | null;
  fromTubeId: number | null;
  toTubeId: number | null;
  onChange: (field: "fromTubeId" | "toTubeId", value: number | null) => void;
}) {
  const fromTubesQuery = trpc.infraMap.tubesByElement.useQuery(
    { elementId: fromElId! },
    { enabled: fromElId != null }
  );
  const toTubesQuery = trpc.infraMap.tubesByElement.useQuery(
    { elementId: toElId! },
    { enabled: toElId != null }
  );
  const fromTubes = (fromTubesQuery.data ?? []) as { id: number; identifier: string; totalVias: number; color: string | null; type: string }[];
  const toTubes = (toTubesQuery.data ?? []) as { id: number; identifier: string; totalVias: number; color: string | null; type: string }[];
  if (!fromElId && !toElId) return null;
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1 text-xs text-muted-foreground"><span className="text-emerald-400 font-bold">DE</span> Tubo na Origem</Label>
        {fromElId ? (
          fromTubesQuery.isLoading ? (
            <div className="text-xs text-muted-foreground py-1">Carregando tubos...</div>
          ) : fromTubes.length === 0 ? (
            <div className="text-xs text-muted-foreground italic py-1">Nenhum tubo cadastrado</div>
          ) : (
            <Select
              value={fromTubeId != null ? String(fromTubeId) : "none"}
              onValueChange={v => onChange("fromTubeId", v === "none" ? null : Number(v))}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Nenhum">{fromTubes.find(t => t.id === fromTubeId)?.identifier ?? "Nenhum"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {fromTubes.map(t => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    <span className="flex items-center gap-1">
                      <span className="text-[10px] font-bold text-emerald-400">{t.type === "splitter" ? "SPL" : "TUB"}</span>
                      {t.identifier} <span className="text-muted-foreground">({t.totalVias}v)</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        ) : <div className="text-xs text-muted-foreground italic py-1">Selecione a origem</div>}
      </div>
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1 text-xs text-muted-foreground"><span className="text-cyan-400 font-bold">PARA</span> Tubo no Destino</Label>
        {toElId ? (
          toTubesQuery.isLoading ? (
            <div className="text-xs text-muted-foreground py-1">Carregando tubos...</div>
          ) : toTubes.length === 0 ? (
            <div className="text-xs text-muted-foreground italic py-1">Nenhum tubo cadastrado</div>
          ) : (
            <Select
              value={toTubeId != null ? String(toTubeId) : "none"}
              onValueChange={v => onChange("toTubeId", v === "none" ? null : Number(v))}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Nenhum">{toTubes.find(t => t.id === toTubeId)?.identifier ?? "Nenhum"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {toTubes.map(t => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    <span className="flex items-center gap-1">
                      <span className="text-[10px] font-bold text-cyan-400">{t.type === "splitter" ? "SPL" : "TUB"}</span>
                      {t.identifier} <span className="text-muted-foreground">({t.totalVias}v)</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        ) : <div className="text-xs text-muted-foreground italic py-1">Selecione o destino</div>}
      </div>
    </div>
  );
}

type MapElement = {
  id: number; type: "ceo" | "cto"; referenceId: number;
  lat: number; lng: number; name?: string; status?: string;
  capacity?: number; usedPorts?: number; sgpId?: number | null;
  color?: string | null;
};
type MapRoute = {
  id: number; fromElementId: number; toElementId: number;
  fromTubeId?: number | null; toTubeId?: number | null;
  name?: string | null; cableType?: string | null; fiberCount?: number | null;
  color?: string | null; notes?: string | null; path?: string | null;
};
type MapPoi = { id: number; name: string; category: string; lat: number | string; lng: number | string; color: string | null; notes: string | null; groups?: number[] };
type SidePanelContent = { kind: "element"; element: MapElement } | { kind: "route"; route: MapRoute } | { kind: "poi"; poi: MapPoi } | null;

const STATUS_COLOR: Record<string, string> = {
  active: "#22c55e", maintenance: "#f59e0b", inactive: "#ef4444",
};

function createLeafletIcon(
  type: "ceo" | "cto",
  status: string,
  name: string,
  selected = false,
  onuBadge?: { total: number; online?: number } | null,
  customColor?: string | null,
  showName = true
) {
  const safeName = name.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // Badge de ONUs: verde se todos online, amarelo se parcial, cinza se só total
  let badgeHtml = "";
  if (type === "cto" && onuBadge && onuBadge.total > 0) {
    const hasOnline = onuBadge.online != null;
    const allOnline = hasOnline && onuBadge.online === onuBadge.total;
    const noneOnline = hasOnline && onuBadge.online === 0;
    const badgeColor = !hasOnline ? "rgba(100,116,139,0.9)" : allOnline ? "rgba(16,185,129,0.9)" : noneOnline ? "rgba(239,68,68,0.85)" : "rgba(234,179,8,0.9)";
    const badgeText = hasOnline ? `${onuBadge.online}/${onuBadge.total}` : `${onuBadge.total}`;
    badgeHtml = `<div style="background:${badgeColor};color:white;font-size:9px;font-weight:700;padding:0px 3px;border-radius:3px;margin-top:1px;white-space:nowrap;line-height:14px;">${badgeText}</div>`;
  }
  const nameHtml = showName ? `<div style="background:rgba(0,0,0,0.75);color:white;font-size:10px;font-weight:600;padding:1px 4px;border-radius:3px;margin-top:2px;white-space:nowrap;max-width:80px;overflow:hidden;text-overflow:ellipsis;">${safeName}</div>` : "";
  // Indicador de status: ponto colorido abaixo da imagem
  const statusColor = customColor ?? STATUS_COLOR[status] ?? "#6b7280";
  const selectedRing = selected ? `<div style="position:absolute;inset:-3px;border:3px solid #22d3ee;border-radius:4px;pointer-events:none;"></div>` : "";
  const imgSrc = type === "cto" ? "/icons/cto.png" : "/icons/ceo.png";
  // Imagem diretamente sem container branco — apenas sombra e anel de seleção
  const iconHtml = `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;"><div style="position:relative;display:inline-flex;"><img src="${imgSrc}" style="width:48px;height:48px;object-fit:contain;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.6));" />${selectedRing}<div style="position:absolute;bottom:-4px;left:50%;transform:translateX(-50%);width:10px;height:4px;background:${statusColor};border-radius:2px;"></div></div>${nameHtml}${badgeHtml}</div>`;
  return L.divIcon({ html: iconHtml, className: "", iconSize: [80, onuBadge && onuBadge.total > 0 ? 70 : 58], iconAnchor: [40, 24] });
}

// Calcula distância em metros entre dois pontos (Haversine)
function haversineDistance(latlngs: L.LatLngExpression[]): number {
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

function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters)} m`;
}

export default function InfrastructureMap() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "operator";

  const utils = trpc.useUtils();
  // staleTime: 2 min — dados do mapa mudam raramente, não precisam recarregar a cada foco de janela
  const MAP_QUERY_OPTS = { staleTime: 2 * 60 * 1000, refetchOnWindowFocus: false } as const;
  const { data: elements = [], refetch: refetchElements } = trpc.infraMap.elements.useQuery(undefined, MAP_QUERY_OPTS);
  const { data: routes = [], refetch: refetchRoutes } = trpc.infraMap.routes.useQuery(undefined, MAP_QUERY_OPTS);
  const { data: routesOccupancy = [] } = trpc.infraMap.routesOccupancy.useQuery(undefined, MAP_QUERY_OPTS);
  const { data: ctos = [], refetch: refetchCtos } = trpc.ctos.list.useQuery(undefined, MAP_QUERY_OPTS);
  const { data: ceosRaw = [], refetch: refetchCeos } = trpc.ceos.list.useQuery({}, MAP_QUERY_OPTS);
  const ceos = ceosRaw as any[];
  const { data: sysConfig } = trpc.systemConfig.get.useQuery(undefined, { staleTime: 10 * 60 * 1000, refetchOnWindowFocus: false });
  // OLT elements no mapa
  const { data: oltElements = [], refetch: refetchOltElements } = trpc.infraMap.oltElements.useQuery(undefined, MAP_QUERY_OPTS);
  const [showOlts, setShowOlts] = useState(true);
  const [addingOltMode, setAddingOltMode] = useState(false);
  const [oltAddDialogOpen, setOltAddDialogOpen] = useState(false);
  const [oltAddLat, setOltAddLat] = useState(0);
  const [oltAddLng, setOltAddLng] = useState(0);
  const [oltAddEquipmentId, setOltAddEquipmentId] = useState<number | null>(null);
  const [oltAddTxPower, setOltAddTxPower] = useState("5.0");
  const [oltAddAttenuation, setOltAddAttenuation] = useState("0.35");
  const [oltAddFusionLoss, setOltAddFusionLoss] = useState("0.1");
  const [oltAddNotes, setOltAddNotes] = useState("");
  const [selectedOltElementId, setSelectedOltElementId] = useState<number | null>(null);
  const [oltDetailPanelOpen, setOltDetailPanelOpen] = useState(false);
  const oltMarkersRef = useRef<Record<number, L.Marker>>({});
  // DGO no mapa
  const { data: dgoElements = [], refetch: refetchDgoElements } = trpc.infraMap.dgoElements.useQuery(undefined, { staleTime: 30000, refetchOnWindowFocus: false });
  const [showDgos, setShowDgos] = useState(true);
  const [addingDgoMode, setAddingDgoMode] = useState(false);
  const [dgoCreateDialogOpen, setDgoCreateDialogOpen] = useState(false);
  const [dgoCreateLat, setDgoCreateLat] = useState(0);
  const [dgoCreateLng, setDgoCreateLng] = useState(0);
  const [selectedDgoElementId, setSelectedDgoElementId] = useState<number | null>(null);
  const [dgoDetailPanelOpen, setDgoDetailPanelOpen] = useState(false);
  const [pendingDgoFiberLinkRouteId, setPendingDgoFiberLinkRouteId] = useState<number | null>(null);
  const [isDraggingRoute, setIsDraggingRoute] = useState(false);
  const dgoMarkersRef = useRef<Record<number, L.Marker>>({});
  const [movingDgoId, setMovingDgoId] = useState<number | null>(null);
  const [pendingDgoMovePos, setPendingDgoMovePos] = useState<{ id: number; lat: number; lng: number } | null>(null);
  // Postes no mapa
  const { data: mapPoles = [], refetch: refetchPoles } = trpc.mapPoles.list.useQuery(undefined, MAP_QUERY_OPTS);
  const [showPoles, setShowPoles] = useState(false);
  const [addingPoleMode, setAddingPoleMode] = useState(false);
  const [poleDialogOpen, setPoleDialogOpen] = useState(false);
  const [poleDialogLat, setPoleDialogLat] = useState(0);
  const [poleDialogLng, setPoleDialogLng] = useState(0);
  const [poleForm, setPoleForm] = useState({ name: "", reference: "", effort: "", notes: "" });
  const [editingPoleId, setEditingPoleId] = useState<number | null>(null);
  const [deletePoleId, setDeletePoleId] = useState<number | null>(null);
  const poleMarkersRef = useRef<Record<number, L.Marker>>({});
  // Reservas Técnicas no mapa
  const { data: mapReserves = [], refetch: refetchReserves } = trpc.mapTechnicalReserves.list.useQuery(undefined, MAP_QUERY_OPTS);
  const [showReserves, setShowReserves] = useState(false);
  const [addingReserveMode, setAddingReserveMode] = useState(false);
  const [reserveDialogOpen, setReserveDialogOpen] = useState(false);
  const [reserveDialogLat, setReserveDialogLat] = useState(0);
  const [reserveDialogLng, setReserveDialogLng] = useState(0);
  const [reserveForm, setReserveForm] = useState({ name: "", sizeMeters: 0, routeId: null as number | null, notes: "" });
  const [editingReserveId, setEditingReserveId] = useState<number | null>(null);
  const [deleteReserveId, setDeleteReserveId] = useState<number | null>(null);
  const reserveMarkersRef = useRef<Record<number, L.Marker>>({});
  // POIs (Pontos de Interesse) no mapa
  const [showPois, setShowPois] = useState(false);
  const poiMarkersRef = useRef<Record<number, L.Marker>>({});
  const [editingPoi, setEditingPoi] = useState(false);
  const [poiEditForm, setPoiEditForm] = useState({ name: "", category: "geral", color: "#6366f1", notes: "" });
  const [addingPoiMode, setAddingPoiMode] = useState(false);
  const [poiDialogOpen, setPoiDialogOpen] = useState(false);
  const [poiDialogLat, setPoiDialogLat] = useState(0);
  const [poiDialogLng, setPoiDialogLng] = useState(0);
  const [poiCreateForm, setPoiCreateForm] = useState({ name: "", category: "geral", notes: "", groupId: null as number | null });
  // Contagem de ONUs por sgpId (total do splitter/all, online actualizado após clique)
  const { data: onuCountsData } = trpc.sgp.getOnuCounts.useQuery(undefined, { staleTime: 5 * 60 * 1000 });
  // Estado local para guardar contagem online após cada consulta ao /onu/all/
  const [onlineCounts, setOnlineCounts] = useState<Record<number, number>>({});
  // Mapa sgpId → { total, online? } para passar ao createLeafletIcon
  const onuCountMap = useMemo(() => {
    const m: Record<number, { total: number; online?: number }> = {};
    const counts = (onuCountsData as any)?.counts ?? {};
    for (const [id, v] of Object.entries(counts)) {
      const numId = Number(id);
      m[numId] = { total: (v as any).total ?? 0, online: onlineCounts[numId] };
    }
    return m;
  }, [onuCountsData, onlineCounts]);

  // Mapa de ocupação por routeId
  const occupancyMap = useMemo(() => {
    const m: Record<number, number> = {};
    (routesOccupancy as any[]).forEach((o: any) => { m[o.routeId] = o.pct; });
    return m;
  }, [routesOccupancy]);
  const getOccupancyColor = useCallback((routeId: number, baseColor: string) => {
    // Sempre usar a cor do cadastro do cabo, independente da ocupação das vias
    return baseColor ?? "#22d3ee";
  }, []);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Record<number, L.Marker>>({});
  const polylinesRef = useRef<Record<number, L.Polyline>>({});
  const routeLabelsRef = useRef<Record<number, L.Marker>>({});
  // Cache de ícones Leaflet: evita recriar L.divIcon quando nada mudou no marcador
  const iconCacheRef = useRef<Record<string, any>>({});
  // Estado anterior dos marcadores para diff incremental
  const prevMarkerStateRef = useRef<Record<number, string>>({});
  // Estado anterior das polylines para diff incremental
  const prevRouteStateRef = useRef<Record<number, string>>({});
  const previewPolylineRef = useRef<L.Polyline | null>(null);
  const mousePolylineRef = useRef<L.Polyline | null>(null);
  const drawingMarkersRef = useRef<L.CircleMarker[]>([]);
  const [mapReady, setMapReady] = useState(false);

  const [sidePanel, setSidePanel] = useState<SidePanelContent>(null);
  const [showCeos, setShowCeos] = useState(true);
  const [showCtos, setShowCtos] = useState(true);
  const [showRoutes, setShowRoutes] = useState(true);
  const [showElementNames, setShowElementNames] = useState(() => {
    const v = localStorage.getItem('map_showElementNames');
    return v === null ? true : v === '1';
  });
  const [showCableLabels, setShowCableLabels] = useState(() => {
    const v = localStorage.getItem('map_showCableLabels');
    return v === null ? true : v === '1';
  });
  // Modo edição: quando false, os markers ficam bloqueados (não arrastáveis)
  const [editMode, setEditMode] = useState(false);
  // Elemento em modo de mover individualmente (drag individual sem modo edição global)
  const [movingElementId, setMovingElementId] = useState<number | null>(null);
  // Posição pendente após drag — aguarda confirmação do utilizador
  const [pendingMovePos, setPendingMovePos] = useState<{ id: number; lat: number; lng: number } | null>(null);
  // POI em modo mover
  const [movingPoiId, setMovingPoiId] = useState<number | null>(null);
  const [pendingPoiMovePos, setPendingPoiMovePos] = useState<{ id: number; lat: number; lng: number } | null>(null);
  // OLT em modo mover
  const [movingOltId, setMovingOltId] = useState<number | null>(null);
  const [pendingOltMovePos, setPendingOltMovePos] = useState<{ id: number; lat: number; lng: number } | null>(null);
  // Painel de detalhes sobreposto ao mapa (Sheet)
  const [detailPanel, setDetailPanel] = useState<{ type: "ceo" | "cto"; id: number } | null>(null);
  const [addingMode, setAddingMode] = useState<"ceo" | "cto" | null>(null);
  const addingModeRef = useRef<"ceo" | "cto" | null>(null);
  const groupSelectModeRef = useRef(false);
  const addingRouteModeRef = useRef(false);
  const otdrModeRef = useRef(false);
  // Refs para evitar stale closure no handler dragend dos marcadores
  const movingElementIdRef = useRef<number | null>(null);
  const editModeRef = useRef(false);
  const [addingRouteMode, setAddingRouteMode] = useState(false);
  const [routeFrom, setRouteFrom] = useState<number | null>(null);
  const [routeTo, setRouteTo] = useState<number | null>(null);
  const [drawingPath, setDrawingPath] = useState<{ lat: number; lng: number }[]>([]);
  const [routeDialogOpen, setRouteDialogOpen] = useState(false);
  const [routeForm, setRouteForm] = useState({ name: "", cableType: "FO", fiberCount: 12, color: "#22d3ee", notes: "" });
  const [deleteElementId, setDeleteElementId] = useState<{ id: number; type: string; referenceId: number } | null>(null);
  const [deleteRouteId, setDeleteRouteId] = useState<number | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [cablesReportOpen, setCablesReportOpen] = useState(false);
  const [cablesReportLoading, setCablesReportLoading] = useState(false);
  const [cablesGroupSummary, setCablesGroupSummary] = useState<any[] | null>(null);
  const [cablesFilterGroups, setCablesFilterGroups] = useState<Set<string>>(new Set(["all"]));
  const exportCablesMut = trpc.infraMap.exportCables.useMutation();
  const [expandedExportGrps, setExpandedExportGrps] = useState<Set<number>>(new Set());
  const [exportFormat, setExportFormat] = useState<"kml" | "kmz">("kmz");
  const [exportLoading, setExportLoading] = useState(false);
  const [exportSelectedElements, setExportSelectedElements] = useState<Set<number>>(new Set());
  const [exportSelectedRoutes, setExportSelectedRoutes] = useState<Set<number>>(new Set());
  const [exportSelectAll, setExportSelectAll] = useState(true);
  const [exportIncludeFibers, setExportIncludeFibers] = useState(false);
  const [exportTypeCto, setExportTypeCto] = useState(true);
  const [exportTypeCeo, setExportTypeCeo] = useState(true);
  const [exportTypeCabo, setExportTypeCabo] = useState(true);
  const [exportIncludePoles, setExportIncludePoles] = useState(true);
  const [exportIncludeReserves, setExportIncludeReserves] = useState(true);
  const [exportIncludePois, setExportIncludePois] = useState(true);
  const [exportIncludeFusions, setExportIncludeFusions] = useState(true);
  const [exportGroupId, setExportGroupId] = useState<number | null>(null);
  const [exportOnlyVisible, setExportOnlyVisible] = useState(false);
  const [groupSelectMode, setGroupSelectMode] = useState(false);
  // ─── Viabilidade Técnica ───────────────────────────────────────────────────────
  const [viabilityMode, setViabilityMode] = useState(false);
  const [viabilityPoint, setViabilityPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [viabilityRadius, setViabilityRadius] = useState<number>(500);
  const [viabilityResults, setViabilityResults] = useState<{ id: number; name: string; lat: number; lng: number; capacity: number; usedPorts: number; distance: number; routeDistance: number | null; routeDuration: number | null; routeCoords: [number,number][] | null; status: string }[]>([]);
  const [viabilityCircleRef, setViabilityCircleRef] = useState<L.Circle | null>(null);
  const [viabilityMarkerRef, setViabilityMarkerRef] = useState<L.Marker | null>(null);
  const viabilityPolylinesRef = useRef<L.Polyline[]>([]);
  const viabilityLabelsRef = useRef<L.Marker[]>([]);
  const [viabilityLoadingRoutes, setViabilityLoadingRoutes] = useState(false);
  const [viabilityHoveredId, setViabilityHoveredId] = useState<number | null>(null);
  const viabilityModeRef = useRef(false);
  const [mapBoxSelectRect, setMapBoxSelectRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const mapBoxSelectStartRef = useRef<{ x: number; y: number } | null>(null);
  const [groupSelectedElements, setGroupSelectedElements] = useState<Set<number>>(new Set());
  const [groupSelectedRoutes, setGroupSelectedRoutes] = useState<Set<number>>(new Set());
  const [groupSelectedPoles, setGroupSelectedPoles] = useState<Set<number>>(new Set());
  const [pickDialogOpen, setPickDialogOpen] = useState(false);
  // pickDialogKey força re-render do diálogo quando abre (refs não causam re-render)
  const [pickDialogKey, setPickDialogKey] = useState(0);
  // pickDialogTypeRef: definido sincronamente no handler do mapa, antes de qualquer re-render
  const pickDialogTypeRef = useRef<"ceo" | "cto">("cto");
  const [pickDialogLat, setPickDialogLat] = useState(0);
  const [pickDialogLng, setPickDialogLng] = useState(0);
  const [pickSelectedId, setPickSelectedId] = useState<number | null>(null);
  const [pickCreateNew, setPickCreateNew] = useState(false);
  const [pickNewName, setPickNewName] = useState("");
  const [pickNewAddress, setPickNewAddress] = useState("");
  const [pickNewCapacity, setPickNewCapacity] = useState(8);
  const [geocodeLoading, setGeocodeLoading] = useState(false);
  const fetchReverseGeocode = useCallback(async (lat: number, lng: number) => {
    setGeocodeLoading(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=pt-BR`);
      const data = await res.json();
      if (data?.display_name) setPickNewAddress(data.display_name);
      else toast.error("Endereço não encontrado para esta localização");
    } catch {
      toast.error("Erro ao buscar endereço");
    } finally {
      setGeocodeLoading(false);
    }
  }, []);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [satelliteMode, setSatelliteMode] = useState(false);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const [kmlImportOpen, setKmlImportOpen] = useState(false);
  const [kmlImportLoading, setKmlImportLoading] = useState(false);
  const [kmlImportResult, setKmlImportResult] = useState<{ added: number; skipped: number; errors: string[]; byType: Record<string, number> } | null>(null);
  const kmlFileRef = useRef<HTMLInputElement | null>(null);
  // Pré-visualização KML
  type KmlPreviewItem = {
    id: string;
    name: string;
    type: "cto" | "ceo" | "cabo" | "poste" | "reserva" | "poi";
    color: string | null;
    lat: number | null;
    lng: number | null;
    path: string | null;
    fiberName: string | null;
    include: boolean;
    folderName: string;
    fiberCount: number;
    cableType: string;
    capacity: number;
    sizeMeters: number;
    iconHref: string;     // URL do ícone original do KML
    selected: boolean;    // selecionado para edição em lote
    poiCategory: string;  // categoria do POI
  };
  const [kmlPreviewItems, setKmlPreviewItems] = useState<KmlPreviewItem[]>([]);
  const [kmlPreviewOpen, setKmlPreviewOpen] = useState(false);
  const [kmlImportingPreview, setKmlImportingPreview] = useState(false);
  const [kmlImportProgress, setKmlImportProgress] = useState(0);
  const [kmlImportTotal, setKmlImportTotal] = useState(0);
  const [kmlPreviewFilter, setKmlPreviewFilter] = useState<"all" | "cto" | "ceo" | "cabo" | "poste" | "reserva" | "poi">("all");
  const [kmlImportTargetGroupId, setKmlImportTargetGroupId] = useState<number | null>(null);
  const [kmlBatchType, setKmlBatchType] = useState<string>("");  // tipo para edição em lote
  const [kmlIconPanelOpen, setKmlIconPanelOpen] = useState(false); // painel de reconhecimento por ícone

  // ─── Edição de Traçado de Cabo ────────────────────────────────────────────
  const [editingRouteId, setEditingRouteId] = useState<number | null>(null);
  const editingRouteIdRef = useRef<number | null>(null);
  const [editingRoutePath, setEditingRoutePath] = useState<{ lat: number; lng: number }[]>([]);
  const editRouteMarkersRef = useRef<L.CircleMarker[]>([]);
  const editRouteMidMarkersRef = useRef<L.CircleMarker[]>([]);
  const editRoutePolylineRef = useRef<L.Polyline | null>(null);
  const editingRoutePathRef = useRef<{ lat: number; lng: number }[]>([]);
  // Snap: IDs dos elementos vinculados durante edição (podem mudar ao arrastar endpoints)
  const snapFromIdRef = useRef<number | null>(null);
  const snapToIdRef = useRef<number | null>(null);
  const snapIndicatorRef = useRef<L.CircleMarker | null>(null);
  // Ref para elements sempre actualizada (evita closure stale no renderEditRouteMarkers)
  const elementsRef = useRef<any[]>([]);
  // Actualizar a ref sempre que elements muda (deve estar DEPOIS do useRef)
  elementsRef.current = elements as any[];
  // Ref para dgoElements sempre actualizada (para snap no traçado)
  const dgoElementsRef = useRef<any[]>([]);
  dgoElementsRef.current = dgoElements as any[];

  // Edição inline de CEO/CTO/Cabo pelo painel lateral
  const [editElementDialogOpen, setEditElementDialogOpen] = useState(false);
  const [editElementForm, setEditElementForm] = useState({ name: "", address: "", capacity: 8, status: "active", notes: "", color: "" });
  const [editRouteDialogOpen, setEditRouteDialogOpen] = useState(false);
  const [editRouteForm, setEditRouteForm] = useState({ name: "", cableType: "FO", fiberCount: 12, color: "#22d3ee", notes: "", fromElementId: null as number | null, toElementId: null as number | null, fromTubeId: null as number | null, toTubeId: null as number | null });
  const [fromSearch, setFromSearch] = useState("");
  const [toSearch, setToSearch] = useState("");
  // Dividir cabo no meio
  const [splitRouteOpen, setSplitRouteOpen] = useState(false);
  const [splitRoutePointIdx, setSplitRoutePointIdx] = useState<number | null>(null);
  const [splitRouteSearch, setSplitRouteSearch] = useState("");
  const [splitRouteSelectedEl, setSplitRouteSelectedEl] = useState<number | null>(null);
  // Associar extremos de cabos importados a equipamentos
  const [linkEndpointsOpen, setLinkEndpointsOpen] = useState(false);
  const [linkEndpointsRouteId, setLinkEndpointsRouteId] = useState<number | null>(null);
  const [linkEndpointsFrom, setLinkEndpointsFrom] = useState<number | null>(null);
  const [linkEndpointsTo, setLinkEndpointsTo] = useState<number | null>(null);
  const [linkEndpointsFromSearch, setLinkEndpointsFromSearch] = useState("");
  const [linkEndpointsToSearch, setLinkEndpointsToSearch] = useState("");
  // Posição da janela flutuante de associação (arrastável)
  const [linkEndpointsPos, setLinkEndpointsPos] = useState<{ x: number; y: number } | null>(null);
  const linkEndpointsDragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  // Modo de seleção por clique no mapa: "from" | "to" | null
  const [linkEndpointsPickMode, setLinkEndpointsPickMode] = useState<"from" | "to" | null>(null);
  const linkEndpointsPickModeRef = useRef<"from" | "to" | null>(null);
  const linkEndpointsFromRef = useRef<number | null>(null);
  const linkEndpointsToRef = useRef<number | null>(null);

  // Grupos/Pastas
  const { data: mapGroups = [], refetch: refetchGroups } = trpc.mapGroups.list.useQuery(undefined, MAP_QUERY_OPTS);
  const [groupsPanelOpen, setGroupsPanelOpen] = useState(false);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupForm, setGroupForm] = useState({ name: "", color: "#6366f1", description: "", parentId: null as number | null });
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [activeGroupFilter, setActiveGroupFilter] = useState<number | null>(null);
  const [assignGroupDialogOpen, setAssignGroupDialogOpen] = useState(false);
  const [assignGroupId, setAssignGroupId] = useState<number | null>(null);
  const [quickAssignDialogOpen, setQuickAssignDialogOpen] = useState(false);
  const [quickAssignGroupId, setQuickAssignGroupId] = useState<number | null>(null);
  const [expandedPickerGroups, setExpandedPickerGroups] = useState<Set<number>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [expandedGroupElements, setExpandedGroupElements] = useState<Set<number>>(new Set([-1]));
  const [expandedGroupItems, setExpandedGroupItems] = useState<Set<number>>(new Set()); // seta para minimizar itens dentro da pasta
  const [deletingGroupId, setDeletingGroupId] = useState<number | null>(null); // confirmação exclusão de pasta
  const [dragOverGroupId, setDragOverGroupId] = useState<number | null>(null); // drag-and-drop entre pastas
  const [dragFolderId, setDragFolderId] = useState<number | null>(null); // pasta sendo arrastada
  const [dragFolderOverId, setDragFolderOverId] = useState<number | null>(null); // pasta alvo do arrasto de pasta
  const [folderDropPosition, setFolderDropPosition] = useState<{ groupId: number; pos: 'before' | 'after' | 'inside' } | null>(null); // indicador de posição no drag de pasta
  const [groupSearch, setGroupSearch] = useState(""); // filtro de busca no painel de grupos
  const [isOrganizing, setIsOrganizing] = useState(false); // auto-organizar postes e reservas em pastas
  const [checkedItems, setCheckedItems] = useState<{ elements: Set<number>; routes: Set<number>; poles: Set<number>; reserves: Set<number>; pois: Set<number>; olts: Set<number> }>({ elements: new Set(), routes: new Set(), poles: new Set(), reserves: new Set(), pois: new Set(), olts: new Set() });
  const [checkedGroupId, setCheckedGroupId] = useState<number | null>(null); // grupo de onde os itens foram marcados
  // ─── Drag-to-select no painel de grupos ───
  const [dragSelectActive, setDragSelectActive] = useState(false);
  const [dragSelectRect, setDragSelectRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const dragSelectStartRef = useRef<{ x: number; y: number } | null>(null);
  const groupsPanelScrollRef = useRef<HTMLDivElement>(null);
  const itemElemsRef = useRef<Map<string, { id: number; type: string; groupId: number; el: HTMLElement }>>(new Map());
  const groupsPanelContainerRef = useRef<HTMLDivElement>(null);
  // Drag-to-select: callback ref que registra/remove listeners quando o container monta/desmonta
  const groupsPanelCallbackRef = useCallback((container: HTMLDivElement | null) => {
    (groupsPanelContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = container;
    if (!container) return;

    const onMouseDown = (e: MouseEvent) => {
      if (!container.contains(e.target as Node)) return;
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest('button') || target.closest('[role="checkbox"]') || target.closest('input') || target.closest('a')) return;
      if (mapRef.current) mapRef.current.dragging.disable();
      dragSelectStartRef.current = { x: e.clientX, y: e.clientY };
      setDragSelectActive(false);
      setDragSelectRect(null);
      e.stopPropagation();
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!dragSelectStartRef.current) return;
      e.stopPropagation();
      const dx = Math.abs(e.clientX - dragSelectStartRef.current.x);
      const dy = Math.abs(e.clientY - dragSelectStartRef.current.y);
      if (dx > 5 || dy > 5) {
        setDragSelectActive(true);
        const containerRect = container.getBoundingClientRect();
        const scrollTop = groupsPanelScrollRef.current?.scrollTop ?? 0;
        const startRelX = dragSelectStartRef.current.x - containerRect.left;
        const startRelY = dragSelectStartRef.current.y - containerRect.top + scrollTop;
        const curRelX = e.clientX - containerRect.left;
        const curRelY = e.clientY - containerRect.top + scrollTop;
        setDragSelectRect({
          x: Math.min(startRelX, curRelX),
          y: Math.min(startRelY, curRelY),
          w: Math.abs(curRelX - startRelX),
          h: Math.abs(curRelY - startRelY),
        });
        const selLeft = Math.min(e.clientX, dragSelectStartRef.current.x);
        const selRight = Math.max(e.clientX, dragSelectStartRef.current.x);
        const selTop = Math.min(e.clientY, dragSelectStartRef.current.y);
        const selBottom = Math.max(e.clientY, dragSelectStartRef.current.y);
        const newChecked: { elements: Set<number>; routes: Set<number>; poles: Set<number>; reserves: Set<number>; pois: Set<number>; olts: Set<number> } = { elements: new Set(), routes: new Set(), poles: new Set(), reserves: new Set(), pois: new Set(), olts: new Set() };
        let foundGroupId: number | null = null;
        itemElemsRef.current.forEach((item) => {
          const r = item.el.getBoundingClientRect();
          if (r.left < selRight && r.right > selLeft && r.top < selBottom && r.bottom > selTop) {
            if (item.type === 'element') newChecked.elements.add(item.id);
            else if (item.type === 'route') newChecked.routes.add(item.id);
            else if (item.type === 'pole') newChecked.poles.add(item.id);
            else if (item.type === 'reserve') newChecked.reserves.add(item.id);
            else if (item.type === 'poi') newChecked.pois.add(item.id);
            else if (item.type === 'olt') newChecked.olts.add(item.id);
            foundGroupId = item.groupId;
          }
        });
        setCheckedItems(newChecked);
        if (foundGroupId !== null) setCheckedGroupId(foundGroupId);
      }
    };

    const onMouseUp = () => {
      if (dragSelectStartRef.current) {
        dragSelectStartRef.current = null;
        setDragSelectActive(false);
        setDragSelectRect(null);
        if (mapRef.current) mapRef.current.dragging.enable();
      }
    };

    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('mouseup', onMouseUp, true);
    // Retornar cleanup (armazenar no container para ser chamado quando desmonta)
    (container as any).__dragCleanup = () => {
      document.removeEventListener('mousedown', onMouseDown, true);
      document.removeEventListener('mousemove', onMouseMove, true);
      document.removeEventListener('mouseup', onMouseUp, true);
      if (mapRef.current) mapRef.current.dragging.enable();
    };
  }, []);
  // ─── Mover para grupo e exclusão em massa ───
  const [moveToGroupDialogOpen, setMoveToGroupDialogOpen] = useState(false);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const toggleCheckedElement = (id: number, gid?: number) => { if (gid !== undefined) setCheckedGroupId(gid); setCheckedItems(prev => { const e = new Set(prev.elements); if (e.has(id)) e.delete(id); else e.add(id); return { ...prev, elements: e }; }); };
  const toggleCheckedRoute = (id: number, gid?: number) => { if (gid !== undefined) setCheckedGroupId(gid); setCheckedItems(prev => { const r = new Set(prev.routes); if (r.has(id)) r.delete(id); else r.add(id); return { ...prev, routes: r }; }); };
  const toggleCheckedPole = (id: number, gid?: number) => { if (gid !== undefined) setCheckedGroupId(gid); setCheckedItems(prev => { const p = new Set(prev.poles); if (p.has(id)) p.delete(id); else p.add(id); return { ...prev, poles: p }; }); };
  const toggleCheckedReserve = (id: number, gid?: number) => { if (gid !== undefined) setCheckedGroupId(gid); setCheckedItems(prev => { const r = new Set(prev.reserves); if (r.has(id)) r.delete(id); else r.add(id); return { ...prev, reserves: r }; }); };
  const toggleCheckedPoi = (id: number, gid?: number) => { if (gid !== undefined) setCheckedGroupId(gid); setCheckedItems(prev => { const p = new Set(prev.pois); if (p.has(id)) p.delete(id); else p.add(id); return { ...prev, pois: p }; }); };
  const toggleCheckedOlt = (id: number, gid?: number) => { if (gid !== undefined) setCheckedGroupId(gid); setCheckedItems(prev => { const o = new Set(prev.olts); if (o.has(id)) o.delete(id); else o.add(id); return { ...prev, olts: o }; }); };
  const totalChecked = checkedItems.elements.size + checkedItems.routes.size + checkedItems.poles.size + checkedItems.reserves.size + checkedItems.pois.size + checkedItems.olts.size;
  const handleExportChecked = () => { setExportSelectedElements(new Set(checkedItems.elements)); setExportSelectedRoutes(new Set(checkedItems.routes)); setExportSelectAll(false); setExportDialogOpen(true); };
  const clearCheckedItems = () => { setCheckedItems({ elements: new Set(), routes: new Set(), poles: new Set(), reserves: new Set(), pois: new Set(), olts: new Set() }); setCheckedGroupId(null); };

  // ─── Visibilidade por grupo e por item (bidirecional, estilo Google Earth) ───
  // Helpers de persistência no localStorage
  const LS_KEY = "fiberdoc_map_visibility";
  const loadVisibility = () => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      return {
        groups: new Set<number>(d.groups ?? []),
        elements: new Set<number>(d.elements ?? []),
        routes: new Set<number>(d.routes ?? []),
        poles: new Set<number>(d.poles ?? []),
        reserves: new Set<number>(d.reserves ?? []),
        pois: new Set<number>(d.pois ?? []),
        olts: new Set<number>(d.olts ?? []),
      };
    } catch { return null; }
  };
  const saveVisibility = useCallback((groups: Set<number>, elements: Set<number>, routes: Set<number>, poles: Set<number>, reserves: Set<number>, pois: Set<number>, olts: Set<number>) => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        groups: Array.from(groups), elements: Array.from(elements), routes: Array.from(routes),
        poles: Array.from(poles), reserves: Array.from(reserves), pois: Array.from(pois), olts: Array.from(olts),
      }));
    } catch {}
  }, []);
  const _initVis = loadVisibility();
  const [hiddenGroupIds, setHiddenGroupIds] = useState<Set<number>>(_initVis?.groups ?? new Set());
  const [hiddenElementIds, setHiddenElementIds] = useState<Set<number>>(_initVis?.elements ?? new Set());
  const [hiddenRouteIds, setHiddenRouteIds] = useState<Set<number>>(_initVis?.routes ?? new Set());
  const [hiddenPoleIds, setHiddenPoleIds] = useState<Set<number>>(_initVis?.poles ?? new Set());
  const [hiddenReserveIds, setHiddenReserveIds] = useState<Set<number>>(_initVis?.reserves ?? new Set());
  const [hiddenPoiIds, setHiddenPoiIds] = useState<Set<number>>(_initVis?.pois ?? new Set());
  const [hiddenOltIds, setHiddenOltIds] = useState<Set<number>>(_initVis?.olts ?? new Set());
  // Persiste no localStorage sempre que qualquer estado de visibilidade muda
  useEffect(() => {
    saveVisibility(hiddenGroupIds, hiddenElementIds, hiddenRouteIds, hiddenPoleIds, hiddenReserveIds, hiddenPoiIds, hiddenOltIds);
  }, [hiddenGroupIds, hiddenElementIds, hiddenRouteIds, hiddenPoleIds, hiddenReserveIds, hiddenPoiIds, hiddenOltIds, saveVisibility]);
  // Propaga visibilidade de grupo para todos os filhos recursivamente (estilo Google Earth)
  const setGroupVisibilityRecursive = useCallback((groupId: number, hide: boolean, allGroups: any[]) => {
    const childIds = allGroups.filter((g: any) => g.parentId === groupId).map((g: any) => g.id);
    setHiddenGroupIds(prev => {
      const n = new Set(prev);
      if (hide) n.add(groupId); else n.delete(groupId);
      const propagate = (gid: number) => {
        const kids = allGroups.filter((g: any) => g.parentId === gid).map((g: any) => g.id);
        kids.forEach((kid: number) => { if (hide) n.add(kid); else n.delete(kid); propagate(kid); });
      };
      propagate(groupId);
      return n;
    });
    // Propaga para itens do grupo e subgrupos
    const collectGroupIds = (gid: number): number[] => {
      const kids = allGroups.filter((g: any) => g.parentId === gid).map((g: any) => g.id);
      return [gid, ...kids.flatMap((kid: number) => collectGroupIds(kid))];
    };
    const allAffectedGroupIds = collectGroupIds(groupId);
    allAffectedGroupIds.forEach(gid => {
      const grp = allGroups.find((g: any) => g.id === gid);
      if (!grp) return;
      if (hide) {
        (grp.elements ?? []).forEach((e: any) => setHiddenElementIds(prev => { const n = new Set(prev); n.add(e.elementId); return n; }));
        (grp.routes ?? []).forEach((r: any) => setHiddenRouteIds(prev => { const n = new Set(prev); n.add(r.routeId); return n; }));
        (grp.poles ?? []).forEach((p: any) => setHiddenPoleIds(prev => { const n = new Set(prev); n.add(p.poleId); return n; }));
        (grp.reserves ?? []).forEach((r: any) => setHiddenReserveIds(prev => { const n = new Set(prev); n.add(r.reserveId); return n; }));
        (grp.pois ?? []).forEach((p: any) => setHiddenPoiIds(prev => { const n = new Set(prev); n.add(p.poiId); return n; }));
        (grp.olts ?? []).forEach((o: any) => setHiddenOltIds(prev => { const n = new Set(prev); n.add(o.oltId); return n; }));
      } else {
        (grp.elements ?? []).forEach((e: any) => setHiddenElementIds(prev => { const n = new Set(prev); n.delete(e.elementId); return n; }));
        (grp.routes ?? []).forEach((r: any) => setHiddenRouteIds(prev => { const n = new Set(prev); n.delete(r.routeId); return n; }));
        (grp.poles ?? []).forEach((p: any) => setHiddenPoleIds(prev => { const n = new Set(prev); n.delete(p.poleId); return n; }));
        (grp.reserves ?? []).forEach((r: any) => setHiddenReserveIds(prev => { const n = new Set(prev); n.delete(r.reserveId); return n; }));
        (grp.pois ?? []).forEach((p: any) => setHiddenPoiIds(prev => { const n = new Set(prev); n.delete(p.poiId); return n; }));
        (grp.olts ?? []).forEach((o: any) => setHiddenOltIds(prev => { const n = new Set(prev); n.delete(o.oltId); return n; }));
      }
    });
  }, []);
  const toggleGroupVisibility = useCallback((groupId: number) => {
    setHiddenGroupIds(prev => { const n = new Set(prev); if (n.has(groupId)) n.delete(groupId); else n.add(groupId); return n; });
  }, []);
  const toggleItemVisibility = useCallback((type: "element" | "route" | "pole" | "reserve" | "poi" | "olt", id: number) => {
    if (type === "element") setHiddenElementIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    else if (type === "route") setHiddenRouteIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    else if (type === "pole") setHiddenPoleIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    else if (type === "reserve") setHiddenReserveIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    else if (type === "poi") setHiddenPoiIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    else if (type === "olt") setHiddenOltIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);
  // Calcula se um elemento está oculto por grupo (pertence a pelo menos um grupo oculto)
  const isHiddenByGroup = useCallback((itemGroupIds: number[]) => {
    if (hiddenGroupIds.size === 0) return false;
    return itemGroupIds.some(gid => hiddenGroupIds.has(gid));
  }, [hiddenGroupIds]);

  const createGroupMut = trpc.mapGroups.create.useMutation({
    onSuccess: () => { refetchGroups(); setGroupDialogOpen(false); setGroupForm({ name: "", color: "#6366f1", description: "", parentId: null }); toast.success("Grupo criado"); },
    onError: (e) => toast.error(e.message),
  });
  const updateGroupMut = trpc.mapGroups.update.useMutation({
    onSuccess: () => { refetchGroups(); setGroupDialogOpen(false); setEditingGroupId(null); toast.success("Grupo atualizado"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteGroupMapMut = trpc.mapGroups.delete.useMutation({
    onSuccess: () => { refetchGroups(); if (activeGroupFilter === editingGroupId) setActiveGroupFilter(null); toast.success("Grupo excluído"); },
    onError: (e) => toast.error(e.message),
  });
  const reorderGroupMut = trpc.mapGroups.reorder.useMutation({
    onSuccess: () => refetchGroups(),
    onError: (e) => toast.error(e.message),
  });

  // Auto-organizar: criar pastas "Postes" e "Reservas Técnicas" e atribuir itens não agrupados
  const handleAutoOrganize = async () => {
    setIsOrganizing(true);
    try {
      const groups = mapGroups as any[];
      const poles = mapPoles as any[];
      const reserves = mapReserves as any[];
      // Postes sem pasta
      const unassignedPoles = poles.filter((p: any) => !(poleGroupMap[p.id]?.length));
      if (unassignedPoles.length > 0) {
        let posteGroup = groups.find((g: any) => g.name.toLowerCase() === "postes" && !g.parentId);
        if (!posteGroup) {
          const res = await createGroupMut.mutateAsync({ name: "Postes", color: "#78716c", description: "Postes cadastrados no mapa" });
          await refetchGroups();
          const updatedGroups = (mapGroups as any[]);
          posteGroup = updatedGroups.find((g: any) => g.name.toLowerCase() === "postes" && !g.parentId);
          if (!posteGroup) posteGroup = { id: (res as any).id };
        }
        for (const pole of unassignedPoles) {
          try { await assignPoleToGroupMut.mutateAsync({ poleId: pole.id, groupId: posteGroup.id }); } catch {}
        }
      }
      // Reservas Técnicas sem pasta
      const unassignedReserves = reserves.filter((r: any) => !(reserveGroupMap[r.id]?.length));
      if (unassignedReserves.length > 0) {
        let reserveGroup = groups.find((g: any) => g.name.toLowerCase().includes("reserva") && !g.parentId);
        if (!reserveGroup) {
          const res = await createGroupMut.mutateAsync({ name: "Reservas Técnicas", color: "#0891b2", description: "Reservas técnicas cadastradas no mapa" });
          await refetchGroups();
          const updatedGroups = (mapGroups as any[]);
          reserveGroup = updatedGroups.find((g: any) => g.name.toLowerCase().includes("reserva") && !g.parentId);
          if (!reserveGroup) reserveGroup = { id: (res as any).id };
        }
        for (const reserve of unassignedReserves) {
          try { await assignReserveToGroupMut.mutateAsync({ reserveId: reserve.id, groupId: reserveGroup.id }); } catch {}
        }
      }
      await refetchGroups();
      const totalOrganized = unassignedPoles.length + unassignedReserves.length;
      if (totalOrganized > 0) {
        toast.success(`${totalOrganized} item(s) organizados em pastas`);
      } else {
        toast.info("Todos os postes e reservas já estão em pastas");
      }
    } catch (e: any) {
      toast.error("Erro ao organizar: " + (e?.message ?? "desconhecido"));
    } finally {
      setIsOrganizing(false);
    }
  };

  // Mutations de edição inline
  const updateCeoMut = trpc.ceos.update.useMutation({
    onSuccess: () => {
      mapUtils.ceos.list.invalidate();
      mapUtils.ceos.byId.invalidate();
      setEditElementDialogOpen(false);
      if (sidePanel?.kind === "element") {
        setSidePanel({ ...sidePanel, element: { ...sidePanel.element, name: editElementForm.name, status: editElementForm.status, color: editElementForm.color || null } });
      }
      toast.success("CEO atualizado");
      // Delay para garantir que upsertElement (cor) já foi persistido antes do refetch
      setTimeout(() => refetchElements(), 400);
    },
    onError: (e) => toast.error(e.message),
  });
  const updateCtoMut = trpc.ctos.update.useMutation({
    onSuccess: () => {
      refetchCtos();
      setEditElementDialogOpen(false);
      if (sidePanel?.kind === "element") {
        setSidePanel({ ...sidePanel, element: { ...sidePanel.element, name: editElementForm.name, status: editElementForm.status, capacity: editElementForm.capacity, color: editElementForm.color || null } });
      }
      toast.success("CTO atualizada");
      // Delay para garantir que upsertElement (cor) já foi persistido antes do refetch
      setTimeout(() => refetchElements(), 400);
    },
    onError: (e) => toast.error(e.message),
  });
  const updateRouteMut = trpc.infraMap.updateRoute.useMutation({
    onSuccess: () => {
      refetchRoutes();
      setEditRouteDialogOpen(false);
      if (sidePanel?.kind === "route") {
        setSidePanel({ ...sidePanel, route: {
          ...sidePanel.route,
          name: editRouteForm.name,
          cableType: editRouteForm.cableType,
          fiberCount: editRouteForm.fiberCount,
          color: editRouteForm.color,
          notes: editRouteForm.notes,
          fromElementId: editRouteForm.fromElementId ?? sidePanel.route.fromElementId,
          toElementId: editRouteForm.toElementId ?? sidePanel.route.toElementId,
        } });
      }
      toast.success("Cabo atualizado");
    },
    onError: (e) => toast.error(e.message),
  });

  // Mutations e estados para criar tubos/splitters pelo mapa
  const [addTubeDialogOpen, setAddTubeDialogOpen] = useState(false);
  const [addTubeForm, setAddTubeForm] = useState({ identifier: "", type: "tube" as "tube" | "splitter", totalVias: 12, color: "", notes: "" });
  const createCtoTubeMut = trpc.ctoTubes.create.useMutation({
    onSuccess: () => {
      ctoTubesQuery.refetch();
      ctoViasQuery.refetch();
      setAddTubeDialogOpen(false);
      setAddTubeForm({ identifier: "", type: "tube", totalVias: 12, color: "", notes: "" });
      toast.success("Tubo adicionado com sucesso");
    },
    onError: (e) => toast.error(e.message),
  });
  const createCeoTubeMut = trpc.ceoTubes.create.useMutation({
    onSuccess: () => {
      mapUtils.ceoTubes.byCeo.invalidate({ ceoId: sidePanelRefId });
      mapUtils.ceoVias.byCeo.invalidate({ ceoId: sidePanelRefId });
      setAddTubeDialogOpen(false);
      setAddTubeForm({ identifier: "", type: "tube", totalVias: 12, color: "", notes: "" });
      toast.success("Tubo adicionado com sucesso");
    },
    onError: (e) => toast.error(e.message),
  });

  // ─── Editar / Excluir Tubo ───────────────────────────────────────────────
  const [editTubeDialogOpen, setEditTubeDialogOpen] = useState(false);
  const [editingTube, setEditingTube] = useState<{ id: number; identifier: string; type: "tube" | "splitter"; color: string; notes: string; isCto: boolean } | null>(null);
  const [deleteTubeId, setDeleteTubeId] = useState<{ id: number; isCto: boolean } | null>(null);
  const updateCtoTubeMut = trpc.ctoTubes.update.useMutation({
    onSuccess: () => { ctoTubesQuery.refetch(); setEditTubeDialogOpen(false); toast.success("Tubo atualizado"); },
    onError: (e) => toast.error(e.message),
  });
  const updateCeoTubeMut = trpc.ceoTubes.update.useMutation({
    onSuccess: () => { mapUtils.ceoTubes.byCeo.invalidate({ ceoId: sidePanelRefId }); setEditTubeDialogOpen(false); toast.success("Tubo atualizado"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteCtoTubeMut = trpc.ctoTubes.delete.useMutation({
    onSuccess: () => { mapUtils.ctoTubes.byCto.invalidate({ ctoId: sidePanelRefId }); mapUtils.ctoVias.byCto.invalidate({ ctoId: sidePanelRefId }); setDeleteTubeId(null); toast.success("Tubo excluído"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteCeoTubeMut = trpc.ceoTubes.delete.useMutation({
    onSuccess: () => { mapUtils.ceoTubes.byCeo.invalidate({ ceoId: sidePanelRefId }); mapUtils.ceoVias.byCeo.invalidate({ ceoId: sidePanelRefId }); setDeleteTubeId(null); toast.success("Tubo excluído"); },
    onError: (e) => toast.error(e.message),
  });

  // ─── Edição de Vias pelo Mapa ──────────────────────────────────────────────
  const [editViaDialogOpen, setEditViaDialogOpen] = useState(false);
  const [editViaData, setEditViaData] = useState<{ id: number; viaNumber: number; label: string; notes: string; isCto: boolean } | null>(null);
  const updateCtoViaMut = trpc.ctoVias.update.useMutation({
    onSuccess: () => { ctoViasQuery.refetch(); setEditViaDialogOpen(false); toast.success("Via atualizada"); },
    onError: (e) => toast.error(e.message),
  });
  const updateCeoViaMut = trpc.ceoVias.updateLabel.useMutation({
    onSuccess: () => {
      mapUtils.ceoVias.byCeo.invalidate({ ceoId: sidePanelRefId });
      mapUtils.ceoVias.byTube.invalidate();
      setEditViaDialogOpen(false);
      toast.success("Via atualizada");
    },
    onError: (e) => toast.error(e.message),
  });

  // ─── Fusões pelo Mapa ─────────────────────────────────────────────────────
  const [fusionDialogOpen, setFusionDialogOpen] = useState(false);
  const [fusionPdfLoading, setFusionPdfLoading] = useState(false);
  // ─── Vincular CTO ao SGP ──────────────────────────────────────────────
  const [linkSgpDialogOpen, setLinkSgpDialogOpen] = useState(false);
  const [linkSgpFetched, setLinkSgpFetched] = useState(false);
  const [linkSgpSearch, setLinkSgpSearch] = useState("");
  const [linkSgpSearchDebounced, setLinkSgpSearchDebounced] = useState("");
  const [linkSgpSelectedId, setLinkSgpSelectedId] = useState<number | null>(null);
  // On-demand: só consulta o SGP quando o utilizador abre o dialog pela primeira vez
  const sgpCtosQuery = trpc.sgp.listCtos.useQuery(undefined, { enabled: linkSgpFetched });
  const linkedSgpIdsQuery = trpc.sgp.linkedSgpIds.useQuery(undefined, { enabled: linkSgpFetched });
  // Auto-match: busca a melhor correspondência SGP para o nome da CTO local aberta no painel
  const linkSgpCtoName = sidePanel?.kind === "element" && sidePanel.element.type === "cto" ? (sidePanel.element.name ?? "") : "";
  const autoMatchQuery = trpc.sgp.autoMatchForName.useQuery(
    { ctoName: linkSgpCtoName },
    { enabled: linkSgpFetched && linkSgpCtoName.length > 0 }
  );
  // Quando o auto-match retorna, pré-seleccionar automaticamente se ainda não há selecção
  useEffect(() => {
    if (autoMatchQuery.data?.match && !linkSgpSelectedId) {
      setLinkSgpSelectedId(autoMatchQuery.data.match.sgpId);
    }
  }, [autoMatchQuery.data, linkSgpSelectedId]);
  // Debounce de 300ms na pesquisa SGP
  useEffect(() => {
    const t = setTimeout(() => setLinkSgpSearchDebounced(linkSgpSearch), 300);
    return () => clearTimeout(t);
  }, [linkSgpSearch]);
  const linkCtoToSgpMut = trpc.sgp.linkCtoToSgp.useMutation({
    onSuccess: () => {
      refetchCtos();
      setLinkSgpDialogOpen(false);
      setLinkSgpSearch("");
      setLinkSgpSelectedId(null);
      // Actualizar sgpId no sidePanel
      if (sidePanel?.kind === "element") {
        setSidePanel({ ...sidePanel, element: { ...sidePanel.element, sgpId: linkSgpSelectedId } });
      }
      toast.success("CTO vinculada ao SGP com sucesso");
    },
    onError: (e) => toast.error(e.message),
  });
  const unlinkCtoFromSgpMut = trpc.sgp.unlinkCtoFromSgp.useMutation({
    onSuccess: () => {
      refetchCtos();
      if (sidePanel?.kind === "element") {
        setSidePanel({ ...sidePanel, element: { ...sidePanel.element, sgpId: null } });
      }
      toast.success("Vínculo SGP removido");
    },
    onError: (e) => toast.error(e.message),
  });
  const [fusionSourceVia, setFusionSourceVia] = useState<{ id: number; viaNumber: number; tubeId: number; isCto: boolean; isFused: boolean; label?: string | null } | null>(null);
  const [fusionTargetTubeId, setFusionTargetTubeId] = useState<string>("");
  const [fusionTargetViaId, setFusionTargetViaId] = useState<string>("");
  const [clearFusionConfirm, setClearFusionConfirm] = useState<{ id: number; viaNumber: number; isCto: boolean } | null>(null);
  const mapUtils = trpc.useUtils();
  const setCtoFusionMut = trpc.ctoVias.setFusion.useMutation({
    onSuccess: () => {
      ctoViasQuery.refetch();
      // Invalidar queries do menu CTO para sincronização bidirecional
      mapUtils.ctoVias.byCto.invalidate({ ctoId: sidePanelRefId });
      mapUtils.ctoVias.byTube.invalidate();
      setFusionDialogOpen(false);
      toast.success("Fusão registrada");
    },
    onError: (e) => toast.error(e.message),
  });
  const clearCtoFusionMut = trpc.ctoVias.clearFusion.useMutation({
    onSuccess: () => {
      ctoViasQuery.refetch();
      mapUtils.ctoVias.byCto.invalidate({ ctoId: sidePanelRefId });
      mapUtils.ctoVias.byTube.invalidate();
      toast.success("Fusão removida");
    },
    onError: (e) => toast.error(e.message),
  });
  const setCeoFusionMut = trpc.ceoVias.setFusion.useMutation({
    onSuccess: () => {
      mapUtils.ceoVias.byCeo.invalidate({ ceoId: sidePanelRefId });
      mapUtils.ceoVias.byTube.invalidate();
      setFusionDialogOpen(false);
      toast.success("Fusão registrada");
    },
    onError: (e) => toast.error(e.message),
  });
  const clearCeoFusionMut = trpc.ceoVias.clearFusion.useMutation({
    onSuccess: () => {
      mapUtils.ceoVias.byCeo.invalidate({ ceoId: sidePanelRefId });
      mapUtils.ceoVias.byTube.invalidate();
      toast.success("Fusão removida");
    },
    onError: (e) => toast.error(e.message),
  });

  const assignElementToGroupMut = trpc.mapGroups.addElement.useMutation({
    onSuccess: () => { refetchGroups(); setAssignGroupDialogOpen(false); toast.success("Elemento adicionado ao grupo"); },
    onError: (e: any) => toast.error(e.message),
  });
  const assignRouteToGroupMut = trpc.mapGroups.addRoute.useMutation({
    onSuccess: () => { refetchGroups(); setAssignGroupDialogOpen(false); toast.success("Cabo adicionado ao grupo"); },
    onError: (e: any) => toast.error(e.message),
  });
  const removeElementFromGroupMut = trpc.mapGroups.removeElement.useMutation({
    onSuccess: () => { refetchGroups(); toast.success("Elemento removido do grupo"); },
    onError: (e: any) => toast.error(e.message),
  });
  const removeRouteFromGroupMut = trpc.mapGroups.removeRoute.useMutation({
    onSuccess: () => { refetchGroups(); toast.success("Cabo removido do grupo"); },
    onError: (e: any) => toast.error(e.message),
  });
  const assignPoleToGroupMut = trpc.mapGroups.addPole.useMutation({
    onSuccess: () => { refetchGroups(); toast.success("Poste adicionado ao grupo"); },
    onError: (e: any) => toast.error(e.message),
  });
  const removePoleFromGroupMut = trpc.mapGroups.removePole.useMutation({
    onSuccess: () => { refetchGroups(); toast.success("Poste removido do grupo"); },
    onError: (e: any) => toast.error(e.message),
  });
  const assignReserveToGroupMut = trpc.mapGroups.addReserve.useMutation({
    onSuccess: () => { refetchGroups(); toast.success("Reserva adicionada ao grupo"); },
    onError: (e: any) => toast.error(e.message),
  });
  const removeReserveFromGroupMut = trpc.mapGroups.removeReserve.useMutation({
    onSuccess: () => { refetchGroups(); toast.success("Reserva removida do grupo"); },
    onError: (e: any) => toast.error(e.message),
  });
  const addElementsMut = trpc.mapGroups.addElements.useMutation({
    onSuccess: (data: any) => { refetchGroups(); setQuickAssignDialogOpen(false); setGroupSelectMode(false); setGroupSelectedElements(new Set()); setGroupSelectedRoutes(new Set()); setGroupSelectedPoles(new Set()); toast.success(`${data.count} elemento${data.count !== 1 ? "s" : ""} adicionado${data.count !== 1 ? "s" : ""} ao grupo`); },
    onError: (e: any) => toast.error(e.message),
  });
  const removeElementsMut = trpc.mapGroups.removeElements.useMutation({
    onSuccess: (data: any) => { refetchGroups(); toast.success(`${data.count} elemento${data.count !== 1 ? "s" : ""} removido${data.count !== 1 ? "s" : ""} do grupo`); },
    onError: (e: any) => toast.error(e.message),
  });

  const handleQuickAssign = useCallback((groupId: number) => {
    const elementIds = Array.from(groupSelectedElements);
    const routeIds = Array.from(groupSelectedRoutes);
    const poleIds = Array.from(groupSelectedPoles);
    // Adicionar elementos em lote
    if (elementIds.length > 0) addElementsMut.mutate({ elementIds, groupId });
    // Adicionar cabos individualmente
    routeIds.forEach(rId => assignRouteToGroupMut.mutate({ routeId: rId, groupId }));
    // Adicionar postes individualmente
    poleIds.forEach(pId => assignPoleToGroupMut.mutate({ poleId: pId, groupId }));
    const totalNonElements = routeIds.length + poleIds.length;
    if (elementIds.length === 0 && totalNonElements > 0) {
      refetchGroups();
      setQuickAssignDialogOpen(false);
      setGroupSelectMode(false);
      setGroupSelectedElements(new Set());
      setGroupSelectedRoutes(new Set());
      setGroupSelectedPoles(new Set());
      toast.success(`${totalNonElements} item${totalNonElements !== 1 ? "s" : ""} adicionado${totalNonElements !== 1 ? "s" : ""} ao grupo`);
    }
  }, [groupSelectedElements, groupSelectedRoutes, groupSelectedPoles, addElementsMut, assignRouteToGroupMut, assignPoleToGroupMut, refetchGroups]);

  // Filtrar elementos por grupo ativo
  const filteredElements = activeGroupFilter
    ? (elements as any[]).filter((el: any) => {
        const group = (mapGroups as any[]).find((g: any) => g.id === activeGroupFilter);
        return group?.elements?.some((ge: any) => ge.elementId === el.id);
      })
    : (elements as any[]);
  const filteredRoutes = activeGroupFilter
    ? (routes as any[]).filter((r: any) => {
        const group = (mapGroups as any[]).find((g: any) => g.id === activeGroupFilter);
        return group?.routes?.some((gr: any) => gr.routeId === r.id);
      })
    : (routes as any[]);

  // Mapas de grupos por item — para isHiddenByGroup verificar rapidamente
  const elementGroupMap = useMemo(() => {
    const m: Record<number, number[]> = {};
    (mapGroups as any[]).forEach((g: any) => {
      (g.elements ?? []).forEach((e: any) => {
        if (!m[e.elementId]) m[e.elementId] = [];
        m[e.elementId].push(g.id);
      });
    });
    return m;
  }, [mapGroups]);
  const routeGroupMap = useMemo(() => {
    const m: Record<number, number[]> = {};
    (mapGroups as any[]).forEach((g: any) => {
      (g.routes ?? []).forEach((r: any) => {
        if (!m[r.routeId]) m[r.routeId] = [];
        m[r.routeId].push(g.id);
      });
    });
    return m;
  }, [mapGroups]);
  const poleGroupMap = useMemo(() => {
    const m: Record<number, number[]> = {};
    (mapGroups as any[]).forEach((g: any) => {
      (g.poles ?? []).forEach((p: any) => {
        if (!m[p.poleId]) m[p.poleId] = [];
        m[p.poleId].push(g.id);
      });
    });
    return m;
  }, [mapGroups]);
  const reserveGroupMap = useMemo(() => {
    const m: Record<number, number[]> = {};
    (mapGroups as any[]).forEach((g: any) => {
      (g.reserves ?? []).forEach((r: any) => {
        if (!m[r.reserveId]) m[r.reserveId] = [];
        m[r.reserveId].push(g.id);
      });
    });
    return m;
  }, [mapGroups]);
  const poiGroupMap = useMemo(() => {
    const m: Record<number, number[]> = {};
    (mapGroups as any[]).forEach((g: any) => {
      (g.pois ?? []).forEach((p: any) => {
        if (!m[p.poiId]) m[p.poiId] = [];
        m[p.poiId].push(g.id);
      });
    });
    return m;
  }, [mapGroups]);
  const oltGroupMap = useMemo(() => {
    const m: Record<number, number[]> = {};
    (mapGroups as any[]).forEach((g: any) => {
      (g.olts ?? []).forEach((o: any) => {
        if (!m[o.oltId]) m[o.oltId] = [];
        m[o.oltId].push(g.id);
      });
    });
    return m;
  }, [mapGroups]);

  const toggleGroupSelectMode = useCallback(() => {
    setGroupSelectMode(v => {
      if (v) { setGroupSelectedElements(new Set()); setGroupSelectedRoutes(new Set()); setGroupSelectedPoles(new Set()); }
      else { setSidePanel(null); setAddingMode(null); setAddingRouteMode(false); }
      return !v;
    });
  }, []);
  const toggleGroupElement = useCallback((id: number) => {
    setGroupSelectedElements(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);
  const toggleGroupRoute = useCallback((id: number) => {
    setGroupSelectedRoutes(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);
  const toggleGroupPole = useCallback((id: number) => {
    setGroupSelectedPoles(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);
  const selectAllGroup = useCallback(() => {
    setGroupSelectedElements(new Set((elements as any[]).map((e: any) => e.id)));
    setGroupSelectedRoutes(new Set((routes as any[]).map((r: any) => r.id)));
    setGroupSelectedPoles(new Set((mapPoles as any[]).map((p: any) => p.id)));
  }, [elements, routes, mapPoles]);
  const clearGroupSelection = useCallback(() => { setGroupSelectedElements(new Set()); setGroupSelectedRoutes(new Set()); setGroupSelectedPoles(new Set()); }, []);
  const groupTotalSelected = groupSelectedElements.size + groupSelectedRoutes.size + groupSelectedPoles.size;

  const upsertElementMut = trpc.infraMap.upsertElement.useMutation({
    // onSuccess genérico: só refetch; toast é feito pelo chamador quando necessário
    onSuccess: () => { refetchElements(); },
    onError: (e) => toast.error(e.message),
  });
  const createCeoMut = trpc.ceos.create.useMutation({ onError: (e) => toast.error(e.message) });
  const createCtoMut = trpc.ctos.create.useMutation({ onError: (e) => toast.error(e.message) });
  const deleteCeoMut = trpc.ceos.delete.useMutation({
    onSuccess: () => { refetchCeos(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteCtoMut = trpc.ctos.delete.useMutation({
    onSuccess: () => { refetchCtos(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteElementMut = trpc.infraMap.deleteElement.useMutation({
    onSuccess: () => { refetchElements(); setDeleteElementId(null); setSidePanel(null); toast.success("Excluído com sucesso"); },
    onError: (e) => toast.error(e.message),
  });
  const createRouteMut = trpc.infraMap.createRoute.useMutation({
    onSuccess: () => { refetchRoutes(); setRouteDialogOpen(false); setRouteFrom(null); setAddingRouteMode(false); toast.success("Rota criada"); },
    onError: (e) => toast.error(e.message),
  });
  const splitRouteMut = trpc.infraMap.splitRoute.useMutation({
    onSuccess: () => {
      refetchRoutes();
      refetchElements();
      toast.success("Cabo dividido com sucesso");
      setSplitRouteOpen(false);
      setSplitRoutePointIdx(null);
      cancelEditRoutePath();
    },
    onError: (e) => toast.error(e.message ?? "Erro ao dividir cabo"),
  });
  const deleteRouteMut = trpc.infraMap.deleteRoute.useMutation({
    onSuccess: () => { refetchRoutes(); setDeleteRouteId(null); setSidePanel(null); toast.success("Rota excluída"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteGroupMut = trpc.infraMap.deleteElement.useMutation();
  const deleteGroupRouteMut = trpc.infraMap.deleteRoute.useMutation();
  // Mutations de postes
  const createPoleMut = trpc.mapPoles.create.useMutation({
    onSuccess: () => { refetchPoles(); setPoleDialogOpen(false); setPoleForm({ name: "", reference: "", effort: "", notes: "" }); toast.success("Poste adicionado"); },
    onError: (e) => toast.error(e.message),
  });
  const updatePoleMut = trpc.mapPoles.update.useMutation({
    onSuccess: () => { refetchPoles(); setPoleDialogOpen(false); setEditingPoleId(null); toast.success("Poste atualizado"); },
    onError: (e) => toast.error(e.message),
  });
  const deletePoleMut = trpc.mapPoles.delete.useMutation({
    onSuccess: () => { refetchPoles(); setDeletePoleId(null); toast.success("Poste excluído"); },
    onError: (e) => toast.error(e.message),
  });
  // Mutations de reservas técnicas
  const createReserveMut = trpc.mapTechnicalReserves.create.useMutation({
    onSuccess: () => { refetchReserves(); setReserveDialogOpen(false); setReserveForm({ name: "", sizeMeters: 0, routeId: null, notes: "" }); toast.success("Reserva técnica adicionada"); },
    onError: (e) => toast.error(e.message),
  });
  const updateReserveMut = trpc.mapTechnicalReserves.update.useMutation({
    onSuccess: () => { refetchReserves(); setReserveDialogOpen(false); setEditingReserveId(null); toast.success("Reserva técnica atualizada"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteReserveMut = trpc.mapTechnicalReserves.delete.useMutation({
    onSuccess: () => { refetchReserves(); setDeleteReserveId(null); toast.success("Reserva técnica excluída"); },
    onError: (e) => toast.error(e.message),
  });
  // ─── POI ─────────────────────────────────────────────────────────────────────
  const { data: pois = [], refetch: refetchPois } = trpc.mapPois.list.useQuery(undefined, MAP_QUERY_OPTS);
  const createPoiMut = trpc.mapPois.create.useMutation({
    onSuccess: () => { refetchPois(); toast.success("Ponto de interesse adicionado"); },
    onError: (e) => toast.error(e.message),
  });
  const updatePoiMut = trpc.mapPois.update.useMutation({
    onSuccess: () => { refetchPois(); toast.success("POI atualizado"); },
    onError: (e) => toast.error(e.message),
  });
  const deletePoiMut = trpc.mapPois.delete.useMutation({
    onSuccess: () => { refetchPois(); setSidePanel(null); toast.success("POI excluído"); },
    onError: (e) => toast.error(e.message),
  });
  const addPoiToGroupMut = trpc.mapPois.addToGroup.useMutation({ onError: (e) => toast.error(e.message) });
  const assignOltToGroupMut = trpc.mapGroups.addOlt.useMutation({ onSuccess: () => refetchGroups(), onError: (e) => toast.error(e.message) });
  const removeOltFromGroupMut = trpc.mapGroups.removeOlt.useMutation({ onSuccess: () => refetchGroups(), onError: (e) => toast.error(e.message) });
  const deleteOltElementMut = trpc.infraMap.deleteOltElement.useMutation({ onSuccess: () => { refetchOltElements(); refetchGroups(); }, onError: (e) => toast.error(e.message) });
  const updateOltElementMut = trpc.infraMap.updateOltElement.useMutation({ onSuccess: () => { refetchOltElements(); toast.success("Posição da OLT salva"); }, onError: (e) => toast.error(e.message) });
  const updateDgoElementMut = trpc.infraMap.updateDgoElement.useMutation({ onSuccess: () => { refetchDgoElements(); toast.success("Posição do DGO salva"); }, onError: (e) => toast.error(e.message) });
  const removePoiFromGroupMut = trpc.mapGroups.removePoi.useMutation({ onSuccess: () => refetchGroups(), onError: (e) => toast.error(e.message) });
  const sgpQuery = trpc.sgp.queryClientsByCto.useQuery(
    {
      ctoName: sidePanel?.kind === "element" && sidePanel.element.type === "cto" ? (sidePanel.element.name ?? "") : "",
      sgpId: sidePanel?.kind === "element" && sidePanel.element.type === "cto" ? (sidePanel.element.sgpId ?? null) : null,
    },
    { enabled: sidePanel?.kind === "element" && sidePanel.element.type === "cto" && (!!sidePanel.element.sgpId || !!sidePanel.element.name) }
  );
  // Quando sgpQuery retorna, actualizar onlineCounts para o sgpId actual
  useEffect(() => {
    if (!sgpQuery.data?.clients?.length) return;
    const currentSgpId = sidePanel?.kind === "element" && sidePanel.element.type === "cto" ? (sidePanel.element.sgpId ?? null) : null;
    if (currentSgpId == null) return;
    const onlineCount = (sgpQuery.data.clients as any[]).filter((c: any) => String(c.status ?? "").toLowerCase() === "online").length;
    setOnlineCounts(prev => ({ ...prev, [currentSgpId]: onlineCount }));
  }, [sgpQuery.data, sidePanel]);
  // Queries de tubos/vias para o painel lateral
  const sidePanelRefId = sidePanel?.kind === "element" ? sidePanel.element.referenceId : 0;
  const sidePanelType = sidePanel?.kind === "element" ? sidePanel.element.type : null;
   const [expandedTubeIds, setExpandedTubeIds] = useState<Set<number>>(new Set());
  // Filtro de vias no painel lateral ("all" | "free" | "fused" | "entry")
  const [ctoViaFilter, setCtoViaFilter] = useState<"all" | "free" | "fused" | "entry">("all");
  // ─── Estados OTDR Virtual ──────────────────────────────────────────────────
  const [otdrMode, setOtdrMode] = useState(false);           // modo OTDR activo
  const [otdrPanelOpen, setOtdrPanelOpen] = useState(false); // painel de input aberto
  const [otdrElementId, setOtdrElementId] = useState<number | null>(null); // elemento de partida
  const [otdrTubeId, setOtdrTubeId] = useState<string>("");  // tubo seleccionado
  const [otdrViaNumber, setOtdrViaNumber] = useState<string>(""); // via seleccionada
  const [otdrDistance, setOtdrDistance] = useState<string>(""); // distância em metros
  const [otdrRunning, setOtdrRunning] = useState(false);
  const [otdrResult, setOtdrResult] = useState<{
    found: boolean; lat: number | null; lng: number | null;
    distanceTraveled: number; totalLength: number;
    segmentName: string | null; segmentRouteId: number | null;
    elementReached: { id: number; name: string; type: string } | null;
    tracedPath: { lat: number; lng: number }[];
    warnings: string[];
  } | null>(null);
  const otdrPolylineRef = useRef<L.Polyline | null>(null);
  const otdrMarkerRef = useRef<L.Marker | null>(null);

  // Estados para selecção de tubo inline no painel lateral da rota
  const [inlineTubeFromId, setInlineTubeFromId] = useState<number | null>(null);
  const [inlineTubeToId, setInlineTubeToId] = useState<number | null>(null);
  const [inlineTubeSaving, setInlineTubeSaving] = useState(false);
  // Tubos extras (múltiplos tubos por cabo)
  const [addExtraTubeOpen, setAddExtraTubeOpen] = useState(false);
  const [addExtraTubeSide, setAddExtraTubeSide] = useState<"from" | "to">("from");
  const [addExtraTubeElementId, setAddExtraTubeElementId] = useState<number | null>(null);
  const [addExtraTubeTubeId, setAddExtraTubeTubeId] = useState<number | null>(null);
  const [addExtraTubeSaving, setAddExtraTubeSaving] = useState(false);
  const extraTubesRouteId = sidePanel?.kind === "route" ? sidePanel.route.id : null;
  const extraTubesQuery = trpc.infraMap.routeExtraTubes.useQuery(
    { routeId: extraTubesRouteId! },
    { enabled: extraTubesRouteId != null }
  );
  const addExtraTubeMut = trpc.infraMap.addRouteExtraTube.useMutation({
    onSuccess: () => { extraTubesQuery.refetch(); setAddExtraTubeOpen(false); setAddExtraTubeTubeId(null); setAddExtraTubeElementId(null); toast.success("Tubo extra adicionado"); },
    onError: (e) => toast.error(e.message ?? "Erro ao adicionar tubo"),
  });
  const deleteExtraTubeMut = trpc.infraMap.deleteRouteExtraTube.useMutation({
    onSuccess: () => { extraTubesQuery.refetch(); toast.success("Tubo extra removido"); },
    onError: (e) => toast.error(e.message ?? "Erro ao remover tubo"),
  });
  const addExtraTubeElementTubesQuery = trpc.infraMap.tubesByElement.useQuery(
    { elementId: addExtraTubeElementId! },
    { enabled: addExtraTubeElementId != null }
  );

  // Estado para confirmação de truncagem do traçado
  const [truncateConfirm, setTruncateConfirm] = useState<{
    snappedId: number;
    snappedName: string;
    isCloserToStart: boolean;
    newPath: { lat: number; lng: number }[];
    routeColor: string;
    splitPointIdx: number; // índice do ponto no path completo onde o elemento foi encaixado
  } | null>(null);

  // Query de tubos para o painel OTDR (carrega quando um elemento é seleccionado no modo OTDR)
  const otdrElement = otdrElementId != null ? (elements as any[]).find((e: any) => e.id === otdrElementId) : null;
  const otdrTubesQuery = trpc.infraMap.tubesByElement.useQuery(
    { elementId: otdrElementId ?? 0 },
    { enabled: otdrElementId != null && otdrPanelOpen }
  );
  const otdrTubes = (otdrTubesQuery.data ?? []) as { id: number; identifier: string; totalVias: number; type: string }[];
  const otdrSelectedTube = otdrTubes.find(t => String(t.id) === otdrTubeId);

  // Sincronizar tubos inline quando o painel lateral muda para uma rota
  useEffect(() => {
    if (sidePanel?.kind === "route") {
      setInlineTubeFromId((sidePanel.route as any).fromTubeId ?? null);
      setInlineTubeToId((sidePanel.route as any).toTubeId ?? null);
    }
  }, [sidePanel?.kind === "route" ? sidePanel.route.id : null]);

  // Limpar polilinha e marcador OTDR quando o modo é desactivado
  useEffect(() => {
    if (!otdrMode) {
      safeLeafletRemove(otdrPolylineRef.current);
      otdrPolylineRef.current = null;
      safeLeafletRemove(otdrMarkerRef.current);
      otdrMarkerRef.current = null;
      setOtdrResult(null);
      setOtdrElementId(null);
      setOtdrTubeId("");
      setOtdrViaNumber("");
      setOtdrDistance("");
    }
  }, [otdrMode]);

  // Desenhar resultado OTDR no mapa quando disponível
  useEffect(() => {
    if (!mapRef.current || !otdrResult) return;
    // Limpar traçado anterior
    safeLeafletRemove(otdrPolylineRef.current);
    safeLeafletRemove(otdrMarkerRef.current);
    otdrPolylineRef.current = null;
    otdrMarkerRef.current = null;
    if (otdrResult.tracedPath.length >= 2) {
      const latlngs = otdrResult.tracedPath.map(p => [p.lat, p.lng] as [number, number]);
      otdrPolylineRef.current = L.polyline(latlngs, {
        color: "#f59e0b", weight: 5, opacity: 0.9, dashArray: "10, 5"
      }).addTo(mapRef.current!);
    }
    if (otdrResult.found && otdrResult.lat != null && otdrResult.lng != null) {
      const iconHtml = `<div style="width:28px;height:28px;background:#f59e0b;border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 3px #f59e0b,0 2px 8px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
      </div>`;
      const icon = L.divIcon({ html: iconHtml, className: "", iconSize: [28, 28], iconAnchor: [14, 14] });
      otdrMarkerRef.current = L.marker([otdrResult.lat, otdrResult.lng], { icon })
        .bindPopup(`<div style="font-size:12px;min-width:180px">
          <b style="color:#f59e0b">⚡ Ponto OTDR</b><br/>
          <b>Distância:</b> ${Math.round(otdrResult.distanceTraveled)} m<br/>
          ${otdrResult.segmentName ? `<b>Cabo:</b> ${otdrResult.segmentName}<br/>` : ""}
          <b>GPS:</b> ${otdrResult.lat.toFixed(6)}, ${otdrResult.lng.toFixed(6)}<br/>
          <button onclick="navigator.clipboard.writeText('${otdrResult.lat.toFixed(6)},${otdrResult.lng.toFixed(6)}').then(()=>alert('Copiado!'))"
            style="margin-top:6px;background:#f59e0b;color:white;border:none;padding:3px 8px;border-radius:4px;cursor:pointer;font-size:11px">
            Copiar GPS
          </button>
        </div>`, { maxWidth: 240 })
        .addTo(mapRef.current!)
        .openPopup();
      mapRef.current!.flyTo([otdrResult.lat, otdrResult.lng], Math.max(mapRef.current!.getZoom(), 16), { duration: 1 });
    }
  }, [otdrResult]);

  const ctoTubesQuery = trpc.ctoTubes.byCto.useQuery(
    { ctoId: sidePanelRefId },
    { enabled: sidePanelType === "cto" && sidePanelRefId > 0 }
  );
  const ctoViasQuery = trpc.ctoVias.byCto.useQuery(
    { ctoId: sidePanelRefId },
    { enabled: sidePanelType === "cto" && sidePanelRefId > 0 }
  );
  const ceoTubesQuery = trpc.ceoTubes.byCeo.useQuery(
    { ceoId: sidePanelRefId },
    { enabled: sidePanelType === "ceo" && sidePanelRefId > 0 }
  );
  const ceoViasQuery = trpc.ceoVias.byCeo.useQuery(
    { ceoId: sidePanelRefId },
    { enabled: sidePanelType === "ceo" && sidePanelRefId > 0 }
  );
  const ceoSplittersQuery = trpc.ceoSplitters.byCeo.useQuery(
    { ceoId: sidePanelRefId },
    { enabled: sidePanelType === "ceo" && sidePanelRefId > 0 }
  );
  const ceoSplitterViasQuery = trpc.ceoSplitterVias.byCeo.useQuery(
    { ceoId: sidePanelRefId },
    { enabled: sidePanelType === "ceo" && sidePanelRefId > 0 }
  );
  const ceoViaAssocQuery = trpc.ceoViaAssociations.byCeo.useQuery(
    { ceoId: sidePanelRefId },
    { enabled: sidePanelType === "ceo" && sidePanelRefId > 0 }
  );
  const ctoViaAssocQuery = trpc.ctoViaAssociations.byCto.useQuery(
    { ctoId: sidePanelRefId },
    { enabled: sidePanelType === "cto" && sidePanelRefId > 0 }
  );
  const createCtoSplFusionMut = trpc.ctoViaAssociations.create.useMutation({
    onSuccess: () => {
      mapUtils.ctoViaAssociations.byCto.invalidate({ ctoId: sidePanelRefId });
      mapUtils.ctoVias.byCto.invalidate({ ctoId: sidePanelRefId });
      mapUtils.ctoVias.byTube.invalidate();
      setFusionDialogOpen(false);
      toast.success("Fusão registrada");
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteCtoSplFusionMut = trpc.ctoViaAssociations.deleteByVias.useMutation({
    onSuccess: () => {
      mapUtils.ctoViaAssociations.byCto.invalidate({ ctoId: sidePanelRefId });
      mapUtils.ctoVias.byCto.invalidate({ ctoId: sidePanelRefId });
      mapUtils.ctoVias.byTube.invalidate();
      toast.success("Fusão removida");
    },
    onError: (e) => toast.error(e.message),
  });
  // Splitter fusion dialog state
  const [splFusionDialogOpen, setSplFusionDialogOpen] = useState(false);
  const [splFusionSourceVia, setSplFusionSourceVia] = useState<{ id: number; viaNumber: number; splitterId: number } | null>(null);
  const [splFusionTargetType, setSplFusionTargetType] = useState<"tube" | "splitter">("tube");
  const [splFusionTargetTubeId, setSplFusionTargetTubeId] = useState<string>("");
  const [splFusionTargetViaId, setSplFusionTargetViaId] = useState<string>("");
  const createSplFusionMut = trpc.ceoViaAssociations.create.useMutation({
    onSuccess: () => {
      mapUtils.ceoViaAssociations.byCeo.invalidate({ ceoId: sidePanelRefId });
      mapUtils.ceoSplitterVias.byCeo.invalidate({ ceoId: sidePanelRefId });
      mapUtils.ceoVias.byCeo.invalidate({ ceoId: sidePanelRefId });
      setFusionDialogOpen(false);
      setSplFusionDialogOpen(false);
      toast.success("Fusão registrada");
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteSplFusionMut = trpc.ceoViaAssociations.deleteByVias.useMutation({
    onSuccess: () => {
      mapUtils.ceoViaAssociations.byCeo.invalidate({ ceoId: sidePanelRefId });
      mapUtils.ceoSplitterVias.byCeo.invalidate({ ceoId: sidePanelRefId });
      mapUtils.ceoVias.byCeo.invalidate({ ceoId: sidePanelRefId });
      toast.success("Fusão removida");
    },
    onError: (e) => toast.error(e.message),
  });

  // Auto-expandir todos os tubos quando carregados no painel lateral
  useEffect(() => {
    const tubes = (sidePanelType === "cto" ? ctoTubesQuery.data : ceoTubesQuery.data) as any[] | undefined;
    if (tubes && tubes.length > 0) {
      setExpandedTubeIds(new Set(tubes.map((t: any) => t.id)));
    }
  }, [ctoTubesQuery.data, ceoTubesQuery.data, sidePanelType]);

  // Sincronização bidirecional: escutar mensagens do iframe de detalhes (CTO/CEO)
  // Quando a página de detalhes faz uma mutação, envia postMessage e o painel lateral invalida o cache
  useEffect(() => {
    function handleIframeMessage(evt: MessageEvent) {
      if (!evt.data || typeof evt.data !== "object") return;
      const { type, ctoId, ceoId } = evt.data as any;
      if (type !== "fiber-doc-invalidate") return;
      if (ctoId) {
        mapUtils.ctoTubes.byCto.invalidate({ ctoId });
        mapUtils.ctoVias.byCto.invalidate({ ctoId });
        mapUtils.ctoVias.byTube.invalidate();
        mapUtils.ctoViaAssociations.byCto.invalidate({ ctoId });
      }
      if (ceoId) {
        mapUtils.ceoTubes.byCeo.invalidate({ ceoId });
        mapUtils.ceoVias.byCeo.invalidate({ ceoId });
        mapUtils.ceoVias.byTube.invalidate();
        mapUtils.ceoSplitterVias.byCeo.invalidate({ ceoId });
        mapUtils.ceoViaAssociations.byCeo.invalidate({ ceoId });
      }
    }
    window.addEventListener("message", handleIframeMessage);
    return () => window.removeEventListener("message", handleIframeMessage);
  }, [mapUtils]);

  // Inicializar mapa Leaflet
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const cfgLat = parseFloat((sysConfig as any)?.mapDefaultLat ?? "");
    const cfgLng = parseFloat((sysConfig as any)?.mapDefaultLng ?? "");
    const cfgZoom = parseInt((sysConfig as any)?.mapDefaultZoom ?? "");
    const initCenter: [number, number] = (!isNaN(cfgLat) && !isNaN(cfgLng)) ? [cfgLat, cfgLng] : [-15.7801, -47.9292];
    const initZoom = !isNaN(cfgZoom) ? cfgZoom : 5;
    const map = L.map(mapContainerRef.current, { center: initCenter, zoom: initZoom, zoomControl: true });
    const osmLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    });
    osmLayer.addTo(map);
    tileLayerRef.current = osmLayer;
    // Criar pane personalizado para pontos de edição de traçado (acima de tudo)
    map.createPane("editHandlesPane");
    const editHandlesPaneEl = map.getPane("editHandlesPane");
    if (editHandlesPaneEl) editHandlesPaneEl.style.zIndex = "800";
    mapRef.current = map;
    setMapReady(true);
    // Forçar recalculo do tamanho após mount (corrige mapa em branco após F5)
    setTimeout(() => { map.invalidateSize(); }, 100);
    setTimeout(() => { map.invalidateSize(); }, 500);
    return () => { map.remove(); mapRef.current = null; tileLayerRef.current = null; };
  }, []);

  // Renderizar marcadores — diff incremental: só recria marcadores que mudaram
  const renderMarkers = useCallback(() => {
    if (!mapRef.current || !mapReady) return;

    const currentIds = new Set<number>((elements as any[]).map((el: any) => el.id as number));
    const prevIds = Object.keys(markersRef.current).map(Number);

    // Remover marcadores de elementos que já não existem
    for (const id of prevIds) {
      if (!currentIds.has(id)) {
        safeLeafletRemove(markersRef.current[id]);
        delete markersRef.current[id];
        delete prevMarkerStateRef.current[id];
      }
    }

    (elements as any[]).forEach((el: any) => {
      const isCto = el.type === "cto";
      if (isCto && !showCtos) {
        if (markersRef.current[el.id]) { safeLeafletRemove(markersRef.current[el.id]); delete markersRef.current[el.id]; }
        return;
      }
      if (!isCto && !showCeos) {
        if (markersRef.current[el.id]) { safeLeafletRemove(markersRef.current[el.id]); delete markersRef.current[el.id]; }
        return;
      }
      // Visibilidade por item ou por grupo
      const isHiddenItem = hiddenElementIds.has(el.id) || isHiddenByGroup(elementGroupMap[el.id] ?? []);
      if (isHiddenItem) {
        if (markersRef.current[el.id]) { safeLeafletRemove(markersRef.current[el.id]); delete markersRef.current[el.id]; delete prevMarkerStateRef.current[el.id]; }
        return;
      }

      const ref = isCto ? (ctos as any[]).find((c: any) => c.id === el.referenceId) : ceos.find((c: any) => c.id === el.referenceId);
      const name = ref?.name ?? (isCto ? `CTO-${el.referenceId}` : `CEO-${el.referenceId}`);
      const status = ref?.status ?? "active";
      const isSelected = groupSelectedElements.has(el.id);
      const sgpIdForBadge = isCto ? (ref?.sgpId ?? null) : null;
      const onuBadgeData = sgpIdForBadge != null ? (onuCountMap[sgpIdForBadge] ?? null) : null;
      const isDraggable = isAdmin && (editMode || movingElementId === el.id);

      // Chave de estado: se igual ao anterior, apenas actualiza posição se mudou
      const badgeKey = onuBadgeData ? `${onuBadgeData.total}/${onuBadgeData.online ?? ''}` : '';
      const stateKey = `${el.type}|${status}|${name}|${isSelected ? 1 : 0}|${badgeKey}|${el.color ?? ''}|${isDraggable ? 1 : 0}|${showElementNames ? 1 : 0}`;
      const existingMarker = markersRef.current[el.id];

      if (existingMarker) {
        // Actualizar posição se mudou (drag salvo)
        const pos = existingMarker.getLatLng();
        if (Math.abs(pos.lat - Number(el.lat)) > 1e-8 || Math.abs(pos.lng - Number(el.lng)) > 1e-8) {
          existingMarker.setLatLng([Number(el.lat), Number(el.lng)]);
        }
        // Actualizar ícone apenas se o estado visual mudou
        if (stateKey !== prevMarkerStateRef.current[el.id]) {
          const iconKey = `${el.type}|${status}|${name}|${isSelected ? 1 : 0}|${badgeKey}|${el.color ?? ''}|${showElementNames ? 1 : 0}`;
          if (!iconCacheRef.current[iconKey]) {
            iconCacheRef.current[iconKey] = createLeafletIcon(el.type, status, name, isSelected, onuBadgeData, el.color ?? null, showElementNames);
          }
          existingMarker.setIcon(iconCacheRef.current[iconKey]);
          (existingMarker as any).dragging?.[isDraggable ? 'enable' : 'disable']();
          prevMarkerStateRef.current[el.id] = stateKey;
        }
        return;
      }

      // Criar novo marcador
      const iconKey = `${el.type}|${status}|${name}|${isSelected ? 1 : 0}|${badgeKey}|${el.color ?? ''}|${showElementNames ? 1 : 0}`;
      if (!iconCacheRef.current[iconKey]) {
        iconCacheRef.current[iconKey] = createLeafletIcon(el.type, status, name, isSelected, onuBadgeData, el.color ?? null, showElementNames);
      }
      const icon = iconCacheRef.current[iconKey];
      const marker = L.marker([Number(el.lat), Number(el.lng)], { icon, draggable: isDraggable, bubblingMouseEvents: false } as any).addTo(mapRef.current!);
      if (isAdmin) {
        marker.on("dragend", () => {
          // Usar refs para evitar stale closure — sempre pega o valor atual
          console.log('[dragend] movingElementIdRef.current:', movingElementIdRef.current, 'el.id:', el.id, 'editModeRef.current:', editModeRef.current);
          if (!editModeRef.current && movingElementIdRef.current !== el.id) {
            console.log('[dragend] Retornando porque não está em modo mover');
            return;
          }
          const pos = marker.getLatLng();
          console.log('[dragend] Posição:', pos);
          if (movingElementIdRef.current === el.id) {
            console.log('[dragend] Chamando setPendingMovePos');
            setPendingMovePos({ id: el.id, lat: pos.lat, lng: pos.lng });
          } else {
            console.log('[dragend] Chamando upsertElementMut');
            upsertElementMut.mutate({ type: el.type, referenceId: el.referenceId, lat: pos.lat, lng: pos.lng });
          }
        });
      }
      marker.on("click", (e: any) => {
        // Se há uma rota em edição de traçado, ignorar cliques nos marcadores de elemento
        // (evita seleccionar o elemento ao tentar arrastar a extremidade do cabo)
        if (editingRouteIdRef.current !== null) return;
        if (addingModeRef.current) {
          mapRef.current?.fire("click", { latlng: marker.getLatLng(), originalEvent: e.originalEvent });
          return;
        }
        // Usar refs para evitar stale closures — o handler é criado uma vez e reutilizado
        if (groupSelectModeRef.current) { toggleGroupElement(el.id); return; }
        if (addingRouteModeRef.current) {
          const pos = marker.getLatLng();
          setDrawingPath(prev => [...prev, { lat: pos.lat, lng: pos.lng }]);
          toast.info(`Ponto adicionado: ${name}`);
          return;
        }
        if (otdrModeRef.current) {
          setOtdrElementId(el.id);
          setOtdrTubeId("");
          setOtdrViaNumber("");
          setOtdrResult(null);
          setOtdrPanelOpen(true);
          toast.info(`OTDR: ${name} seleccionado como ponto de partida`);
          return;
        }
        // Modo de seleção por clique para associar extremos de cabo
        if (linkEndpointsPickModeRef.current) {
          const pickMode = linkEndpointsPickModeRef.current;
          if (pickMode === "from") {
            setLinkEndpointsFrom(el.id);
            // Avançar automaticamente para seleção do destino se destino ainda não definido
            if (linkEndpointsToRef.current === null) {
              setLinkEndpointsPickMode("to");
            } else {
              setLinkEndpointsPickMode(null);
            }
          } else {
            setLinkEndpointsTo(el.id);
            setLinkEndpointsPickMode(null);
          }
          toast.success(`${pickMode === "from" ? "Origem" : "Destino"}: ${name} selecionado`);
          return;
        }
        setSidePanel({ kind: "element", element: { ...el, name, status, capacity: ref?.capacity, usedPorts: ref?.usedPorts, sgpId: ref?.sgpId ?? null, color: el.color ?? null } });
      });
      markersRef.current[el.id] = marker;
      prevMarkerStateRef.current[el.id] = stateKey;
    });
  }, [elements, ctos, ceos, showCeos, showCtos, mapReady, addingRouteMode, groupSelectMode, groupSelectedElements, toggleGroupElement, isAdmin, editMode, movingElementId, onuCountMap, otdrMode, hiddenElementIds, elementGroupMap, isHiddenByGroup, showElementNames]);

  // Renderizar rotas (diff incremental — só cria/actualiza/remove o que mudou)
  const renderRoutes = useCallback(() => {
    if (!mapRef.current || !mapReady) return;
    const activeIds = new Set<number>();
    if (showRoutes) {
      (routes as any[]).forEach((r: any) => {
        const fromEl = (elements as any[]).find((e: any) => e.id === r.fromElementId);
        const toEl = (elements as any[]).find((e: any) => e.id === r.toElementId);
        const latlngs: L.LatLngExpression[] = [];
        if (fromEl) latlngs.push([Number(fromEl.lat), Number(fromEl.lng)]);
        if (r.path) { try { (JSON.parse(r.path) as any[]).forEach((pt: any) => latlngs.push([pt.lat, pt.lng])); } catch {} }
        if (toEl) latlngs.push([Number(toEl.lat), Number(toEl.lng)]);
        if (latlngs.length < 2) return;
        // Visibilidade por item ou por grupo
        if (hiddenRouteIds.has(r.id) || isHiddenByGroup(routeGroupMap[r.id] ?? [])) {
          // Remover se estava visível antes
          if (polylinesRef.current[r.id]) { safeLeafletRemove(polylinesRef.current[r.id]); delete polylinesRef.current[r.id]; }
          if (routeLabelsRef.current[r.id]) { safeLeafletRemove(routeLabelsRef.current[r.id]); delete routeLabelsRef.current[r.id]; }
          delete prevRouteStateRef.current[r.id];
          return;
        }
        activeIds.add(r.id);
        const isSelected = groupSelectedRoutes.has(r.id);
        const isBeingEdited = r.id === editingRouteId;
        const routeColor = getOccupancyColor(r.id, r.color ?? "#22d3ee");
        const pathKey = r.path ?? "";
        const stateKey = `${routeColor}|${isSelected ? 1 : 0}|${isBeingEdited ? 1 : 0}|${pathKey}|${fromEl?.lat ?? ''}|${fromEl?.lng ?? ''}|${toEl?.lat ?? ''}|${toEl?.lng ?? ''}|${showCableLabels ? 1 : 0}`;
        const existing = polylinesRef.current[r.id];
        if (existing) {
          // Actualizar apenas se o estado visual mudou
          if (stateKey !== prevRouteStateRef.current[r.id]) {
            existing.setStyle({ color: routeColor, weight: isSelected ? 6 : 3, opacity: isBeingEdited ? 0 : 0.9 });
            existing.setLatLngs(latlngs);
            if (routeLabelsRef.current[r.id]) { routeLabelsRef.current[r.id].setOpacity(isBeingEdited ? 0 : (showCableLabels ? 1 : 0)); }
            prevRouteStateRef.current[r.id] = stateKey;
          }
          return;
        }
        // Criar nova polyline
        const polyline = L.polyline(latlngs, { color: routeColor, weight: isSelected ? 6 : 3, opacity: isBeingEdited ? 0 : 0.9 }).addTo(mapRef.current!);
        polyline.on("click", () => {
          if (groupSelectMode) { toggleGroupRoute(r.id); return; }
          setSidePanel({ kind: "route", route: r });
        });
        polylinesRef.current[r.id] = polyline;
        prevRouteStateRef.current[r.id] = stateKey;
        // Rótulo de distância no ponto médio do cabo
        const distMeters = haversineDistance(latlngs);
        const distText = formatDistance(distMeters);
        const midIdx = Math.floor(latlngs.length / 2);
        const midPt = latlngs[midIdx] as [number, number];
        const labelIcon = L.divIcon({
          html: `<div style="background:rgba(0,0,0,0.72);color:#fff;font-size:10px;font-weight:600;padding:2px 5px;border-radius:4px;white-space:nowrap;pointer-events:none;border:1px solid rgba(255,255,255,0.15);">${distText}</div>`,
          className: "", iconSize: [0, 0], iconAnchor: [0, 0],
        });
        const labelMarker = L.marker(midPt, { icon: labelIcon, interactive: false, keyboard: false, opacity: isBeingEdited ? 0 : (showCableLabels ? 1 : 0) } as any).addTo(mapRef.current!);
        routeLabelsRef.current[r.id] = labelMarker;
      });
    }
    // Remover polylines de rotas que já não existem ou foram ocultadas globalmente
    Object.keys(polylinesRef.current).forEach(idStr => {
      const id = Number(idStr);
      if (!activeIds.has(id)) {
        safeLeafletRemove(polylinesRef.current[id]); delete polylinesRef.current[id];
        if (routeLabelsRef.current[id]) { safeLeafletRemove(routeLabelsRef.current[id]); delete routeLabelsRef.current[id]; }
        delete prevRouteStateRef.current[id];
      }
    });
  }, [routes, elements, showRoutes, mapReady, groupSelectMode, groupSelectedRoutes, toggleGroupRoute, editingRouteId, occupancyMap, getOccupancyColor, hiddenRouteIds, routeGroupMap, isHiddenByGroup, showCableLabels]);

  useEffect(() => { renderMarkers(); }, [renderMarkers]);
  useEffect(() => { renderRoutes(); }, [renderRoutes]);

  // Renderizar marcadores OLT no mapa
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    // Limpar marcadores OLT anteriores
    Object.values(oltMarkersRef.current).forEach(m => safeLeafletRemove(m));
    oltMarkersRef.current = {};
    if (!showOlts) return;
    (oltElements as any[]).forEach((olt: any) => {
      if (hiddenOltIds.has(olt.id) || isHiddenByGroup(oltGroupMap[olt.id] ?? [])) return;
      const icon = L.divIcon({
        className: "",
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        html: `<div style="width:36px;height:36px;background:#f59e0b;border:3px solid #fff;border-radius:6px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.4);position:relative;">
          <svg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><path d='M2 20h.01'/><path d='M7 20v-4'/><path d='M12 20v-8'/><path d='M17 20V8'/><path d='M22 4v16'/></svg>
          <div style="position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.75);color:#f59e0b;font-size:9px;font-weight:700;padding:1px 4px;border-radius:3px;white-space:nowrap;border:1px solid rgba(245,158,11,0.4);">${olt.equipmentName ?? 'OLT'}</div>
        </div>`,
      });
      const isMovingThisOlt = movingOltId === olt.id;
      const marker = L.marker([Number(olt.lat), Number(olt.lng)], { icon, draggable: isMovingThisOlt }).addTo(mapRef.current!);
      marker.on("click", () => {
        if (isMovingThisOlt) return;
        if (editingRouteIdRef.current !== null) return;
        setSelectedOltElementId(olt.id);
        setOltDetailPanelOpen(true);
      });
      if (isMovingThisOlt) {
        marker.on("dragend", () => {
          const pos = marker.getLatLng();
          // Salvar posição automaticamente e reabrir o painel
          setPendingOltMovePos({ id: olt.id, lat: pos.lat, lng: pos.lng });
          setSelectedOltElementId(olt.id);
          setOltDetailPanelOpen(true);
        });
      }
      oltMarkersRef.current[olt.id] = marker;
    });
  }, [oltElements, showOlts, mapReady, hiddenOltIds, oltGroupMap, isHiddenByGroup, movingOltId]);

  // Renderizar marcadores DGO no mapa
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    Object.values(dgoMarkersRef.current).forEach(m => safeLeafletRemove(m));
    dgoMarkersRef.current = {};
    if (!showDgos) return;
    (dgoElements as any[]).forEach((dgo: any) => {
      const isMovingThis = movingDgoId === dgo.id;
      const icon = L.divIcon({
        className: "",
        iconSize: [40, 40],
        iconAnchor: [20, 20],
        html: `<div style="position:relative;width:40px;height:40px;">
          <img src="/icons/dgo.png" style="width:40px;height:40px;object-fit:contain;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));${isMovingThis ? 'outline:2px solid #f97316;border-radius:4px;' : ''}" />
          <div style="position:absolute;bottom:-16px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.75);color:#f97316;font-size:9px;font-weight:700;padding:1px 4px;border-radius:3px;white-space:nowrap;border:1px solid rgba(249,115,22,0.4);">${dgo.equipmentName ?? 'DGO'}</div>
        </div>`,
      });
      const marker = L.marker([Number(dgo.lat), Number(dgo.lng)], { icon, draggable: isMovingThis }).addTo(mapRef.current!);
      marker.on("click", () => {
        if (isMovingThis) return;
        if (editingRouteIdRef.current !== null) return;
        // Se está em modo de traçado, adicionar ponto na posição do DGO
        if (addingRouteModeRef.current) {
          const pos = marker.getLatLng();
          setDrawingPath(prev => [...prev, { lat: pos.lat, lng: pos.lng }]);
          toast.info(`Ponto adicionado: ${dgo.equipmentName ?? 'DGO'}`);
          return;
        }
        setSelectedDgoElementId(dgo.id);
        setDgoDetailPanelOpen(true);
      });
      if (isMovingThis) {
        marker.on("dragend", () => {
          const pos = marker.getLatLng();
          setPendingDgoMovePos({ id: dgo.id, lat: pos.lat, lng: pos.lng });
          setSelectedDgoElementId(dgo.id);
          setDgoDetailPanelOpen(true);
        });
      }
      dgoMarkersRef.current[dgo.id] = marker;
    });
  }, [dgoElements, showDgos, mapReady, movingDgoId]);

  // Destacar ícones DGO quando um traçado está sendo arrastado
  useEffect(() => {
    Object.values(dgoMarkersRef.current).forEach(marker => {
      const el = marker.getElement();
      if (!el) return;
      if (isDraggingRoute) {
        (el as HTMLElement).style.filter = 'drop-shadow(0 0 8px #06b6d4) drop-shadow(0 0 4px #06b6d4)';
        (el as HTMLElement).style.transform = 'scale(1.15)';
        (el as HTMLElement).style.transition = 'transform 0.15s ease';
      } else {
        (el as HTMLElement).style.filter = '';
        (el as HTMLElement).style.transform = '';
        (el as HTMLElement).style.transition = '';
      }
    });
  }, [isDraggingRoute]);

  // Renderizar postes no mapa
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    Object.values(poleMarkersRef.current).forEach(m => safeLeafletRemove(m));
    poleMarkersRef.current = {};
    if (!showPoles) return;
    (mapPoles as any[]).forEach((pole: any) => {
      if (hiddenPoleIds.has(pole.id) || isHiddenByGroup(poleGroupMap[pole.id] ?? [])) return;
      const icon = L.divIcon({
        className: "",
        iconSize: [32, 46],
        iconAnchor: [16, 46],
        html: `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;">
          <div style="width:32px;height:32px;background:#6b7280;border:3px solid #fff;border-radius:4px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.4);">
            <svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><line x1='12' y1='2' x2='12' y2='22'/><path d='M4 6h16'/><path d='M4 6l4 4'/><path d='M20 6l-4 4'/></svg>
          </div>
          <div style="background:rgba(0,0,0,0.75);color:white;font-size:10px;font-weight:600;padding:1px 4px;border-radius:3px;margin-top:2px;white-space:nowrap;max-width:80px;overflow:hidden;text-overflow:ellipsis;">${(pole.name ?? '').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
        </div>`,
      });
      const isGroupSelected = groupSelectedPoles.has(pole.id);
      const poleIconHtml = `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;">
          <div style="width:32px;height:32px;background:${isGroupSelected ? '#06b6d4' : '#6b7280'};border:3px solid ${isGroupSelected ? '#22d3ee' : '#fff'};border-radius:4px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.4);">
            <svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><line x1='12' y1='2' x2='12' y2='22'/><path d='M4 6h16'/><path d='M4 6l4 4'/><path d='M20 6l-4 4'/></svg>
          </div>
          <div style="background:${isGroupSelected ? 'rgba(6,182,212,0.9)' : 'rgba(0,0,0,0.75)'};color:white;font-size:10px;font-weight:600;padding:1px 4px;border-radius:3px;margin-top:2px;white-space:nowrap;max-width:80px;overflow:hidden;text-overflow:ellipsis;">${(pole.name ?? '').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
        </div>`;
      const poleIcon = L.divIcon({ className: "", iconSize: [32, 46], iconAnchor: [16, 46], html: poleIconHtml });
      const marker = L.marker([Number(pole.lat), Number(pole.lng)], { icon: poleIcon, draggable: isAdmin && !groupSelectModeRef.current, bubblingMouseEvents: false } as any).addTo(mapRef.current!);
      marker.on("click", () => {
        if (editingRouteIdRef.current !== null) return;
        // No modo de seleção em grupo, adicionar/remover poste da seleção
        if (groupSelectModeRef.current) {
          toggleGroupPole(pole.id);
          return;
        }
        // No modo de traçado, adicionar ponto na posição do poste
        if (addingRouteModeRef.current) {
          const pos = marker.getLatLng();
          setDrawingPath(prev => [...prev, { lat: pos.lat, lng: pos.lng }]);
          toast.info(`Ponto adicionado: ${pole.name ?? 'Poste'}`);
          return;
        }
        if (!isAdmin) return;
        setEditingPoleId(pole.id);
        setPoleForm({ name: pole.name ?? "", reference: pole.reference ?? "", effort: pole.effort ?? "", notes: pole.notes ?? "" });
        setPoleDialogLat(Number(pole.lat));
        setPoleDialogLng(Number(pole.lng));
        setPoleDialogOpen(true);
      });
      if (isAdmin) {
        marker.on("dragend", () => {
          const pos = marker.getLatLng();
          updatePoleMut.mutate({ id: pole.id, lat: pos.lat, lng: pos.lng });
        });
      }
      poleMarkersRef.current[pole.id] = marker;
    });
  }, [mapPoles, showPoles, mapReady, isAdmin, hiddenPoleIds, poleGroupMap, isHiddenByGroup, toggleGroupPole, groupSelectedPoles, groupSelectMode]);

  // Renderizar reservas técnicas no mapa
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    Object.values(reserveMarkersRef.current).forEach(m => safeLeafletRemove(m));
    reserveMarkersRef.current = {};
    if (!showReserves) return;
    (mapReserves as any[]).forEach((reserve: any) => {
      if (hiddenReserveIds.has(reserve.id) || isHiddenByGroup(reserveGroupMap[reserve.id] ?? [])) return;
      const icon = L.divIcon({
        className: "",
        iconSize: [32, 46],
        iconAnchor: [16, 46],
        html: `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;">
          <div style="width:32px;height:32px;background:#0891b2;border:3px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.4);">
            <svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><path d='M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z'/><polyline points='3.27 6.96 12 12.01 20.73 6.96'/><line x1='12' y1='22.08' x2='12' y2='12'/></svg>
          </div>
          <div style="background:rgba(8,145,178,0.85);color:white;font-size:10px;font-weight:600;padding:1px 4px;border-radius:3px;margin-top:2px;white-space:nowrap;max-width:80px;overflow:hidden;text-overflow:ellipsis;">${reserve.sizeMeters ?? 0}m</div>
        </div>`,
      });
      const marker = L.marker([Number(reserve.lat), Number(reserve.lng)], { icon, draggable: isAdmin, bubblingMouseEvents: false } as any).addTo(mapRef.current!);
      marker.on("click", () => {
        if (editingRouteIdRef.current !== null) return;
        if (!isAdmin) return;
        setEditingReserveId(reserve.id);
        setReserveForm({ name: reserve.name ?? "", sizeMeters: reserve.sizeMeters ?? 0, routeId: reserve.routeId ?? null, notes: reserve.notes ?? "" });
        setReserveDialogLat(Number(reserve.lat));
        setReserveDialogLng(Number(reserve.lng));
        setReserveDialogOpen(true);
      });
      if (isAdmin) {
        marker.on("dragend", () => {
          const pos = marker.getLatLng();
          updateReserveMut.mutate({ id: reserve.id, lat: pos.lat, lng: pos.lng });
        });
      }
      reserveMarkersRef.current[reserve.id] = marker;
    });
   }, [mapReserves, showReserves, mapReady, isAdmin, hiddenReserveIds, reserveGroupMap, isHiddenByGroup]);
  // Renderizar POIs no mapa
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    Object.values(poiMarkersRef.current).forEach(m => safeLeafletRemove(m));
    poiMarkersRef.current = {};
    if (!showPois) return;
    const POI_CATEGORY_COLORS: Record<string, string> = {
      camera: "#ef4444", predio: "#8b5cf6", antena: "#f59e0b",
      torre: "#06b6d4", geral: "#6366f1",
    };
    const POI_CATEGORY_ICONS: Record<string, string> = {
      camera: `<circle cx='12' cy='12' r='3'/><path d='M20 7h-3l-2-3H9L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z'/>`,
      predio: `<rect x='2' y='3' width='20' height='18' rx='2'/><path d='M9 3v18'/><path d='M15 3v18'/><path d='M2 9h20'/><path d='M2 15h20'/>`,
      antena: `<path d='M2 12 C2 6.5 6.5 2 12 2 S22 6.5 22 12'/><path d='M6 12 C6 8.7 8.7 6 12 6 S18 8.7 18 12'/><line x1='12' y1='12' x2='12' y2='22'/>`,
      torre: `<line x1='12' y1='2' x2='12' y2='22'/><path d='M4 6h16'/><path d='M4 6l4 4'/><path d='M20 6l-4 4'/>`,
      geral: `<path d='M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z'/><circle cx='12' cy='10' r='3'/>`,
    };
    (pois as any[]).forEach((poi: any) => {
      if (hiddenPoiIds.has(poi.id) || isHiddenByGroup(poiGroupMap[poi.id] ?? [])) return;
      const cat = (poi.category ?? "geral").toLowerCase();
      const bgColor = poi.color ?? POI_CATEGORY_COLORS[cat] ?? "#6366f1";
      const iconPath = POI_CATEGORY_ICONS[cat] ?? POI_CATEGORY_ICONS.geral;
      const safeName = (poi.name ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const icon = L.divIcon({
        className: "",
        iconSize: [32, 46],
        iconAnchor: [16, 46],
        html: `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;">
          <div style="width:32px;height:32px;background:${bgColor};border:3px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.4);">
            <svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>${iconPath}</svg>
          </div>
          <div style="background:rgba(0,0,0,0.75);color:white;font-size:10px;font-weight:600;padding:1px 4px;border-radius:3px;margin-top:2px;white-space:nowrap;max-width:80px;overflow:hidden;text-overflow:ellipsis;">${safeName}</div>
        </div>`,
      });
      const isMovingThisPoi = movingPoiId === poi.id;
      const marker = L.marker([Number(poi.lat), Number(poi.lng)], { icon, draggable: isMovingThisPoi }).addTo(mapRef.current!);
      marker.on("click", () => {
        if (isMovingThisPoi) return; // não abrir painel durante mover
        if (editingRouteIdRef.current !== null) return;
        setSidePanel({ kind: "poi", poi: poi as MapPoi });
        setEditingPoi(false);
        setPoiEditForm({ name: poi.name ?? "", category: poi.category ?? "geral", color: poi.color ?? "#6366f1", notes: poi.notes ?? "" });
      });
      if (isMovingThisPoi) {
        marker.on("dragend", () => {
          const pos = marker.getLatLng();
          setPendingPoiMovePos({ id: poi.id, lat: pos.lat, lng: pos.lng });
        });
      }
      poiMarkersRef.current[poi.id] = marker;
    });
  }, [pois, showPois, mapReady, hiddenPoiIds, poiGroupMap, isHiddenByGroup, movingPoiId]);
  // Modo adicionar poste — clique no mapa
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const map = mapRef.current;
    if (!addingPoleMode) { map.getContainer().style.cursor = ""; return; }
    map.getContainer().style.cursor = "crosshair";
    const handler = (e: L.LeafletMouseEvent) => {
      setPoleDialogLat(e.latlng.lat); setPoleDialogLng(e.latlng.lng);
      setEditingPoleId(null); setPoleForm({ name: "", reference: "", effort: "", notes: "" });
      setPoleDialogOpen(true); setAddingPoleMode(false); map.getContainer().style.cursor = "";
    };
    map.once("click", handler);
    return () => { map.off("click", handler); map.getContainer().style.cursor = ""; };
  }, [addingPoleMode, mapReady]);

  // Modo adicionar reserva técnica — clique no mapa
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const map = mapRef.current;
    if (!addingReserveMode) { map.getContainer().style.cursor = ""; return; }
    map.getContainer().style.cursor = "crosshair";
    const handler = (e: L.LeafletMouseEvent) => {
      setReserveDialogLat(e.latlng.lat); setReserveDialogLng(e.latlng.lng);
      setEditingReserveId(null); setReserveForm({ name: "", sizeMeters: 0, routeId: null, notes: "" });
      setReserveDialogOpen(true); setAddingReserveMode(false); map.getContainer().style.cursor = "";
    };
    map.once("click", handler);
    return () => { map.off("click", handler); map.getContainer().style.cursor = ""; };
  }, [addingReserveMode, mapReady]);
  // Modo adicionar POI — clique no mapa
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const map = mapRef.current;
    if (!addingPoiMode) { map.getContainer().style.cursor = ""; return; }
    map.getContainer().style.cursor = "crosshair";
    const handler = (e: L.LeafletMouseEvent) => {
      setPoiDialogLat(e.latlng.lat); setPoiDialogLng(e.latlng.lng);
      setPoiCreateForm({ name: "", category: "geral", notes: "", groupId: null });
      setPoiDialogOpen(true); setAddingPoiMode(false); map.getContainer().style.cursor = "";
    };
    map.once("click", handler);
    return () => { map.off("click", handler); map.getContainer().style.cursor = ""; };
  }, [addingPoiMode, mapReady]);

  // Modo viabilidade técnica — clique no mapa define o ponto de busca
  useEffect(() => { viabilityModeRef.current = viabilityMode; }, [viabilityMode]);
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const map = mapRef.current;
    if (!viabilityMode) {
      map.getContainer().style.cursor = "";
      return;
    }
    map.getContainer().style.cursor = "crosshair";
    const handler = (e: L.LeafletMouseEvent) => {
      setViabilityPoint({ lat: e.latlng.lat, lng: e.latlng.lng });
      map.getContainer().style.cursor = "crosshair";
    };
    map.on("click", handler);
    return () => { map.off("click", handler); map.getContainer().style.cursor = ""; };
  }, [viabilityMode, mapReady]);

  // Calcular CTOs no raio e buscar rotas OSRM
  useEffect(() => {
    if (!viabilityPoint || !viabilityMode) { setViabilityResults([]); return; }
    // Função Haversine para distância em linha reta (metros)
    const haversine = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
      const R = 6371000;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };
    const ctoElements = (elements as any[]).filter((el: any) => el.type === "cto");
    const candidates = ctoElements
      .map((el: any) => {
        const ctoData = (ctos as any[]).find((c: any) => c.id === el.referenceId);
        if (!ctoData) return null;
        const dist = haversine(viabilityPoint.lat, viabilityPoint.lng, Number(el.lat), Number(el.lng));
        if (dist > viabilityRadius) return null;
        return {
          id: el.referenceId,
          name: ctoData.name ?? el.elementName ?? `CTO ${el.referenceId}`,
          lat: Number(el.lat),
          lng: Number(el.lng),
          capacity: ctoData.capacity ?? 8,
          usedPorts: ctoData.usedPorts ?? 0,
          distance: Math.round(dist),
          routeDistance: null as number | null,
          routeDuration: null as number | null,
          routeCoords: null as [number,number][] | null,
          status: ctoData.status ?? "active",
        };
      })
      .filter(Boolean) as any[];
    candidates.sort((a: any, b: any) => a.distance - b.distance);
    setViabilityResults(candidates);
    // Buscar rotas OSRM para cada CTO — atualiza progressivamente
    if (candidates.length === 0) return;
    setViabilityLoadingRoutes(true);
    const origin = viabilityPoint;
    let pending = candidates.length;
    candidates.forEach((cto: any) => {
      const params = new URLSearchParams({ fromLng: String(origin.lng), fromLat: String(origin.lat), toLng: String(cto.lng), toLat: String(cto.lat) });
      fetch(`/api/osrm/route?${params}`, { signal: AbortSignal.timeout(12000) })
        .then(r => { console.log('[OSRM] status', r.status, 'ok', r.ok); return r.ok ? r.json() : null; })
        .then((data: any) => {
          console.log('[OSRM] data', JSON.stringify(data)?.substring(0, 200));
          pending--;
          if (data?.code === 'Ok' && data.routes?.[0]) {
            const route = data.routes[0];
            const coords: [number,number][] = route.geometry.coordinates.map((c: number[]) => [c[1], c[0]]);
            console.log('[OSRM] coords length', coords.length, 'for cto.id', cto.id);
            // Atualiza funcionalmente para garantir estado mais recente
            setViabilityResults(prev => {
              console.log('[OSRM] prev ids', prev.map((r:any) => r.id), 'cto.id', cto.id);
              const next = prev.map(r => r.id === cto.id
                ? { ...r, routeDistance: Math.round(route.distance), routeDuration: Math.round(route.duration), routeCoords: coords }
                : r
              );
              if (pending === 0) next.sort((a: any, b: any) => (a.routeDistance ?? a.distance) - (b.routeDistance ?? b.distance));
              return next;
            });
          }
          if (pending === 0) setViabilityLoadingRoutes(false);
        })
        .catch((e) => { console.error('[OSRM] catch', e?.message); pending--; if (pending === 0) setViabilityLoadingRoutes(false); });
    });
  }, [viabilityPoint, viabilityRadius, viabilityMode, elements, ctos]);

  // Desenhar polylines das rotas OSRM no mapa
  useEffect(() => {
    console.log('[POLY] effect triggered, results:', viabilityResults.length, 'mode:', viabilityMode, 'point:', !!viabilityPoint);
    if (!mapRef.current || !mapReady) return;
    // Remover polylines e labels anteriores usando refs (evita stale closure)
    viabilityPolylinesRef.current.forEach(p => safeLeafletRemove(p));
    viabilityLabelsRef.current.forEach(l => safeLeafletRemove(l));
    viabilityPolylinesRef.current = [];
    viabilityLabelsRef.current = [];
    if (!viabilityPoint || !viabilityMode || viabilityResults.length === 0) { console.log('[POLY] early return'); return; }
    console.log('[POLY] drawing', viabilityResults.map((r:any) => ({ id: r.id, hasRoute: !!r.routeCoords, coords: r.routeCoords?.length })));
    const newPolylines: L.Polyline[] = [];
    const newLabels: L.Marker[] = [];
    viabilityResults.forEach((r: any) => {
      const free = r.capacity - r.usedPorts;
      const viable = free > 0 && r.status === 'active';
      const warn = viable && free <= 2;
      const color = !viable ? '#ef4444' : warn ? '#f59e0b' : '#22c55e';
      const coords: [number,number][] = r.routeCoords ?? [[viabilityPoint.lat, viabilityPoint.lng], [r.lat, r.lng]];
      const poly = L.polyline(coords, {
        color,
        weight: 3,
        opacity: 0.8,
        dashArray: r.routeCoords ? undefined : '8 5',
      }).addTo(mapRef.current!);
      // Label de distância no meio da rota
      const midIdx = Math.floor(coords.length / 2);
      const midPt = coords[midIdx];
      const distLabel = r.routeDistance != null
        ? `${r.routeDistance >= 1000 ? (r.routeDistance / 1000).toFixed(1) + 'km' : r.routeDistance + 'm'}${r.routeDuration != null ? ' · ' + Math.round(r.routeDuration / 60) + 'min' : ''}`
        : `${r.distance}m ≈`;
      const labelIcon = L.divIcon({
        className: '',
        iconAnchor: [40, 12],
        iconSize: [80, 24],
        html: `<div style="background:${color};color:#fff;font-size:10px;font-weight:700;padding:2px 6px;border-radius:10px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.4);">${distLabel}</div>`,
      });
      const label = L.marker(midPt, { icon: labelIcon, interactive: false } as any).addTo(mapRef.current!);
      newPolylines.push(poly);
      newLabels.push(label);
    });
    viabilityPolylinesRef.current = newPolylines;
    viabilityLabelsRef.current = newLabels;
    return () => {
      newPolylines.forEach(p => p.remove());
      newLabels.forEach(l => l.remove());
      viabilityPolylinesRef.current = [];
      viabilityLabelsRef.current = [];
    };
  }, [viabilityResults, viabilityPoint, viabilityMode, mapReady]);

  // Desenhar círculo e marcador de viabilidade no mapa
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    // Remover anteriores
    viabilityCircleRef?.remove();
    viabilityMarkerRef?.remove();
    if (!viabilityPoint || !viabilityMode) { setViabilityCircleRef(null); setViabilityMarkerRef(null); return; }
    const circle = L.circle([viabilityPoint.lat, viabilityPoint.lng], {
      radius: viabilityRadius,
      color: "#f59e0b",
      fillColor: "#f59e0b",
      fillOpacity: 0.08,
      weight: 2,
      dashArray: "6 4",
    }).addTo(mapRef.current);
    const markerIcon = L.divIcon({
      className: "",
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      html: `<div style="width:24px;height:24px;background:#f59e0b;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;">
        <svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'><path d='M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z'/><circle cx='12' cy='10' r='3'/></svg>
      </div>`,
    });
    const marker = L.marker([viabilityPoint.lat, viabilityPoint.lng], { icon: markerIcon, bubblingMouseEvents: false } as any).addTo(mapRef.current);
    setViabilityCircleRef(circle);
    setViabilityMarkerRef(marker);
    return () => { circle.remove(); marker.remove(); };
  }, [viabilityPoint, viabilityRadius, viabilityMode, mapReady]);

  // Sincronizar refs com estados para evitar stale closures nos handlers de click
  useEffect(() => { addingModeRef.current = addingMode; }, [addingMode]);
  useEffect(() => { groupSelectModeRef.current = groupSelectMode; }, [groupSelectMode]);
  // Sincronizar sidePanel.route com a lista de rotas atualizada (evita objeto stale após salvar traçado)
  useEffect(() => {
    if (!routes.length) return;
    setSidePanel(prev => {
      if (prev?.kind !== "route") return prev;
      const updated = routes.find((r: any) => r.id === prev.route.id);
      if (!updated) return prev;
      // Só atualiza se algo realmente mudou (fromElementId, toElementId ou path)
      if (
        updated.fromElementId === prev.route.fromElementId &&
        updated.toElementId   === prev.route.toElementId   &&
        updated.path          === prev.route.path
      ) return prev;
      return { ...prev, route: updated as any };
    });
  }, [routes]);
  // Desabilitar arrasto do mapa, mudar cursor e implementar box select quando modo seleção está ativo
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const map = mapRef.current;
    if (!groupSelectMode) {
      map.dragging.enable();
      map.getContainer().style.cursor = '';
      setMapBoxSelectRect(null);
      mapBoxSelectStartRef.current = null;
      return;
    }
    map.dragging.disable();
    map.getContainer().style.cursor = 'crosshair';

    const container = map.getContainer();

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      // Não iniciar drag-select se o clique foi em cima de um marcador Leaflet
      const target = e.target as HTMLElement;
      if (target.closest('.leaflet-marker-icon') || target.closest('.leaflet-marker-pane') || target.closest('.leaflet-div-icon')) return;
      const rect = container.getBoundingClientRect();
      mapBoxSelectStartRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      setMapBoxSelectRect(null);
      e.preventDefault();
      e.stopPropagation();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!mapBoxSelectStartRef.current) return;
      const rect = container.getBoundingClientRect();
      const curX = e.clientX - rect.left;
      const curY = e.clientY - rect.top;
      const sx = mapBoxSelectStartRef.current.x;
      const sy = mapBoxSelectStartRef.current.y;
      setMapBoxSelectRect({ x: Math.min(sx, curX), y: Math.min(sy, curY), w: Math.abs(curX - sx), h: Math.abs(curY - sy) });
      e.preventDefault();
      e.stopPropagation();
    };

    const onMouseUp = (e: MouseEvent) => {
      if (!mapBoxSelectStartRef.current) return;
      const rect = container.getBoundingClientRect();
      const curX = e.clientX - rect.left;
      const curY = e.clientY - rect.top;
      const sx = mapBoxSelectStartRef.current.x;
      const sy = mapBoxSelectStartRef.current.y;
      mapBoxSelectStartRef.current = null;
      setMapBoxSelectRect(null);
      // Calcular bounds geográficos do retângulo desenhado
      const topLeft = map.containerPointToLatLng(L.point(Math.min(sx, curX), Math.min(sy, curY)));
      const bottomRight = map.containerPointToLatLng(L.point(Math.max(sx, curX), Math.max(sy, curY)));
      const minLat = Math.min(topLeft.lat, bottomRight.lat);
      const maxLat = Math.max(topLeft.lat, bottomRight.lat);
      const minLng = Math.min(topLeft.lng, bottomRight.lng);
      const maxLng = Math.max(topLeft.lng, bottomRight.lng);
      const dx = Math.abs(curX - sx);
      const dy = Math.abs(curY - sy);
      if (dx < 5 && dy < 5) return; // clique simples, não selecionar
      // Selecionar elementos dentro do retângulo
      const newElements = new Set<number>();
      (elements as any[]).forEach((el: any) => {
        const lat = Number(el.lat); const lng = Number(el.lng);
        if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) newElements.add(el.id);
      });
      // Selecionar rotas cujo ponto médio (ou qualquer ponto do path) está dentro do retângulo
      const newRoutes = new Set<number>();
      (routes as any[]).forEach((r: any) => {
        const fromEl = (elements as any[]).find((el: any) => el.id === r.fromElementId);
        const toEl = (elements as any[]).find((el: any) => el.id === r.toElementId);
        // Montar lista de pontos: fromEl + path + toEl (suporta cabos KMZ sem fromEl/toEl)
        const pts: { lat: number; lng: number }[] = [];
        if (fromEl) pts.push({ lat: Number(fromEl.lat), lng: Number(fromEl.lng) });
        if (r.path) { try { (JSON.parse(r.path) as any[]).forEach((p: any) => pts.push({ lat: Number(p.lat), lng: Number(p.lng) })); } catch {} }
        if (toEl) pts.push({ lat: Number(toEl.lat), lng: Number(toEl.lng) });
        if (pts.length === 0) return;
        // Verificar se qualquer ponto do cabo está dentro do retângulo de seleção
        const anyPointInside = pts.some(p => p.lat >= minLat && p.lat <= maxLat && p.lng >= minLng && p.lng <= maxLng);
        if (anyPointInside) newRoutes.add(r.id);
      });
      // Selecionar postes dentro do retângulo
      const newPoles = new Set<number>();
      (mapPoles as any[]).forEach((pole: any) => {
        const lat = Number(pole.lat); const lng = Number(pole.lng);
        if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) newPoles.add(pole.id);
      });
      // Selecionar reservas técnicas dentro do retângulo
      const newReserves = new Set<number>();
      (mapReserves as any[]).forEach((reserve: any) => {
        const lat = Number(reserve.lat); const lng = Number(reserve.lng);
        if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) newReserves.add(reserve.id);
      });
      setGroupSelectedElements(prev => { const n = new Set(prev); newElements.forEach(id => n.add(id)); return n; });
      setGroupSelectedRoutes(prev => { const n = new Set(prev); newRoutes.forEach(id => n.add(id)); return n; });
      if (newPoles.size > 0) setGroupSelectedPoles(prev => { const p = new Set(prev); newPoles.forEach(id => p.add(id)); return p; });
      if (newReserves.size > 0) setCheckedItems(prev => { const r = new Set(prev.reserves); newReserves.forEach(id => r.add(id)); return { ...prev, reserves: r }; });
      e.preventDefault();
      e.stopPropagation();
    };

    container.addEventListener('mousedown', onMouseDown);
    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mouseup', onMouseUp);
    return () => {
      container.removeEventListener('mousedown', onMouseDown);
      container.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('mouseup', onMouseUp);
      map.dragging.enable();
      map.getContainer().style.cursor = '';
      setMapBoxSelectRect(null);
      mapBoxSelectStartRef.current = null;
    };
  }, [groupSelectMode, mapReady, elements, routes, mapPoles, mapReserves]);
  useEffect(() => { addingRouteModeRef.current = addingRouteMode; }, [addingRouteMode]);
  useEffect(() => { otdrModeRef.current = otdrMode; }, [otdrMode]);
  useEffect(() => { linkEndpointsPickModeRef.current = linkEndpointsPickMode; }, [linkEndpointsPickMode]);
  useEffect(() => { linkEndpointsFromRef.current = linkEndpointsFrom; }, [linkEndpointsFrom]);
  useEffect(() => { linkEndpointsToRef.current = linkEndpointsTo; }, [linkEndpointsTo]);
  useEffect(() => { movingElementIdRef.current = movingElementId; }, [movingElementId]);
  useEffect(() => { editModeRef.current = editMode; }, [editMode]);
  useEffect(() => { editingRouteIdRef.current = editingRouteId; }, [editingRouteId]);

  // Durante edição de traçado: desabilitar pointer-events nos marcadores de elemento
  // para que o pointerdown no circleMarker de endpoint não seja interceptado pelo marcador
  useEffect(() => {
    const isEditing = editingRouteId !== null;
    // Desabilitar pointer-events em todos os marcadores de elemento (CEO/CTO/OLT/DGO/poste/reserva/POI)
    const allMarkers = [
      ...Object.values(markersRef.current),
      ...Object.values(oltMarkersRef.current),
      ...Object.values(dgoMarkersRef.current),
      ...Object.values(poleMarkersRef.current),
      ...Object.values(reserveMarkersRef.current),
      ...Object.values(poiMarkersRef.current),
    ] as L.Marker[];
    allMarkers.forEach(m => {
      const el = m.getElement();
      if (el) el.style.pointerEvents = isEditing ? "none" : "";
    });
  }, [editingRouteId]);

  // Modo de adição de elemento
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const map = mapRef.current;
    if (!addingMode) { map.getContainer().style.cursor = ""; return; }
    map.getContainer().style.cursor = "crosshair";
    const handler = (e: L.LeafletMouseEvent) => {
      // Usar ref para garantir o tipo correcto mesmo com stale closure
      const currentMode = addingModeRef.current ?? addingMode;
      // Definir ref atomicamente ANTES de qualquer setState
      pickDialogTypeRef.current = currentMode;
      setPickDialogLat(e.latlng.lat); setPickDialogLng(e.latlng.lng);
      setPickSelectedId(null); setPickCreateNew(false); setPickNewName(""); setPickNewAddress(""); setPickNewCapacity(8);
      // Incrementar key para forçar re-render do diálogo com o novo tipo
      setPickDialogKey(k => k + 1);
      setPickDialogOpen(true); setAddingMode(null); addingModeRef.current = null; map.getContainer().style.cursor = "";
    };
    map.once("click", handler);
    return () => { map.off("click", handler); map.getContainer().style.cursor = ""; };
  }, [addingMode, mapReady]);

  // Modo adicionar OLT — clique no mapa
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const map = mapRef.current;
    if (!addingOltMode) { map.getContainer().style.cursor = ""; return; }
    map.getContainer().style.cursor = "crosshair";
    const handler = (e: L.LeafletMouseEvent) => {
      setOltAddLat(e.latlng.lat); setOltAddLng(e.latlng.lng);
      setOltAddEquipmentId(null); setOltAddTxPower("5.0"); setOltAddAttenuation("0.35"); setOltAddFusionLoss("0.1"); setOltAddNotes("");
      setOltAddDialogOpen(true); setAddingOltMode(false); map.getContainer().style.cursor = "";
    };
    map.once("click", handler);
    return () => { map.off("click", handler); map.getContainer().style.cursor = ""; };
  }, [addingOltMode, mapReady]);

  // Modo de adição de DGO
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const map = mapRef.current;
    if (!addingDgoMode) { map.getContainer().style.cursor = ""; return; }
    map.getContainer().style.cursor = "crosshair";
    const handler = (e: L.LeafletMouseEvent) => {
      setDgoCreateLat(e.latlng.lat); setDgoCreateLng(e.latlng.lng);
      setDgoCreateDialogOpen(true); setAddingDgoMode(false); map.getContainer().style.cursor = "";
    };
    map.once("click", handler);
    return () => { map.off("click", handler); map.getContainer().style.cursor = ""; };
  }, [addingDgoMode, mapReady]);

  // Traçado livre — prévia
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    if (!addingRouteMode) {
      if (previewPolylineRef.current) { previewPolylineRef.current.remove(); previewPolylineRef.current = null; }
      if (mousePolylineRef.current) { mousePolylineRef.current.remove(); mousePolylineRef.current = null; }
      drawingMarkersRef.current.forEach(m => safeLeafletRemove(m)); drawingMarkersRef.current = [];
      return;
    }
    if (!previewPolylineRef.current) {
      previewPolylineRef.current = L.polyline([], { color: "#22d3ee", weight: 3, opacity: 0.9 }).addTo(mapRef.current!);
    }
    previewPolylineRef.current.setLatLngs(drawingPath.map(p => [p.lat, p.lng]));
    drawingMarkersRef.current.forEach(m => safeLeafletRemove(m)); drawingMarkersRef.current = [];
    drawingPath.forEach((pt, idx) => {
      const color = idx === 0 ? "#22c55e" : idx === drawingPath.length - 1 ? "#f59e0b" : "#22d3ee";
      const cm = L.circleMarker([pt.lat, pt.lng], { radius: idx === 0 || idx === drawingPath.length - 1 ? 7 : 5, color: "white", fillColor: color, fillOpacity: 1, weight: 2 }).addTo(mapRef.current!);
      drawingMarkersRef.current.push(cm);
    });
  }, [drawingPath, addingRouteMode, mapReady]);

  // Traçado livre — cliques no mapa
  useEffect(() => {
    if (!mapRef.current || !mapReady || !addingRouteMode) return;
    const map = mapRef.current;
    map.getContainer().style.cursor = "crosshair";
    const clickHandler = (e: L.LeafletMouseEvent) => setDrawingPath(prev => [...prev, { lat: e.latlng.lat, lng: e.latlng.lng }]);
    const moveHandler = (e: L.LeafletMouseEvent) => {
      if (drawingPath.length === 0) return;
      const last = drawingPath[drawingPath.length - 1];
      if (!mousePolylineRef.current) {
        mousePolylineRef.current = L.polyline([], { color: "#22d3ee", weight: 2, opacity: 0.35, dashArray: "6, 6" }).addTo(map);
      }
      mousePolylineRef.current.setLatLngs([[last.lat, last.lng], [e.latlng.lat, e.latlng.lng]]);
    };
    map.on("click", clickHandler); map.on("mousemove", moveHandler);
    return () => { map.off("click", clickHandler); map.off("mousemove", moveHandler); map.getContainer().style.cursor = ""; };
  }, [addingRouteMode, mapReady, drawingPath]);

  const confirmDrawing = useCallback(() => {
    if (drawingPath.length < 2) { toast.error("Adicione pelo menos 2 pontos ao traçado"); return; }
    setRouteDialogOpen(true); setRouteForm(f => ({ ...f, name: "" }));
  }, [drawingPath]);
  const undoLastPoint = useCallback(() => setDrawingPath(prev => prev.slice(0, -1)), []);
  const cancelDrawing = useCallback(() => { setAddingRouteMode(false); setDrawingPath([]); setRouteFrom(null); setRouteTo(null); }, []);

  // ─── Edição de Traçado de Cabo ────────────────────────────────────────────
  const updateRoutePathMut = trpc.infraMap.updateRoute.useMutation({
    onSuccess: () => { refetchRoutes(); toast.success("Traçado salvo"); },
    onError: (e) => toast.error(e.message),
  });

  // Limpar marcadores de edição do mapa
  const clearEditRouteMarkers = useCallback(() => {
    editRouteMarkersRef.current.forEach(m => safeLeafletRemove(m));
    editRouteMarkersRef.current = [];
    editRouteMidMarkersRef.current.forEach(m => safeLeafletRemove(m));
    editRouteMidMarkersRef.current = [];
    if (editRoutePolylineRef.current) { editRoutePolylineRef.current.remove(); editRoutePolylineRef.current = null; }
  }, []);

  // Renderizar os marcadores de edição de traçado
  const renderEditRouteMarkers = useCallback((path: { lat: number; lng: number }[], routeColor: string) => {
    if (!mapRef.current) return;
    clearEditRouteMarkers();
    editingRoutePathRef.current = [...path];
    // Polyline de prévia (com duplo clique para inserir ponto)
    editRoutePolylineRef.current = L.polyline(
      path.map(p => [p.lat, p.lng] as L.LatLngExpression),
      { color: routeColor, weight: 8, opacity: 0.6, dashArray: "8, 4" }
    ).addTo(mapRef.current!);
    editRoutePolylineRef.current.on("dblclick", (e: L.LeafletMouseEvent) => {
      L.DomEvent.stopPropagation(e);
      const clickPt = { lat: e.latlng.lat, lng: e.latlng.lng };
      // Encontrar o segmento mais próximo do clique
      const pts = editingRoutePathRef.current;
      let bestIdx = 1;
      let bestDist = Infinity;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i]; const b = pts[i + 1];
        // Distância do ponto ao segmento
        const dx = b.lng - a.lng; const dy = b.lat - a.lat;
        const lenSq = dx * dx + dy * dy;
        let t = lenSq > 0 ? ((clickPt.lng - a.lng) * dx + (clickPt.lat - a.lat) * dy) / lenSq : 0;
        t = Math.max(0, Math.min(1, t));
        const projLat = a.lat + t * dy; const projLng = a.lng + t * dx;
        const d = Math.hypot(clickPt.lat - projLat, clickPt.lng - projLng);
        if (d < bestDist) { bestDist = d; bestIdx = i + 1; }
      }
      const newPath = [
        ...pts.slice(0, bestIdx),
        clickPt,
        ...pts.slice(bestIdx),
      ];
      editingRoutePathRef.current = newPath;
      setEditingRoutePath([...newPath]);
      renderEditRouteMarkers(newPath, routeColor);
    });

    // Marcadores de vértice (arrastáveis)
    path.forEach((pt, idx) => {
      const isEndpoint = idx === 0 || idx === path.length - 1;
      const cm = L.circleMarker([pt.lat, pt.lng], {
        radius: isEndpoint ? 9 : 7,
        color: "white",
        fillColor: isEndpoint ? "#f59e0b" : routeColor,
        fillOpacity: 1,
        weight: 2,
        bubblingMouseEvents: false,
        pane: "editHandlesPane",
      }).addTo(mapRef.current!);

      // Arrastar vértice — usa Pointer Events para suporte unificado mouse + touch
      // Snap activo para TODOS os pontos (não apenas endpoints)
      const SNAP_THRESHOLD_DEG = 0.0015; // ~150m em graus — raio de snap ao soltar sobre o elemento
      const SNAP_MIN_MOVE_DEG = 0.0008;  // ~80m — distância mínima antes de activar snap (evita snap imediato ao elemento original)
      let dragging = false;
      let pointerId: number | null = null;

      // Helper: converter clientX/Y para LatLng do mapa
      const clientToLatLng = (clientX: number, clientY: number): { lat: number; lng: number } | null => {
        if (!mapRef.current) return null;
        const rect = mapRef.current.getContainer().getBoundingClientRect();
        const p = L.point(clientX - rect.left, clientY - rect.top);
        const ll = mapRef.current.containerPointToLatLng(p);
        return { lat: ll.lat, lng: ll.lng };
      };

      // Posição inicial do ponto (para ignorar snap ao elemento actual no início do drag)
      const initialLat = pt.lat;
      const initialLng = pt.lng;
      // ID do elemento vinculado a esta extremidade (para ignorar snap ao mesmo elemento)
      const currentSnapId = isEndpoint
        ? (idx === 0 ? snapFromIdRef.current : snapToIdRef.current)
        : null;
      let hasMoved = false; // true após o utilizador se afastar suficientemente do ponto inicial

      // Snap: encontrar elemento mais próximo dentro do threshold
      // Ignora o elemento já vinculado a esta extremidade enquanto não se afastou o suficiente
      const findSnap = (lat: number, lng: number): { id: number; lat: number; lng: number; name: string } | null => {
        // Só activar snap após o utilizador se afastar do ponto inicial
        if (!hasMoved) return null;
        let best: any = null;
        let bestDist = SNAP_THRESHOLD_DEG;
        elementsRef.current.forEach((el: any) => {
          // Ignorar o elemento actualmente vinculado a esta extremidade
          if (isEndpoint && currentSnapId !== null && el.id === currentSnapId) return;
          const d = Math.hypot(lat - Number(el.lat), lng - Number(el.lng));
          if (d < bestDist) { bestDist = d; best = { ...el, _isDgo: false }; }
        });
        // Incluir DGOs no snap
        dgoElementsRef.current.forEach((dgo: any) => {
          if (isEndpoint && currentSnapId !== null && dgo.id === currentSnapId) return;
          const d = Math.hypot(lat - Number(dgo.lat), lng - Number(dgo.lng));
          if (d < bestDist) { bestDist = d; best = { ...dgo, _isDgo: true, name: dgo.equipmentName ?? `DGO #${dgo.id}` }; }
        });
        return best ? { id: best.id, lat: Number(best.lat), lng: Number(best.lng), name: best.name ?? `El. ${best.id}`, _isDgo: best._isDgo ?? false } : null;
      };

      // Movimento: mover o marcador livremente SEM snap (snap só ao soltar)
      const handleDragMove = (clientX: number, clientY: number) => {
        if (!dragging) return;
        const ll = clientToLatLng(clientX, clientY);
        if (!ll) return;
        // Verificar se o utilizador já se afastou suficientemente do ponto inicial
        // Só então activar snap (evita snap imediato ao elemento original)
        if (!hasMoved) {
          const distFromStart = Math.hypot(ll.lat - initialLat, ll.lng - initialLng);
          if (distFromStart >= SNAP_MIN_MOVE_DEG) hasMoved = true;
        }
        // Mover o marcador para a posição actual do cursor (sem snap)
        cm.setLatLng([ll.lat, ll.lng]);
        const newPath = [...editingRoutePathRef.current];
        newPath[idx] = { lat: ll.lat, lng: ll.lng };
        editingRoutePathRef.current = newPath;
        if (editRoutePolylineRef.current) {
          editRoutePolylineRef.current.setLatLngs(newPath.map(p => [p.lat, p.lng] as L.LatLngExpression));
        }
        // Indicador visual de snap próximo (só visual, não move o ponto)
        // Só mostrar após o utilizador se afastar do ponto inicial
        if (snapIndicatorRef.current) { snapIndicatorRef.current.remove(); snapIndicatorRef.current = null; }
        const nearSnap = findSnap(ll.lat, ll.lng);
        if (nearSnap && mapRef.current) {
          const snapColor = isEndpoint ? "#22c55e" : "#f59e0b";
          snapIndicatorRef.current = L.circleMarker([nearSnap.lat, nearSnap.lng], {
            radius: 14, color: snapColor, fillColor: snapColor, fillOpacity: 0.25, weight: 3,
            pane: "editHandlesPane",
          }).addTo(mapRef.current);
        }
        editRouteMidMarkersRef.current.forEach(m => safeLeafletRemove(m));
        editRouteMidMarkersRef.current = [];
        renderMidpoints(newPath, routeColor);
      };

      // Fim de drag: aplicar snap definitivo ao soltar
      const handleDragEnd = () => {
        if (!dragging) return;
        dragging = false;
        pointerId = null;
        mapRef.current!.dragging.enable();
        if (snapIndicatorRef.current) { snapIndicatorRef.current.remove(); snapIndicatorRef.current = null; }
        const cmLatLng = cm.getLatLng();
        // Verificar distância percorrida para calcular hasMoved no momento do soltar
        if (!hasMoved) {
          const distFromStart = Math.hypot(cmLatLng.lat - initialLat, cmLatLng.lng - initialLng);
          if (distFromStart >= SNAP_MIN_MOVE_DEG) hasMoved = true;
        }
        // Snap definitivo: verificar se o ponto foi solto perto de um elemento
        // findSnap já retorna null se !hasMoved
        const snap = findSnap(cmLatLng.lat, cmLatLng.lng);
        const pts = editingRoutePathRef.current;
        const isCurrentEndpoint = idx === 0 || idx === pts.length - 1;
        if (isCurrentEndpoint) {
          // Extremidade: se snap, mover para as coordenadas exactas do elemento e vincular
          if (snap) {
            const snappedPath = [...pts];
            snappedPath[idx] = { lat: snap.lat, lng: snap.lng };
            editingRoutePathRef.current = snappedPath;
            cm.setLatLng([snap.lat, snap.lng]);
            if (editRoutePolylineRef.current) {
              editRoutePolylineRef.current.setLatLngs(snappedPath.map(p => [p.lat, p.lng] as L.LatLngExpression));
            }
            if (idx === 0) snapFromIdRef.current = snap.id;
            else snapToIdRef.current = snap.id;
            const isDgoSnap = (snap as any)._isDgo;
            toast.success(isDgoSnap
              ? `${idx === 0 ? "Origem" : "Destino"} encaixado no DGO "${snap.name}" (posição salva no traçado)`
              : `${idx === 0 ? "Origem" : "Destino"} vinculado a "${snap.name}"`
            );
            setEditingRoutePath([...snappedPath]);
          } else {
            // Sem snap: desvincular elemento desta extremidade
            if (idx === 0) snapFromIdRef.current = null;
            else snapToIdRef.current = null;
            setEditingRoutePath([...pts]);
          }
        } else if (snap) {
          // Ponto do meio arrastado para elemento:
          // NÃO truncar o traçado — mover o ponto para as coordenadas exactas do elemento
          // e mostrar dialog para o utilizador decidir se quer vincular como nova extremidade
          const snappedPath = [...pts];
          snappedPath[idx] = { lat: snap.lat, lng: snap.lng };
          editingRoutePathRef.current = snappedPath;
          cm.setLatLng([snap.lat, snap.lng]);
          if (editRoutePolylineRef.current) {
            editRoutePolylineRef.current.setLatLngs(snappedPath.map(p => [p.lat, p.lng] as L.LatLngExpression));
          }
          setEditingRoutePath([...snappedPath]);
          setTruncateConfirm({
            snappedId: snap.id,
            snappedName: snap.name,
            isCloserToStart: idx <= pts.length / 2,
            newPath: snappedPath, // passa o path completo (sem truncar)
            routeColor,
            splitPointIdx: idx, // índice do ponto onde o elemento foi encaixado
          });
          return;
        } else {
          setEditingRoutePath([...pts]);
        }
      };

      // ── Pointer Events (unifica mouse + touch) ────────────────────────────
      const cmEl = (cm as any).getElement?.();
      if (cmEl) {
        cmEl.style.cursor = "grab";
        cmEl.style.touchAction = "none"; // impede scroll durante drag em touch
        cmEl.addEventListener("pointerdown", (e: PointerEvent) => {
          e.stopPropagation();
          e.preventDefault();
          cmEl.setPointerCapture(e.pointerId);
          pointerId = e.pointerId;
          dragging = true;
          cmEl.style.cursor = "grabbing";
          mapRef.current!.dragging.disable();
        }, { passive: false });
        cmEl.addEventListener("pointermove", (e: PointerEvent) => {
          if (!dragging || e.pointerId !== pointerId) return;
          e.stopPropagation();
          e.preventDefault();
          handleDragMove(e.clientX, e.clientY);
        }, { passive: false });
        cmEl.addEventListener("pointerup", (e: PointerEvent) => {
          if (e.pointerId !== pointerId) return;
          e.stopPropagation();
          cmEl.style.cursor = "grab";
          handleDragEnd();
        }, { passive: false });
        cmEl.addEventListener("pointercancel", (e: PointerEvent) => {
          if (e.pointerId !== pointerId) return;
          dragging = false;
          pointerId = null;
          cmEl.style.cursor = "grab";
          mapRef.current?.dragging.enable();
          if (snapIndicatorRef.current) { snapIndicatorRef.current.remove(); snapIndicatorRef.current = null; }
        }, { passive: false });
      }

      // Duplo clique para remover vértice (exceto endpoints)
      if (!isEndpoint) {
        cm.on("dblclick", (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          const newPath = editingRoutePathRef.current.filter((_, i) => i !== idx);
          editingRoutePathRef.current = newPath;
          setEditingRoutePath([...newPath]);
          renderEditRouteMarkers(newPath, routeColor);
        });
      }

      editRouteMarkersRef.current.push(cm);
    });

    // Pontos médios para inserir novo vértice
    renderMidpoints(path, routeColor);
  }, [clearEditRouteMarkers]);

  // Renderizar pontos médios entre vértices (arrastáveis para inserir e posicionar)
  const renderMidpoints = useCallback((path: { lat: number; lng: number }[], routeColor: string) => {
    if (!mapRef.current) return;
    editRouteMidMarkersRef.current.forEach(m => safeLeafletRemove(m));
    editRouteMidMarkersRef.current = [];
    for (let i = 0; i < path.length - 1; i++) {
      const midLat = (path[i].lat + path[i + 1].lat) / 2;
      const midLng = (path[i].lng + path[i + 1].lng) / 2;
      const insertIdx = i + 1;
      const mid = L.circleMarker([midLat, midLng], {
        radius: 6,
        color: "white",
        fillColor: routeColor,
        fillOpacity: 0.45,
        weight: 2,
        bubblingMouseEvents: false,
        pane: "editHandlesPane",
      }).addTo(mapRef.current!);
      mid.getElement()?.setAttribute("title", "Arraste ou clique para adicionar ponto");
      if (mid.getElement()) (mid.getElement() as HTMLElement).style.cursor = "grab";

      let midDragging = false;
      let midInserted = false;

      // Helper: converter clientX/Y para LatLng
      const midClientToLatLng = (clientX: number, clientY: number): { lat: number; lng: number } | null => {
        if (!mapRef.current) return null;
        const rect = mapRef.current.getContainer().getBoundingClientRect();
        const pt = L.point(clientX - rect.left, clientY - rect.top);
        const ll = mapRef.current.containerPointToLatLng(pt);
        return { lat: ll.lat, lng: ll.lng };
      };

      const doInsertAndMove = (lat: number, lng: number) => {
        if (!midInserted) {
          // Inserir o novo ponto na posição do midpoint
          midInserted = true;
          const newPath = [
            ...editingRoutePathRef.current.slice(0, insertIdx),
            { lat, lng },
            ...editingRoutePathRef.current.slice(insertIdx),
          ];
          editingRoutePathRef.current = newPath;
        } else {
          // Actualizar a posição do ponto inserido
          editingRoutePathRef.current[insertIdx] = { lat, lng };
        }
        mid.setLatLng([lat, lng]);
        if (editRoutePolylineRef.current) {
          editRoutePolylineRef.current.setLatLngs(
            editingRoutePathRef.current.map(p => [p.lat, p.lng] as L.LatLngExpression)
          );
        }
      };

      // Mouse drag
      mid.on("mousedown", (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        midDragging = true;
        midInserted = false;
        mapRef.current!.dragging.disable();
        if (mid.getElement()) (mid.getElement() as HTMLElement).style.cursor = "grabbing";
        const onMove = (ev: L.LeafletMouseEvent) => {
          if (!midDragging) return;
          doInsertAndMove(ev.latlng.lat, ev.latlng.lng);
        };
        const onUp = () => {
          mapRef.current!.off("mousemove", onMove);
          mapRef.current!.off("mouseup", onUp);
          if (!midDragging) return;
          midDragging = false;
          mapRef.current!.dragging.enable();
          if (mid.getElement()) (mid.getElement() as HTMLElement).style.cursor = "grab";
          if (midInserted) {
            setEditingRoutePath([...editingRoutePathRef.current]);
            renderEditRouteMarkers([...editingRoutePathRef.current], routeColor);
          }
        };
        mapRef.current!.on("mousemove", onMove);
        mapRef.current!.on("mouseup", onUp);
      });

      // Touch drag
      const midEl = mid.getElement?.();
      if (midEl) {
        midEl.addEventListener("touchstart", ((e: Event) => {
          const te = e as TouchEvent;
          te.stopPropagation(); te.preventDefault();
          midDragging = true; midInserted = false;
          mapRef.current!.dragging.disable();
        }) as EventListener, { passive: false });
        midEl.addEventListener("touchmove", ((e: Event) => {
          if (!midDragging) return;
          const te = e as TouchEvent;
          te.stopPropagation(); te.preventDefault();
          const touch = te.touches[0];
          const ll = midClientToLatLng(touch.clientX, touch.clientY);
          if (ll) doInsertAndMove(ll.lat, ll.lng);
        }) as EventListener, { passive: false });
        midEl.addEventListener("touchend", ((e: Event) => {
          const te = e as TouchEvent;
          te.stopPropagation();
          if (!midDragging) return;
          midDragging = false;
          mapRef.current!.dragging.enable();
          if (midInserted) {
            setEditingRoutePath([...editingRoutePathRef.current]);
            renderEditRouteMarkers([...editingRoutePathRef.current], routeColor);
          }
        }) as EventListener, { passive: false });
      }

      // Clique simples (sem arrastar) — insere no midpoint
      mid.on("click", (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        if (midInserted) return; // já foi inserido pelo drag
        const newPath = [
          ...editingRoutePathRef.current.slice(0, insertIdx),
          { lat: midLat, lng: midLng },
          ...editingRoutePathRef.current.slice(insertIdx),
        ];
        editingRoutePathRef.current = newPath;
        setEditingRoutePath([...newPath]);
        renderEditRouteMarkers(newPath, routeColor);
      });

      editRouteMidMarkersRef.current.push(mid);
    }
  }, []);

  // Iniciar modo de edição de traçado
  const startEditRoutePath = useCallback((route: MapRoute) => {
    if (!mapRef.current) return;
    // Montar path completo (fromEl + path + toEl)
    // Suporta rotas importadas via KML (sem fromElementId/toElementId — apenas path)
    const fromEl = (elements as any[]).find((e: any) => e.id === route.fromElementId);
    const toEl   = (elements as any[]).find((e: any) => e.id === route.toElementId);
    const pts: { lat: number; lng: number }[] = [];
    if (fromEl) pts.push({ lat: Number(fromEl.lat), lng: Number(fromEl.lng) });
    if (route.path) { try { (JSON.parse(route.path) as any[]).forEach((p: any) => pts.push({ lat: p.lat, lng: p.lng })); } catch {} }
    if (toEl)   pts.push({ lat: Number(toEl.lat),   lng: Number(toEl.lng) });
    if (pts.length < 2) { toast.error("Esta rota não tem traçado editável (sem pontos suficientes)"); return; }
    setEditingRouteId(route.id);
    setEditingRoutePath(pts);
    editingRoutePathRef.current = pts;
    snapFromIdRef.current = route.fromElementId ?? null;
    snapToIdRef.current = route.toElementId ?? null;
    renderEditRouteMarkers(pts, route.color ?? "#22d3ee");
    setSidePanel(null);
    toast.info("Arraste os pontos para editar o traçado. Os pontos laranja (extremidades) encaixam automaticamente em CTOs/CEOs próximos ao soltar. Clique duplo na linha para adicionar ponto. Clique direito num ponto para remover.", { duration: 7000 });
  }, [elements, renderEditRouteMarkers]);

  // Cancelar edição de traçado
  const cancelEditRoutePath = useCallback(() => {
    clearEditRouteMarkers();
    if (snapIndicatorRef.current) { snapIndicatorRef.current.remove(); snapIndicatorRef.current = null; }
    setEditingRouteId(null);
    setEditingRoutePath([]);
    editingRoutePathRef.current = [];
    snapFromIdRef.current = null;
    snapToIdRef.current = null;
  }, [clearEditRouteMarkers]);

  // Salvar traçado editado
  const saveEditRoutePath = useCallback(() => {
    if (!editingRouteId) return;
    // Usar os IDs de snap (podem ter mudado ao arrastar endpoints)
    const newFromId = snapFromIdRef.current;
    const newToId   = snapToIdRef.current;
    // Verificar se o snap é para um DGO (não é map_element, não pode ser fromElementId/toElementId)
    const fromIsDgo = newFromId !== null && dgoElementsRef.current.some((d: any) => d.id === newFromId);
    const toIsDgo   = newToId   !== null && dgoElementsRef.current.some((d: any) => d.id === newToId);
    const fromEl = !fromIsDgo ? (elements as any[]).find((e: any) => e.id === newFromId) : null;
    const toEl   = !toIsDgo   ? (elements as any[]).find((e: any) => e.id === newToId)   : null;
    // Remover os endpoints (fromEl e toEl) do path salvo — eles são inferidos pelos elementos
    // Para DGO: manter o ponto no path (posição exata do DGO fica no path)
    let pts = [...editingRoutePathRef.current];
    if (fromEl) {
      const first = pts[0];
      if (first && Math.abs(first.lat - Number(fromEl.lat)) < 0.0001 && Math.abs(first.lng - Number(fromEl.lng)) < 0.0001) {
        pts = pts.slice(1);
      }
    }
    if (toEl) {
      const last = pts[pts.length - 1];
      if (last && Math.abs(last.lat - Number(toEl.lat)) < 0.0001 && Math.abs(last.lng - Number(toEl.lng)) < 0.0001) {
        pts = pts.slice(0, -1);
      }
    }
    updateRoutePathMut.mutate({
      id: editingRouteId,
      path: JSON.stringify(pts),
      // DGO não é map_element: não salvar como fromElementId/toElementId
      // null significa desvincular, undefined significa "não alterar"
      fromElementId: fromIsDgo ? null : (newFromId !== undefined ? newFromId : null),
      toElementId:   toIsDgo   ? null : (newToId   !== undefined ? newToId   : null),
    });
    cancelEditRoutePath();
  }, [editingRouteId, elements, updateRoutePathMut, cancelEditRoutePath]);

  // Busca de endereço via Nominatim (OpenStreetMap)
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim() || !mapRef.current) return;
    setSearchLoading(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=1`, { headers: { "Accept-Language": "pt-BR,pt;q=0.9" } });
      const data = await res.json();
      if (data.length > 0) { mapRef.current.setView([parseFloat(data[0].lat), parseFloat(data[0].lon)], 16); }
      else toast.error("Endereço não encontrado");
    } catch { toast.error("Erro ao buscar endereço"); }
    finally { setSearchLoading(false); }
  }, [searchQuery]);

  // Alternar camada de satélite
  const toggleSatellite = useCallback(() => {
    if (!mapRef.current) return;
    const newMode = !satelliteMode;
    setSatelliteMode(newMode);
    if (tileLayerRef.current) { tileLayerRef.current.remove(); }
    if (newMode) {
      // ESRI World Imagery (satélite gratuito)
      tileLayerRef.current = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { attribution: "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community", maxZoom: 18, maxNativeZoom: 18 }
      );
    } else {
      tileLayerRef.current = L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19 }
      );
    }
    tileLayerRef.current.addTo(mapRef.current);
    tileLayerRef.current.bringToBack();
  }, [satelliteMode]);

  // ─── Parsing KML: extrair elementos sem importar ─────────────────────────
  const parseKmlToPreview = useCallback(async (file: File): Promise<void> => {
    setKmlImportLoading(true);
    try {
      let kmlText: string;
      if (file.name.toLowerCase().endsWith(".kmz")) {
        const buf = await file.arrayBuffer();
        const unzipped = unzipSync(new Uint8Array(buf));
        // Procurar o primeiro ficheiro .kml dentro do ZIP (comprimido ou não)
        const kmlEntry = Object.keys(unzipped).find(name => name.toLowerCase().endsWith(".kml"));
        if (!kmlEntry) throw new Error("Nenhum ficheiro .kml encontrado dentro do KMZ");
        kmlText = strFromU8(unzipped[kmlEntry]);
      } else {
        kmlText = await file.text();
      }
      const parser = new DOMParser();
      const doc = parser.parseFromString(kmlText!, "application/xml");
      const styleIconMap: Record<string, string> = {};
      const styleColorMap: Record<string, string> = {};
      // Indexar todos os <Style id="..."> com href do ícone e cor da linha
      doc.querySelectorAll("Style").forEach(style => {
        const id = style.getAttribute("id");
        if (!id) return;
        const href = style.querySelector("IconStyle > Icon > href")?.textContent ?? "";
        styleIconMap["#" + id] = href; // preservar case original
        const kmlColor = style.querySelector("LineStyle > color")?.textContent?.trim();
        if (kmlColor && kmlColor.length === 8) {
          const rr = kmlColor.slice(6, 8); const gg = kmlColor.slice(4, 6); const bb = kmlColor.slice(2, 4);
          styleColorMap["#" + id] = `#${rr}${gg}${bb}`;
        }
      });
      // Indexar <StyleMap id="..."> → resolver para o par normalStyle (key=normal)
      const styleMapMap: Record<string, string> = {};
      doc.querySelectorAll("StyleMap").forEach(sm => {
        const id = sm.getAttribute("id");
        if (!id) return;
        // Preferir o Pair com key=normal; fallback para o primeiro
        let resolvedUrl = "";
        sm.querySelectorAll("Pair").forEach(pair => {
          const key = pair.querySelector("key")?.textContent?.trim();
          const url = pair.querySelector("styleUrl")?.textContent?.trim() ?? "";
          if (key === "normal" || resolvedUrl === "") resolvedUrl = url;
        });
        styleMapMap["#" + id] = resolvedUrl;
      });
      // Função para resolver styleUrl → iconHref (suporta StyleMap e Style directo)
      const resolveIconHref = (styleUrl: string, pmElement: Element): string => {
        if (!styleUrl) {
          // Tentar estilo inline no próprio Placemark
          return pmElement.querySelector("IconStyle > Icon > href")?.textContent?.trim() ?? "";
        }
        // Se aponta para um StyleMap, resolver para o Style normal
        let resolved = styleUrl;
        if (styleMapMap[styleUrl]) resolved = styleMapMap[styleUrl];
        return styleIconMap[resolved] ?? pmElement.querySelector("IconStyle > Icon > href")?.textContent?.trim() ?? "";
      };
      // Função para resolver cor da linha
      const resolveLineColor = (styleUrl: string, pmElement: Element): string | null => {
        let resolved = styleUrl;
        if (styleMapMap[styleUrl]) resolved = styleMapMap[styleUrl];
        const inlineColor = pmElement.querySelector("LineStyle > color")?.textContent?.trim();
        if (inlineColor && inlineColor.length === 8) {
          const rr = inlineColor.slice(6, 8); const gg = inlineColor.slice(4, 6); const bb = inlineColor.slice(2, 4);
          return `#${rr}${gg}${bb}`;
        }
        return styleColorMap[resolved] ?? null;
      };

      const extractFiberName = (rawName: string, desc: string): string => {
        const pattern = /^(.+?)\s+(?:para|sentido|sent)\s+/i;
        const namePara = rawName.match(pattern);
        if (namePara) return namePara[1].trim();
        const descPara = desc.match(pattern);
        if (descPara) return descPara[1].trim();
        return rawName;
      };
      const detectType = (pm: Element, folderName: string): "cto" | "ceo" | "cabo" | "poste" | "reserva" | "poi" => {
        const name = pm.querySelector("name")?.textContent?.trim().toLowerCase() ?? "";
        const desc = pm.querySelector("description")?.textContent?.toLowerCase() ?? "";
        const styleUrl = pm.querySelector("styleUrl")?.textContent?.trim() ?? "";
        const iconHref = resolveIconHref(styleUrl, pm).toLowerCase();
        const folderLower = folderName.toLowerCase();
        const hasLine = !!pm.querySelector("LineString");
        if (hasLine) return "cabo";
        // Poste
        if (folderLower.includes("poste") || name.includes("poste") || iconHref.includes("pole")) return "poste";
        // Reserva Técnica
        if (folderLower.includes("reserva") || name.includes("reserva") || iconHref.includes("reserve")) return "reserva";
        // CTO
        if (folderLower.includes("cto") || folderLower.includes("splitter")) return "cto";
        if (iconHref.includes("square") || iconHref.includes("cto")) return "cto";
        if (name.includes("cto") || desc.includes("cto") || name.startsWith("sp ")) return "cto";
        // CEO
        if (folderLower.includes("ceo") || folderLower.includes("caixa")) return "ceo";
        if (iconHref.includes("donut") || iconHref.includes("ceo")) return "ceo";
        if (name.includes("ceo") || desc.includes("ceo")) return "ceo";
        // POI: câmera, prédio, antena, torre, etc.
        if (
          folderLower.includes("camera") || folderLower.includes("câmera") ||
          folderLower.includes("predio") || folderLower.includes("prédio") ||
          folderLower.includes("antena") || folderLower.includes("torre") ||
          folderLower.includes("poi") || folderLower.includes("ponto de interesse") ||
          name.includes("camera") || name.includes("câmera") ||
          name.includes("predio") || name.includes("prédio") ||
          name.includes("antena") || name.includes("torre")
        ) return "poi";
        // Ponto genérico com ícone padrão do Google Earth → POI
        if (iconHref.includes("placemark") || iconHref.includes("ylw-pushpin") || iconHref.includes("paddle") || iconHref === "") return "poi";
        // Fallback → CEO
        return "ceo";
      };
      const getFolderPath = (pm: Element): string[] => {
        const path: string[] = [];
        let parent = pm.parentElement;
        while (parent) {
          if (parent.tagName === "Folder") {
            const n = parent.querySelector(":scope > name")?.textContent?.trim();
            if (n) path.unshift(n);
          }
          parent = parent.parentElement;
        }
        return path;
      };
      const placemarks = Array.from(doc.querySelectorAll("Placemark"));
      const items: KmlPreviewItem[] = [];
      let idx = 0;
      for (const pm of placemarks) {
        const name = pm.querySelector("name")?.textContent?.trim() ?? "";
        const folderPath = getFolderPath(pm);
        const folderName = folderPath[folderPath.length - 1] ?? "";
        const type = detectType(pm, folderName);
        const folderLabel = folderPath.join(" / ");
        // Extrair o href do ícone para reconhecimento visual (resolve StyleMap e Style)
        const pmStyleUrl = pm.querySelector("styleUrl")?.textContent?.trim() ?? "";
        const pmIconHref = resolveIconHref(pmStyleUrl, pm);
        // Categoria POI derivada do nome/pasta
        const poiCatRaw = (folderName || name).toLowerCase();
        const poiCategory = poiCatRaw.includes("camera") || poiCatRaw.includes("c\u00e2mera") ? "camera" :
          poiCatRaw.includes("predio") || poiCatRaw.includes("pr\u00e9dio") ? "predio" :
          poiCatRaw.includes("antena") ? "antena" :
          poiCatRaw.includes("torre") ? "torre" : "geral";
        if (type === "cabo") {
          const coordsText = pm.querySelector("LineString > coordinates")?.textContent?.trim() ?? "";
          if (!coordsText) continue;
          const pathPoints = coordsText.trim().split(/\s+/).map(c => {
            const p = c.split(","); return { lat: parseFloat(p[1]), lng: parseFloat(p[0]) };
          }).filter(p => !isNaN(p.lat) && !isNaN(p.lng));
          if (pathPoints.length < 2) continue;
          const desc = pm.querySelector("description")?.textContent?.trim() ?? "";
          const fiberName = extractFiberName(name || `Cabo-KML-${idx + 1}`, desc);
          const cableColor = resolveLineColor(pmStyleUrl, pm) ?? "#22d3ee";
          items.push({ id: `kml-${idx}`, name: fiberName, type: "cabo", color: cableColor, lat: null, lng: null, path: JSON.stringify(pathPoints), fiberName, include: true, folderName: folderLabel, fiberCount: 12, cableType: "FO", capacity: 8, sizeMeters: 0, iconHref: pmIconHref, selected: false, poiCategory });
        } else {
          // Tentar ponto direto ou dentro de MultiGeometry
          const coordText = (pm.querySelector("Point > coordinates") ?? pm.querySelector("MultiGeometry Point > coordinates"))?.textContent?.trim();
          if (!coordText) continue;
          const parts = coordText.split(",");
          if (parts.length < 2) continue;
          const lng = parseFloat(parts[0]); const lat = parseFloat(parts[1]);
          if (isNaN(lat) || isNaN(lng)) continue;
          items.push({ id: `kml-${idx}`, name: name || `${type.toUpperCase()}-KML-${idx + 1}`, type, color: null, lat, lng, path: null, fiberName: null, include: true, folderName: folderLabel, fiberCount: 12, cableType: "FO", capacity: 8, sizeMeters: 0, iconHref: pmIconHref, selected: false, poiCategory });
        }
        idx++;
      }
      if (items.length === 0) { toast.error("Nenhum elemento reconhecido no ficheiro KML/KMZ"); return; }
      setKmlPreviewItems(items);
      setKmlImportOpen(false);
      setKmlPreviewOpen(true);
    } catch (e: any) { toast.error("Erro ao processar KML/KMZ: " + (e.message ?? "")); }
    finally { setKmlImportLoading(false); }
  }, []);

  const handleKmlImport = useCallback(async (file: File) => {
    await parseKmlToPreview(file);
  }, [parseKmlToPreview]);

  // ─── Confirmar importação após pré-visualização ────────────────────────────
  const confirmKmlImport = useCallback(async () => {
    const toImport = kmlPreviewItems.filter(it => it.include);
    if (toImport.length === 0) { toast.error("Nenhum elemento seleccionado para importar"); return; }
    setKmlImportingPreview(true);
    setKmlImportProgress(0);
    setKmlImportTotal(toImport.length);
    let added = 0;
    const errors: string[] = [];
    const byType: Record<string, number> = {};
    // Cache de grupos criados/encontrados por nome de pasta KML
    const folderGroupCache: Record<string, number> = {};
    const getOrCreateGroupId = async (folderName: string): Promise<number | null> => {
      if (!folderName) return kmlImportTargetGroupId;
      if (folderGroupCache[folderName] !== undefined) return folderGroupCache[folderName];
      // Procurar grupo existente pelo nome
      const existing = (mapGroups as any[]).find((g: any) => g.name.toLowerCase() === folderName.toLowerCase());
      if (existing) { folderGroupCache[folderName] = existing.id; return existing.id; }
      // Criar novo grupo
      try {
        const res = await createGroupMut.mutateAsync({ name: folderName });
        folderGroupCache[folderName] = (res as any).id;
        return (res as any).id;
      } catch { return kmlImportTargetGroupId; }
    };
    for (let i = 0; i < toImport.length; i++) {
      const item = toImport[i];
      setKmlImportProgress(i + 1);
      try {
        // Determinar grupo: pasta KML ou grupo manual selecionado
        const targetFolder = item.folderName ? item.folderName.split(" / ").pop()! : "";
        const groupId = await getOrCreateGroupId(targetFolder) ?? kmlImportTargetGroupId;
        if (item.type === "cabo") {
          const res = await createRouteMut.mutateAsync({ name: item.name, path: item.path!, fiberCount: item.fiberCount, cableType: item.cableType, color: item.color ?? "#22d3ee" });
          if (groupId !== null) {
            try { await assignRouteToGroupMut.mutateAsync({ routeId: (res as any).id, groupId }); } catch {}
          }
          added++; byType["Cabos"] = (byType["Cabos"] ?? 0) + 1;
        } else if (item.type === "cto") {
          const cto = await createCtoMut.mutateAsync({ name: item.name, capacity: item.capacity, lat: item.lat!, lng: item.lng! });
          const el = await upsertElementMut.mutateAsync({ type: "cto", referenceId: (cto as any).id, lat: item.lat!, lng: item.lng! });
          if (groupId !== null) {
            try { await assignElementToGroupMut.mutateAsync({ elementId: (el as any).id, groupId }); } catch {}
          }
          added++; byType["CTOs"] = (byType["CTOs"] ?? 0) + 1;
        } else if (item.type === "poste") {
          const pole = await createPoleMut.mutateAsync({ name: item.name, lat: item.lat!, lng: item.lng! });
          if (groupId !== null) {
            try { await assignPoleToGroupMut.mutateAsync({ poleId: (pole as any).id, groupId }); } catch {}
          }
          added++; byType["Postes"] = (byType["Postes"] ?? 0) + 1;
        } else if (item.type === "reserva") {
          const reserve = await createReserveMut.mutateAsync({ name: item.name, sizeMeters: item.sizeMeters, lat: item.lat!, lng: item.lng! });
          if (groupId !== null) {
            try { await assignReserveToGroupMut.mutateAsync({ reserveId: (reserve as any).id, groupId }); } catch {}
          }
          added++; byType["Reservas"] = (byType["Reservas"] ?? 0) + 1;
        } else if (item.type === "poi") {
          const poi = await createPoiMut.mutateAsync({ name: item.name, category: item.poiCategory, lat: item.lat!, lng: item.lng!, color: "#6366f1" });
          if (groupId !== null) {
            try { await addPoiToGroupMut.mutateAsync({ poiId: (poi as any).id, groupId }); } catch {}
          }
          added++; byType["POIs"] = (byType["POIs"] ?? 0) + 1;
        } else {
          const ceo = await createCeoMut.mutateAsync({ name: item.name, location: "" });
          const el = await upsertElementMut.mutateAsync({ type: "ceo", referenceId: (ceo as any).id, lat: item.lat!, lng: item.lng! });
          if (groupId !== null) {
            try { await assignElementToGroupMut.mutateAsync({ elementId: (el as any).id, groupId }); } catch {}
          }
          added++; byType["CEOs"] = (byType["CEOs"] ?? 0) + 1;
        }
      } catch (e: any) { errors.push(`${item.name}: ${e.message}`); }
    }
    setKmlImportingPreview(false);
    setKmlImportProgress(0);
    setKmlPreviewOpen(false);
    setKmlPreviewItems([]);
    setKmlImportResult({ added, skipped: kmlPreviewItems.length - toImport.length, errors, byType });
    setKmlImportOpen(true);
    if (added > 0) {
      refetchElements(); refetchRoutes?.(); refetchPoles?.(); refetchReserves?.(); refetchGroups?.(); refetchPois?.();
      toast.success(`${added} elemento${added !== 1 ? "s" : ""} importado${added !== 1 ? "s" : ""} do KML/KMZ`);
    } else toast.error("Nenhum elemento importado");
  }, [kmlPreviewItems, kmlImportTargetGroupId, mapGroups, createCtoMut, createCeoMut, upsertElementMut, createRouteMut, createPoleMut, createReserveMut, createPoiMut, addPoiToGroupMut, assignElementToGroupMut, assignRouteToGroupMut, assignPoleToGroupMut, assignReserveToGroupMut, createGroupMut, refetchElements, refetchRoutes, refetchPoles, refetchReserves, refetchGroups, refetchPois]);

  // Exportar KML/KMZ
  const openExportDialog = () => {
    setExportSelectedElements(new Set((elements as any[]).map((e: any) => e.id)));
    setExportSelectedRoutes(new Set((routes as any[]).map((r: any) => r.id)));
    setExportSelectAll(true); setExportDialogOpen(true);
  };
  const toggleExportSelectAll = () => {
    if (exportSelectAll) { setExportSelectedElements(new Set()); setExportSelectedRoutes(new Set()); }
    else { setExportSelectedElements(new Set((elements as any[]).map((e: any) => e.id))); setExportSelectedRoutes(new Set((routes as any[]).map((r: any) => r.id))); }
    setExportSelectAll(!exportSelectAll);
  };
  const toggleElement = (id: number) => setExportSelectedElements(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleRoute = (id: number) => setExportSelectedRoutes(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const handleExportKml = async () => {
    setExportLoading(true);
    try {
      let elementIds = exportSelectAll ? undefined : Array.from(exportSelectedElements);
      let routeIds = exportSelectAll ? undefined : Array.from(exportSelectedRoutes);
      // Filtrar apenas itens visíveis (sem ocultos) quando exportOnlyVisible está ativo
      if (exportOnlyVisible) {
        const allElIds = (elements as any[]).map((e: any) => e.id);
        const allRtIds = (routes as any[]).map((r: any) => r.id);
        const visibleElIds = allElIds.filter((id: number) => !hiddenElementIds.has(id));
        const visibleRtIds = allRtIds.filter((id: number) => !hiddenRouteIds.has(id));
        elementIds = elementIds ? elementIds.filter((id: number) => visibleElIds.includes(id)) : visibleElIds;
        routeIds = routeIds ? routeIds.filter((id: number) => visibleRtIds.includes(id)) : visibleRtIds;
      }
      // Combinar filtro de grupo com filtro de visíveis
      // Se exportGroupId está definido, filtrar elementos do grupo selecionado
      if (exportGroupId !== null) {
        const allGrps = mapGroups as any[];
        // Coletar todos os IDs do grupo selecionado (recursivo)
        const collectGroupIds = (gId: number): { elems: number[]; routes: number[]; poles: number[]; reserves: number[]; pois: number[]; olts: number[] } => {
          const g = allGrps.find((x: any) => x.id === gId);
          if (!g) return { elems: [], routes: [], poles: [], reserves: [], pois: [], olts: [] };
          const kids = allGrps.filter((x: any) => x.parentId === gId);
          const childData = kids.map((k: any) => collectGroupIds(k.id));
          return {
            elems: [...(g.elements ?? []).map((e: any) => e.elementId), ...childData.flatMap(d => d.elems)],
            routes: [...(g.routes ?? []).map((r: any) => r.routeId), ...childData.flatMap(d => d.routes)],
            poles: [...(g.poles ?? []).map((p: any) => p.poleId), ...childData.flatMap(d => d.poles)],
            reserves: [...(g.reserves ?? []).map((r: any) => r.reserveId), ...childData.flatMap(d => d.reserves)],
            pois: [...(g.pois ?? []).map((p: any) => p.poiId), ...childData.flatMap(d => d.pois)],
            olts: [...(g.olts ?? []).map((o: any) => o.oltId), ...childData.flatMap(d => d.olts)],
          };
        };
        const groupData = collectGroupIds(exportGroupId);
        // Interseccionar com seleção manual
        elementIds = elementIds ? elementIds.filter(id => groupData.elems.includes(id)) : groupData.elems;
        routeIds = routeIds ? routeIds.filter(id => groupData.routes.includes(id)) : groupData.routes;
        // Se exportOnlyVisible, filtrar também por visíveis
        if (exportOnlyVisible) {
          elementIds = elementIds.filter(id => !hiddenElementIds.has(id));
          routeIds = routeIds.filter(id => !hiddenRouteIds.has(id));
        }
      }
      // Usar endpoint HTTP directo para evitar limitações do tRPC batch link com payloads grandes
      const resp = await fetch("/api/export-kml", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          format: exportFormat,
          elementIds,
          routeIds,
          includeFibers: exportIncludeFibers,
          exportTypes: { cto: exportTypeCto, ceo: exportTypeCeo, cabo: exportTypeCabo },
          includePoles: exportOnlyVisible ? (exportIncludePoles ? (mapPoles as any[]).filter((p: any) => !hiddenPoleIds.has(p.id)).map((p: any) => p.id) : []) : (exportIncludePoles ? undefined : []),
          includeReserves: exportOnlyVisible ? (exportIncludeReserves ? (mapReserves as any[]).filter((r: any) => !hiddenReserveIds.has(r.id)).map((r: any) => r.id) : []) : (exportIncludeReserves ? undefined : []),
          includePois: exportOnlyVisible ? (exportIncludePois ? (pois as any[]).filter((p: any) => !hiddenPoiIds.has(p.id)).map((p: any) => p.id) : []) : (exportIncludePois ? undefined : []),
          includeFusions: exportIncludeFusions,
          exportGroupId: exportGroupId ?? undefined,
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Erro ao exportar" }));
        throw new Error(err.error ?? "Erro ao exportar");
      }
      const blob = await resp.blob();
      const ext = exportFormat === "kmz" ? "kmz" : "kml";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fiberdoc-infraestrutura-${new Date().toISOString().slice(0, 10)}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${exportFormat.toUpperCase()} exportado com sucesso`);
      setExportDialogOpen(false);
    } catch (e: any) { toast.error(e.message ?? "Erro ao exportar"); }
    finally { setExportLoading(false); }
  };

  // Criar rota
  const handleCreateRoute = () => {
    const pathStr = drawingPath.length >= 2 ? JSON.stringify(drawingPath) : undefined;
    createRouteMut.mutate({
      ...(routeFrom !== null ? { fromElementId: routeFrom } : {}),
      ...(routeTo !== null ? { toElementId: routeTo } : {}),
      name: routeForm.name || undefined, cableType: routeForm.cableType || undefined,
      fiberCount: routeForm.fiberCount || undefined, color: routeForm.color || undefined,
      notes: routeForm.notes || undefined, path: pathStr,
    });
    setRouteTo(null); setDrawingPath([]);
  };

  // Confirmar pick CEO/CTO
  const handlePickConfirm = async () => {
    // Usar ref para garantir o tipo correcto (imune a re-renders e stale state)
    const confirmedType = pickDialogTypeRef.current;
    try {
      if (pickCreateNew) {
        if (!pickNewName.trim()) { toast.error("Informe o nome"); return; }
        if (confirmedType === "cto") {
          const cto = await createCtoMut.mutateAsync({ name: pickNewName, address: pickNewAddress || undefined, capacity: pickNewCapacity, lat: pickDialogLat, lng: pickDialogLng });
          await upsertElementMut.mutateAsync({ type: "cto", referenceId: (cto as any).id, lat: pickDialogLat, lng: pickDialogLng });
        } else {
          const ceo = await createCeoMut.mutateAsync({ name: pickNewName, location: pickNewAddress || undefined });
          await upsertElementMut.mutateAsync({ type: "ceo", referenceId: (ceo as any).id, lat: pickDialogLat, lng: pickDialogLng });
        }
        toast.success(`${confirmedType.toUpperCase()} criado e adicionado ao mapa`);
      } else {
        if (!pickSelectedId) { toast.error("Selecione um item"); return; }
        await upsertElementMut.mutateAsync({ type: confirmedType, referenceId: pickSelectedId, lat: pickDialogLat, lng: pickDialogLng });
        toast.success(`${confirmedType.toUpperCase()} adicionado ao mapa`);
      }
      setPickDialogOpen(false);
      refetchElements();
      refetchCtos();
      refetchCeos();
    } catch (e: any) { toast.error(e.message ?? "Erro ao adicionar"); }
  };

  // Excluir em grupo
  const handleGroupDelete = async () => {
    for (const id of Array.from(groupSelectedElements)) await deleteGroupMut.mutateAsync({ id });
    for (const id of Array.from(groupSelectedRoutes)) await deleteGroupRouteMut.mutateAsync({ id });
    for (const id of Array.from(groupSelectedPoles)) await deletePoleMut.mutateAsync({ id });
    setGroupSelectedElements(new Set()); setGroupSelectedRoutes(new Set()); setGroupSelectedPoles(new Set());
    refetchElements(); refetchRoutes(); refetchPoles(); toast.success("Itens excluídos");
  };

  // Exportar seleção em grupo
  const handleGroupExport = () => {
    setExportSelectedElements(new Set(groupSelectedElements));
    setExportSelectedRoutes(new Set(groupSelectedRoutes));
    setExportSelectAll(false); setExportDialogOpen(true);
  };

  // ─── URL params: centralizar e destacar marcador ────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const lat = parseFloat(params.get("lat") ?? "");
    const lng = parseFloat(params.get("lng") ?? "");
    const highlightId = parseInt(params.get("highlight") ?? "");
    const zoomParam = parseInt(params.get("zoom") ?? "");
    const zoomLevel = !isNaN(zoomParam) ? zoomParam : 17;
    if (!isNaN(lat) && !isNaN(lng)) {
      mapRef.current.setView([lat, lng], zoomLevel);
    }
    // Ativar modo de adição automático (addMode=ceo|cto)
    const addModeParam = params.get("addMode") as "ceo" | "cto" | null;
    if (addModeParam === "ceo" || addModeParam === "cto") {
      setAddingMode(addModeParam);
      toast.success(
        addModeParam === "cto"
          ? "📍 Modo CTO ativado — clique no mapa para posicionar a CTO"
          : "📍 Modo CEO ativado — clique no mapa para posicionar a CEO",
        { duration: 6000 }
      );
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }
    // Se não há elementos para destacar, limpar URL e sair
    if ((elements as any[]).length === 0) {
      if (params.has("lat") || params.has("highlight") || params.has("zoom")) {
        window.history.replaceState({}, "", window.location.pathname);
      }
      return;
    }
    if (!isNaN(highlightId)) {
      const el = (elements as any[]).find((e: any) => e.id === highlightId);
      if (el) {
        const marker = markersRef.current[el.id];
        if (marker) {
          let count = 0;
          const blink = setInterval(() => {
            const iconEl = marker.getElement();
            if (iconEl) iconEl.style.filter = count % 2 === 0 ? "drop-shadow(0 0 12px #f59e0b) brightness(1.5)" : "";
            count++;
            if (count >= 6) { clearInterval(blink); const iconEl2 = marker.getElement(); if (iconEl2) iconEl2.style.filter = ""; }
          }, 400);
        }
        const ctoRef = el.type === "cto" ? (ctos as any[]).find((c: any) => c.id === el.referenceId) : null;
        const ceoRef = el.type === "ceo" ? ceos.find((c: any) => c.id === el.referenceId) : null;
        const ref = ctoRef ?? ceoRef;
        setSidePanel({ kind: "element", element: { ...el, name: ref?.name ?? el.type.toUpperCase(), status: ref?.status, capacity: ref?.capacity, usedPorts: ref?.usedPorts, sgpId: ref?.sgpId ?? null } });
      }
    }
    if (params.has("lat") || params.has("highlight") || params.has("zoom")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, elements]);

  // Painel lateral
  const renderSidePanel = () => {
    if (!sidePanel) return null;
    if (sidePanel.kind === "poi") {
      const poi = sidePanel.poi;
      const POI_CATEGORY_LABELS: Record<string, string> = {
        camera: "Câmera", predio: "Prédio", antena: "Antena", torre: "Torre", geral: "Geral",
      };
      const POI_CATEGORY_COLORS: Record<string, string> = {
        camera: "#ef4444", predio: "#8b5cf6", antena: "#f59e0b", torre: "#06b6d4", geral: "#6366f1",
      };
      const cat = (poi.category ?? "geral").toLowerCase();
      const catColor = poi.color ?? POI_CATEGORY_COLORS[cat] ?? "#6366f1";
      const catLabel = POI_CATEGORY_LABELS[cat] ?? poi.category ?? "Geral";
      const poiGroups = (mapGroups as any[]).filter((g: any) => (poi.groups ?? []).includes(g.id));
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: catColor, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='white' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'><path d='M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z'/><circle cx='12' cy='10' r='3'/></svg>
            </div>
            <h3 className="font-semibold truncate flex-1">{poi.name}</h3>
          </div>
          {!editingPoi ? (
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Categoria</span><span style={{ color: catColor }} className="font-medium">{catLabel}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Lat</span><span className="font-mono text-xs">{Number(poi.lat).toFixed(6)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Lng</span><span className="font-mono text-xs">{Number(poi.lng).toFixed(6)}</span></div>
              {poi.notes && <div className="mt-2 p-2 rounded bg-muted/30 text-xs text-muted-foreground">{poi.notes}</div>}
              {poiGroups.length > 0 && (
                <div className="mt-2">
                  <div className="text-xs text-muted-foreground mb-1">Grupos</div>
                  <div className="flex flex-wrap gap-1">
                    {poiGroups.map((g: any) => (
                      <span key={g.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs" style={{ background: (g.color ?? "#6366f1") + "33", color: g.color ?? "#6366f1" }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: g.color ?? "#6366f1", display: "inline-block" }} />
                        {g.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {isAdmin && (
                 <div className="space-y-2 mt-3">
                   <div className="flex gap-2">
                     <button onClick={() => setEditingPoi(true)} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded bg-muted/40 hover:bg-muted/70 text-xs">
                       <Pencil className="w-3 h-3" /> Editar
                     </button>
                     <button onClick={() => { if (confirm("Excluir este POI?")) deletePoiMut.mutate({ id: poi.id }); }} className="flex items-center justify-center gap-1 px-3 py-1.5 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs">
                       <Trash2 className="w-3 h-3" /> Excluir
                     </button>
                   </div>
                   <button
                     onClick={() => {
                       if (movingPoiId === poi.id) {
                         setMovingPoiId(null);
                         setPendingPoiMovePos(null);
                         toast.info("Modo mover cancelado");
                       } else {
                         setMovingPoiId(poi.id);
                         setPendingPoiMovePos(null);
                         toast.info(`Arraste o marcador do POI para reposicioná-lo e clique em 'Salvar posição'.`, { duration: 5000 });
                       }
                     }}
                     className={`w-full flex items-center justify-center gap-1 py-1.5 rounded text-xs ${
                       movingPoiId === poi.id
                         ? "bg-amber-500/20 border border-amber-500/60 text-amber-300"
                         : "bg-muted/40 hover:bg-muted/70 border border-amber-500/30 text-amber-400"
                     }`}
                   >
                     <Move className="w-3 h-3" />
                     {movingPoiId === poi.id ? "Cancelar mover" : "Mover"}
                   </button>
                   {pendingPoiMovePos?.id === poi.id && (
                     <button
                       onClick={() => {
                         const p = pendingPoiMovePos;
                         if (!p) return;
                         updatePoiMut.mutate(
                           { id: p.id, lat: p.lat, lng: p.lng },
                           { onSuccess: () => { setMovingPoiId(null); setPendingPoiMovePos(null); setSidePanel({ kind: "poi", poi: { ...poi, lat: p.lat, lng: p.lng } }); } }
                         );
                       }}
                       className="w-full flex items-center justify-center gap-1 py-1.5 rounded text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                     >
                       <CheckCircle2 className="w-3 h-3" /> Salvar posição
                     </button>
                   )}
                 </div>
               )}
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <div>
                <label className="text-xs text-muted-foreground">Nome</label>
                <input className="w-full mt-0.5 bg-muted/50 border border-border rounded px-2 py-1 text-sm" value={poiEditForm.name} onChange={e => setPoiEditForm(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Categoria</label>
                <select className="w-full mt-0.5 bg-muted/50 border border-border rounded px-2 py-1 text-sm" value={poiEditForm.category} onChange={e => setPoiEditForm(p => ({ ...p, category: e.target.value }))}>
                  <option value="geral">Geral</option>
                  <option value="camera">Câmera</option>
                  <option value="predio">Prédio</option>
                  <option value="antena">Antena</option>
                  <option value="torre">Torre</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Cor</label>
                <input type="color" className="w-full mt-0.5 h-8 rounded cursor-pointer" value={poiEditForm.color} onChange={e => setPoiEditForm(p => ({ ...p, color: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Notas</label>
                <textarea className="w-full mt-0.5 bg-muted/50 border border-border rounded px-2 py-1 text-sm resize-none" rows={2} value={poiEditForm.notes} onChange={e => setPoiEditForm(p => ({ ...p, notes: e.target.value }))} />
              </div>
              <div className="flex gap-2">
                <button onClick={() => { updatePoiMut.mutate({ id: poi.id, ...poiEditForm }); setEditingPoi(false); setSidePanel({ kind: "poi", poi: { ...poi, ...poiEditForm } }); }} className="flex-1 py-1.5 rounded bg-primary/80 hover:bg-primary text-primary-foreground text-xs font-medium">
                  Guardar
                </button>
                <button onClick={() => setEditingPoi(false)} className="px-3 py-1.5 rounded bg-muted/40 hover:bg-muted/70 text-xs">
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      );
    }
    if (sidePanel.kind === "route") {
      const r = sidePanel.route;
      const fromEl = (elements as any[]).find((e: any) => e.id === r.fromElementId) as any;
      const toEl = (elements as any[]).find((e: any) => e.id === r.toElementId) as any;
      const fromRef = fromEl?.type === "cto" ? (ctos as any[]).find((c: any) => c.id === fromEl?.referenceId) : ceos.find((c: any) => c.id === fromEl?.referenceId);
      const toRef = toEl?.type === "cto" ? (ctos as any[]).find((c: any) => c.id === toEl?.referenceId) : ceos.find((c: any) => c.id === toEl?.referenceId);
      const isSolto = !fromEl || !toEl;
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2"><Cable className="w-5 h-5 text-cyan-400" /><h3 className="font-semibold">{r.name ?? `Cabo ${r.id}`}</h3></div>
          {isSolto && (
            <div className="flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/30 px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
              <span className="text-xs text-amber-400">
                Cabo sem {!fromEl && !toEl ? "origem e destino" : !fromEl ? "origem" : "destino"} vinculado.
                Use <strong>Editar</strong> para conectar a um CEO/CTO.
              </span>
            </div>
          )}
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Tipo</span><span>{r.cableType ?? "FO"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Fibras</span><span>{r.fiberCount ?? "—"}</span></div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">De</span>
              <span className={!fromEl ? "text-amber-400 text-xs italic" : ""}>
                {fromEl ? ((fromRef as any)?.name ?? `El. ${r.fromElementId}`) : "— não vinculado"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Para</span>
              <span className={!toEl ? "text-amber-400 text-xs italic" : ""}>
                {toEl ? ((toRef as any)?.name ?? `El. ${r.toElementId}`) : "— não vinculado"}
              </span>
            </div>
            {r.notes && <div className="pt-1 text-muted-foreground text-xs">{r.notes}</div>}
          </div>
          {/* Ocupação real por tubo */}
          {(() => {
            const occ = (routesOccupancy as any[]).find((o: any) => o.routeId === r.id);
            if (!occ) return null;
            const pct = occ.pct as number;
            const barColor = pct >= 100 ? "#ef4444" : pct >= 80 ? "#f97316" : pct >= 50 ? "#eab308" : pct > 0 ? "#22d3ee" : "#22c55e";
            const label = pct >= 100 ? "Saturado" : pct >= 80 ? "Quase saturado" : pct >= 50 ? "Parcial" : pct > 0 ? "Uso baixo" : "Livre";
            return (
              <div className="space-y-1.5 border border-border rounded-md p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground font-medium">Ocupação de Fibras</span>
                  <span className="text-xs font-bold" style={{ color: barColor }}>{pct}% — {label}</span>
                </div>
                {occ.tubeLabel && (
                  <div className="text-[10px] text-muted-foreground/70">Tubo: <span className="text-muted-foreground font-medium">{occ.tubeLabel}</span> · {occ.fusedCount}/{occ.fiberCount} vias</div>
                )}
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
                </div>
              </div>
            );
          })()}
          {/* Selecção de tubo inline + tubos extras */}
          {(fromEl || toEl) && (
            <div className="border border-border rounded-lg p-3 space-y-2.5">
              {/* Cabeçalho */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Cable className="w-3 h-3" /> Tubos vinculados
                </span>
                {isAdmin && (
                  <button
                    className="text-[10px] text-primary hover:underline"
                    disabled={inlineTubeSaving}
                    onClick={async () => {
                      setInlineTubeSaving(true);
                      try {
                        await updateRouteMut.mutateAsync({
                          id: r.id,
                          fromTubeId: inlineTubeFromId,
                          toTubeId: inlineTubeToId,
                        });
                        setSidePanel({ kind: "route", route: { ...r, fromTubeId: inlineTubeFromId, toTubeId: inlineTubeToId } as any });
                        toast.success("Tubos actualizados");
                      } catch (e: any) {
                        toast.error(e.message ?? "Erro ao salvar tubos");
                      } finally {
                        setInlineTubeSaving(false);
                      }
                    }}
                  >
                    {inlineTubeSaving ? "Salvando..." : "Salvar"}
                  </button>
                )}
              </div>
              {/* Tubo principal (from/to) */}
              <TubeSelectors
                fromElId={r.fromElementId ?? null}
                toElId={r.toElementId ?? null}
                fromTubeId={inlineTubeFromId}
                toTubeId={inlineTubeToId}
                onChange={(field, value) => {
                  if (!isAdmin) return;
                  if (field === "fromTubeId") setInlineTubeFromId(value);
                  else setInlineTubeToId(value);
                }}
              />
              {/* Tubos extras */}
              {(() => {
                const extras = extraTubesQuery.data ?? [];
                const fromExtras = extras.filter(e => e.side === "from");
                const toExtras = extras.filter(e => e.side === "to");
                return (
                  <div className="space-y-1.5">
                    {/* Lista de tubos extras de origem */}
                    {fromExtras.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">Origens extras</span>
                        {fromExtras.map(et => (
                          <div key={et.id} className="flex items-center gap-1.5 text-xs bg-muted/20 rounded px-2 py-1">
                            <span className="flex-1 truncate text-muted-foreground">{et.elementName} → {et.tubeIdentifier}</span>
                            {isAdmin && (
                              <button onClick={() => deleteExtraTubeMut.mutate({ id: et.id })} className="text-red-400/60 hover:text-red-400 flex-shrink-0" title="Remover">
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Lista de tubos extras de destino */}
                    {toExtras.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">Destinos extras</span>
                        {toExtras.map(et => (
                          <div key={et.id} className="flex items-center gap-1.5 text-xs bg-muted/20 rounded px-2 py-1">
                            <span className="flex-1 truncate text-muted-foreground">{et.elementName} → {et.tubeIdentifier}</span>
                            {isAdmin && (
                              <button onClick={() => deleteExtraTubeMut.mutate({ id: et.id })} className="text-red-400/60 hover:text-red-400 flex-shrink-0" title="Remover">
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Botão adicionar tubo extra */}
                    {isAdmin && (
                      <div>
                        {!addExtraTubeOpen ? (
                          <button
                            onClick={() => { setAddExtraTubeOpen(true); setAddExtraTubeElementId(null); setAddExtraTubeTubeId(null); setAddExtraTubeSide("from"); }}
                            className="text-[10px] text-primary/70 hover:text-primary flex items-center gap-1 mt-1"
                          >
                            <Plus className="w-3 h-3" /> Adicionar tubo extra
                          </button>
                        ) : (
                          <div className="border border-border/60 rounded p-2 space-y-2 mt-1 bg-muted/10">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-medium text-muted-foreground">Novo tubo extra</span>
                              <button onClick={() => setAddExtraTubeOpen(false)} className="text-muted-foreground/50 hover:text-muted-foreground"><X className="w-3 h-3" /></button>
                            </div>
                            {/* Lado: origem ou destino */}
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => setAddExtraTubeSide("from")}
                                className={`flex-1 text-[10px] py-0.5 rounded border transition-colors ${
                                  addExtraTubeSide === "from" ? "border-cyan-500/60 bg-cyan-500/10 text-cyan-300" : "border-border text-muted-foreground hover:border-border/80"
                                }`}
                              >Origem</button>
                              <button
                                onClick={() => setAddExtraTubeSide("to")}
                                className={`flex-1 text-[10px] py-0.5 rounded border transition-colors ${
                                  addExtraTubeSide === "to" ? "border-violet-500/60 bg-violet-500/10 text-violet-300" : "border-border text-muted-foreground hover:border-border/80"
                                }`}
                              >Destino</button>
                            </div>
                            {/* Elemento (CEO/CTO) */}
                            <Select
                              value={addExtraTubeElementId != null ? String(addExtraTubeElementId) : "none"}
                              onValueChange={v => { setAddExtraTubeElementId(v === "none" ? null : Number(v)); setAddExtraTubeTubeId(null); }}
                            >
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue placeholder="Selecionar CEO/CTO" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Selecionar CEO/CTO...</SelectItem>
                                {(elements as any[]).filter((e: any) => e.type === 'ceo' || e.type === 'cto').map((e: any) => (
                                  <SelectItem key={e.id} value={String(e.id)}>{e.elementName ?? e.name ?? e.label ?? `#${e.id}`} ({e.type?.toUpperCase()})</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {/* Tubo do elemento selecionado */}
                            {addExtraTubeElementId != null && (
                              <Select
                                value={addExtraTubeTubeId != null ? String(addExtraTubeTubeId) : "none"}
                                onValueChange={v => setAddExtraTubeTubeId(v === "none" ? null : Number(v))}
                              >
                                <SelectTrigger className="h-7 text-xs">
                                  <SelectValue placeholder="Selecionar tubo" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">Selecionar tubo...</SelectItem>
                                  {(addExtraTubeElementTubesQuery.data ?? []).map((t: any) => (
                                    <SelectItem key={t.id} value={String(t.id)}>{t.identifier} ({t.totalVias} vias)</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                            {/* Botão confirmar */}
                            <button
                              disabled={addExtraTubeElementId == null || addExtraTubeTubeId == null || addExtraTubeSaving}
                              onClick={async () => {
                                if (addExtraTubeElementId == null || addExtraTubeTubeId == null) return;
                                setAddExtraTubeSaving(true);
                                try {
                                  await addExtraTubeMut.mutateAsync({
                                    routeId: r.id,
                                    elementId: addExtraTubeElementId,
                                    tubeId: addExtraTubeTubeId,
                                    side: addExtraTubeSide,
                                  });
                                } finally {
                                  setAddExtraTubeSaving(false);
                                }
                              }}
                              className="w-full text-[10px] py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {addExtraTubeSaving ? "Adicionando..." : "Confirmar"}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {isAdmin && (
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" className="flex-1 gap-2" onClick={() => {
                setEditRouteForm({ name: r.name ?? "", cableType: r.cableType ?? "FO", fiberCount: r.fiberCount ?? 12, color: r.color ?? "#22d3ee", notes: r.notes ?? "", fromElementId: r.fromElementId ?? null, toElementId: r.toElementId ?? null, fromTubeId: (r as any).fromTubeId ?? null, toTubeId: (r as any).toTubeId ?? null });
                setEditRouteDialogOpen(true);
              }}><span className="text-xs">✏️</span> Editar</Button>
              <Button variant="outline" size="sm" className="flex-1 gap-2 border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10" onClick={() => startEditRoutePath(r)}>
                <Cable className="w-3.5 h-3.5" /> Traçado
              </Button>
              {r.fromElementId ? (
                <Button
                  variant="outline" size="sm"
                  className="flex-1 gap-1 border-orange-500/40 text-orange-400 hover:bg-orange-500/10 text-xs"
                  disabled={updateRouteMut.isPending}
                  title={`Desvincular origem: ${(fromRef as any)?.name ?? `El.${r.fromElementId}`}`}
                  onClick={() => {
                    if (!window.confirm(`Desvincular a origem "${(fromRef as any)?.name ?? `El.${r.fromElementId}`}" deste cabo?`)) return;
                    updateRouteMut.mutate({ id: r.id, fromElementId: null }, {
                      onSuccess: () => {
                        toast.success("Origem desvinculada");
                        refetchRoutes();
                        setSidePanel({ kind: "route", route: { ...r, fromElementId: null as any } });
                      },
                      onError: (e) => toast.error(`Erro ao desvincular: ${e.message}`),
                    });
                  }}
                >
                  <Unlink className="w-3 h-3" /> Desv. Orig.
                </Button>
              ) : null}
              {r.toElementId ? (
                <Button
                  variant="outline" size="sm"
                  className="flex-1 gap-1 border-orange-500/40 text-orange-400 hover:bg-orange-500/10 text-xs"
                  disabled={updateRouteMut.isPending}
                  title={`Desvincular destino: ${(toRef as any)?.name ?? `El.${r.toElementId}`}`}
                  onClick={() => {
                    if (!window.confirm(`Desvincular o destino "${(toRef as any)?.name ?? `El.${r.toElementId}`}" deste cabo?`)) return;
                    updateRouteMut.mutate({ id: r.id, toElementId: null }, {
                      onSuccess: () => {
                        toast.success("Destino desvinculado");
                        refetchRoutes();
                        setSidePanel({ kind: "route", route: { ...r, toElementId: null as any } });
                      },
                      onError: (e) => toast.error(`Erro ao desvincular: ${e.message}`),
                    });
                  }}
                >
                  <Unlink className="w-3 h-3" /> Desv. Dest.
                </Button>
              ) : null}
              {(!r.fromElementId || !r.toElementId) && (
                <Button variant="outline" size="sm" className="flex-1 gap-2 border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10 min-w-full" onClick={() => {
                  setLinkEndpointsRouteId(r.id);
                  setLinkEndpointsFrom((r.fromElementId as any) ?? null);
                  setLinkEndpointsTo((r.toElementId as any) ?? null);
                  setLinkEndpointsFromSearch("");
                  setLinkEndpointsToSearch("");
                  setLinkEndpointsOpen(true);
                }}>
                  <span className="text-xs">🔗</span> Associar Equipamentos
                </Button>
              )}
            </div>
          )}
          {/* Seletor de Grupo */}
          <div className="border-t border-border pt-2">
            <div className="text-xs text-muted-foreground mb-1.5 font-medium flex items-center gap-1"><Folder className="w-3 h-3" /> Grupo</div>
            <Select
              value={(() => { const g = (mapGroups as any[]).find((g: any) => g.routes?.some((gr: any) => gr.routeId === r.id)); return g ? String(g.id) : "none"; })()
              }
              onValueChange={(val) => {
                const curGroup = (mapGroups as any[]).find((g: any) => g.routes?.some((gr: any) => gr.routeId === r.id));
                if (curGroup) removeRouteFromGroupMut.mutate({ groupId: curGroup.id, routeId: r.id });
                if (val !== "none") assignRouteToGroupMut.mutate({ groupId: Number(val), routeId: r.id });
              }}
            >
              <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Sem grupo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem grupo</SelectItem>
                {(mapGroups as any[]).map((g: any) => (
                  <SelectItem key={g.id} value={String(g.id)}>
                    <span className="flex items-center gap-1.5"><span style={{ background: g.color, width: 8, height: 8, borderRadius: "50%", display: "inline-block" }} />{g.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isAdmin && <Button variant="destructive" size="sm" className="w-full gap-2" onClick={() => { setDeleteRouteId(r.id); setSidePanel(null); }}><Trash2 className="w-3.5 h-3.5" /> Excluir Rota</Button>}
        </div>
      );
    }
    const el = sidePanel.element; const isCto = el.type === "cto"; const statusColor = STATUS_COLOR[el.status ?? "active"];
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          {isCto ? <Box className="w-5 h-5" style={{ color: statusColor }} /> : <Radio className="w-5 h-5" style={{ color: statusColor }} />}
          <h3 className="font-semibold">{el.name}</h3>
          <Badge className="ml-auto text-xs" style={{ background: statusColor + "33", color: statusColor, border: `1px solid ${statusColor}55` }}>
            {el.status === "active" ? "Ativo" : el.status === "maintenance" ? "Manutenção" : "Inativo"}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground">{isCto ? "CTO — Caixa de Terminação Óptica" : "CEO — Caixa de Emenda Óptica"}</div>
        <div className="text-xs text-muted-foreground/50">ID cadastro: {el.referenceId}</div>
        {isCto && (
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Capacidade</span><span>{el.capacity ?? "—"} portas</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Usadas</span><span>{el.usedPorts ?? 0} portas</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Livres</span><span className="text-emerald-400">{(el.capacity ?? 0) - (el.usedPorts ?? 0)} portas</span></div>
          </div>
        )}
        <div className="text-xs text-muted-foreground">{Number(el.lat).toFixed(6)}, {Number(el.lng).toFixed(6)}</div>
        {isCto && (
          <div className="border-t border-border pt-2 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Users className="w-3.5 h-3.5" /> Clientes SGP</div>
              {isAdmin && (
                el.sgpId ? (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-emerald-400 font-mono">ID {el.sgpId}</span>
                    <button
                      className="text-[10px] text-red-400 hover:text-red-300 underline ml-1"
                      onClick={() => unlinkCtoFromSgpMut.mutate({ ctoId: el.referenceId })}
                      disabled={unlinkCtoFromSgpMut.isPending}
                      title="Remover vínculo SGP"
                    >
                      {unlinkCtoFromSgpMut.isPending ? <Loader2 className="w-3 h-3 animate-spin inline" /> : <Unlink className="w-3 h-3 inline" />}
                    </button>
                  </div>
                ) : (
                  <button
                    className="text-[10px] text-cyan-400 hover:text-cyan-300 underline"
                    onClick={() => { setLinkSgpSearch(""); setLinkSgpSelectedId(null); setLinkSgpDialogOpen(true); setLinkSgpFetched(true); }}
                  >
                    + Vincular ao SGP
                  </button>
                )
              )}
            </div>
            {sgpQuery.isLoading ? (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Consultando SGP...</div>
            ) : sgpQuery.data?.clients?.length ? (
              <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                {sgpQuery.data.clients.map((c: any, i: number) => {
                  const isOnline = String(c.status ?? '').toLowerCase() === 'online';
                  return (
                    <div key={i} className="text-xs rounded bg-muted/40 px-1.5 py-1 space-y-0.5">
                      {/* Linha 1: nome do cliente + status */}
                      <div className="flex items-center gap-1.5">
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isOnline ? 'bg-emerald-400' : 'bg-zinc-500'}`} />
                        <span className="truncate font-medium">{c.name ?? c.login ?? `ONU ${i + 1}`}</span>
                        <span className={`ml-auto text-[10px] flex-shrink-0 ${isOnline ? 'text-emerald-400' : 'text-zinc-500'}`}>{c.status ?? ''}</span>
                      </div>
                      {/* Linha 2: login do serviço (se diferente do nome) */}
                      {c.login && c.login !== c.name && (
                        <div className="text-[10px] text-muted-foreground pl-3">Login: {c.login}</div>
                      )}
                      {/* Linha 3: MAC */}
                      {c.phy_addr && <div className="text-[10px] text-muted-foreground font-mono pl-3">MAC: {c.phy_addr}</div>}
                      {/* Linha 4: OLT / Slot / PON / Porta CTO */}
                      {(c.olt || c.slot != null || c.pon != null || c.ctoport != null) && (
                        <div className="text-[10px] text-muted-foreground pl-3">
                          {c.olt && <span>{c.olt}</span>}
                          {c.slot != null && <span className="ml-1">Slot {c.slot}</span>}
                          {c.pon != null && <span className="ml-1">PON {c.pon}</span>}
                          {c.ctoport != null && <span className="ml-1">&middot; Porta {c.ctoport}</span>}
                        </div>
                      )}
                      {/* Linha 5: Sinal RX/TX */}
                      {(c.rx != null || c.tx != null) && (
                        <div className="text-[10px] text-muted-foreground pl-3">
                          {c.rx != null && <span>RX: {c.rx} dBm</span>}
                          {c.rx != null && c.tx != null && <span className="mx-1">&middot;</span>}
                          {c.tx != null && <span>TX: {c.tx} dBm</span>}
                          {c.olt_rx != null && <span className="ml-1">(OLT: {c.olt_rx} dBm)</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : <div className="text-xs text-muted-foreground">Nenhuma ONU vinculada</div>}
          </div>
        )}
        {/* Botões de ação */}
        <div className="flex gap-2">
          <Button
            variant="outline" size="sm" className="flex-1 gap-1.5"
            onClick={() => setDetailPanel({ type: isCto ? "cto" : "ceo", id: el.referenceId })}
          >
            <Link2 className="w-3.5 h-3.5" /> Abrir detalhes
          </Button>
          <a
            href={isCto ? tenantUrl(`/cto/${el.referenceId}`) : tenantUrl(`/ceo/${el.referenceId}`)}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir em nova aba"
          >
            <Button variant="outline" size="sm" className="gap-1 px-2">
              <ExternalLink className="w-3.5 h-3.5" />
            </Button>
          </a>
          {isAdmin && (
            <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => {
              setEditElementForm({
                name: el.name ?? "",
                address: "",
                capacity: el.capacity ?? 8,
                status: el.status ?? "active",
                notes: "",
                color: el.color ?? "",
              });
              setEditElementDialogOpen(true);
            }}>
              <Pencil className="w-3.5 h-3.5" /> Editar
            </Button>
          )}
        </div>
        {/* Botão Mover (drag individual) */}
        {isAdmin && (
          <div className="flex flex-col gap-1.5">
            {/* Botão principal: Mover / Cancelar */}
            <Button
              variant="outline"
              size="sm"
              className={`w-full gap-1.5 ${
                movingElementId === el.id
                  ? "bg-amber-500/20 border-amber-500/60 text-amber-300 hover:bg-amber-500/30"
                  : "border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
              }`}
              onClick={() => {
                if (movingElementId === el.id) {
                  setMovingElementId(null);
                  setPendingMovePos(null);
                  toast.info("Modo mover cancelado");
                } else {
                  setMovingElementId(el.id);
                  setPendingMovePos(null);
                  toast.info(`Arraste ${el.name ?? el.type.toUpperCase()} para reposicionar e clique em 'Salvar posição'.`, { duration: 5000 });
                }
              }}
            >
              <Move className="w-3.5 h-3.5" />
              {movingElementId === el.id ? "Cancelar mover" : "Mover"}
            </Button>
            {/* Botão Salvar posição: só aparece após arrastar */}
            {pendingMovePos?.id === sidePanel.element.id && (
              <Button
                size="sm"
                className="w-full gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={upsertElementMut.isPending}
                onClick={() => {
                  const pending = pendingMovePos;
                  if (!pending) return;
                  upsertElementMut.mutate(
                    { type: el.type, referenceId: el.referenceId, lat: pending.lat, lng: pending.lng },
                    {
                      onSuccess: () => {
                        setMovingElementId(null);
                        setPendingMovePos(null);
                        refetchElements();
                        toast.success("Posição salva com sucesso");
                      },
                    }
                  );
                }}
              >
                {upsertElementMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Salvar posição
              </Button>
            )}
          </div>
        )}
        {/* Botão Exportar PDF de Fusões */}
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-1.5 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/10"
          disabled={fusionPdfLoading}
          onClick={async () => {
            setFusionPdfLoading(true);
            try {
              const elName = el.name ?? (isCto ? "CTO" : "CEO");
              const tubes = (isCto ? ctoTubesQuery.data : ceoTubesQuery.data) as any[] | undefined;
              const allVias = (isCto ? ctoViasQuery.data : ceoViasQuery.data) as any[] | undefined;
              const pdfCeoSplitters = (!isCto ? ceoSplittersQuery.data : undefined) as any[] | undefined;
              const pdfCeoSplitterVias = (!isCto ? ceoSplitterViasQuery.data : undefined) as any[] | undefined;
              const pdfCeoAssocs = (!isCto ? ceoViaAssocQuery.data : ctoViaAssocQuery.data) as any[] | undefined ?? [];
              if (!tubes || !allVias) { toast.error("Dados ainda n\u00e3o carregados. Aguarde."); setFusionPdfLoading(false); return; }

              // Helpers de formata\u00e7\u00e3o (igual ao CtoDetail/CeoDetail)
              const viaById: Record<number, any> = {};
              for (const v of allVias) viaById[v.id] = v;
              const tubeById: Record<number, any> = {};
              for (const t of tubes) tubeById[t.id] = t;
              const viasByTube: Record<number, any[]> = {};
              for (const v of allVias) {
                if (!viasByTube[v.tubeId]) viasByTube[v.tubeId] = [];
                viasByTube[v.tubeId].push(v);
              }
              for (const k of Object.keys(viasByTube)) viasByTube[Number(k)].sort((a: any, b: any) => a.viaNumber - b.viaNumber);
              // CEO splitter vias grouped by splitterId
              const viasBySplitter: Record<number, any[]> = {};
              for (const v of (pdfCeoSplitterVias ?? [])) {
                if (!viasBySplitter[v.splitterId]) viasBySplitter[v.splitterId] = [];
                viasBySplitter[v.splitterId].push(v);
              }
              for (const k of Object.keys(viasBySplitter)) viasBySplitter[Number(k)].sort((a: any, b: any) => a.viaNumber - b.viaNumber);

              const totalVias = tubes.reduce((s: number, t: any) => s + t.totalVias, 0);
              const fusedVias = allVias.filter((v: any) => v.fusedToViaId !== null || pdfCeoAssocs.some((a: any) =>
                (a.sourceType === "tube" && a.sourceViaId === v.id) ||
                (a.targetType === "tube" && a.targetViaId === v.id)
              )).length;
              // Lookup: splitterViaById para associações
              const splitterViaById: Record<number, any> = {};
              for (const sv of (pdfCeoSplitterVias ?? [])) splitterViaById[sv.id] = sv;
              const splitterById2: Record<number, any> = {};
              for (const s of (pdfCeoSplitters ?? [])) splitterById2[s.id] = s;
              const now = new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

              const PRINT_VIA_COLORS: Record<number, { bg: string; text: string; border: string }> = {
                1:  { bg: "#dcfce7", text: "#15803d", border: "#86efac" },
                2:  { bg: "#fef9c3", text: "#854d0e", border: "#fde047" },
                3:  { bg: "#f9fafb", text: "#374151", border: "#d1d5db" },
                4:  { bg: "#dbeafe", text: "#1d4ed8", border: "#93c5fd" },
                5:  { bg: "#fee2e2", text: "#b91c1c", border: "#fca5a5" },
                6:  { bg: "#f3e8ff", text: "#7e22ce", border: "#d8b4fe" },
                7:  { bg: "#fef3c7", text: "#78350f", border: "#fcd34d" },
                8:  { bg: "#fce7f3", text: "#be185d", border: "#f9a8d4" },
                9:  { bg: "#1f2937", text: "#f9fafb", border: "#374151" },
                10: { bg: "#f3f4f6", text: "#374151", border: "#9ca3af" },
                11: { bg: "#ffedd5", text: "#c2410c", border: "#fdba74" },
                12: { bg: "#cffafe", text: "#0e7490", border: "#67e8f9" },
              };
              const escH = (s: string | null | undefined) => (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
              const colorBadge = (colorName: string | null): string => {
                if (!colorName) return "";
                const cm: Record<string, { bg: string; text: string; border: string }> = {
                  azul: { bg: "#dbeafe", text: "#1d4ed8", border: "#93c5fd" }, verde: { bg: "#dcfce7", text: "#15803d", border: "#86efac" },
                  amarelo: { bg: "#fef9c3", text: "#854d0e", border: "#fde047" }, vermelho: { bg: "#fee2e2", text: "#b91c1c", border: "#fca5a5" },
                  laranja: { bg: "#ffedd5", text: "#c2410c", border: "#fdba74" }, roxo: { bg: "#f3e8ff", text: "#7e22ce", border: "#d8b4fe" },
                  rosa: { bg: "#fce7f3", text: "#be185d", border: "#f9a8d4" }, branco: { bg: "#f9fafb", text: "#374151", border: "#d1d5db" },
                  preto: { bg: "#1f2937", text: "#f9fafb", border: "#374151" }, cinza: { bg: "#f3f4f6", text: "#374151", border: "#d1d5db" },
                  marrom: { bg: "#fef3c7", text: "#78350f", border: "#fcd34d" }, ciano: { bg: "#cffafe", text: "#0e7490", border: "#67e8f9" },
                };
                const st = cm[colorName.toLowerCase().trim()] ?? { bg: "#f3f4f6", text: "#374151", border: "#d1d5db" };
                return `<span style='background:${st.bg};color:${st.text};border:1px solid ${st.border};padding:1px 6px;border-radius:3px;font-size:7pt;font-weight:700;margin-left:6mm'>${colorName.toUpperCase()}</span>`;
              };
              const renderTubeHtml = (tube: any): string => {
                const vias = viasByTube[tube.id] ?? [];
                const fused = vias.filter((v: any) => v.fusedToViaId !== null || pdfCeoAssocs.some((a: any) =>
                  (a.sourceType === "tube" && a.sourceViaId === v.id) ||
                  (a.targetType === "tube" && a.targetViaId === v.id)
                )).length;
                return `<div class="tube-section">
                  <div class="tube-title${tube.type === "splitter" ? " splitter-title" : ""}">
                    ${tube.type === "splitter" ? "SPLITTER" : "TUBO"} &mdash; ${escH(tube.identifier)}
                    ${colorBadge(tube.color)}
                    <span style="font-weight:400;font-size:8pt;margin-left:6mm;color:#6b7280">${tube.totalVias} vias &middot; ${fused} fusionada${fused !== 1 ? "s" : ""}</span>
                  </div>
                  <table><thead><tr>
                    <th style="width:8%">VIA</th><th style="width:20%">ETIQUETA</th>
                    <th style="width:12%">STATUS</th><th style="width:35%">IDENT. FUS&Atilde;O</th><th>OBSERVA&Ccedil;&Otilde;ES</th>
                  </tr></thead><tbody>
                  ${vias.map((via: any, idx: number) => {
                    const ft = via.fusedToTubeId ? tubeById[via.fusedToTubeId] : null;
                    const fv = via.fusedToViaId ? viaById[via.fusedToViaId] : null;
                    const ok = !!(ft && fv);
                    // Verificar associação com splitter
                    const myAssoc = !ok ? pdfCeoAssocs.find((a: any) =>
                      (a.sourceType === "tube" && a.sourceViaId === via.id) ||
                      (a.targetType === "tube" && a.targetViaId === via.id)
                    ) : null;
                    const hasAssoc = !!myAssoc;
                    const bg = ok ? "#f0fdfa" : hasAssoc ? "#f0fdf4" : (idx % 2 === 0 ? "#fff" : "#f8f9fa");
                    const lbl = via.label ? "<b>" + escH(via.label) + "</b>" : "<span style='color:#9ca3af;font-style:italic'>&mdash;</span>";
                    let st: string; let fc: string; let ft2: string;
                    if (ok) {
                      st = "<span style='background:#d1fae5;color:#059669;padding:1px 5px;border-radius:3px;font-size:7pt;font-weight:700'>FUSIONADA</span>";
                      fc = "#059669";
                      ft2 = "VIA " + fv!.viaNumber + " do " + escH(ft!.identifier) + (fv!.label ? " (" + escH(fv!.label) + ")" : "");
                    } else if (hasAssoc) {
                      // Associação com splitter
                      const isSrc = myAssoc.sourceType === "tube" && myAssoc.sourceViaId === via.id;
                      const otherViaId = isSrc ? myAssoc.targetViaId : myAssoc.sourceViaId;
                      const otherType = isSrc ? myAssoc.targetType : myAssoc.sourceType;
                      let assocLabel = "";
                      if (otherType === "splitter") {
                        const sv = splitterViaById[otherViaId];
                        const sp = sv ? splitterById2[sv.splitterId] : null;
                        assocLabel = sv && sp ? "VIA " + String(sv.viaNumber).padStart(2,"0") + " &middot; " + escH(sp.identifier) : "Via #" + otherViaId;
                      } else {
                        const ov = viaById[otherViaId];
                        const ot = ov ? tubeById[ov.tubeId] : null;
                        assocLabel = ov && ot ? "VIA " + String(ov.viaNumber).padStart(2,"0") + " &middot; " + escH(ot.identifier) : "Via #" + otherViaId;
                      }
                      st = "<span style='background:#dcfce7;color:#166534;padding:1px 5px;border-radius:3px;font-size:7pt;font-weight:700'>ASSOC</span>";
                      fc = "#166534";
                      ft2 = assocLabel;
                    } else {
                      st = "<span style='background:#f3f4f6;color:#9ca3af;padding:1px 5px;border-radius:3px;font-size:7pt'>LIVRE</span>";
                      fc = "#9ca3af";
                      ft2 = "&mdash;";
                    }
                    const isEntryVia = tube.type === "splitter" && via.viaNumber === 0;
                    const viaDisplayNum = isEntryVia ? "ENT" : (tube.type === "splitter" ? String(via.viaNumber).padStart(2, "0") : via.viaNumber);
                    const vc = isEntryVia ? null : PRINT_VIA_COLORS[via.viaNumber];
                    const vc2 = isEntryVia
                      ? `<span style='background:#f3e8ff;color:#7c3aed;border:1px solid #c4b5fd;padding:2px 7px;border-radius:3px;font-size:8pt;font-weight:700'>ENT</span>`
                      : (vc ? `<span style='background:${vc.bg};color:${vc.text};border:1px solid ${vc.border};padding:2px 7px;border-radius:3px;font-size:8pt;font-weight:700'>${viaDisplayNum}</span>` : `<b>${viaDisplayNum}</b>`);
                    return `<tr style='background:${bg}'><td style='text-align:center'>${vc2}</td><td>${lbl}</td><td style='text-align:center'>${st}</td><td style='color:${fc}'>${ft2}</td><td style='font-size:8pt;color:#6b7280'>${escH(via.notes)}</td></tr>`;
                  }).join("")}
                  </tbody></table></div>`;
              }

              // Render CEO splitter as a section in the PDF
              const renderCeoSplitterHtml = (spl: any): string => {
                const vias = viasBySplitter[spl.id] ?? [];
                const escH2 = escH;
                return `<div class="tube-section">
                  <div class="tube-title splitter-title">
                    SPLITTER &mdash; ${escH2(spl.identifier)}
                    <span style="font-weight:400;font-size:8pt;margin-left:6mm;color:#6b7280">${escH2(spl.ratio)} &middot; ${vias.length} vias</span>
                  </div>
                  <table><thead><tr>
                    <th style="width:8%">VIA</th><th style="width:10%">TIPO</th><th style="width:18%">ETIQUETA</th><th style="width:10%">PERDA</th><th style="width:30%">ASSOCIA&Ccedil;&Atilde;O</th><th>OBSERVA&Ccedil;&Otilde;ES</th>
                  </tr></thead><tbody>
                  ${vias.map((via: any, idx: number) => {
                    const isEntrada = via.viaNumber === 0;
                    const bg = isEntrada ? "#fefce8" : (idx % 2 === 0 ? "#fff" : "#f8f9fa");
                    const lbl = via.label ? "<b>" + escH2(via.label) + "</b>" : "<span style='color:#9ca3af;font-style:italic'>&mdash;</span>";
                    const viaLabel = isEntrada ? "ENT" : String(via.viaNumber).padStart(2, "0");
                    const tipoLabel = isEntrada
                      ? "<span style='background:#fef3c7;color:#92400e;padding:1px 4px;border-radius:3px;font-size:7pt;font-weight:700'>ENTRADA</span>"
                      : "<span style='background:#e0f2fe;color:#0c4a6e;padding:1px 4px;border-radius:3px;font-size:7pt'>SA&Iacute;DA</span>";
                    const lossLabel = isEntrada ? "0 dB" : (via.lossDb !== null ? "~" + via.lossDb + " dB" : "&mdash;");
                    const myAssocSpl = pdfCeoAssocs.find((a: any) =>
                      (a.sourceType === "splitter" && a.sourceViaId === via.id) ||
                      (a.targetType === "splitter" && a.targetViaId === via.id)
                    );
                    let assocLabel = "&mdash;";
                    if (myAssocSpl) {
                      const isSrc = myAssocSpl.sourceType === "splitter" && myAssocSpl.sourceViaId === via.id;
                      const otherViaId = isSrc ? myAssocSpl.targetViaId : myAssocSpl.sourceViaId;
                      const otherType = isSrc ? myAssocSpl.targetType : myAssocSpl.sourceType;
                      if (otherType === "tube") {
                        const ov = viaById[otherViaId];
                        const ot = ov ? tubeById[ov.tubeId] : null;
                        assocLabel = ov && ot ? "VIA " + String(ov.viaNumber).padStart(2,"0") + " &middot; " + escH2(ot.identifier) : "Via #" + otherViaId;
                      } else {
                        const sv2 = splitterViaById[otherViaId];
                        const sp2 = sv2 ? splitterById2[sv2.splitterId] : null;
                        assocLabel = sv2 && sp2 ? "VIA " + String(sv2.viaNumber).padStart(2,"0") + " &middot; " + escH2(sp2.identifier) : "Via #" + otherViaId;
                      }
                    }
                    const assocColor = myAssocSpl ? "#166534" : "#9ca3af";
                    return `<tr style='background:${bg}'><td style='text-align:center;font-weight:700;color:#7c3aed'>${viaLabel}</td><td style='text-align:center'>${tipoLabel}</td><td>${lbl}</td><td style='text-align:center;color:#6b7280;font-size:8pt'>${lossLabel}</td><td style='color:${assocColor};font-size:8pt'>${assocLabel}</td><td style='font-size:8pt;color:#6b7280'>${escH2(via.notes)}</td></tr>`;
                  }).join("")}
                  </tbody></table></div>`;
              };
              const splitterContent = (pdfCeoSplitters ?? []).map((s: any) => renderCeoSplitterHtml(s)).join("");
              const allContent = tubes.map((t: any) => renderTubeHtml(t)).join("") + splitterContent;
              const elNameSafe = escH(elName);
              const statusColor = (el.status === "active") ? "#059669" : "#d97706";
              const statusLabel = el.status === "active" ? "Ativo" : el.status === "maintenance" ? "Manuten&ccedil;&atilde;o" : "Inativo";
              const statsHtml = [
                { l: "Tubos", v: tubes.filter((t: any) => t.type === "tube").length },
                { l: "Splitters", v: (tubes.filter((t: any) => t.type === "splitter").length) + (pdfCeoSplitters?.length ?? 0) },
                { l: "Total de Vias", v: totalVias },
                { l: "Vias Fusionadas", v: fusedVias },
                { l: "Vias Livres", v: totalVias - fusedVias },
                { l: "Ocupa&ccedil;&atilde;o", v: totalVias > 0 ? Math.round((fusedVias / totalVias) * 100) + "%" : "0%" },
              ].map(s => `<div class='stat'><div class='stat-val'>${s.v}</div><div class='stat-lbl'>${s.l}</div></div>`).join("");

              const html = `<!DOCTYPE html><html lang="pt-BR"><head>
                <meta charset="UTF-8">
                <title>Mapa de Fus&otilde;es &mdash; ${isCto ? "CTO" : "CEO"} ${elNameSafe}</title>
                <style>
                  * { box-sizing: border-box; margin: 0; padding: 0; }
                  body { font-family: Arial, sans-serif; font-size: 10pt; color: #111; background: white; padding: 14mm 16mm; }
                  h1 { font-size: 16pt; font-weight: 800; color: #1a1a2e; margin-bottom: 2mm; }
                  h2 { font-size: 14pt; font-weight: 700; color: #059669; margin-bottom: 1mm; }
                  .header { border-bottom: 2px solid #1a1a2e; padding-bottom: 6mm; margin-bottom: 6mm; display: flex; justify-content: space-between; align-items: flex-start; }
                  .header-right { text-align: right; font-size: 8pt; color: #6b7280; }
                  .stats { display: flex; gap: 6mm; margin-bottom: 6mm; flex-wrap: wrap; }
                  .stat { border: 1px solid #ddd; padding: 3mm 5mm; text-align: center; min-width: 22mm; }
                  .stat-val { font-size: 14pt; font-weight: 700; color: #1a1a2e; }
                  .stat-lbl { font-size: 7pt; color: #6b7280; text-transform: uppercase; }
                  table { width: 100%; border-collapse: collapse; margin-bottom: 6mm; font-size: 9pt; }
                  th { background: #1a1a2e; color: white; padding: 4px 8px; text-align: left; font-size: 8pt; text-transform: uppercase; border: 1px solid #333; }
                  td { padding: 4px 8px; border: 1px solid #ddd; vertical-align: middle; }
                  .tube-section { margin-bottom: 8mm; page-break-inside: avoid; }
                  .tube-title { font-size: 10pt; font-weight: 700; margin-bottom: 2mm; padding: 3px 8px; background: #d1fae5; border-left: 4px solid #059669; }
                  .splitter-title { background: #f3e8ff; border-left-color: #7c3aed; }
                  .footer { border-top: 1px solid #ddd; padding-top: 4mm; margin-top: 6mm; font-size: 7pt; color: #6b7280; display: flex; justify-content: space-between; }
                  @media print { body { padding: 0; } @page { size: A4 portrait; margin: 14mm 16mm; } }
                </style>
              </head><body>
                <div class="header">
                  <div>
                    <h1>MAPA DE FUS&Otilde;ES &mdash; ${isCto ? "CTO" : "CEO"}</h1>
                    <h2>${elNameSafe}</h2>
                  </div>
                  <div class="header-right">
                    <div style="font-weight:700;font-size:9pt;color:#1a1a2e;margin-bottom:1mm">FiberDoc</div>
                    <div>Gerado em: ${now}</div>
                    <div style="margin-top:1mm">Status: <b style="color:${statusColor}">${statusLabel}</b></div>
                  </div>
                </div>
                <div class="stats">${statsHtml}</div>
                ${allContent}
                <div class="footer">
                  <span>FiberDoc &mdash; Sistema de Gest&atilde;o de Infraestrutura de Rede &Oacute;ptica</span>
                  <span>${elNameSafe} &middot; ${now}</span>
                </div>
              </body></html>`;

              const win = window.open("", "_blank", "width=900,height=700");
              if (!win) { toast.error("Popup bloqueado pelo navegador. Permita popups para este site."); return; }
              win.document.write(html);
              win.document.close();
              win.focus();
              setTimeout(() => win.print(), 500);
              toast.success("PDF aberto para impress\u00e3o");
            } catch (e: any) { toast.error(e.message ?? "Erro ao gerar PDF"); } finally { setFusionPdfLoading(false); }
          }}
        >
          {fusionPdfLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
          Exportar Fusões PDF
        </Button>
        {/* Painel de Tubos e Vias */}
        {(() => {
          const tubes = (isCto ? ctoTubesQuery.data : ceoTubesQuery.data) as any[] | undefined;
          const allVias = (isCto ? ctoViasQuery.data : ceoViasQuery.data) as any[] | undefined;
          const ceoSplitters = (!isCto ? ceoSplittersQuery.data : undefined) as any[] | undefined;
          const ceoSplitterVias = (!isCto ? ceoSplitterViasQuery.data : undefined) as any[] | undefined;
          const ceoViaAssocs = (!isCto ? ceoViaAssocQuery.data : undefined) as any[] | undefined;
          const ctoViaAssocs = (isCto ? ctoViaAssocQuery.data : undefined) as any[] | undefined;
          const isLoadingTubes = isCto ? ctoTubesQuery.isLoading : ceoTubesQuery.isLoading;
          if (isLoadingTubes) return (
            <div className="border-t border-border pt-2">
              <div className="text-xs text-muted-foreground mb-1.5 font-medium flex items-center gap-1">
                <Layers className="w-3 h-3" /> Tubos e Vias
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" /> Carregando...
              </div>
            </div>
          );
          const tubeCount = tubes?.length ?? 0;
          const splitterCount = ceoSplitters?.length ?? 0;
          // Estatísticas de ocupação globais para CTO
          const ctoAllVias = isCto ? (allVias ?? []) : [];
          const ctoTotalVias = ctoAllVias.length;
          const ctoFusedVias = ctoAllVias.filter((v: any) => v.fusedToViaId !== null || (ctoViaAssocs ?? []).some((a: any) =>
            (a.sourceType === "tube" && a.sourceViaId === v.id) ||
            (a.targetType === "tube" && a.targetViaId === v.id) ||
            (a.sourceType === "splitter" && a.sourceViaId === v.id) ||
            (a.targetType === "splitter" && a.targetViaId === v.id)
          )).length;
          const ctoFreeVias = ctoTotalVias - ctoFusedVias;
          const ctoOccPct = ctoTotalVias > 0 ? Math.round((ctoFusedVias / ctoTotalVias) * 100) : 0;
          const ctoOccBarColor = ctoOccPct >= 90 ? "#ef4444" : ctoOccPct >= 60 ? "#f59e0b" : "#22c55e";
          return (
            <div className="border-t border-border pt-2">
              <div className="text-xs text-muted-foreground mb-2 font-medium flex items-center gap-1">
                <Layers className="w-3 h-3" /> Tubos e Vias
                {(tubeCount > 0 || splitterCount > 0) && <span className="ml-auto text-muted-foreground/60">{tubeCount} tubo{tubeCount !== 1 ? "s" : ""}{splitterCount > 0 ? ` · ${splitterCount} splitter${splitterCount !== 1 ? "s" : ""}` : ""}</span>}
                {isAdmin && isCto && (
                  <button
                    className="ml-auto flex items-center gap-0.5 text-xs text-primary hover:text-primary/80 font-medium"
                    onClick={() => {
                      setAddTubeForm({ identifier: "", type: "tube", totalVias: 12, color: "", notes: "" });
                      setAddTubeDialogOpen(true);
                    }}
                  >
                    <Plus className="w-3 h-3" /> Adicionar
                  </button>
                )}
              </div>
              {/* Indicador de ocupação global + filtro de vias (apenas CTO) */}
              {isCto && ctoTotalVias > 0 && (
                <div className="mb-2 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Ocupação geral</span>
                    <span className="font-semibold" style={{ color: ctoOccBarColor }}>{ctoFusedVias}/{ctoTotalVias} vias ({ctoOccPct}%)</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted/40 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${ctoOccPct}%`, background: ctoOccBarColor }} />
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    {(["all", "free", "fused", "entry"] as const).map(f => (
                      <button
                        key={f}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors border ${
                          ctoViaFilter === f
                            ? "bg-primary/20 border-primary/50 text-primary"
                            : "bg-transparent border-border/40 text-muted-foreground hover:border-primary/30"
                        }`}
                        onClick={() => setCtoViaFilter(f)}
                      >
                        {f === "all" ? `Todas (${ctoTotalVias})` : f === "free" ? `Livres (${ctoFreeVias})` : f === "fused" ? `Fundidas (${ctoFusedVias})` : "Entrada"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {(!tubes || tubes.length === 0) && (
                <div className="text-xs text-muted-foreground/60 italic py-1">Nenhum tubo cadastrado. Clique em "Adicionar" para criar.</div>
              )}
              <div className="space-y-1">
                {(tubes ?? []).map((tube: any) => {
                  const tubViasAll = (allVias ?? []).filter((v: any) => v.tubeId === tube.id);
                  // Contar fusões incluindo associações tubo-splitter
                  const fusedCount = tubViasAll.filter((v: any) => v.fusedToViaId !== null || (isCto ? (ctoViaAssocs ?? []) : (ceoViaAssocs ?? [])).some((a: any) =>
                    (a.sourceType === "tube" && a.sourceViaId === v.id) ||
                    (a.targetType === "tube" && a.targetViaId === v.id)
                  )).length;
                  const total = tube.totalVias;
                  const pct = total > 0 ? Math.round((fusedCount / total) * 100) : 0;
                  // NOTE: For CEO, splitters are rendered separately below
                  const isExpanded = expandedTubeIds.has(tube.id);
                  const barColor = pct >= 90 ? "#ef4444" : pct >= 60 ? "#f59e0b" : "#22c55e";
                  // Aplicar filtro de vias (apenas CTO)
                  const tubVias = isCto && ctoViaFilter !== "all"
                    ? tubViasAll.filter((v: any) => {
                        const isViaFused = v.fusedToViaId !== null || (ctoViaAssocs ?? []).some((a: any) =>
                          (a.sourceType === "tube" && a.sourceViaId === v.id) ||
                          (a.targetType === "tube" && a.targetViaId === v.id)
                        );
                        if (ctoViaFilter === "free") return !isViaFused && v.viaNumber !== 0;
                        if (ctoViaFilter === "fused") return isViaFused;
                        if (ctoViaFilter === "entry") return v.viaNumber === 0;
                        return true;
                      })
                    : tubViasAll;
                  return (
                    <div key={tube.id} className="rounded border border-border/40 overflow-hidden">
                      {/* Cabeçalho do tubo com botões de ação */}
                      <div className="flex items-center">
                        <button
                          className="flex-1 flex items-center gap-2 px-2 py-1.5 hover:bg-accent/30 text-left min-w-0"
                          onClick={() => {
                            const next = new Set(expandedTubeIds);
                            if (next.has(tube.id)) next.delete(tube.id); else next.add(tube.id);
                            setExpandedTubeIds(next);
                          }}
                        >
                          <span className="text-xs text-muted-foreground shrink-0">{isExpanded ? "▾" : "▸"}</span>
                          <span className="text-xs font-medium flex-1 truncate">{tube.type === "splitter" ? "⊕" : "○"} {tube.identifier}</span>
                          <span className="text-xs text-muted-foreground shrink-0">{fusedCount}/{total}</span>
                        </button>
                        {isAdmin && (
                          <div className="flex items-center gap-0.5 pr-1 shrink-0">
                            <button
                              className="p-1 rounded hover:bg-accent/40 text-muted-foreground hover:text-foreground"
                              title="Editar tubo"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingTube({ id: tube.id, identifier: tube.identifier, type: tube.type, color: tube.color ?? "", notes: tube.notes ?? "", isCto });
                                setEditTubeDialogOpen(true);
                              }}
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              className="p-1 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400"
                              title="Excluir tubo"
                              onClick={(e) => { e.stopPropagation(); setDeleteTubeId({ id: tube.id, isCto }); }}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                      {/* Barra de ocupação */}
                      <div className="h-1 bg-muted/30 mx-2 mb-1.5 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
                      </div>
                      {/* Lista de vias expandida */}
                      {isExpanded && (
                        <div className="px-2 pb-1.5 space-y-0.5 max-h-48 overflow-y-auto">
                          {tubVias.length === 0 && <div className="text-xs text-muted-foreground/50 italic py-0.5">Nenhuma via cadastrada</div>}
                          {tubVias.sort((a: any, b: any) => a.viaNumber - b.viaNumber).map((via: any) => {
                            // Verificar fusão directa (tubo-tubo) ou via associação (tubo-splitter)
                            const viaAssocs = isCto ? (ctoViaAssocs ?? []) : (ceoViaAssocs ?? []);
                            const assocForVia = viaAssocs.find((a: any) =>
                              (a.sourceType === "tube" && a.sourceViaId === via.id) ||
                              (a.targetType === "tube" && a.targetViaId === via.id)
                            );
                            const isFused = via.fusedToViaId !== null || !!assocForVia;
                            const viaColor = FIBER_VIA_COLORS[via.viaNumber] ?? "#6b7280";
                            // Badge de destino de fusão: mostra o outro lado da ligação
                            let assocBadge: { tubeIdentifier: string; viaNumber: number; isSplitter: boolean } | null = null;
                            if (assocForVia) {
                              // Fusão via associação (tubo↔splitter)
                              const otherViaId = (assocForVia.sourceType === "tube" && assocForVia.sourceViaId === via.id)
                                ? assocForVia.targetViaId
                                : assocForVia.sourceViaId;
                              const otherType = (assocForVia.sourceType === "tube" && assocForVia.sourceViaId === via.id)
                                ? assocForVia.targetType
                                : assocForVia.sourceType;
                              const otherVia = (allVias ?? []).find((v: any) => v.id === otherViaId);
                              if (otherVia) {
                                const otherTube = (tubes ?? []).find((t: any) => t.id === otherVia.tubeId);
                                if (otherTube) {
                                  assocBadge = {
                                    tubeIdentifier: otherTube.identifier,
                                    viaNumber: otherVia.viaNumber,
                                    isSplitter: otherType === "splitter" || otherTube.type === "splitter",
                                  };
                                }
                              }
                            } else if (via.fusedToViaId && via.fusedToTubeId) {
                              // Fusão directa tubo↔tubo (fusedToViaId/fusedToTubeId)
                              const destTube = (tubes ?? []).find((t: any) => t.id === via.fusedToTubeId);
                              const destVia = (allVias ?? []).find((v: any) => v.id === via.fusedToViaId);
                              if (destTube && destVia) {
                                assocBadge = {
                                  tubeIdentifier: destTube.identifier,
                                  viaNumber: destVia.viaNumber,
                                  isSplitter: destTube.type === "splitter",
                                };
                              }
                            }
                            return (
                              <div key={via.id} className="flex items-center gap-0.5 group">
                                <button
                                  className={`flex-1 flex items-center gap-1.5 text-xs py-0.5 px-1 rounded hover:bg-accent/30 text-left transition-colors ${isFused ? "" : "hover:bg-emerald-500/10"}`}
                                  title={isFused ? "Clique para remover fusão" : "Clique para registrar fusão"}
                                  onClick={() => {
                                    if (isFused) {
                                      if (assocForVia) {
                                        // Fusão via associação (tubo-splitter): apagar a associação
                                        if (isCto) {
                                          deleteCtoSplFusionMut.mutate({ ctoId: sidePanelRefId, viaId1: assocForVia.sourceViaId, viaId2: assocForVia.targetViaId });
                                        } else {
                                          deleteSplFusionMut.mutate({ ceoId: sidePanelRefId, viaId1: assocForVia.sourceViaId, viaId2: assocForVia.targetViaId });
                                        }
                                      } else {
                                        setClearFusionConfirm({ id: via.id, viaNumber: via.viaNumber, isCto });
                                      }
                                    } else {
                                      setFusionSourceVia({ id: via.id, viaNumber: via.viaNumber, tubeId: tube.id, isCto, isFused: false, label: via.label });
                                      setFusionTargetTubeId("");
                                      setFusionTargetViaId("");
                                      setFusionDialogOpen(true);
                                    }
                                  }}
                                >
                                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isFused ? "bg-emerald-400" : (tube.type === "splitter" && via.viaNumber === 0 ? "bg-purple-400" : "bg-muted-foreground/30")}`} />
                                  <span
                                    className="shrink-0 flex items-center gap-0.5"
                                    style={{ minWidth: "2rem" }}
                                    title={`Via ${via.viaNumber}`}
                                  >
                                    {tube.type !== "splitter" && (
                                      <span
                                        className="inline-block w-2 h-2 rounded-full border border-white/20 shrink-0"
                                        style={{ background: viaColor }}
                                      />
                                    )}
                                    <span className={tube.type === "splitter" && via.viaNumber === 0 ? "text-purple-300 font-semibold" : "text-muted-foreground"}>
                                      {tube.type === "splitter" ? (via.viaNumber === 0 ? "ENT" : String(via.viaNumber).padStart(2, "0")) : via.viaNumber}
                                    </span>
                                  </span>
                                  {via.label && via.viaNumber !== 0
                                    ? <span className="truncate font-medium">{via.label}</span>
                                    : via.viaNumber === 0
                                      ? <span className="text-muted-foreground/70 italic">{tube.type === "splitter" ? "entrada" : "livre"}</span>
                                      : <span className="text-muted-foreground/50 italic">livre</span>}
                                  {/* Badge de associação CTO: mostra o outro lado da ligação */}
                                  {assocBadge && (
                                    <span className="ml-1 flex items-center gap-0.5 text-[10px] text-violet-300 bg-violet-500/10 border border-violet-500/20 rounded px-1 py-0 shrink-0 font-medium" title={`Associado a ${assocBadge.isSplitter ? "SPL" : "TUB"} ${assocBadge.tubeIdentifier} / Via ${assocBadge.viaNumber === 0 ? "ENT" : assocBadge.viaNumber}`}>
                                      → {assocBadge.isSplitter ? "SPL" : "TUB"} {assocBadge.tubeIdentifier} / {assocBadge.viaNumber === 0 ? "ENT" : String(assocBadge.viaNumber).padStart(2, "0")}
                                    </span>
                                  )}
                                  {isFused && (
                                    <span className="ml-auto flex items-center gap-0.5 text-[10px] text-red-400 font-semibold shrink-0">
                                      <Link2Off className="w-2.5 h-2.5" /> desfazer
                                    </span>
                                  )}
                                  {!isFused && (
                                    <span className="ml-auto flex items-center gap-0.5 text-[10px] text-cyan-400 font-semibold shrink-0">
                                      <Link2 className="w-2.5 h-2.5" /> fundir
                                    </span>
                                  )}
                                </button>
                                <button
                                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-accent/50 transition-all shrink-0"
                                  title="Editar via"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditViaData({ id: via.id, viaNumber: via.viaNumber, label: via.label ?? "", notes: via.notes ?? "", isCto });
                                    setEditViaDialogOpen(true);
                                  }}
                                >
                                  <Pencil className="w-2.5 h-2.5 text-muted-foreground" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* Splitters do CEO */}
              {!isCto && ceoSplitters && ceoSplitters.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="text-xs text-muted-foreground/70 font-medium px-1 flex items-center gap-1">
                    <span className="text-purple-400">⊕</span> Splitters
                  </div>
                  {ceoSplitters.map((spl: any) => {
                    const splVias = (ceoSplitterVias ?? []).filter((v: any) => v.splitterId === spl.id);
                    const isExpanded = expandedTubeIds.has(spl.id + 100000);
                    return (
                      <div key={spl.id} className="rounded border border-purple-500/30 overflow-hidden">
                        <button
                          className="flex-1 w-full flex items-center gap-2 px-2 py-1.5 hover:bg-purple-500/10 text-left min-w-0"
                          onClick={() => {
                            const next = new Set(expandedTubeIds);
                            const key = spl.id + 100000;
                            if (next.has(key)) next.delete(key); else next.add(key);
                            setExpandedTubeIds(next);
                          }}
                        >
                          <span className="text-xs text-muted-foreground shrink-0">{isExpanded ? "▾" : "▸"}</span>
                          <span className="text-xs font-medium flex-1 truncate text-purple-300">⊕ {spl.identifier}</span>
                          <span className="text-xs text-muted-foreground/60 shrink-0">{spl.ratio}</span>
                          <span className="text-xs text-muted-foreground shrink-0">{splVias.length}v</span>
                        </button>
                        {isExpanded && (
                          <div className="px-2 pb-1.5 space-y-0.5 max-h-60 overflow-y-auto">
                            {splVias.map((via: any) => {
                              const myAssoc = (ceoViaAssocs ?? []).find((a: any) =>
                                (a.sourceType === "splitter" && a.sourceViaId === via.id) ||
                                (a.targetType === "splitter" && a.targetViaId === via.id)
                              );
                              const isFused = !!myAssoc;
                              // Badge de destino: mostrar o tubo/via do outro lado da associação
                              let splAssocBadge: { tubeIdentifier: string; viaNumber: number } | null = null;
                              if (myAssoc) {
                                const otherViaId = (myAssoc.sourceType === "splitter" && myAssoc.sourceViaId === via.id)
                                  ? myAssoc.targetViaId : myAssoc.sourceViaId;
                                const otherVia = (ceoViasQuery.data as any[] ?? []).find((v: any) => v.id === otherViaId);
                                if (otherVia) {
                                  const otherTube = (ceoTubesQuery.data as any[] ?? []).find((t: any) => t.id === otherVia.tubeId);
                                  if (otherTube) splAssocBadge = { tubeIdentifier: otherTube.identifier, viaNumber: otherVia.viaNumber };
                                }
                              }
                              return (
                                <div key={via.id} className={`flex items-center gap-1.5 text-xs py-0.5 px-1 rounded group cursor-pointer ${isFused ? "bg-cyan-500/10" : "hover:bg-accent/20"}`}
                                  onClick={() => {
                                    if (isFused) {
                                      deleteSplFusionMut.mutate({ ceoId: sidePanelRefId, viaId1: via.id, viaId2: myAssoc.sourceType === "splitter" && myAssoc.sourceViaId === via.id ? myAssoc.targetViaId : myAssoc.sourceViaId });
                                    } else {
                                      setSplFusionSourceVia({ id: via.id, viaNumber: via.viaNumber, splitterId: spl.id });
                                      setSplFusionTargetType("tube");
                                      setSplFusionTargetTubeId("");
                                      setSplFusionTargetViaId("");
                                      setSplFusionDialogOpen(true);
                                    }
                                  }}
                                >
                                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isFused ? "bg-cyan-400" : "bg-purple-400/50"}`} />
                                  <span className="text-muted-foreground shrink-0" style={{ minWidth: "2rem" }}>
                                    {via.viaNumber === 0 ? "ENT" : String(via.viaNumber).padStart(2, "0")}
                                  </span>
                                  {via.label
                                    ? <span className="truncate font-medium">{via.label}</span>
                                    : <span className="text-muted-foreground/50 italic">{via.viaNumber === 0 ? "entrada" : "livre"}</span>}
                                  {/* Badge de destino: mostra o tubo/via do outro lado */}
                                  {splAssocBadge && (
                                    <span className="ml-1 flex items-center gap-0.5 text-[10px] text-violet-300 bg-violet-500/10 border border-violet-500/20 rounded px-1 py-0 shrink-0 font-medium"
                                      title={`Associado a TUB ${splAssocBadge.tubeIdentifier} / Via ${splAssocBadge.viaNumber}`}>
                                      → TUB {splAssocBadge.tubeIdentifier} / {String(splAssocBadge.viaNumber).padStart(2, "0")}
                                    </span>
                                  )}
                                  {isFused ? (
                                    <span className="ml-auto flex items-center gap-0.5 text-[10px] text-red-400 font-semibold shrink-0">
                                      <Link2Off className="w-2.5 h-2.5" /> desfazer
                                    </span>
                                  ) : (
                                    <span className="ml-auto flex items-center gap-0.5 text-[10px] text-cyan-400 font-semibold shrink-0">
                                      <Link2 className="w-2.5 h-2.5" /> fundir
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}
        {/* Seletor de Grupo */}
        <div className="border-t border-border pt-2">
          <div className="text-xs text-muted-foreground mb-1.5 font-medium flex items-center gap-1"><Folder className="w-3 h-3" /> Grupo</div>
          <Select
            value={(() => { const g = (mapGroups as any[]).find((g: any) => g.elements?.some((ge: any) => ge.elementId === el.id)); return g ? String(g.id) : "none"; })()}
            onValueChange={(val) => {
              const curGroup = (mapGroups as any[]).find((g: any) => g.elements?.some((ge: any) => ge.elementId === el.id));
              if (curGroup) removeElementFromGroupMut.mutate({ groupId: curGroup.id, elementId: el.id });
              if (val !== "none") assignElementToGroupMut.mutate({ groupId: Number(val), elementId: el.id });
            }}
          >
            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Sem grupo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sem grupo</SelectItem>
              {(mapGroups as any[]).map((g: any) => (
                <SelectItem key={g.id} value={String(g.id)}>
                  <span className="flex items-center gap-1.5"><span style={{ background: g.color, width: 8, height: 8, borderRadius: "50%", display: "inline-block" }} />{g.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {isAdmin && <Button variant="destructive" size="sm" className="w-full gap-2" onClick={() => { setDeleteElementId({ id: el.id, type: el.type, referenceId: el.referenceId }); setSidePanel(null); }}><Trash2 className="w-3.5 h-3.5" /> Excluir {el.type === "cto" ? "CTO" : "CEO"}</Button>}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card/50 flex-wrap">
        <MapIcon className="w-4 h-4 text-primary flex-shrink-0" />
        <span className="text-sm font-medium">Mapa de Infraestrutura</span>
        <div className="w-px h-4 bg-border mx-1" />
        {/* ── Menu Camadas ─────────────────────────────────────────────────── */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className={`h-7 gap-1 text-xs ${
                (!showCeos || !showCtos || !showRoutes || !showPoles || !showReserves || !showPois || !showOlts || !showDgos || !showElementNames || !showCableLabels)
                  ? "border-primary/60 text-primary bg-primary/10"
                  : ""
              }`}
              title="Mostrar/ocultar camadas do mapa"
            >
              <Layers className="w-3 h-3" />
              Camadas
              <ChevronDown className="w-3 h-3 ml-0.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuLabel className="text-xs text-muted-foreground py-1">Elementos</DropdownMenuLabel>
            <DropdownMenuCheckboxItem checked={showCeos} onCheckedChange={() => setShowCeos(v => !v)} className="text-xs">
              <Radio className="w-3 h-3 mr-1.5 text-muted-foreground" />CEOs
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={showCtos} onCheckedChange={() => setShowCtos(v => !v)} className="text-xs">
              <Box className="w-3 h-3 mr-1.5 text-muted-foreground" />CTOs
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={showOlts} onCheckedChange={() => setShowOlts(v => !v)} className="text-xs">
              <Signal className="w-3 h-3 mr-1.5 text-muted-foreground" />OLTs
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={showDgos} onCheckedChange={() => setShowDgos(v => !v)} className="text-xs">
              <Layers className="w-3 h-3 mr-1.5 text-muted-foreground" />DGOs
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={showPoles} onCheckedChange={() => setShowPoles(v => !v)} className="text-xs">
              <Milestone className="w-3 h-3 mr-1.5 text-muted-foreground" />Postes
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={showReserves} onCheckedChange={() => setShowReserves(v => !v)} className="text-xs">
              <Codesandbox className="w-3 h-3 mr-1.5 text-muted-foreground" />Reservas
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={showPois} onCheckedChange={() => setShowPois(v => !v)} className="text-xs">
              <MapPin className="w-3 h-3 mr-1.5 text-muted-foreground" />POIs
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground py-1">Cabos</DropdownMenuLabel>
            <DropdownMenuCheckboxItem checked={showRoutes} onCheckedChange={() => setShowRoutes(v => !v)} className="text-xs">
              <Cable className="w-3 h-3 mr-1.5 text-muted-foreground" />Cabos
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground py-1">Rótulos</DropdownMenuLabel>
            <DropdownMenuCheckboxItem checked={showElementNames} onCheckedChange={() => { setShowElementNames(v => { const next = !v; localStorage.setItem('map_showElementNames', next ? '1' : '0'); return next; }); }} className="text-xs">
              <Tag className="w-3 h-3 mr-1.5 text-muted-foreground" />Nomes dos elementos
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={showCableLabels} onCheckedChange={() => { setShowCableLabels(v => { const next = !v; localStorage.setItem('map_showCableLabels', next ? '1' : '0'); return next; }); }} className="text-xs">
              <Milestone className="w-3 h-3 mr-1.5 text-muted-foreground" />Metragem dos cabos
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {isAdmin && (
          <>
            <div className="w-px h-4 bg-border mx-1" />
            <Button
              size="sm"
              variant={editMode ? "default" : "outline"}
              className={`h-7 gap-1.5 text-xs font-medium ${editMode ? "bg-amber-600 hover:bg-amber-700 border-amber-500 text-white" : "border-amber-500/40 text-amber-400 hover:bg-amber-500/10"}`}
              onClick={() => setEditMode(v => !v)}
              title={editMode ? "Desactivar modo edição (bloquear elementos)" : "Activar modo edição (permitir mover CEO/CTO)"}
            >
              {editMode ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
              {editMode ? "Edição ON" : "Edição"}
            </Button>
            <div className="w-px h-4 bg-border mx-1" />
            {/* ── Menu Adicionar Elemento ──────────────────────────────────── */}
            {(() => {
              const anyAddingActive = addingMode !== null || addingRouteMode || addingOltMode || addingDgoMode || addingPoleMode || addingReserveMode || addingPoiMode;
              const activeLabel = addingMode === "ceo" ? "CEO" : addingMode === "cto" ? "CTO" : addingRouteMode ? "Cabo" : addingOltMode ? "OLT" : addingDgoMode ? "DGO" : addingPoleMode ? "Poste" : addingReserveMode ? "Reserva" : addingPoiMode ? "POI" : null;
              return (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant={anyAddingActive ? "default" : "outline"}
                      className={`h-7 gap-1 text-xs font-medium ${
                        anyAddingActive
                          ? "bg-emerald-600 hover:bg-emerald-700 border-emerald-500 text-white"
                          : "border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                      }`}
                      title="Adicionar elemento ao mapa"
                    >
                      <Plus className="w-3 h-3" />
                      {anyAddingActive ? `Adicionando: ${activeLabel}` : "Adicionar"}
                      {!anyAddingActive && <ChevronDown className="w-3 h-3 ml-0.5" />}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-52">
                    <DropdownMenuLabel className="text-xs text-muted-foreground py-1">Selecione o tipo de elemento</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuItem
                        className={`text-xs gap-2 cursor-pointer ${ addingMode === "ceo" ? "bg-primary/10 text-primary font-medium" : "" }`}
                        onClick={() => { setAddingMode(v => v === "ceo" ? null : "ceo"); setAddingRouteMode(false); setAddingOltMode(false); setAddingDgoMode(false); setAddingPoleMode(false); setAddingReserveMode(false); setAddingPoiMode(false); }}
                      >
                        <Radio className="w-3.5 h-3.5 text-blue-400" />
                        <span className="flex-1">CEO</span>
                        <span className="text-[10px] text-muted-foreground">Caixa de Emenda</span>
                        {addingMode === "ceo" && <Check className="w-3 h-3 text-primary" />}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className={`text-xs gap-2 cursor-pointer ${ addingMode === "cto" ? "bg-primary/10 text-primary font-medium" : "" }`}
                        onClick={() => { setAddingMode(v => v === "cto" ? null : "cto"); setAddingRouteMode(false); setAddingOltMode(false); setAddingDgoMode(false); setAddingPoleMode(false); setAddingReserveMode(false); setAddingPoiMode(false); }}
                      >
                        <Box className="w-3.5 h-3.5 text-green-400" />
                        <span className="flex-1">CTO</span>
                        <span className="text-[10px] text-muted-foreground">Caixa Terminal</span>
                        {addingMode === "cto" && <Check className="w-3 h-3 text-primary" />}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className={`text-xs gap-2 cursor-pointer ${ addingOltMode ? "bg-amber-500/10 text-amber-400 font-medium" : "" }`}
                        onClick={() => { setAddingOltMode(v => !v); setAddingMode(null); setAddingRouteMode(false); setAddingDgoMode(false); setAddingPoleMode(false); setAddingReserveMode(false); setAddingPoiMode(false); }}
                      >
                        <Signal className="w-3.5 h-3.5 text-amber-400" />
                        <span className="flex-1">OLT</span>
                        <span className="text-[10px] text-muted-foreground">Equipamento OLT</span>
                        {addingOltMode && <Check className="w-3 h-3 text-amber-400" />}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className={`text-xs gap-2 cursor-pointer ${ addingDgoMode ? "bg-orange-500/10 text-orange-400 font-medium" : "" }`}
                        onClick={() => { setAddingDgoMode(v => !v); setAddingMode(null); setAddingRouteMode(false); setAddingOltMode(false); setAddingPoleMode(false); setAddingReserveMode(false); setAddingPoiMode(false); }}
                      >
                        <Layers className="w-3.5 h-3.5 text-orange-400" />
                        <span className="flex-1">DGO</span>
                        <span className="text-[10px] text-muted-foreground">Distribuidor Geral</span>
                        {addingDgoMode && <Check className="w-3 h-3 text-orange-400" />}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className={`text-xs gap-2 cursor-pointer ${ addingPoleMode ? "bg-slate-500/10 text-slate-400 font-medium" : "" }`}
                        onClick={() => { setAddingPoleMode(v => !v); setAddingMode(null); setAddingRouteMode(false); setAddingOltMode(false); setAddingDgoMode(false); setAddingReserveMode(false); setAddingPoiMode(false); }}
                      >
                        <Milestone className="w-3.5 h-3.5 text-slate-400" />
                        <span className="flex-1">Poste</span>
                        <span className="text-[10px] text-muted-foreground">Poste de rede</span>
                        {addingPoleMode && <Check className="w-3 h-3 text-slate-400" />}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className={`text-xs gap-2 cursor-pointer ${ addingReserveMode ? "bg-cyan-500/10 text-cyan-400 font-medium" : "" }`}
                        onClick={() => { setAddingReserveMode(v => !v); setAddingMode(null); setAddingRouteMode(false); setAddingOltMode(false); setAddingDgoMode(false); setAddingPoleMode(false); setAddingPoiMode(false); }}
                      >
                        <Codesandbox className="w-3.5 h-3.5 text-cyan-400" />
                        <span className="flex-1">Reserva Técnica</span>
                        <span className="text-[10px] text-muted-foreground">Ponto de reserva</span>
                        {addingReserveMode && <Check className="w-3 h-3 text-cyan-400" />}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className={`text-xs gap-2 cursor-pointer ${ addingPoiMode ? "bg-indigo-500/10 text-indigo-400 font-medium" : "" }`}
                        onClick={() => { setAddingPoiMode(v => !v); setAddingMode(null); setAddingRouteMode(false); setAddingOltMode(false); setAddingDgoMode(false); setAddingPoleMode(false); setAddingReserveMode(false); }}
                      >
                        <MapPin className="w-3.5 h-3.5 text-indigo-400" />
                        <span className="flex-1">POI</span>
                        <span className="text-[10px] text-muted-foreground">Ponto de Interesse</span>
                        {addingPoiMode && <Check className="w-3 h-3 text-indigo-400" />}
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuItem
                        className={`text-xs gap-2 cursor-pointer ${ addingRouteMode ? "bg-cyan-500/10 text-cyan-400 font-medium" : "" }`}
                        onClick={() => { setAddingRouteMode(v => !v); setRouteFrom(null); setAddingMode(null); setAddingOltMode(false); setAddingDgoMode(false); setAddingPoleMode(false); setAddingReserveMode(false); setAddingPoiMode(false); }}
                      >
                        <Cable className="w-3.5 h-3.5 text-cyan-400" />
                        <span className="flex-1">Cabo / Rota</span>
                        <span className="text-[10px] text-muted-foreground">Traçar cabo no mapa</span>
                        {addingRouteMode && <Check className="w-3 h-3 text-cyan-400" />}
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                    {anyAddingActive && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-xs gap-2 cursor-pointer text-red-400 hover:text-red-300"
                          onClick={() => { setAddingMode(null); setAddingRouteMode(false); setAddingOltMode(false); setAddingDgoMode(false); setAddingPoleMode(false); setAddingReserveMode(false); setAddingPoiMode(false); }}
                        >
                          <X className="w-3.5 h-3.5" />
                          Cancelar modo de adição
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            })()}
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          <div className="relative flex items-center gap-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
            <input type="text" placeholder="Buscar endereço..." value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSearch()}
              className="h-7 pl-6 pr-2 text-xs bg-background border border-border rounded-md w-44 focus:outline-none focus:ring-1 focus:ring-ring" />
            {searchLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
          </div>
          <Button size="sm" variant={satelliteMode ? "default" : "outline"} className={`h-7 gap-1 text-xs ${satelliteMode ? "bg-emerald-700 hover:bg-emerald-800 border-emerald-600" : ""}`} onClick={toggleSatellite} title={satelliteMode ? "Voltar para mapa de ruas" : "Ativar imagem de satélite"}>
            <Layers className="w-3 h-3" />{satelliteMode ? "Satélite" : "Ruas"}
          </Button>
          <Button size="sm" variant={groupSelectMode ? "default" : "outline"} className={`h-7 gap-1 text-xs ${groupSelectMode ? "bg-cyan-600 hover:bg-cyan-700 border-cyan-500" : ""}`} onClick={toggleGroupSelectMode}>
            <MousePointer2 className="w-3 h-3" />{groupSelectMode ? `Seleção (${groupTotalSelected})` : "Selecionar"}
          </Button>
          <Button size="sm" variant={viabilityMode ? "default" : "outline"} className={`h-7 gap-1 text-xs ${viabilityMode ? "bg-amber-600 hover:bg-amber-700 border-amber-500" : ""}`} onClick={() => { setViabilityMode(v => { if (v) { setViabilityPoint(null); setViabilityResults([]); } return !v; }); }} title="Viabilidade Técnica">
            <ScanSearch className="w-3 h-3" />{viabilityMode ? "Viabilidade" : "Viabilidade"}
          </Button>
          {isAdmin && (
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => { setKmlImportResult(null); setKmlImportOpen(true); }} title="Importar posições de CEO/CTO de um arquivo KML">
              <Upload className="w-3 h-3" />Importar KML
            </Button>
          )}
          {/* Filtro rápido por grupo */}
          {(mapGroups as any[]).length > 0 && (
            <div className="relative flex items-center">
              <Select
                value={activeGroupFilter !== null ? String(activeGroupFilter) : "all"}
                onValueChange={(v) => setActiveGroupFilter(v === "all" ? null : Number(v))}
              >
                <SelectTrigger
                  className={`h-7 text-xs pr-2 pl-2 gap-1 border rounded-md min-w-[90px] max-w-[140px] ${
                    activeGroupFilter !== null
                      ? "bg-violet-600/20 border-violet-500/60 text-violet-300"
                      : "bg-background border-border text-muted-foreground"
                  }`}
                  title="Filtrar mapa por grupo"
                >
                  <Folder className="w-3 h-3 flex-shrink-0" />
                  <SelectValue placeholder="Grupo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os grupos</SelectItem>
                  {(mapGroups as any[]).map((g: any) => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full inline-block flex-shrink-0" style={{ background: g.color ?? "#6366f1" }} />
                        {g.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button size="sm" variant={groupsPanelOpen ? "default" : "outline"} className={`h-7 gap-1 text-xs ${groupsPanelOpen ? "bg-violet-600 hover:bg-violet-700 border-violet-500" : ""}`} onClick={() => setGroupsPanelOpen(v => !v)} title="Grupos/Pastas de setores">
            <Folder className="w-3 h-3" />Grupos {(mapGroups as any[]).length > 0 && <span className="ml-0.5 bg-white/20 rounded px-1">{(mapGroups as any[]).length}</span>}
          </Button>
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={openExportDialog}>
            <FileDown className="w-3 h-3" />Exportar KML/KMZ
          </Button>
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setCablesReportOpen(true)}>
            <FileText className="w-3 h-3" />Rel. Cabos
          </Button>
          <Button
            size="sm"
            variant={otdrMode ? "default" : "outline"}
            className={`h-7 gap-1 text-xs ${otdrMode ? "bg-amber-600 hover:bg-amber-700 border-amber-500 text-white" : ""}`}
            onClick={() => { setOtdrMode(v => !v); if (!otdrMode) { setOtdrPanelOpen(true); } }}
            title="OTDR Virtual — calcular posição de falha por distância"
          >
            <Zap className="w-3 h-3" />OTDR Virtual
          </Button>
        </div>
      </div>

      {groupSelectMode && (
        <div className="px-4 py-2 bg-cyan-500/10 border-b border-cyan-500/30 text-cyan-400 text-xs flex items-center gap-3">
          <MousePointer2 className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="flex-1">Modo de seleção ativo — clique nos marcadores (CEO/CTO) ou cabos para selecionar.{groupTotalSelected > 0 && <span className="font-semibold ml-1">{groupTotalSelected} selecionado{groupTotalSelected !== 1 ? "s" : ""}</span>}</span>
          <button onClick={selectAllGroup} className="text-cyan-300 hover:text-cyan-200 underline text-xs">Selecionar tudo</button>
          <button onClick={clearGroupSelection} className="text-cyan-300 hover:text-cyan-200 underline text-xs">Limpar</button>
          {groupTotalSelected > 0 && isAdmin && (
            <button
              onClick={() => setQuickAssignDialogOpen(true)}
              className="flex items-center gap-1 bg-violet-600 hover:bg-violet-700 text-white rounded px-2 py-0.5 text-xs font-medium"
            >
              <Folder className="w-3 h-3" />Adicionar a grupo
            </button>
          )}
          {groupTotalSelected > 0 && isAdmin && <button onClick={handleGroupDelete} className="text-red-400 hover:text-red-300 underline text-xs">Excluir seleção</button>}
          {groupTotalSelected > 0 && <button onClick={handleGroupExport} className="text-cyan-300 hover:text-cyan-200 underline text-xs">Exportar seleção</button>}
          <button onClick={toggleGroupSelectMode} className="text-cyan-300 hover:text-cyan-200 underline text-xs">Sair da seleção</button>
        </div>
      )}
      {viabilityMode && (
        <div className="border-b border-amber-500/30 bg-amber-500/5">
          {/* Banner de instrução */}
          <div className="px-4 py-2 text-amber-400 text-xs flex items-center gap-3 flex-wrap">
            <ScanSearch className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="flex-1 min-w-[120px]">{viabilityPoint ? `Ponto selecionado — ${viabilityResults.length} CTO${viabilityResults.length !== 1 ? 's' : ''} encontrada${viabilityResults.length !== 1 ? 's' : ''} no raio` : 'Clique no mapa ou informe as coordenadas'}</span>
            {/* Entrada manual de coordenadas */}
            <div className="flex items-center gap-1.5">
              <span className="text-amber-300/70">Lat:</span>
              <input
                id="viability-lat-input"
                type="text"
                placeholder="-23.5505"
                defaultValue={viabilityPoint ? String(viabilityPoint.lat.toFixed(6)) : ''}
                className="w-24 h-6 text-xs bg-background border border-amber-500/40 rounded px-1.5 text-amber-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              <span className="text-amber-300/70">Lng:</span>
              <input
                id="viability-lng-input"
                type="text"
                placeholder="-46.6333"
                defaultValue={viabilityPoint ? String(viabilityPoint.lng.toFixed(6)) : ''}
                className="w-24 h-6 text-xs bg-background border border-amber-500/40 rounded px-1.5 text-amber-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              <button
                onClick={() => {
                  const latEl = document.getElementById('viability-lat-input') as HTMLInputElement;
                  const lngEl = document.getElementById('viability-lng-input') as HTMLInputElement;
                  const lat = parseFloat(latEl?.value ?? '');
                  const lng = parseFloat(lngEl?.value ?? '');
                  if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                    setViabilityPoint({ lat, lng });
                    mapRef.current?.flyTo([lat, lng], 15, { duration: 0.8 });
                  } else {
                    toast.error('Coordenadas inválidas. Use formato decimal, ex: -23.5505');
                  }
                }}
                className="h-6 px-2 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-medium"
              >Buscar</button>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-amber-300/70">Raio:</span>
              <input
                type="number"
                min={50} max={10000} step={50}
                value={viabilityRadius}
                onChange={e => setViabilityRadius(Number(e.target.value))}
                className="w-20 h-6 text-xs bg-background border border-amber-500/40 rounded px-1.5 text-amber-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              <span className="text-amber-300/70">m</span>
            </div>
            {viabilityPoint && <button onClick={() => { setViabilityPoint(null); setViabilityResults([]); }} className="text-amber-300 hover:text-amber-200 underline text-xs">Limpar ponto</button>}
            <button onClick={() => { setViabilityMode(false); setViabilityPoint(null); setViabilityResults([]); }} className="text-amber-300 hover:text-amber-200 underline text-xs">Sair</button>
          </div>
          {/* Resultados */}
          {viabilityPoint && (
            <div className="px-4 pb-3">
              {viabilityLoadingRoutes && (
                <div className="flex items-center gap-2 py-1.5 text-amber-400/70 text-xs mb-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Calculando rotas pelas ruas via OSRM…</span>
                </div>
              )}
              {viabilityResults.length === 0 ? (
                <div className="flex items-center gap-2 py-2 text-amber-400/70 text-xs">
                  <XCircle className="w-4 h-4" />
                  <span>Nenhuma CTO encontrada no raio de {viabilityRadius}m. Tente aumentar o raio.</span>
                </div>
              ) : (
                <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
                  {viabilityResults.map((r: any, idx: number) => {
                    const free = r.capacity - r.usedPorts;
                    const pct = r.capacity > 0 ? Math.round((r.usedPorts / r.capacity) * 100) : 0;
                    const viable = free > 0 && r.status === 'active';
                    const warn = viable && free <= 2;
                    const isBest = idx === 0 && viable;
                    const distDisplay = r.routeDistance != null
                      ? `${r.routeDistance >= 1000 ? (r.routeDistance / 1000).toFixed(1) + ' km' : r.routeDistance + ' m'} pelas ruas`
                      : `${r.distance} m (linha reta)`;
                    const timeDisplay = r.routeDuration != null
                      ? `~${Math.round(r.routeDuration / 60)} min de carro`
                      : null;
                    return (
                      <div
                        key={r.id}
                        onMouseEnter={() => setViabilityHoveredId(r.id)}
                        onMouseLeave={() => setViabilityHoveredId(null)}
                        className={`rounded-lg border p-2.5 text-xs flex flex-col gap-1.5 transition-all ${
                          !viable ? 'border-red-500/30 bg-red-500/5' :
                          warn ? 'border-amber-500/40 bg-amber-500/5' :
                          isBest ? 'border-emerald-400/60 bg-emerald-500/10 ring-1 ring-emerald-500/30' :
                          'border-emerald-500/30 bg-emerald-500/5'
                        }`}>
                        <div className="flex items-center gap-1.5 font-semibold">
                          {!viable ? <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" /> :
                           warn ? <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" /> :
                           <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />}
                          <span className={!viable ? 'text-red-300' : warn ? 'text-amber-300' : 'text-emerald-300'}>{r.name}</span>
                          {isBest && <span className="ml-auto text-[9px] bg-emerald-600/40 text-emerald-300 rounded px-1 py-0.5">Mais próxima</span>}
                        </div>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <CircleDot className="w-3 h-3 flex-shrink-0" />
                          <span>{distDisplay}</span>
                          {r.routeDistance == null && viabilityLoadingRoutes && <Loader2 className="w-3 h-3 animate-spin ml-1" />}
                        </div>
                        {timeDisplay && <div className="text-muted-foreground/80">{timeDisplay}</div>}
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span>{r.usedPorts}/{r.capacity} portas</span>
                          <span>{pct}% ocupada</span>
                        </div>
                        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${
                            pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'
                          }`} style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                        {!viable && r.status !== 'active' && <span className="text-red-400/80">Status: {r.status}</span>}
                        {!viable && free === 0 && <span className="text-red-400/80">Sem portas livres</span>}
                        {viable && <span className={warn ? 'text-amber-400/80' : 'text-emerald-400/80'}>{free} porta{free !== 1 ? 's' : ''} livre{free !== 1 ? 's' : ''}</span>}
                        <button
                          onClick={() => { if (mapRef.current) mapRef.current.flyTo([r.lat, r.lng], 17, { duration: 0.8 }); }}
                          className="mt-0.5 text-xs text-cyan-400 hover:text-cyan-300 underline text-left"
                        >Ver no mapa</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {addingMode && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/30 text-amber-400 text-xs flex items-center gap-2">
          <Navigation className="w-3.5 h-3.5" />Clique no mapa para posicionar um {addingMode.toUpperCase()}
          <button onClick={() => setAddingMode(null)} className="ml-auto text-amber-300 hover:text-amber-200 underline">Cancelar</button>
        </div>
      )}
      {addingOltMode && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/30 text-amber-400 text-xs flex items-center gap-2">
          <Signal className="w-3.5 h-3.5" />Clique no mapa para posicionar a OLT
          <button onClick={() => setAddingOltMode(false)} className="ml-auto text-amber-300 hover:text-amber-200 underline">Cancelar</button>
        </div>
      )}
      {addingDgoMode && (
        <div className="px-4 py-2 bg-orange-500/10 border-b border-orange-500/30 text-orange-400 text-xs flex items-center gap-2">
          <Layers className="w-3.5 h-3.5" />Clique no mapa para posicionar o DGO
          <button onClick={() => setAddingDgoMode(false)} className="ml-auto text-orange-300 hover:text-orange-200 underline">Cancelar</button>
        </div>
      )}
      {addingPoleMode && (
        <div className="px-4 py-2 bg-slate-500/10 border-b border-slate-500/30 text-slate-400 text-xs flex items-center gap-2">
          <Milestone className="w-3.5 h-3.5" />Clique no mapa para posicionar o poste
          <button onClick={() => setAddingPoleMode(false)} className="ml-auto text-slate-300 hover:text-slate-200 underline">Cancelar</button>
        </div>
      )}
      {addingReserveMode && (
        <div className="px-4 py-2 bg-cyan-500/10 border-b border-cyan-500/30 text-cyan-400 text-xs flex items-center gap-2">
          <Codesandbox className="w-3.5 h-3.5" />Clique no mapa para posicionar a reserva técnica
          <button onClick={() => setAddingReserveMode(false)} className="ml-auto text-cyan-300 hover:text-cyan-200 underline">Cancelar</button>
        </div>
      )}
      {addingPoiMode && (
        <div className="px-4 py-2 bg-indigo-500/10 border-b border-indigo-500/30 text-indigo-400 text-xs flex items-center gap-2">
          <MapPin className="w-3.5 h-3.5" />Clique no mapa para posicionar o Ponto de Interesse
          <button onClick={() => setAddingPoiMode(false)} className="ml-auto text-indigo-300 hover:text-indigo-200 underline">Cancelar</button>
        </div>
      )}
      {otdrMode && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/30 text-amber-400 text-xs flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="flex-1">
            {otdrElementId == null
              ? "Modo OTDR Virtual ativo — clique num CEO ou CTO no mapa para seleccioná-lo como ponto de partida"
              : (() => { const el = (elements as any[]).find((e: any) => e.id === otdrElementId); if (!el) return `Elemento #${otdrElementId} selecionado — configure o tubo, via e distância no painel`; const ref = el.type === 'cto' ? (ctos as any[]).find((c: any) => c.id === el.referenceId) : (ceos as any[]).find((c: any) => c.id === el.referenceId); const name = ref?.name ?? (el.type === 'cto' ? `CTO-${el.referenceId}` : `CEO-${el.referenceId}`); return `Elemento selecionado: ${name} — configure o tubo, via e distância no painel`; })()}
          </span>
          {otdrResult && (
            <span className="text-amber-300 font-medium">
              {otdrResult.found ? `✓ Ponto a ${Math.round(otdrResult.distanceTraveled)} m` : `⚠ Fim da cadeia a ${Math.round(otdrResult.distanceTraveled)} m`}
            </span>
          )}
          <button onClick={() => setOtdrPanelOpen(v => !v)} className="text-amber-300 hover:text-amber-200 underline text-xs flex-shrink-0">
            {otdrPanelOpen ? "Fechar painel" : "Abrir painel"}
          </button>
          <button onClick={() => setOtdrMode(false)} className="text-amber-300 hover:text-amber-200 underline text-xs flex-shrink-0">Sair</button>
        </div>
      )}
      {addingRouteMode && (
        <div className="px-4 py-2 bg-cyan-500/10 border-b border-cyan-500/30 text-cyan-400 text-xs flex items-center gap-2">
          <Cable className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="flex-1">{drawingPath.length === 0 ? "Clique em qualquer ponto do mapa para iniciar o traçado do cabo. Clique sobre um CEO/CTO para vincular." : `${drawingPath.length} ponto${drawingPath.length !== 1 ? "s" : ""} — continue clicando ou confirme o traçado.`}</span>
          {drawingPath.length > 0 && <button onClick={undoLastPoint} className="text-cyan-300 hover:text-cyan-200 underline text-xs flex-shrink-0">Desfazer</button>}
          {drawingPath.length >= 2 && <button onClick={confirmDrawing} className="bg-cyan-500 text-white px-2 py-0.5 rounded text-xs hover:bg-cyan-400 flex-shrink-0">Confirmar traçado</button>}
          <button onClick={cancelDrawing} className="text-cyan-300 hover:text-cyan-200 underline text-xs flex-shrink-0">Cancelar</button>
        </div>
      )}
      {editingRouteId !== null && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/30 text-amber-400 text-xs flex items-center gap-2">
          <Cable className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="flex-1">
            <span className="font-semibold">Editando traçado</span> — Arraste os pontos para mover. <span className="text-amber-300 font-medium">Pontos laranja (extremidades) encaixam em CTOs/CEOs próximos.</span> <span className="text-cyan-300">Arraste qualquer ponto do meio para cima de um CEO/CTO para vinculá-lo como nova extremidade.</span> Clique no ponto semitransparente para inserir. Duplo clique num vértice intermediário para remover.
            <span className="ml-2 text-amber-300">{editingRoutePath.length} pontos</span>
          </span>
          <button
            onClick={() => {
              if (editingRoutePath.length < 3) {
                toast.error("Adicione pelo menos 3 pontos ao traçado para poder dividir");
                return;
              }
              setSplitRoutePointIdx(Math.floor(editingRoutePath.length / 2));
              setSplitRouteSearch("");
              setSplitRouteSelectedEl(null);
              setSplitRouteOpen(true);
            }}
            className="bg-purple-600 text-white px-3 py-0.5 rounded text-xs hover:bg-purple-500 font-semibold flex-shrink-0"
          >✂ Dividir Cabo</button>
          <button
            onClick={saveEditRoutePath}
            className="bg-amber-500 text-white px-3 py-0.5 rounded text-xs hover:bg-amber-400 font-semibold flex-shrink-0"
          >Salvar traçado</button>
          <button onClick={cancelEditRoutePath} className="text-amber-300 hover:text-amber-200 underline text-xs flex-shrink-0">Cancelar</button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div
          className="flex-1 relative"
          onDragOver={(e) => {
            // Permitir drop apenas quando há um item fiberdoc sendo arrastado
            if (e.dataTransfer.types.includes('application/fiberdoc-item')) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }
          }}
          onDrop={(e) => {
            const raw = e.dataTransfer.getData('application/fiberdoc-item');
            if (!raw || !mapRef.current) return;
            try {
              const { type, id } = JSON.parse(raw);
              if (type !== 'route') return;
              // Converter posição do mouse para coordenadas do mapa
              const mapContainer = mapContainerRef.current;
              if (!mapContainer) return;
              const rect = mapContainer.getBoundingClientRect();
              const point = L.point(e.clientX - rect.left, e.clientY - rect.top);
              // Verificar se o ponto está próximo de algum ícone DGO (raio de 30px)
              const RADIUS = 30;
              const dgoArr = dgoElements as any[];
              const hitDgo = dgoArr.find((dgo: any) => {
                const dgoPoint = mapRef.current!.latLngToContainerPoint([Number(dgo.lat), Number(dgo.lng)]);
                const dx = dgoPoint.x - point.x;
                const dy = dgoPoint.y - point.y;
                return Math.sqrt(dx * dx + dy * dy) <= RADIUS;
              });
              if (hitDgo) {
                e.preventDefault();
                setPendingDgoFiberLinkRouteId(id);
                setSelectedDgoElementId(hitDgo.id);
                setDgoDetailPanelOpen(true);
              }
            } catch {}
          }}
        >
          <div ref={mapContainerRef} className="w-full h-full" style={{ zIndex: 0 }} />
          {/* Retângulo visual de box select no mapa */}
          {groupSelectMode && mapBoxSelectRect && (
            <div
              className="pointer-events-none absolute border-2 border-cyan-400 bg-cyan-400/10"
              style={{
                left: mapBoxSelectRect.x,
                top: mapBoxSelectRect.y,
                width: mapBoxSelectRect.w,
                height: mapBoxSelectRect.h,
                zIndex: 1000,
              }}
            />
          )}
          {/* Legenda removida conforme solicitação */}
          <div className="absolute top-4 left-4 bg-background/90 backdrop-blur-sm border border-border rounded-lg px-3 py-2 text-xs" style={{ zIndex: 1000 }}>
            <span className="text-muted-foreground">{(elements as any[]).length} elementos · {(routes as any[]).length} cabos</span>
          </div>

          {/* Painel OTDR Virtual flutuante */}
          {otdrMode && otdrPanelOpen && (
            <div className="absolute top-4 right-4 w-80 bg-card border border-amber-500/40 rounded-xl shadow-2xl overflow-hidden" style={{ zIndex: 1100 }}>
              <div className="flex items-center gap-2 px-4 py-3 bg-amber-500/10 border-b border-amber-500/30">
                <Zap className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <span className="font-semibold text-amber-400 text-sm flex-1">OTDR Virtual</span>
                <button onClick={() => setOtdrPanelOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 space-y-3">
                {/* Elemento de partida */}
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Elemento de partida</Label>
                  {otdrElementId == null ? (
                    <div className="text-xs text-amber-400/80 bg-amber-500/10 rounded-lg p-2.5 border border-amber-500/20">
                      Clique num CEO ou CTO no mapa para seleccioná-lo
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 text-xs bg-muted rounded-lg px-3 py-2 text-foreground font-medium">
                        {(() => { const el = (elements as any[]).find((e: any) => e.id === otdrElementId); if (!el) return `Elemento #${otdrElementId}`; const ref = el.type === 'cto' ? (ctos as any[]).find((c: any) => c.id === el.referenceId) : (ceos as any[]).find((c: any) => c.id === el.referenceId); return ref?.name ?? (el.type === 'cto' ? `CTO-${el.referenceId}` : `CEO-${el.referenceId}`); })()}
                      </div>
                      <button onClick={() => { setOtdrElementId(null); setOtdrTubeId(""); setOtdrViaNumber(""); setOtdrResult(null); }}
                        className="text-muted-foreground hover:text-foreground">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Tubo */}
                {otdrElementId != null && (
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Tubo / cabo de saída</Label>
                    {otdrTubesQuery.isLoading ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" />Carregando tubos...</div>
                    ) : otdrTubes.length === 0 ? (
                      <div className="text-xs text-destructive bg-destructive/10 rounded-lg p-2 border border-destructive/20">Nenhum tubo cadastrado neste elemento</div>
                    ) : (
                      <Select value={otdrTubeId} onValueChange={v => { setOtdrTubeId(v); setOtdrViaNumber(""); setOtdrResult(null); }}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Selecione o tubo" />
                        </SelectTrigger>
                        <SelectContent>
                          {otdrTubes.map(t => (
                            <SelectItem key={t.id} value={String(t.id)}>
                              {t.identifier} ({t.totalVias} vias)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}

                {/* Via */}
                {otdrTubeId && otdrSelectedTube && (
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Número da via (fibra)</Label>
                    <Select value={otdrViaNumber} onValueChange={v => { setOtdrViaNumber(v); setOtdrResult(null); }}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Selecione a via" />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: otdrSelectedTube.totalVias }, (_, i) => i + 1).map(n => (
                          <SelectItem key={n} value={String(n)}>Via {n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Distância */}
                {otdrViaNumber && (
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Distância do OTDR (metros)</Label>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      placeholder="Ex: 650"
                      value={otdrDistance}
                      onChange={e => { setOtdrDistance(e.target.value); setOtdrResult(null); }}
                      className="h-8 text-xs"
                    />
                  </div>
                )}

                {/* Botão executar */}
                {otdrElementId && otdrTubeId && otdrViaNumber && otdrDistance && (
                  <Button
                    size="sm"
                    className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                    disabled={otdrRunning}
                    onClick={async () => {
                      setOtdrRunning(true);
                      setOtdrResult(null);
                      try {
                        const result = await utils.infraMap.traceOtdr.fetch({
                          elementId: otdrElementId,
                          tubeId: Number(otdrTubeId),
                          viaNumber: Number(otdrViaNumber),
                          distanceMeters: Number(otdrDistance),
                        });
                        setOtdrResult(result);
                        if (!result.found) {
                          toast.warning(result.warnings[result.warnings.length - 1] ?? "Ponto não encontrado na cadeia de fibra");
                        }
                      } catch (e: any) {
                        toast.error(e.message ?? "Erro ao calcular posição OTDR");
                      } finally {
                        setOtdrRunning(false);
                      }
                    }}
                  >
                    {otdrRunning ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />Calculando...</> : <><Zap className="w-3.5 h-3.5 mr-1" />Calcular posição</>}
                  </Button>
                )}

                {/* Resultado */}
                {otdrResult && (
                  <div className={`rounded-lg p-3 border text-xs space-y-1.5 ${
                    otdrResult.found
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      : "bg-amber-500/10 border-amber-500/30 text-amber-400"
                  }`}>
                    {otdrResult.found ? (
                      <>
                        <div className="font-semibold flex items-center gap-1.5">
                          <Crosshair className="w-3.5 h-3.5" />
                          Ponto encontrado a {Math.round(otdrResult.distanceTraveled)} m
                        </div>
                        {otdrResult.segmentName && <div><span className="opacity-70">Cabo:</span> {otdrResult.segmentName}</div>}
                        <div className="font-mono text-xs">
                          {otdrResult.lat?.toFixed(6)}, {otdrResult.lng?.toFixed(6)}
                        </div>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(`${otdrResult.lat?.toFixed(6)},${otdrResult.lng?.toFixed(6)}`);
                            toast.success("Coordenadas copiadas!");
                          }}
                          className="flex items-center gap-1 text-emerald-300 hover:text-emerald-200 underline"
                        >
                          <Copy className="w-3 h-3" />Copiar GPS
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="font-semibold">Fim da cadeia a {Math.round(otdrResult.distanceTraveled)} m</div>
                        {otdrResult.elementReached && <div><span className="opacity-70">Termina em:</span> {otdrResult.elementReached.name}</div>}
                      </>
                    )}
                    {otdrResult.warnings.length > 0 && (
                      <div className="border-t border-current/20 pt-1.5 mt-1 space-y-0.5">
                        {otdrResult.warnings.map((w, i) => (
                          <div key={i} className="flex items-start gap-1 opacity-80">
                            <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />{w}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        {groupsPanelOpen && (() => {
          // Construir árvore hierárquica de grupos
          const allGroups = mapGroups as any[];
          const poles = mapPoles as any[];
          const reserves = mapReserves as any[];
          const allPois = pois as any[];
          // Ordenar por sortOrder
          const sortedGroups = [...allGroups].sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
          const rootGroups = sortedGroups.filter((g: any) => !g.parentId);
          const childGroups = (parentId: number) => sortedGroups.filter((g: any) => g.parentId === parentId);
          // Filtro de busca
          const searchLower = groupSearch.toLowerCase().trim();
          const groupMatchesSearch = (g: any): boolean => {
            if (!searchLower) return true;
            if (g.name.toLowerCase().includes(searchLower)) return true;
            // Verificar se algum item dentro do grupo corresponde
            const elems = (g.elements ?? []).map((e: any) => (elements as any[]).find((x: any) => x.id === e.elementId)).filter(Boolean);
            const rts = (g.routes ?? []).map((r: any) => (routes as any[]).find((x: any) => x.id === r.routeId)).filter(Boolean);
            if (elems.some((e: any) => (e.elementName ?? e.name ?? "").toLowerCase().includes(searchLower))) return true;
            if (rts.some((r: any) => (r.name ?? "").toLowerCase().includes(searchLower))) return true;
            // Verificar subpastas recursivamente
            return childGroups(g.id).some(groupMatchesSearch);
          };
          const filteredRootGroups = rootGroups.filter(groupMatchesSearch);
          const countAllElements = (g: any): { elems: number; routes: number } => {
            const children = childGroups(g.id);
            const childCounts = children.map(countAllElements);
            return {
              elems: (g.elements?.length ?? 0) + (g.poles?.length ?? 0) + (g.reserves?.length ?? 0) + childCounts.reduce((s: number, c: any) => s + c.elems, 0),
              routes: (g.routes?.length ?? 0) + childCounts.reduce((s: number, c: any) => s + c.routes, 0),
            };
          };
          // Helper: flyTo para um item
          const flyToItem = (lat: number | null | undefined, lng: number | null | undefined) => {
            if (lat == null || lng == null || !mapRef.current) return;
            mapRef.current.flyTo([Number(lat), Number(lng)], Math.max(mapRef.current.getZoom(), 17));
          };
          // Helper: checkbox de visibilidade por item (estilo Google Earth)
          const VisibilityBtn = ({ hidden, onToggle, title }: { hidden: boolean; onToggle: () => void; title?: string }) => (
            <button
              onClick={(e) => { e.stopPropagation(); onToggle(); }}
              className={`w-3.5 h-3.5 flex-shrink-0 rounded-sm border flex items-center justify-center transition-colors ${
                hidden
                  ? "border-muted-foreground/20 bg-transparent"
                  : "border-violet-500/60 bg-violet-500/20 hover:bg-violet-500/30"
              }`}
              title={title ?? (hidden ? "Mostrar no mapa" : "Ocultar do mapa")}
            >
              {!hidden && <span className="w-2 h-2 block" style={{ background: "currentColor", clipPath: "polygon(14% 44%, 0 65%, 50% 100%, 100% 16%, 80% 0%, 43% 62%)" }} />}
            </button>
          );
          // Calcula estado do checkbox da pasta: true=todos visíveis, false=todos ocultos, 'indeterminate'=misto
          const getGroupCheckState = (group: any): boolean | 'indeterminate' => {
            const collectAll = (g: any): { elems: number[]; routes: number[]; poles: number[]; reserves: number[]; pois: number[]; olts: number[] } => {
              const kids = allGroups.filter((c: any) => c.parentId === g.id);
              const childData = kids.map(collectAll);
              return {
                elems: [...(g.elements ?? []).map((e: any) => e.elementId), ...childData.flatMap(d => d.elems)],
                routes: [...(g.routes ?? []).map((r: any) => r.routeId), ...childData.flatMap(d => d.routes)],
                poles: [...(g.poles ?? []).map((p: any) => p.poleId), ...childData.flatMap(d => d.poles)],
                reserves: [...(g.reserves ?? []).map((r: any) => r.reserveId), ...childData.flatMap(d => d.reserves)],
                pois: [...(g.pois ?? []).map((p: any) => p.poiId), ...childData.flatMap(d => d.pois)],
                olts: [...(g.olts ?? []).map((o: any) => o.oltId), ...childData.flatMap(d => d.olts)],
              };
            };
            const all = collectAll(group);
            const allIds = [...all.elems.map(id => `e${id}`), ...all.routes.map(id => `r${id}`), ...all.poles.map(id => `po${id}`), ...all.reserves.map(id => `re${id}`), ...all.pois.map(id => `pi${id}`), ...all.olts.map(id => `ol${id}`)];
            if (allIds.length === 0) return !hiddenGroupIds.has(group.id);
            const hiddenCount = all.elems.filter(id => hiddenElementIds.has(id)).length
              + all.routes.filter(id => hiddenRouteIds.has(id)).length
              + all.poles.filter(id => hiddenPoleIds.has(id)).length
              + all.reserves.filter(id => hiddenReserveIds.has(id)).length
              + all.pois.filter(id => hiddenPoiIds.has(id)).length
              + all.olts.filter(id => hiddenOltIds.has(id)).length;
            if (hiddenCount === 0) return true;
            if (hiddenCount === allIds.length) return false;
            return 'indeterminate';
          };
          const renderGroup = (group: any, depth: number = 0) => {
            const isGroupHidden = hiddenGroupIds.has(group.id);
            const children = childGroups(group.id);
            const isExpanded = expandedGroups.has(group.id) || children.length === 0;
            const isFolderDragOver = dragFolderOverId === group.id && dragFolderId !== group.id;
            // Itens expandidos quando: clicou na seta (isExpanded) OU clicou no nome (expandedGroupElements)
            const isElemsExpanded = isExpanded || expandedGroupElements.has(group.id);
            // Seta para minimizar/expandir a lista de itens dentro da pasta (feature 1)
            const isItemsCollapsed = expandedGroupItems.has(group.id);
            const counts = countAllElements(group);
            // Elementos e rotas directamente neste grupo
            const groupElems: any[] = (group.elements ?? []).map((e: any) => {
              const el = (elements as any[]).find((x: any) => x.id === e.elementId);
              return el ? { ...el, _type: "element" } : null;
            }).filter(Boolean);
            const groupRoutes: any[] = (group.routes ?? []).map((r: any) => {
              const rt = (routes as any[]).find((x: any) => x.id === r.routeId);
              return rt ? { ...rt, _type: "route" } : null;
            }).filter(Boolean);
            const groupPoles: any[] = (group.poles ?? []).map((p: any) => {
              const pole = (poles as any[]).find((x: any) => x.id === p.poleId);
              return pole ? { ...pole, _type: "pole" } : null;
            }).filter(Boolean);
            const groupReserves: any[] = (group.reserves ?? []).map((r: any) => {
              const reserve = (reserves as any[]).find((x: any) => x.id === r.reserveId);
              return reserve ? { ...reserve, _type: "reserve" } : null;
            }).filter(Boolean);
            const groupPois: any[] = allPois.filter((p: any) => (p.groups ?? []).includes(group.id));
            const groupOlts: any[] = (group.olts ?? []).map((o: any) => {
              const olt = (oltElements as any[]).find((x: any) => x.id === o.oltId);
              return olt ? { ...olt, _type: "olt" } : null;
            }).filter(Boolean);
            const hasItems = groupElems.length > 0 || groupRoutes.length > 0 || groupPoles.length > 0 || groupReserves.length > 0 || groupPois.length > 0 || groupOlts.length > 0;
            const showLineBefore = folderDropPosition !== null && folderDropPosition.groupId === group.id && folderDropPosition.pos === 'before';
            const showLineAfter = folderDropPosition !== null && folderDropPosition.groupId === group.id && folderDropPosition.pos === 'after';
            return (
              <div
                key={group.id}
                style={{ opacity: isGroupHidden ? 0.45 : 1, position: 'relative' }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragFolderId !== null && dragFolderId !== group.id) {
                    // Calcular posição: before (top 30%), inside (middle 40%), after (bottom 30%)
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    const relY = e.clientY - rect.top;
                    const pct = relY / rect.height;
                    const pos = pct < 0.3 ? 'before' : pct > 0.7 ? 'after' : 'inside';
                    setFolderDropPosition({ groupId: group.id, pos });
                    setDragFolderOverId(pos === 'inside' ? group.id : null);
                  } else {
                    setDragOverGroupId(group.id);
                  }
                }}
                onDragLeave={(e) => {
                  if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
                    setDragOverGroupId(null);
                    setDragFolderOverId(null);
                    setFolderDropPosition(null);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverGroupId(null);
                  setDragFolderOverId(null);
                  const dropPos = folderDropPosition;
                  setFolderDropPosition(null);
                  // Drag de pasta para pasta (reordenar / mover para novo pai)
                  const folderData = e.dataTransfer.getData('application/fiberdoc-folder');
                  if (folderData) {
                    try {
                      const { id: folderId } = JSON.parse(folderData);
                      if (folderId === group.id) return;
                      if (!dropPos || dropPos.pos === 'inside') {
                        // Mover pasta para dentro desta pasta (novo pai)
                        const siblings = sortedGroups.filter((g: any) => g.parentId === group.id && g.id !== folderId);
                        const updates = [
                          { id: folderId, sortOrder: siblings.length, parentId: group.id },
                          ...siblings.map((s: any, i: number) => ({ id: s.id, sortOrder: i, parentId: group.id }))
                        ];
                        reorderGroupMut.mutate({ updates });
                      } else {
                        // Reordenar como irmão (before/after) — mesmo parentId do grupo alvo
                        const targetParentId = group.parentId ?? null;
                        const siblings = sortedGroups.filter((g: any) => (g.parentId ?? null) === targetParentId && g.id !== folderId);
                        const targetIdx = siblings.findIndex((g: any) => g.id === group.id);
                        const insertIdx = dropPos.pos === 'before' ? targetIdx : targetIdx + 1;
                        siblings.splice(insertIdx, 0, { id: folderId });
                        const updates = siblings.map((s: any, i: number) => ({ id: s.id, sortOrder: i, parentId: targetParentId }));
                        reorderGroupMut.mutate({ updates });
                      }
                      setDragFolderId(null);
                    } catch {}
                    return;
                  }
                  const data = e.dataTransfer.getData('application/fiberdoc-item');
                  if (!data) return;
                  try {
                    const { type, id, fromGroupId } = JSON.parse(data);
                    if (fromGroupId === group.id) return; // mesma pasta, ignorar
                    // Remover do grupo antigo e adicionar ao novo
                    if (type === 'element') {
                      if (fromGroupId) removeElementFromGroupMut.mutate({ groupId: fromGroupId, elementId: id });
                      assignElementToGroupMut.mutate({ groupId: group.id, elementId: id });
                    } else if (type === 'route') {
                      if (fromGroupId) removeRouteFromGroupMut.mutate({ groupId: fromGroupId, routeId: id });
                      assignRouteToGroupMut.mutate({ groupId: group.id, routeId: id });
                    } else if (type === 'pole') {
                      if (fromGroupId) removePoleFromGroupMut.mutate({ groupId: fromGroupId, poleId: id });
                      assignPoleToGroupMut.mutate({ groupId: group.id, poleId: id });
                    } else if (type === 'reserve') {
                      if (fromGroupId) removeReserveFromGroupMut.mutate({ groupId: fromGroupId, reserveId: id });
                      assignReserveToGroupMut.mutate({ groupId: group.id, reserveId: id });
                    } else if (type === 'olt') {
                      if (fromGroupId) removeOltFromGroupMut.mutate({ groupId: fromGroupId, oltId: id });
                      assignOltToGroupMut.mutate({ groupId: group.id, oltId: id });
                    }
                  } catch {}
                }}
              >
                {/* Indicador de posição BEFORE */}
                {showLineBefore && (
                  <div className="h-0.5 mx-2 rounded-full bg-amber-400 shadow-[0_0_4px_rgba(251,191,36,0.8)]" style={{ marginLeft: `${12 + depth * 16}px` }} />
                )}
                <div
                  className={`flex items-center gap-1.5 px-3 py-1.5 hover:bg-muted/30 cursor-grab active:cursor-grabbing
                    ${dragOverGroupId === group.id ? 'bg-violet-500/10 ring-1 ring-violet-500/40 ring-inset' : ''}
                    ${isFolderDragOver ? 'bg-amber-500/10 ring-1 ring-amber-500/40 ring-inset' : ''}
                  `}
                  style={{ paddingLeft: `${12 + depth * 16}px` }}
                  draggable
                  onDragStart={(e) => {
                    setDragFolderId(group.id);
                    e.dataTransfer.setData('application/fiberdoc-folder', JSON.stringify({ id: group.id, currentParentId: group.parentId ?? null }));
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragEnd={() => { setDragFolderId(null); setDragFolderOverId(null); }}
                >
                  {/* Seta para subpastas */}
                  {children.length > 0 ? (
                    <button
                      onClick={() => setExpandedGroups(prev => {
                        const n = new Set(prev);
                        if (n.has(group.id)) n.delete(group.id); else n.add(group.id);
                        return n;
                      })}
                      className="text-muted-foreground hover:text-foreground flex-shrink-0"
                    >
                      {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                  ) : (
                    <span className="w-3.5 flex-shrink-0" />
                  )}
                  {/* Checkbox hierárquico da pasta (estilo Google Earth) */}
                  {(() => {
                    const checkState = getGroupCheckState(group);
                    const isChecked = checkState === true;
                    const isIndet = checkState === 'indeterminate';
                    return (
                      <button
                        onClick={(e) => { e.stopPropagation(); setGroupVisibilityRecursive(group.id, isChecked, allGroups); }}
                        className={`w-3.5 h-3.5 flex-shrink-0 rounded-sm border flex items-center justify-center transition-colors ${
                          isChecked
                            ? "border-violet-500/60 bg-violet-500/20 hover:bg-violet-500/30"
                            : isIndet
                              ? "border-violet-500/40 bg-violet-500/10 hover:bg-violet-500/20"
                              : "border-muted-foreground/20 bg-transparent hover:border-muted-foreground/40"
                        }`}
                        title={isChecked ? "Ocultar pasta do mapa" : "Mostrar pasta no mapa"}
                      >
                        {isChecked && <span className="w-2 h-2 block" style={{ background: "currentColor", clipPath: "polygon(14% 44%, 0 65%, 50% 100%, 100% 16%, 80% 0%, 43% 62%)" }} />}
                        {isIndet && <span className="w-1.5 h-0.5 block bg-violet-400/70 rounded" />}
                      </button>
                    );
                  })()}
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: group.color ?? "#6366f1" }} />
                  <span className="text-xs font-medium flex-1 truncate cursor-pointer" title={group.name}
                    onClick={() => setExpandedGroupElements(prev => { const n = new Set(prev); if (n.has(group.id)) n.delete(group.id); else n.add(group.id); return n; })}>
                    {group.name}
                  </span>
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <span className="text-[10px] text-muted-foreground/60">{counts.elems + counts.routes}</span>
                    {/* Seta para minimizar/expandir itens da pasta */}
                    {hasItems && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setExpandedGroupItems(prev => { const n = new Set(prev); if (n.has(group.id)) n.delete(group.id); else n.add(group.id); return n; }); }}
                        className="p-0.5 text-muted-foreground/50 hover:text-muted-foreground"
                        title={isItemsCollapsed ? "Expandir itens" : "Minimizar itens"}
                      >
                        <ChevronDown className={`w-3 h-3 transition-transform ${isItemsCollapsed ? '-rotate-90' : ''}`} />
                      </button>
                    )}
                    {isAdmin && (
                      <>
                        <button
                          onClick={() => { setEditingGroupId(null); setGroupForm({ name: "", color: group.color ?? "#6366f1", description: "", parentId: group.id }); setGroupDialogOpen(true); }}
                          className="p-0.5 text-muted-foreground hover:text-violet-400"
                          title="Criar subpasta aqui"
                        >
                          <FolderPlus className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => { setEditingGroupId(group.id); setGroupForm({ name: group.name, color: group.color ?? "#6366f1", description: group.description ?? "", parentId: group.parentId ?? null }); setGroupDialogOpen(true); }}
                          className="p-0.5 text-muted-foreground hover:text-foreground"
                          title="Editar grupo"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => setDeletingGroupId(group.id)}
                          className="p-0.5 text-red-400/60 hover:text-red-400"
                          title="Excluir grupo"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {/* Lista de elementos da pasta (expandida) — oculta se minimizada pela seta */}
                {isElemsExpanded && hasItems && !isItemsCollapsed && (
                  <div className="border-l border-border/40 ml-5 mb-1">
                    {groupElems.map((el: any) => {
                      const isHidden = hiddenElementIds.has(el.id);
                      const elName = el.elementName ?? el.name ?? el.label ?? `#${el.id}`;
                      return (
                        <div key={`el-${el.id}`}
                          className={`group flex items-center gap-1.5 px-2 py-0.5 hover:bg-muted/20 text-xs ${isHidden ? "opacity-40" : ""} cursor-grab active:cursor-grabbing ${checkedItems.elements.has(el.id) ? "bg-violet-500/10" : ""}`}
                          style={{ paddingLeft: `${8 + depth * 16}px` }}
                          ref={(node) => { if (node) itemElemsRef.current.set(`el-${el.id}`, { id: el.id, type: 'element', groupId: group.id, el: node }); else itemElemsRef.current.delete(`el-${el.id}`); }}
                          draggable
                          onDragStart={(e) => { e.dataTransfer.setData('application/fiberdoc-item', JSON.stringify({ type: 'element', id: el.id, fromGroupId: group.id })); e.dataTransfer.effectAllowed = 'move'; }}
                        >
                          <Checkbox
                            checked={checkedItems.elements.has(el.id)}
                            onCheckedChange={() => toggleCheckedElement(el.id, group.id)}
                            className="w-3 h-3 flex-shrink-0"
                          />
                          <VisibilityBtn hidden={isHidden} onToggle={() => toggleItemVisibility("element", el.id)} />
                          <span
                            className="text-muted-foreground truncate flex-1 cursor-pointer hover:text-foreground"
                            title={`${elName} — clique para localizar`}
                            onClick={() => { flyToItem(el.lat, el.lng); }}
                          >{elName}</span>
                          <span className="text-muted-foreground/40 uppercase text-[9px]">{el.type ?? ""}</span>
                          {isAdmin && (<>
                            <button title="Editar" className="opacity-0 group-hover:opacity-100 hover:text-cyan-400 text-muted-foreground/50 flex-shrink-0" onClick={e => { e.stopPropagation(); setEditElementForm({ name: el.name ?? "", address: "", capacity: el.capacity ?? 8, status: el.status ?? "active", notes: "", color: el.color ?? "" }); setSidePanel({ kind: "element", element: el }); setEditElementDialogOpen(true); }}><Pencil className="w-3 h-3" /></button>
                            <button title="Remover do grupo" className="opacity-0 group-hover:opacity-100 hover:text-red-400 text-muted-foreground/50 flex-shrink-0" onClick={e => { e.stopPropagation(); removeElementFromGroupMut.mutate({ groupId: group.id, elementId: el.id }); }}><X className="w-3 h-3" /></button>
                          </>)}
                        </div>
                      );
                    })}
                    {groupRoutes.map((rt: any) => {
                      const isHidden = hiddenRouteIds.has(rt.id);
                      const rtName = rt.name ?? rt.label ?? `Cabo #${rt.id}`;
                      // Ponto médio do cabo para flyTo
                      let midLat: number | null = null; let midLng: number | null = null;
                      try {
                        const fromEl = (elements as any[]).find((e: any) => e.id === rt.fromElementId);
                        const toEl = (elements as any[]).find((e: any) => e.id === rt.toElementId);
                        if (fromEl && toEl) { midLat = (Number(fromEl.lat) + Number(toEl.lat)) / 2; midLng = (Number(fromEl.lng) + Number(toEl.lng)) / 2; }
                        else if (fromEl) { midLat = Number(fromEl.lat); midLng = Number(fromEl.lng); }
                        else if (rt.path) { const pts = JSON.parse(rt.path); if (pts.length > 0) { midLat = pts[Math.floor(pts.length/2)].lat; midLng = pts[Math.floor(pts.length/2)].lng; } }
                      } catch {}
                      return (
                        <div key={`rt-${rt.id}`}
                          className={`group flex items-center gap-1.5 px-2 py-0.5 hover:bg-muted/20 text-xs ${isHidden ? "opacity-40" : ""} cursor-grab active:cursor-grabbing ${checkedItems.routes.has(rt.id) ? "bg-violet-500/10" : ""}`}
                          style={{ paddingLeft: `${8 + depth * 16}px` }}
                          ref={(node) => { if (node) itemElemsRef.current.set(`rt-${rt.id}`, { id: rt.id, type: 'route', groupId: group.id, el: node }); else itemElemsRef.current.delete(`rt-${rt.id}`); }}
                          draggable
                          onDragStart={(e) => { e.dataTransfer.setData('application/fiberdoc-item', JSON.stringify({ type: 'route', id: rt.id, fromGroupId: group.id })); e.dataTransfer.effectAllowed = 'move'; setIsDraggingRoute(true); }}
                          onDragEnd={() => setIsDraggingRoute(false)}
                        >
                          <Checkbox
                            checked={checkedItems.routes.has(rt.id)}
                            onCheckedChange={() => toggleCheckedRoute(rt.id, group.id)}
                            className="w-3 h-3 flex-shrink-0"
                          />
                          <VisibilityBtn hidden={isHidden} onToggle={() => toggleItemVisibility("route", rt.id)} />
                          <span
                            className="text-muted-foreground truncate flex-1 cursor-pointer hover:text-foreground"
                            title={`${rtName} — clique para localizar`}
                            onClick={() => flyToItem(midLat, midLng)}
                          >{rtName}</span>
                          <span className="text-muted-foreground/40 uppercase text-[9px]">cabo</span>
                          {isAdmin && (<>
                            <button title="Editar" className="opacity-0 group-hover:opacity-100 hover:text-cyan-400 text-muted-foreground/50 flex-shrink-0" onClick={e => { e.stopPropagation(); setEditRouteForm({ name: rt.name ?? rt.label ?? "", color: rt.color ?? "#22c55e", notes: rt.notes ?? "", fiberCount: rt.fiberCount ?? 12, cableType: rt.cableType ?? "FO", fromElementId: rt.fromElementId ?? null, toElementId: rt.toElementId ?? null, fromTubeId: (rt as any).fromTubeId ?? null, toTubeId: (rt as any).toTubeId ?? null }); setSidePanel({ kind: "route", route: rt }); setEditRouteDialogOpen(true); if (midLat && midLng) flyToItem(midLat, midLng); }}><Pencil className="w-3 h-3" /></button>
                            <button title="Remover do grupo" className="opacity-0 group-hover:opacity-100 hover:text-red-400 text-muted-foreground/50 flex-shrink-0" onClick={e => { e.stopPropagation(); removeRouteFromGroupMut.mutate({ groupId: group.id, routeId: rt.id }); }}><X className="w-3 h-3" /></button>
                          </>)}
                        </div>
                      );
                    })}
                    {groupPoles.map((pole: any) => {
                      const isHidden = hiddenPoleIds.has(pole.id);
                      const poleName = pole.name ?? pole.label ?? `Poste #${pole.id}`;
                      return (
                        <div key={`pole-${pole.id}`}
                          className={`group flex items-center gap-1.5 px-2 py-0.5 hover:bg-muted/20 text-xs ${isHidden ? "opacity-40" : ""} cursor-grab active:cursor-grabbing ${checkedItems.poles.has(pole.id) ? "bg-violet-500/10" : ""}`}
                          style={{ paddingLeft: `${8 + depth * 16}px` }}
                          ref={(node) => { if (node) itemElemsRef.current.set(`pole-${pole.id}`, { id: pole.id, type: 'pole', groupId: group.id, el: node }); else itemElemsRef.current.delete(`pole-${pole.id}`); }}
                          draggable
                          onDragStart={(e) => { e.dataTransfer.setData('application/fiberdoc-item', JSON.stringify({ type: 'pole', id: pole.id, fromGroupId: group.id })); e.dataTransfer.effectAllowed = 'move'; }}
                        >
                          <Checkbox
                            checked={checkedItems.poles.has(pole.id)}
                            onCheckedChange={() => toggleCheckedPole(pole.id, group.id)}
                            className="w-3 h-3 flex-shrink-0"
                          />
                          <VisibilityBtn hidden={isHidden} onToggle={() => toggleItemVisibility("pole", pole.id)} />
                          <span
                            className="text-muted-foreground truncate flex-1 cursor-pointer hover:text-foreground"
                            title={`${poleName} — clique para localizar`}
                            onClick={() => flyToItem(pole.lat, pole.lng)}
                          >{poleName}</span>
                          <span className="text-muted-foreground/40 uppercase text-[9px]">poste</span>
                          {isAdmin && (<>
                            <button title="Remover do grupo" className="opacity-0 group-hover:opacity-100 hover:text-red-400 text-muted-foreground/50 flex-shrink-0" onClick={e => { e.stopPropagation(); removePoleFromGroupMut.mutate({ groupId: group.id, poleId: pole.id }); }}><X className="w-3 h-3" /></button>
                          </>)}
                        </div>
                      );
                    })}
                    {groupReserves.map((reserve: any) => {
                      const isHidden = hiddenReserveIds.has(reserve.id);
                      const reserveName = reserve.name ?? reserve.label ?? `Reserva #${reserve.id}`;
                      return (
                        <div key={`reserve-${reserve.id}`}
                          className={`group flex items-center gap-1.5 px-2 py-0.5 hover:bg-muted/20 text-xs ${isHidden ? "opacity-40" : ""} cursor-grab active:cursor-grabbing ${checkedItems.reserves.has(reserve.id) ? "bg-violet-500/10" : ""}`}
                          style={{ paddingLeft: `${8 + depth * 16}px` }}
                          ref={(node) => { if (node) itemElemsRef.current.set(`reserve-${reserve.id}`, { id: reserve.id, type: 'reserve', groupId: group.id, el: node }); else itemElemsRef.current.delete(`reserve-${reserve.id}`); }}
                          draggable
                          onDragStart={(e) => { e.dataTransfer.setData('application/fiberdoc-item', JSON.stringify({ type: 'reserve', id: reserve.id, fromGroupId: group.id })); e.dataTransfer.effectAllowed = 'move'; }}
                        >
                          <Checkbox
                            checked={checkedItems.reserves.has(reserve.id)}
                            onCheckedChange={() => toggleCheckedReserve(reserve.id, group.id)}
                            className="w-3 h-3 flex-shrink-0"
                          />
                          <VisibilityBtn hidden={isHidden} onToggle={() => toggleItemVisibility("reserve", reserve.id)} />
                          <span
                            className="text-muted-foreground truncate flex-1 cursor-pointer hover:text-foreground"
                            title={`${reserveName} — clique para localizar`}
                            onClick={() => flyToItem(reserve.lat, reserve.lng)}
                          >{reserveName}</span>
                          <span className="text-muted-foreground/40 uppercase text-[9px]">reserva</span>
                          {isAdmin && (<>
                            <button title="Remover do grupo" className="opacity-0 group-hover:opacity-100 hover:text-red-400 text-muted-foreground/50 flex-shrink-0" onClick={e => { e.stopPropagation(); removeReserveFromGroupMut.mutate({ groupId: group.id, reserveId: reserve.id }); }}><X className="w-3 h-3" /></button>
                          </>)}
                        </div>
                      );
                    })}
                    {groupPois.map((poi: any) => {
                      const POI_CAT_COLORS: Record<string, string> = { camera: "#ef4444", predio: "#8b5cf6", antena: "#f59e0b", torre: "#06b6d4", geral: "#6366f1" };
                      const poiColor = poi.color ?? POI_CAT_COLORS[(poi.category ?? "geral").toLowerCase()] ?? "#6366f1";
                      const isHidden = hiddenPoiIds.has(poi.id);
                      return (
                        <div key={`poi-${poi.id}`}
                          className={`group flex items-center gap-1.5 px-2 py-0.5 hover:bg-muted/20 text-xs ${isHidden ? "opacity-40" : ""} cursor-grab active:cursor-grabbing ${checkedItems.pois.has(poi.id) ? "bg-violet-500/10" : ""}`}
                          style={{ paddingLeft: `${8 + depth * 16}px` }}
                          ref={(node) => { if (node) itemElemsRef.current.set(`poi-${poi.id}`, { id: poi.id, type: 'poi', groupId: group.id, el: node }); else itemElemsRef.current.delete(`poi-${poi.id}`); }}
                          draggable
                          onDragStart={(e) => { e.dataTransfer.setData('application/fiberdoc-item', JSON.stringify({ type: 'poi', id: poi.id, fromGroupId: group.id })); e.dataTransfer.effectAllowed = 'move'; }}
                        >
                          <Checkbox
                            checked={checkedItems.pois.has(poi.id)}
                            onCheckedChange={() => toggleCheckedPoi(poi.id, group.id)}
                            className="w-3 h-3 flex-shrink-0"
                          />
                          <VisibilityBtn hidden={isHidden} onToggle={() => toggleItemVisibility("poi", poi.id)} />
                          <span
                            className="text-muted-foreground truncate flex-1 cursor-pointer hover:text-foreground"
                            title={`${poi.name ?? `POI #${poi.id}`} — clique para localizar`}
                            onClick={() => { flyToItem(poi.lat, poi.lng); setSidePanel({ kind: "poi", poi }); setEditingPoi(false); setPoiEditForm({ name: poi.name ?? "", category: poi.category ?? "geral", color: poi.color ?? poiColor, notes: poi.notes ?? "" }); }}
                          >{poi.name ?? `POI #${poi.id}`}</span>
                          <span className="text-muted-foreground/40 uppercase text-[9px]">{poi.category ?? "poi"}</span>
                          {isAdmin && (<>
                            <button title="Editar" className="opacity-0 group-hover:opacity-100 hover:text-cyan-400 text-muted-foreground/50 flex-shrink-0" onClick={e => { e.stopPropagation(); flyToItem(poi.lat, poi.lng); setSidePanel({ kind: "poi", poi }); setEditingPoi(true); setPoiEditForm({ name: poi.name ?? "", category: poi.category ?? "geral", color: poi.color ?? poiColor, notes: poi.notes ?? "" }); }}><Pencil className="w-3 h-3" /></button>
                            <button title="Remover do grupo" className="opacity-0 group-hover:opacity-100 hover:text-red-400 text-muted-foreground/50 flex-shrink-0" onClick={e => { e.stopPropagation(); removePoiFromGroupMut.mutate({ groupId: group.id, poiId: poi.id }); }}><X className="w-3 h-3" /></button>
                          </>)}
                        </div>
                      );
                    })}
                    {groupOlts.map((olt: any) => {
                      const isHidden = hiddenOltIds.has(olt.id);
                      const oltName = olt.equipmentName ?? `OLT #${olt.id}`;
                      return (
                        <div key={`olt-${olt.id}`}
                          className={`group flex items-center gap-1.5 px-2 py-0.5 hover:bg-muted/20 text-xs ${isHidden ? "opacity-40" : ""} cursor-grab active:cursor-grabbing ${checkedItems.olts.has(olt.id) ? "bg-violet-500/10" : ""}`}
                          style={{ paddingLeft: `${8 + depth * 16}px` }}
                          ref={(node) => { if (node) itemElemsRef.current.set(`olt-${olt.id}`, { id: olt.id, type: 'olt', groupId: group.id, el: node }); else itemElemsRef.current.delete(`olt-${olt.id}`); }}
                          draggable
                          onDragStart={(e) => { e.dataTransfer.setData('application/fiberdoc-item', JSON.stringify({ type: 'olt', id: olt.id, fromGroupId: group.id })); e.dataTransfer.effectAllowed = 'move'; }}
                        >
                          <Checkbox
                            checked={checkedItems.olts.has(olt.id)}
                            onCheckedChange={() => toggleCheckedOlt(olt.id, group.id)}
                            className="w-3 h-3 flex-shrink-0"
                          />
                          <VisibilityBtn hidden={isHidden} onToggle={() => toggleItemVisibility("olt", olt.id)} />
                          <span
                            className="text-muted-foreground truncate flex-1 cursor-pointer hover:text-foreground"
                            title={`${oltName} — clique para localizar`}
                            onClick={() => { flyToItem(olt.lat, olt.lng); setSelectedOltElementId(olt.id); setOltDetailPanelOpen(true); }}
                          >{oltName}</span>
                          <span className="text-muted-foreground/40 uppercase text-[9px]">olt</span>
                          {isAdmin && (<>
                            <button title="Editar" className="opacity-0 group-hover:opacity-100 hover:text-cyan-400 text-muted-foreground/50 flex-shrink-0" onClick={e => { e.stopPropagation(); flyToItem(olt.lat, olt.lng); setSelectedOltElementId(olt.id); setOltDetailPanelOpen(true); }}><Pencil className="w-3 h-3" /></button>
                            <button title="Remover do grupo" className="opacity-0 group-hover:opacity-100 hover:text-red-400 text-muted-foreground/50 flex-shrink-0" onClick={e => { e.stopPropagation(); removeOltFromGroupMut.mutate({ groupId: group.id, oltId: olt.id }); }}><X className="w-3 h-3" /></button>
                          </>)}
                        </div>
                      );
                    })}
                  </div>
                )}
                {isExpanded && children.length > 0 && (
                  <div>{children.map((c: any) => renderGroup(c, depth + 1))}</div>
                )}
                {/* Indicador de posição AFTER */}
                {showLineAfter && (
                  <div className="h-0.5 mx-2 rounded-full bg-amber-400 shadow-[0_0_4px_rgba(251,191,36,0.8)]" style={{ marginLeft: `${12 + depth * 16}px` }} />
                )}
              </div>
            );
          };
          return (
            <div ref={(node) => { if (!node && groupsPanelContainerRef.current) { (groupsPanelContainerRef.current as any).__dragCleanup?.(); } groupsPanelCallbackRef(node); }} className="w-72 border-l border-border bg-card/50 flex flex-col overflow-hidden flex-shrink-0">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <FolderTree className="w-4 h-4 text-violet-400" />
                  <span className="text-sm font-medium">Grupos / Pastas</span>
                </div>
                <div className="flex items-center gap-1">
                  {isAdmin && (
                    <>
                      <button
                        onClick={handleAutoOrganize}
                        disabled={isOrganizing}
                        className="text-amber-400 hover:text-amber-300 disabled:opacity-50"
                        title="Auto-organizar: criar pastas Postes e Reservas Técnicas"
                      >
                        {isOrganizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => { setEditingGroupId(null); setGroupForm({ name: "", color: "#6366f1", description: "", parentId: null }); setGroupDialogOpen(true); }}
                        className="text-violet-400 hover:text-violet-300"
                        title="Nova pasta raiz"
                      >
                        <FolderPlus className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  <button onClick={() => setGroupsPanelOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
                </div>
              </div>
              {/* Caixa de busca rápida */}
              <div className="px-3 py-2 border-b border-border/40">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50 pointer-events-none" />
                  <input
                    type="text"
                    value={groupSearch}
                    onChange={(e) => setGroupSearch(e.target.value)}
                    placeholder="Filtrar pastas e itens..."
                    className="w-full pl-7 pr-7 py-1 text-xs bg-muted/30 border border-border/40 rounded-md focus:outline-none focus:ring-1 focus:ring-violet-500/40 placeholder:text-muted-foreground/40"
                  />
                  {groupSearch && (
                    <button onClick={() => setGroupSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto relative select-none"
                ref={groupsPanelScrollRef}
                style={{ userSelect: 'none' }}
                onDragOver={(e) => { if (dragFolderId !== null) { e.preventDefault(); } }}
                onDrop={(e) => {
                  const folderData = e.dataTransfer.getData('application/fiberdoc-folder');
                  if (!folderData) return;
                  e.preventDefault();
                  try {
                    const { id: folderId } = JSON.parse(folderData);
                    // Mover para raiz (sem pai)
                    const rootSiblings = sortedGroups.filter((g: any) => !g.parentId && g.id !== folderId);
                    const updates = [
                      { id: folderId, sortOrder: rootSiblings.length, parentId: null },
                      ...rootSiblings.map((s: any, i: number) => ({ id: s.id, sortOrder: i, parentId: null }))
                    ];
                    reorderGroupMut.mutate({ updates });
                    setDragFolderId(null);
                  } catch {}
                }}
              >
                {/* Retângulo de seleção por arrasto */}
                {dragSelectActive && dragSelectRect && (
                  <div
                    className="pointer-events-none absolute border border-violet-400 bg-violet-400/10 z-50"
                    style={{
                      left: dragSelectRect.x,
                      top: dragSelectRect.y - (groupsPanelScrollRef.current?.scrollTop ?? 0),
                      width: dragSelectRect.w,
                      height: dragSelectRect.h,
                    }}
                  />
                )}
                {allGroups.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    <FolderTree className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p>Nenhuma pasta criada.</p>
                    {isAdmin && <p className="text-xs mt-1">Clique em <strong>+</strong> para criar uma pasta.</p>}
                  </div>
                ) : (
                  <div className="py-1">
                    {filteredRootGroups.map((g: any) => renderGroup(g, 0))}
                    {/* Seção "Sem pasta" */}
                    {(() => {
                      const allGroupedElementIds = new Set<number>();
                      const allGroupedRouteIds = new Set<number>();
                      const allGroupedPoleIds = new Set<number>();
                      const allGroupedReserveIds = new Set<number>();
                      const allGroupedPoiIds = new Set<number>();
                      const allGroupedOltIds = new Set<number>();
                      allGroups.forEach((g: any) => {
                        (g.elements ?? []).forEach((e: any) => allGroupedElementIds.add(e.elementId));
                        (g.routes ?? []).forEach((r: any) => allGroupedRouteIds.add(r.routeId));
                        (g.poles ?? []).forEach((p: any) => allGroupedPoleIds.add(p.poleId));
                        (g.reserves ?? []).forEach((r: any) => allGroupedReserveIds.add(r.reserveId));
                        (g.pois ?? []).forEach((p: any) => allGroupedPoiIds.add(p.poiId));
                        (g.olts ?? []).forEach((o: any) => allGroupedOltIds.add(o.oltId));
                      });
                      const ungroupedElems = (elements as any[]).filter((e: any) => !allGroupedElementIds.has(e.id));
                      const ungroupedRoutes = (routes as any[]).filter((r: any) => !allGroupedRouteIds.has(r.id));
                      const ungroupedPoles = (poles as any[]).filter((p: any) => !allGroupedPoleIds.has(p.id));
                      const ungroupedReserves = (reserves as any[]).filter((r: any) => !allGroupedReserveIds.has(r.id));
                      const ungroupedPois = allPois.filter((p: any) => !allGroupedPoiIds.has(p.id));
                      const ungroupedOlts = (oltElements as any[]).filter((o: any) => !allGroupedOltIds.has(o.id));
                      const totalUngrouped = ungroupedElems.length + ungroupedRoutes.length + ungroupedPoles.length + ungroupedReserves.length + ungroupedPois.length + ungroupedOlts.length;
                      if (totalUngrouped === 0) return null;
                      const isExpanded = expandedGroupElements.has(-1);
                      const ungroupedHiddenCount =
                        ungroupedElems.filter((e: any) => hiddenElementIds.has(e.id)).length +
                        ungroupedRoutes.filter((r: any) => hiddenRouteIds.has(r.id)).length +
                        ungroupedPoles.filter((p: any) => hiddenPoleIds.has(p.id)).length +
                        ungroupedReserves.filter((r: any) => hiddenReserveIds.has(r.id)).length +
                        ungroupedPois.filter((p: any) => hiddenPoiIds.has(p.id)).length +
                        ungroupedOlts.filter((o: any) => hiddenOltIds.has(o.id)).length;
                      const ungroupedAllHidden = ungroupedHiddenCount === totalUngrouped;
                      const ungroupedIndet = ungroupedHiddenCount > 0 && !ungroupedAllHidden;
                      const ungroupedAllVisible = ungroupedHiddenCount === 0;
                      const toggleUngroupedVisibility = () => {
                        const hide = ungroupedAllVisible;
                        ungroupedElems.forEach((e: any) => setHiddenElementIds(prev => { const n = new Set(prev); hide ? n.add(e.id) : n.delete(e.id); return n; }));
                        ungroupedRoutes.forEach((r: any) => setHiddenRouteIds(prev => { const n = new Set(prev); hide ? n.add(r.id) : n.delete(r.id); return n; }));
                        ungroupedPoles.forEach((p: any) => setHiddenPoleIds(prev => { const n = new Set(prev); hide ? n.add(p.id) : n.delete(p.id); return n; }));
                        ungroupedReserves.forEach((r: any) => setHiddenReserveIds(prev => { const n = new Set(prev); hide ? n.add(r.id) : n.delete(r.id); return n; }));
                        ungroupedPois.forEach((p: any) => setHiddenPoiIds(prev => { const n = new Set(prev); hide ? n.add(p.id) : n.delete(p.id); return n; }));
                        ungroupedOlts.forEach((o: any) => setHiddenOltIds(prev => { const n = new Set(prev); hide ? n.add(o.id) : n.delete(o.id); return n; }));
                      };
                      return (
                        <div className="mt-1 border-t border-border/30 pt-1">
                          <div
                            className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-muted/30"
                          >
                            <button
                              onClick={() => setExpandedGroupElements(prev => { const n = new Set(prev); if (n.has(-1)) n.delete(-1); else n.add(-1); return n; })}
                              className="text-muted-foreground hover:text-foreground flex-shrink-0"
                            >
                              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            </button>
                            {/* Checkbox da seção Sem pasta */}
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleUngroupedVisibility(); }}
                              className={`w-3.5 h-3.5 flex-shrink-0 rounded-sm border flex items-center justify-center transition-colors ${
                                ungroupedAllVisible
                                  ? "border-violet-500/60 bg-violet-500/20 hover:bg-violet-500/30"
                                  : ungroupedIndet
                                    ? "border-violet-500/40 bg-violet-500/10 hover:bg-violet-500/20"
                                    : "border-muted-foreground/20 bg-transparent hover:border-muted-foreground/40"
                              }`}
                              title={ungroupedAllVisible ? "Ocultar itens sem pasta" : "Mostrar itens sem pasta"}
                            >
                              {ungroupedAllVisible && <span className="w-2 h-2 block" style={{ background: "currentColor", clipPath: "polygon(14% 44%, 0 65%, 50% 100%, 100% 16%, 80% 0%, 43% 62%)" }} />}
                              {ungroupedIndet && <span className="w-1.5 h-0.5 block bg-violet-400/70 rounded" />}
                            </button>
                            <span className="text-xs font-medium flex-1 text-muted-foreground/70 italic cursor-pointer"
                              onClick={() => setExpandedGroupElements(prev => { const n = new Set(prev); if (n.has(-1)) n.delete(-1); else n.add(-1); return n; })}
                            >Sem pasta</span>
                            <span className="text-[10px] text-muted-foreground/50">{totalUngrouped}</span>
                          </div>
                          {isExpanded && (
                            <div className="border-l border-border/30 ml-5 mb-1">
                              {ungroupedElems.map((el: any) => {
                                const isHidden = hiddenElementIds.has(el.id);
                                const elName = el.elementName ?? el.name ?? el.label ?? `#${el.id}`;
                                return (
                                  <div key={`unel-${el.id}`} ref={(node) => { if (node) itemElemsRef.current.set(`el-${el.id}`, { id: el.id, type: 'element', groupId: -1, el: node }); else itemElemsRef.current.delete(`el-${el.id}`); }} className={`flex items-center gap-1.5 px-2 py-0.5 hover:bg-muted/20 text-xs ${isHidden ? "opacity-40" : ""} ${checkedItems.elements.has(el.id) ? "bg-violet-500/10" : ""}`}>
                                    <span className="w-3 h-3 flex-shrink-0" />
                                    <VisibilityBtn hidden={isHidden} onToggle={() => toggleItemVisibility("element", el.id)} />
                                    <span className="text-muted-foreground truncate flex-1 cursor-pointer hover:text-foreground" onClick={() => flyToItem(el.lat, el.lng)} title={elName}>{elName}</span>
                                    <span className="text-muted-foreground/40 uppercase text-[9px]">{el.type ?? ""}</span>
                                  </div>
                                );
                              })}
                              {ungroupedRoutes.map((rt: any) => {
                                const isHidden = hiddenRouteIds.has(rt.id);
                                const rtName = rt.name ?? rt.label ?? `Cabo #${rt.id}`;
                                let midLat: number | null = null; let midLng: number | null = null;
                                try {
                                  const fromEl = (elements as any[]).find((e: any) => e.id === rt.fromElementId);
                                  const toEl = (elements as any[]).find((e: any) => e.id === rt.toElementId);
                                  if (fromEl && toEl) { midLat = (Number(fromEl.lat) + Number(toEl.lat)) / 2; midLng = (Number(fromEl.lng) + Number(toEl.lng)) / 2; }
                                  else if (fromEl) { midLat = Number(fromEl.lat); midLng = Number(fromEl.lng); }
                                  else if (rt.path) { const pts = JSON.parse(rt.path); if (pts.length > 0) { midLat = pts[Math.floor(pts.length/2)].lat; midLng = pts[Math.floor(pts.length/2)].lng; } }
                                } catch {}
                                return (
                                  <div key={`unrt-${rt.id}`} ref={(node) => { if (node) itemElemsRef.current.set(`rt-${rt.id}`, { id: rt.id, type: 'route', groupId: -1, el: node }); else itemElemsRef.current.delete(`rt-${rt.id}`); }} className={`flex items-center gap-1.5 px-2 py-0.5 hover:bg-muted/20 text-xs ${isHidden ? "opacity-40" : ""} ${checkedItems.routes.has(rt.id) ? "bg-violet-500/10" : ""}`}>
                                    <Checkbox checked={checkedItems.routes.has(rt.id)} onCheckedChange={() => toggleCheckedRoute(rt.id)} className="w-3 h-3 flex-shrink-0" />
                                    <VisibilityBtn hidden={isHidden} onToggle={() => toggleItemVisibility("route", rt.id)} />
                                    <span className="text-muted-foreground truncate flex-1 cursor-pointer hover:text-foreground" onClick={() => flyToItem(midLat, midLng)} title={rtName}>{rtName}</span>
                                    <span className="text-muted-foreground/40 uppercase text-[9px]">cabo</span>
                                  </div>
                                );
                              })}
                              {ungroupedPoles.map((pole: any) => {
                                const isHidden = hiddenPoleIds.has(pole.id);
                                const poleName = pole.name ?? `Poste #${pole.id}`;
                                return (
                                  <div key={`unpole-${pole.id}`} ref={(node) => { if (node) itemElemsRef.current.set(`pole-${pole.id}`, { id: pole.id, type: 'pole', groupId: -1, el: node }); else itemElemsRef.current.delete(`pole-${pole.id}`); }} className={`flex items-center gap-1.5 px-2 py-0.5 hover:bg-muted/20 text-xs ${isHidden ? "opacity-40" : ""} ${checkedItems.poles.has(pole.id) ? "bg-violet-500/10" : ""}`}>
                                    <Checkbox checked={checkedItems.poles.has(pole.id)} onCheckedChange={() => toggleCheckedPole(pole.id)} className="w-3 h-3 flex-shrink-0" />
                                    <VisibilityBtn hidden={isHidden} onToggle={() => toggleItemVisibility("pole", pole.id)} />
                                    <span className="text-muted-foreground truncate flex-1 cursor-pointer hover:text-foreground" onClick={() => flyToItem(pole.lat, pole.lng)} title={poleName}>{poleName}</span>
                                    <span className="text-muted-foreground/40 uppercase text-[9px]">poste</span>
                                  </div>
                                );
                              })}
                              {ungroupedReserves.map((reserve: any) => {
                                const isHidden = hiddenReserveIds.has(reserve.id);
                                const reserveName = reserve.name ?? `Reserva #${reserve.id}`;
                                return (
                                  <div key={`unreserve-${reserve.id}`} ref={(node) => { if (node) itemElemsRef.current.set(`reserve-${reserve.id}`, { id: reserve.id, type: 'reserve', groupId: -1, el: node }); else itemElemsRef.current.delete(`reserve-${reserve.id}`); }} className={`flex items-center gap-1.5 px-2 py-0.5 hover:bg-muted/20 text-xs ${isHidden ? "opacity-40" : ""} ${checkedItems.reserves.has(reserve.id) ? "bg-violet-500/10" : ""}`}>
                                    <Checkbox checked={checkedItems.reserves.has(reserve.id)} onCheckedChange={() => toggleCheckedReserve(reserve.id)} className="w-3 h-3 flex-shrink-0" />
                                    <VisibilityBtn hidden={isHidden} onToggle={() => toggleItemVisibility("reserve", reserve.id)} />
                                    <span className="text-muted-foreground truncate flex-1 cursor-pointer hover:text-foreground" onClick={() => flyToItem(reserve.lat, reserve.lng)} title={reserveName}>{reserveName}</span>
                                    <span className="text-muted-foreground/40 uppercase text-[9px]">reserva</span>
                                  </div>
                                );
                              })}
                              {ungroupedPois.map((poi: any) => {
                                const isHidden = hiddenPoiIds.has(poi.id);
                                const poiName = poi.name ?? `POI #${poi.id}`;
                                return (
                                  <div key={`unpoi-${poi.id}`} ref={(node) => { if (node) itemElemsRef.current.set(`poi-${poi.id}`, { id: poi.id, type: 'poi', groupId: -1, el: node }); else itemElemsRef.current.delete(`poi-${poi.id}`); }} className={`flex items-center gap-1.5 px-2 py-0.5 hover:bg-muted/20 text-xs ${isHidden ? "opacity-40" : ""} ${checkedItems.pois.has(poi.id) ? "bg-violet-500/10" : ""}`}>
                                    <Checkbox checked={checkedItems.pois.has(poi.id)} onCheckedChange={() => toggleCheckedPoi(poi.id)} className="w-3 h-3 flex-shrink-0" />
                                    <VisibilityBtn hidden={isHidden} onToggle={() => toggleItemVisibility("poi", poi.id)} />
                                    <span className="text-muted-foreground truncate flex-1 cursor-pointer hover:text-foreground" onClick={() => { flyToItem(poi.lat, poi.lng); setSidePanel({ kind: "poi", poi }); }} title={poiName}>{poiName}</span>
                                    <span className="text-muted-foreground/40 uppercase text-[9px]">{poi.category ?? "poi"}</span>
                                  </div>
                                );
                              })}
                              {ungroupedOlts.map((olt: any) => {
                                const isHidden = hiddenOltIds.has(olt.id);
                                const oltName = olt.equipmentName ?? `OLT #${olt.id}`;
                                return (
                                  <div key={`unolt-${olt.id}`} ref={(node) => { if (node) itemElemsRef.current.set(`olt-${olt.id}`, { id: olt.id, type: 'olt', groupId: -1, el: node }); else itemElemsRef.current.delete(`olt-${olt.id}`); }} className={`flex items-center gap-1.5 px-2 py-0.5 hover:bg-muted/20 text-xs ${isHidden ? "opacity-40" : ""} ${checkedItems.olts.has(olt.id) ? "bg-violet-500/10" : ""}`}>
                                    <Checkbox checked={checkedItems.olts.has(olt.id)} onCheckedChange={() => toggleCheckedOlt(olt.id)} className="w-3 h-3 flex-shrink-0" />
                                    <VisibilityBtn hidden={isHidden} onToggle={() => toggleItemVisibility("olt", olt.id)} />
                                    <span className="text-muted-foreground truncate flex-1 cursor-pointer hover:text-foreground" onClick={() => { flyToItem(olt.lat, olt.lng); setSelectedOltElementId(olt.id); setOltDetailPanelOpen(true); }} title={oltName}>{oltName}</span>
                                    <span className="text-muted-foreground/40 uppercase text-[9px]">olt</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
              {totalChecked > 0 && (
                 <div className="px-3 py-2 border-t border-border bg-violet-500/5 flex flex-col gap-1.5">
                   <div className="flex items-center gap-2">
                     <span className="text-xs text-violet-400 font-medium flex-1">{totalChecked} item{totalChecked !== 1 ? "s" : ""} selecionado{totalChecked !== 1 ? "s" : ""}</span>
                     <button
                       onClick={clearCheckedItems}
                       className="text-xs text-muted-foreground hover:text-foreground"
                       title="Limpar seleção"
                     >
                       <X className="w-3 h-3" />
                     </button>
                   </div>
                   <div className="flex items-center gap-1.5 flex-wrap">
                     <button
                       onClick={handleExportChecked}
                       className="text-xs px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 border border-cyan-500/20"
                       title="Exportar itens selecionados"
                     >
                       Exportar
                     </button>
                     {isAdmin && (
                       <button
                         onClick={() => setMoveToGroupDialogOpen(true)}
                         className="text-xs px-2 py-0.5 rounded bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 border border-violet-500/20"
                         title="Mover itens selecionados para outra pasta"
                       >
                         Mover para pasta
                       </button>
                     )}
                     {isAdmin && checkedGroupId !== null && (
                       <button
                         onClick={async () => {
                           const gid = checkedGroupId;
                           const promises: Promise<any>[] = [];
                           checkedItems.elements.forEach(id => promises.push(removeElementFromGroupMut.mutateAsync({ groupId: gid, elementId: id })));
                           checkedItems.routes.forEach(id => promises.push(removeRouteFromGroupMut.mutateAsync({ groupId: gid, routeId: id })));
                           checkedItems.poles.forEach(id => promises.push(removePoleFromGroupMut.mutateAsync({ groupId: gid, poleId: id })));
                           checkedItems.reserves.forEach(id => promises.push(removeReserveFromGroupMut.mutateAsync({ groupId: gid, reserveId: id })));
                           checkedItems.pois.forEach(id => promises.push(removePoiFromGroupMut.mutateAsync({ groupId: gid, poiId: id })));
                           checkedItems.olts.forEach(id => promises.push(removeOltFromGroupMut.mutateAsync({ groupId: gid, oltId: id })));
                           try { await Promise.all(promises); toast.success(`${totalChecked} item${totalChecked !== 1 ? 's' : ''} removido${totalChecked !== 1 ? 's' : ''} do grupo`); clearCheckedItems(); refetchGroups(); } catch (e: any) { toast.error(e.message ?? 'Erro ao remover itens'); }
                         }}
                         className="text-xs px-2 py-0.5 rounded bg-orange-500/10 text-orange-300 hover:bg-orange-500/20 border border-orange-500/20"
                         title="Remover itens selecionados do grupo"
                       >
                         Remover do grupo
                       </button>
                     )}
                     {isAdmin && (
                       <button
                         onClick={() => setBulkDeleteConfirmOpen(true)}
                         className="text-xs px-2 py-0.5 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20"
                         title="Excluir permanentemente os itens selecionados"
                       >
                         Excluir
                       </button>
                     )}
                   </div>
                 </div>
               )}
              {isAdmin && (
                <div className="px-3 py-2 border-t border-border">
                  <button
                    onClick={toggleGroupSelectMode}
                    className={`w-full text-xs text-center rounded px-2 py-1.5 ${
                      groupSelectMode
                        ? "bg-cyan-600/20 text-cyan-400 border border-cyan-500/30"
                        : "text-violet-400 hover:text-violet-300 underline"
                    }`}
                  >
                    {groupSelectMode ? `Seleção ativa (${groupTotalSelected})` : "Ativar seleção múltipla"}
                  </button>
                </div>
              )}
            </div>
          );
        })()}
        
        {sidePanel && (
          <div className="w-72 border-l border-border bg-card/50 flex flex-col overflow-hidden flex-shrink-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-sm font-medium">Detalhes</span>
              <button onClick={() => setSidePanel(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">{renderSidePanel()}</div>
          </div>
        )}
      </div>

      {/* Diálogo pick CEO/CTO */}
      {/* IMPORTANTE: usar pickDialogTypeRef.current directamente no JSX para evitar
          stale state — o estado React pode não ter sido actualizado quando o diálogo renderiza */}
      <Dialog key={pickDialogKey} open={pickDialogOpen} onOpenChange={setPickDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle style={{color: pickDialogTypeRef.current === "ceo" ? "#a855f7" : "#22c55e"}}>
              Adicionar {pickDialogTypeRef.current.toUpperCase()} ao Mapa
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button size="sm" variant={!pickCreateNew ? "default" : "outline"} onClick={() => setPickCreateNew(false)} className="flex-1">Selecionar existente</Button>
              <Button size="sm" variant={pickCreateNew ? "default" : "outline"} onClick={() => setPickCreateNew(true)} className="flex-1">Criar novo</Button>
            </div>
            {!pickCreateNew ? (
              <div className="space-y-2">
                <Label>Selecione um {pickDialogTypeRef.current.toUpperCase()}</Label>
                <Select value={pickSelectedId?.toString() ?? ""} onValueChange={v => setPickSelectedId(Number(v))}>
                  <SelectTrigger><SelectValue placeholder={`Selecionar ${pickDialogTypeRef.current.toUpperCase()}...`} /></SelectTrigger>
                  <SelectContent>{(pickDialogTypeRef.current === "cto" ? (ctos as any[]) : ceos).map((item: any) => (<SelectItem key={item.id} value={item.id.toString()}>{item.name}</SelectItem>))}</SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1.5"><Label>Nome *</Label><Input value={pickNewName} onChange={e => setPickNewName(e.target.value)} placeholder={`Nome do ${pickDialogTypeRef.current.toUpperCase()}`} /></div>
                <div className="space-y-1.5">
                  <Label>Endereço</Label>
                  <div className="flex gap-2">
                    <Input value={pickNewAddress} onChange={e => setPickNewAddress(e.target.value)} placeholder="Endereço (opcional)" className="flex-1" />
                    <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1 text-xs" onClick={() => fetchReverseGeocode(pickDialogLat, pickDialogLng)} disabled={geocodeLoading}>
                      {geocodeLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Navigation className="w-3 h-3" />}
                      {geocodeLoading ? "" : "Auto"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Clique em "Auto" para preencher pelo GPS</p>
                </div>
                {pickDialogTypeRef.current === "cto" && <div className="space-y-1.5"><Label>Capacidade (portas)</Label><Input type="number" value={pickNewCapacity} onChange={e => setPickNewCapacity(Number(e.target.value))} min={1} /></div>}
              </div>
            )}
            <div className="text-xs text-muted-foreground">Posição: {pickDialogLat.toFixed(6)}, {pickDialogLng.toFixed(6)}</div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPickDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handlePickConfirm} disabled={upsertElementMut.isPending}>{upsertElementMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo configuração do cabo */}
      <Dialog open={routeDialogOpen} onOpenChange={setRouteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Configurar Cabo</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>Nome do cabo</Label><Input value={routeForm.name} onChange={e => setRouteForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Cabo Principal CEO-01 para CTO-05" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Tipo</Label>
                <Select value={routeForm.cableType} onValueChange={v => setRouteForm(f => ({ ...f, cableType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="FO">Fibra Óptica (FO)</SelectItem><SelectItem value="ADSS">ADSS</SelectItem><SelectItem value="OPGW">OPGW</SelectItem><SelectItem value="Metálico">Metálico</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Fibras</Label><Input type="number" value={routeForm.fiberCount} onChange={e => setRouteForm(f => ({ ...f, fiberCount: Number(e.target.value) }))} min={1} /></div>
            </div>
            <div className="space-y-1.5"><Label>Cor no mapa</Label>
              <div className="flex gap-2 items-center"><input type="color" value={routeForm.color} onChange={e => setRouteForm(f => ({ ...f, color: e.target.value }))} className="w-10 h-8 rounded cursor-pointer border border-border" /><span className="text-xs text-muted-foreground">{routeForm.color}</span></div>
            </div>
            <div className="space-y-1.5"><Label>Observações</Label><Textarea value={routeForm.notes} onChange={e => setRouteForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Observações opcionais..." /></div>
            {drawingPath.length >= 2 && <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2">Traçado livre: {drawingPath.length} pontos definidos</div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRouteDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateRoute} disabled={createRouteMut.isPending}>{createRouteMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Criar Cabo"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Exportação KML/KMZ */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="max-w-lg flex flex-col" style={{maxHeight:"90vh"}}>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Download className="w-4 h-4" />Exportar KML / KMZ</DialogTitle></DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {/* Formato */}
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wide mb-2 block">Formato</Label>
              <div className="flex gap-2">
                <Button size="sm" variant={exportFormat === "kmz" ? "default" : "outline"} onClick={() => setExportFormat("kmz")} className="flex-1">KMZ (Google Earth)</Button>
                <Button size="sm" variant={exportFormat === "kml" ? "default" : "outline"} onClick={() => setExportFormat("kml")} className="flex-1">KML (XML)</Button>
              </div>
            </div>
            {/* Filtro por tipo */}
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wide mb-2 block">Tipos de Elemento</Label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setExportTypeCto(v => !v)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all ${exportTypeCto ? "border-blue-500 bg-blue-500/10 text-blue-400" : "border-border text-muted-foreground"}`}
                >
                  <span className="text-lg font-bold">CTO</span>
                  <span className="text-xs">{(elements as any[]).filter((e: any) => e.type === "cto").length} itens</span>
                  {exportTypeCto ? <span className="text-xs font-medium">✓ Incluído</span> : <span className="text-xs">Excluído</span>}
                </button>
                <button
                  onClick={() => setExportTypeCeo(v => !v)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all ${exportTypeCeo ? "border-amber-500 bg-amber-500/10 text-amber-400" : "border-border text-muted-foreground"}`}
                >
                  <span className="text-lg font-bold">CEO</span>
                  <span className="text-xs">{(elements as any[]).filter((e: any) => e.type === "ceo").length} itens</span>
                  {exportTypeCeo ? <span className="text-xs font-medium">✓ Incluído</span> : <span className="text-xs">Excluído</span>}
                </button>
                <button
                  onClick={() => setExportTypeCabo(v => !v)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all ${exportTypeCabo ? "border-cyan-500 bg-cyan-500/10 text-cyan-400" : "border-border text-muted-foreground"}`}
                >
                  <span className="text-lg font-bold">Cabo</span>
                  <span className="text-xs">{(routes as any[]).length} itens</span>
                  {exportTypeCabo ? <span className="text-xs font-medium">✓ Incluído</span> : <span className="text-xs">Excluído</span>}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2">
                <button
                  onClick={() => setExportIncludePoles(v => !v)}
                  className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border-2 transition-all ${exportIncludePoles ? "border-yellow-500 bg-yellow-500/10 text-yellow-400" : "border-border text-muted-foreground"}`}
                >
                  <span className="text-sm font-bold">Postes</span>
                  <span className="text-xs">{(mapPoles as any[]).length} itens</span>
                  {exportIncludePoles ? <span className="text-xs font-medium">✓ Incluído</span> : <span className="text-xs">Excluído</span>}
                </button>
                <button
                  onClick={() => setExportIncludeReserves(v => !v)}
                  className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border-2 transition-all ${exportIncludeReserves ? "border-orange-500 bg-orange-500/10 text-orange-400" : "border-border text-muted-foreground"}`}
                >
                  <span className="text-sm font-bold">Reservas</span>
                  <span className="text-xs">{(mapReserves as any[]).length} itens</span>
                  {exportIncludeReserves ? <span className="text-xs font-medium">✓ Incluído</span> : <span className="text-xs">Excluído</span>}
                </button>
                <button
                  onClick={() => setExportIncludePois(v => !v)}
                  className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border-2 transition-all ${exportIncludePois ? "border-indigo-500 bg-indigo-500/10 text-indigo-400" : "border-border text-muted-foreground"}`}
                >
                  <span className="text-sm font-bold">POIs</span>
                  <span className="text-xs">{(pois as any[]).length} itens</span>
                  {exportIncludePois ? <span className="text-xs font-medium">✓ Incluído</span> : <span className="text-xs">Excluído</span>}
                </button>
              </div>
            </div>
            {/* Opções de conteúdo */}
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wide mb-2 block">Conteúdo das Descrições</Label>
              <div className="space-y-2 bg-muted/10 rounded-lg p-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={exportIncludeFusions} onChange={e => setExportIncludeFusions(e.target.checked)} className="rounded" />
                  <span className="text-sm">Incluir mapa de fusões (CEO/CTO)</span>
                  <span className="text-xs text-muted-foreground ml-auto">+tempo</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={exportIncludeFibers} onChange={e => setExportIncludeFibers(e.target.checked)} className="rounded" />
                  <span className="text-sm">Incluir dados de fibras ópticas</span>
                </label>
              </div>
            </div>
            {/* Filtro por grupo - árvore hierárquica */}
            {(mapGroups as any[]).length > 0 && (
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wide mb-2 block">Filtrar por Grupo</Label>
                <div className="border border-border rounded-lg overflow-hidden">
                  {/* Opção Todos */}
                  <button
                    type="button"
                    onClick={() => setExportGroupId(null)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                      exportGroupId === null ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/30 text-foreground"
                    }`}
                  >
                    <Folder className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>Todos os grupos</span>
                    {exportGroupId === null && <Check className="w-3 h-3 ml-auto" />}
                  </button>
                  {/* Árvore de grupos */}
                  {(() => {
                    const allGrps = mapGroups as any[];
                    const renderGrp = (g: any, depth: number): React.ReactNode => {
                      const children = allGrps.filter((c: any) => c.parentId === g.id);
                      const isExpanded = expandedExportGrps.has(g.id);
                      const isSelected = exportGroupId === g.id;
                      return (
                        <div key={g.id}>
                          <button
                            type="button"
                            className={`w-full flex items-center gap-1.5 py-2 text-sm text-left transition-colors ${
                              isSelected ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/30 text-foreground"
                            }`}
                            style={{ paddingLeft: `${12 + depth * 16}px`, paddingRight: '12px' }}
                            onClick={() => setExportGroupId(isSelected ? null : g.id)}
                          >
                            {children.length > 0 ? (
                              <button
                                type="button"
                                className="flex-shrink-0 p-0.5 hover:bg-muted/50 rounded"
                                onClick={e => { e.stopPropagation(); setExpandedExportGrps(prev => { const n = new Set(prev); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); return n; }); }}
                              >
                                {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                              </button>
                            ) : <span className="w-4 flex-shrink-0" />}
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{background: g.color ?? '#888'}} />
                            <span className="flex-1 truncate">{g.name}</span>
                            {isSelected && <Check className="w-3 h-3 ml-auto flex-shrink-0" />}
                          </button>
                          {isExpanded && children.map((c: any) => renderGrp(c, depth + 1))}
                        </div>
                      );
                    };
                    const roots = allGrps.filter((g: any) => !g.parentId);
                    return roots.map((g: any) => renderGrp(g, 0));
                  })()}
                </div>
                {exportGroupId !== null && (
                  <p className="text-xs text-muted-foreground mt-1">Apenas elementos do grupo selecionado serão exportados.{exportOnlyVisible ? " Combinado com filtro de visíveis." : ""}</p>
                )}
              </div>
            )}
            {/* Exportar apenas visíveis */}
            <div className="bg-muted/10 rounded-lg p-3">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={exportOnlyVisible}
                  onChange={e => setExportOnlyVisible(e.target.checked)}
                  className="rounded"
                />
                <div>
                  <span className="text-sm font-medium">Exportar apenas itens visíveis</span>
                  <p className="text-xs text-muted-foreground mt-0.5">Inclui somente os itens que estão visíveis no painel de grupos (sem checkbox desmarcado no mapa)</p>
                </div>
              </label>
              {exportOnlyVisible && (
                <p className="text-xs text-amber-500/80 mt-2">⚠ Os itens ocultos no painel lateral serão ignorados na exportação.</p>
              )}
            </div>

            {/* Seleção individual (avançado) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Seleção Individual (Avançado)</Label>
                <button onClick={toggleExportSelectAll} className="text-xs text-primary underline">{exportSelectAll ? "Desmarcar tudo" : "Selecionar tudo"}</button>
              </div>
              <div className="border border-border rounded-lg divide-y divide-border max-h-40 overflow-y-auto">
                {(elements as any[])
                  .filter((el: any) => (el.type === "cto" ? exportTypeCto : exportTypeCeo))
                  .map((el: any) => {
                    const ref = el.type === "cto" ? (ctos as any[]).find((c: any) => c.id === el.referenceId) : ceos.find((c: any) => c.id === el.referenceId);
                    return (<label key={`el-${el.id}`} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/30"><input type="checkbox" checked={exportSelectAll || exportSelectedElements.has(el.id)} onChange={() => toggleElement(el.id)} /><span className={`text-xs font-medium mr-1 ${el.type === "cto" ? "text-blue-400" : "text-amber-400"}`}>{el.type.toUpperCase()}</span><span className="text-xs">{ref?.name ?? el.referenceId}</span></label>);
                  })}
                {exportTypeCabo && (routes as any[]).map((r: any) => (<label key={`rt-${r.id}`} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/30"><input type="checkbox" checked={exportSelectAll || exportSelectedRoutes.has(r.id)} onChange={() => toggleRoute(r.id)} /><span className="text-xs font-medium text-cyan-400 mr-1">CABO</span><span className="text-xs">{r.name ?? `Rota ${r.id}`}</span></label>))}
                {(elements as any[]).filter((el: any) => (el.type === "cto" ? exportTypeCto : exportTypeCeo)).length === 0 && !exportTypeCabo && (
                  <div className="px-3 py-4 text-center text-xs text-muted-foreground">Nenhum tipo seleccionado</div>
                )}
              </div>
            </div>
            {/* Resumo */}
            <div className="bg-muted/20 rounded-lg px-3 py-2 text-xs text-muted-foreground space-y-0.5">
              <div>Serão exportados: {exportTypeCto ? `${(elements as any[]).filter((e: any) => e.type === "cto").length} CTOs` : "0 CTOs"} · {exportTypeCeo ? `${(elements as any[]).filter((e: any) => e.type === "ceo").length} CEOs` : "0 CEOs"} · {exportTypeCabo ? `${(routes as any[]).length} Cabos` : "0 Cabos"}</div>
              <div>{exportIncludePoles ? `${(mapPoles as any[]).length} Postes` : "0 Postes"} · {exportIncludeReserves ? `${(mapReserves as any[]).length} Reservas` : "0 Reservas"} · {exportIncludePois ? `${(pois as any[]).length} POIs` : "0 POIs"}{exportGroupId !== null ? ` (filtrado por grupo)` : ""}</div>
              {exportIncludeFusions && <div className="text-yellow-500/80">⚠ Mapa de fusões ativo — exportação pode ser mais lenta</div>}
            </div>
          </div>
          <DialogFooter className="flex-shrink-0 pt-2">
            <Button variant="outline" onClick={() => setExportDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleExportKml} disabled={exportLoading || (!exportTypeCto && !exportTypeCeo && !exportTypeCabo && !exportIncludePoles && !exportIncludeReserves && !exportIncludePois)}>{exportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Download className="w-4 h-4 mr-1" />Exportar {exportFormat.toUpperCase()}</>}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação exclusão elemento */}
      <Dialog open={deleteElementId !== null} onOpenChange={() => setDeleteElementId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Excluir {deleteElementId?.type === "cto" ? "CTO" : "CEO"}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Deseja excluir permanentemente este elemento? Ele será removido do mapa <strong>e do cadastro</strong>. Esta ação não pode ser desfeita.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteElementId(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={deleteElementMut.isPending}
              onClick={() => {
                if (!deleteElementId) return;
                // Remove do cadastro (ceos/ctos)
                if (deleteElementId.type === "cto") deleteCtoMut.mutate({ id: deleteElementId.referenceId });
                else deleteCeoMut.mutate({ id: deleteElementId.referenceId });
                // Remove do mapa
                deleteElementMut.mutate({ id: deleteElementId.id });
              }}
            >
              {deleteElementMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação exclusão rota */}
      <Dialog open={deleteRouteId !== null} onOpenChange={() => setDeleteRouteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Excluir Rota</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Deseja excluir permanentemente esta rota de cabo?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteRouteId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteRouteId && deleteRouteMut.mutate({ id: deleteRouteId })} disabled={deleteRouteMut.isPending}>{deleteRouteMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Excluir"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo: vincular ponto do meio a elemento */}
      <Dialog open={truncateConfirm !== null} onOpenChange={(open) => { if (!open) setTruncateConfirm(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cable className="w-4 h-4 text-amber-400" />
              Vincular ponto ao elemento
            </DialogTitle>
          </DialogHeader>
          {truncateConfirm && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                O ponto foi posicionado sobre <span className="font-semibold text-foreground">"{truncateConfirm.snappedName}"</span>. O traçado <strong>não será cortado</strong> — o ponto passa pelo elemento. O que deseja fazer?
              </p>
              <div className="grid grid-cols-1 gap-2">
                {/* Opção 1: apenas ponto de passagem (não vincula como extremidade) */}
                <button
                  className="rounded-lg border border-muted/40 bg-muted/10 hover:bg-muted/20 p-3 text-left transition-colors"
                  onClick={() => {
                    // Apenas manter o ponto na posição do elemento (já foi movido)
                    toast.success(`Ponto posicionado sobre "${truncateConfirm.snappedName}" (ponto de passagem)`);
                    setTruncateConfirm(null);
                  }}
                >
                  <p className="text-xs font-semibold text-foreground mb-1">📍 Ponto de passagem</p>
                  <p className="text-xs text-muted-foreground">O cabo passa pelo elemento mas não é vinculado como extremidade. O traçado permanece intacto.</p>
                </button>
                {/* Opção 2: vincular como nova origem (manter do ponto até ao fim) */}
                <button
                  className="rounded-lg border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 p-3 text-left transition-colors"
                  onClick={() => {
                    const pts = truncateConfirm.newPath;
                    // Encontrar o índice do ponto que está sobre o elemento
                    const snapIdx = pts.findIndex(p =>
                      Math.abs(p.lat - (elementsRef.current.find((e: any) => e.id === truncateConfirm.snappedId) as any)?.lat) < 0.0002 &&
                      Math.abs(p.lng - (elementsRef.current.find((e: any) => e.id === truncateConfirm.snappedId) as any)?.lng) < 0.0002
                    );
                    const newPath = snapIdx >= 0 ? pts.slice(snapIdx) : pts;
                    editingRoutePathRef.current = newPath;
                    snapFromIdRef.current = truncateConfirm.snappedId;
                    setEditingRoutePath([...newPath]);
                    renderEditRouteMarkers([...newPath], truncateConfirm.routeColor);
                    toast.success(`"${truncateConfirm.snappedName}" definido como nova origem`);
                    setTruncateConfirm(null);
                  }}
                >
                  <p className="text-xs font-semibold text-amber-400 mb-1">→ Definir como nova origem</p>
                  <p className="text-xs text-muted-foreground">Remove os pontos antes deste elemento. O elemento vira a nova origem do cabo.</p>
                </button>
                {/* Opção 3: vincular como novo destino (manter do início até ao ponto) */}
                <button
                  className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 p-3 text-left transition-colors"
                  onClick={() => {
                    const pts = truncateConfirm.newPath;
                    const snapIdx = pts.findIndex(p =>
                      Math.abs(p.lat - (elementsRef.current.find((e: any) => e.id === truncateConfirm.snappedId) as any)?.lat) < 0.0002 &&
                      Math.abs(p.lng - (elementsRef.current.find((e: any) => e.id === truncateConfirm.snappedId) as any)?.lng) < 0.0002
                    );
                    const newPath = snapIdx >= 0 ? pts.slice(0, snapIdx + 1) : pts;
                    editingRoutePathRef.current = newPath;
                    snapToIdRef.current = truncateConfirm.snappedId;
                    setEditingRoutePath([...newPath]);
                    renderEditRouteMarkers([...newPath], truncateConfirm.routeColor);
                    toast.success(`"${truncateConfirm.snappedName}" definido como novo destino`);
                    setTruncateConfirm(null);
                  }}
                >
                  <p className="text-xs font-semibold text-cyan-400 mb-1">← Definir como novo destino</p>
                  <p className="text-xs text-muted-foreground">Remove os pontos após este elemento. O elemento vira o novo destino do cabo.</p>
                </button>
                {/* Opção 4: dividir cabo neste elemento */}
                <button
                  className="rounded-lg border border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 p-3 text-left transition-colors"
                  onClick={() => {
                    if (!editingRouteId) { toast.error("Nenhuma rota em edição"); return; }
                    // Guardar primeiro o traçado actual (com o ponto no elemento) e depois dividir
                    const pts = truncateConfirm.newPath;
                    const splitIdx = truncateConfirm.splitPointIdx;
                    // 1. Salvar o traçado completo com o ponto do elemento
                    updateRoutePathMut.mutate({
                      id: editingRouteId,
                      path: JSON.stringify(pts),
                      fromElementId: snapFromIdRef.current ?? undefined,
                      toElementId: snapToIdRef.current ?? undefined,
                    }, {
                      onSuccess: () => {
                        // 2. Dividir o cabo no índice do ponto encaixado
                        splitRouteMut.mutate({
                          id: editingRouteId!,
                          splitPointIndex: splitIdx,
                          elementId: truncateConfirm.snappedId,
                        }, {
                          onSuccess: () => {
                            toast.success(`Cabo dividido em "${truncateConfirm.snappedName}" — dois segmentos criados`);
                            cancelEditRoutePath();
                            setTruncateConfirm(null);
                          },
                          onError: (e) => toast.error(`Erro ao dividir: ${e.message}`),
                        });
                      },
                      onError: (e) => toast.error(`Erro ao salvar traçado: ${e.message}`),
                    });
                  }}
                >
                  <p className="text-xs font-semibold text-purple-400 mb-1">✂ Dividir cabo neste elemento</p>
                  <p className="text-xs text-muted-foreground">Cria dois cabos separados: o primeiro termina neste elemento (destino) e o segundo começa neste elemento (origem). O traçado completo é preservado.</p>
                </button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTruncateConfirm(null)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo criação/edição de grupo */}
      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><FolderTree className="w-4 h-4 text-violet-400" />{editingGroupId ? "Editar Pasta" : "Nova Pasta"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>Nome da pasta *</Label><Input value={groupForm.name} onChange={e => setGroupForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Projeto 1, Setor Norte, CTOs..." /></div>
            <div className="space-y-1.5"><Label>Pasta pai (opcional)</Label>
              <Select value={groupForm.parentId !== null ? String(groupForm.parentId) : "none"} onValueChange={v => setGroupForm(f => ({ ...f, parentId: v === "none" ? null : Number(v) }))}>
                <SelectTrigger><SelectValue placeholder="Nenhuma (pasta raiz)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma (pasta raiz)</SelectItem>
                  {(mapGroups as any[]).filter((g: any) => g.id !== editingGroupId).map((g: any) => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: g.color ?? "#6366f1" }} />
                        {g.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Descrição</Label><Input value={groupForm.description} onChange={e => setGroupForm(f => ({ ...f, description: e.target.value }))} placeholder="Descrição opcional" /></div>
            <div className="space-y-1.5"><Label>Cor de identificação</Label>
              <div className="flex gap-2 items-center"><input type="color" value={groupForm.color} onChange={e => setGroupForm(f => ({ ...f, color: e.target.value }))} className="w-10 h-8 rounded cursor-pointer border border-border" /><span className="text-xs text-muted-foreground">{groupForm.color}</span></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => {
              if (!groupForm.name.trim()) { toast.error("Nome obrigatório"); return; }
              if (editingGroupId) updateGroupMut.mutate({ id: editingGroupId, ...groupForm });
              else createGroupMut.mutate(groupForm);
            }} disabled={createGroupMut.isPending || updateGroupMut.isPending}>
              {createGroupMut.isPending || updateGroupMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : editingGroupId ? "Salvar" : "Criar Pasta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de atribuição rápida de seleção a grupo */}
      <Dialog open={quickAssignDialogOpen} onOpenChange={setQuickAssignDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Folder className="w-4 h-4 text-violet-400" />
              Adicionar {groupTotalSelected} item{groupTotalSelected !== 1 ? "s" : ""} a uma pasta
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Selecione a pasta de destino para os {groupTotalSelected} item{groupTotalSelected !== 1 ? "s" : ""} selecionados:</p>
            {(mapGroups as any[]).length === 0 ? (
              <div className="text-center py-4 text-sm text-muted-foreground">
                <p>Nenhuma pasta criada ainda.</p>
                <button onClick={() => { setQuickAssignDialogOpen(false); setEditingGroupId(null); setGroupForm({ name: "", color: "#6366f1", description: "", parentId: null }); setGroupDialogOpen(true); }} className="text-violet-400 underline text-xs mt-1">Criar nova pasta</button>
              </div>
            ) : (() => {
              const allG = mapGroups as any[];
              const rootG = allG.filter((g: any) => !g.parentId);
              const childrenOf = (pid: number) => allG.filter((g: any) => g.parentId === pid);
              const renderPickerNode = (g: any, depth: number): React.ReactNode => {
                const children = childrenOf(g.id);
                const isExpanded = expandedPickerGroups.has(g.id);
                const hasChildren = children.length > 0;
                return (
                  <div key={g.id}>
                    <div className="flex items-center" style={{ paddingLeft: `${depth * 16}px` }}>
                      {hasChildren ? (
                        <button
                          className="p-1 text-muted-foreground hover:text-foreground flex-shrink-0"
                          onClick={() => setExpandedPickerGroups(prev => { const s = new Set(prev); if (s.has(g.id)) s.delete(g.id); else s.add(g.id); return s; })}
                        >
                          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                        </button>
                      ) : (
                        <span className="w-5 flex-shrink-0" />
                      )}
                      <button
                        onClick={() => handleQuickAssign(g.id)}
                        disabled={addElementsMut.isPending}
                        className="flex-1 flex items-center gap-2 px-2 py-2 hover:bg-muted/40 text-left rounded"
                      >
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: g.color ?? "#6366f1" }} />
                        <span className="text-sm flex-1">{g.name}</span>
                        {hasChildren && !isExpanded && <span className="text-xs text-muted-foreground">{children.length} subpasta{children.length !== 1 ? 's' : ''}</span>}
                        {addElementsMut.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                      </button>
                    </div>
                    {isExpanded && children.map((c: any) => renderPickerNode(c, depth + 1))}
                  </div>
                );
              };
              return (
                <div className="border border-border rounded-lg max-h-60 overflow-y-auto py-1">
                  {rootG.map((g: any) => renderPickerNode(g, 0))}
                </div>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickAssignDialogOpen(false)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de Confirmação de Exclusão de Pasta */}
      <Dialog open={deletingGroupId !== null} onOpenChange={(open) => { if (!open) setDeletingGroupId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <Trash2 className="w-4 h-4" /> Excluir pasta?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Tem certeza que deseja excluir a pasta <strong className="text-foreground">{(mapGroups as any[]).find((g: any) => g.id === deletingGroupId)?.name ?? ""}</strong>?
            </p>
            <p className="text-xs text-muted-foreground/70">Os itens atribuídos a esta pasta não serão excluídos — apenas a pasta será removida.</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeletingGroupId(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deletingGroupId !== null) deleteGroupMapMut.mutate({ id: deletingGroupId });
                setDeletingGroupId(null);
              }}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de Edição de CEO/CTO */}
      <Dialog open={editElementDialogOpen} onOpenChange={setEditElementDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-base">✏️</span>
              {sidePanel?.kind === "element" && sidePanel.element.type === "cto" ? "Editar CTO" : "Editar CEO"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input value={editElementForm.name} onChange={e => setEditElementForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome do elemento" />
            </div>
            {sidePanel?.kind === "element" && sidePanel.element.type === "cto" && (
              <div className="space-y-1.5">
                <Label>Capacidade (portas)</Label>
                <Input type="number" min={1} max={512} value={editElementForm.capacity} onChange={e => setEditElementForm(f => ({ ...f, capacity: Number(e.target.value) }))} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={editElementForm.status} onValueChange={v => setEditElementForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="maintenance">Manutenção</SelectItem>
                  <SelectItem value="inactive">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Cor do marcador</Label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={editElementForm.color || (editElementForm.status === "active" ? "#22c55e" : editElementForm.status === "maintenance" ? "#f59e0b" : "#ef4444")}
                  onChange={e => setEditElementForm(f => ({ ...f, color: e.target.value }))}
                  className="w-10 h-8 rounded cursor-pointer border border-border"
                />
                <div className="flex gap-1.5 flex-wrap">
                  {["#22c55e","#3b82f6","#f59e0b","#ef4444","#8b5cf6","#ec4899","#06b6d4","#f97316","#6b7280"].map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditElementForm(f => ({ ...f, color: c }))}
                      className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${editElementForm.color === c ? "border-white scale-110" : "border-transparent"}`}
                      style={{ background: c }}
                      title={c}
                    />
                  ))}
                  {editElementForm.color && (
                    <button
                      type="button"
                      onClick={() => setEditElementForm(f => ({ ...f, color: "" }))}
                      className="text-xs text-muted-foreground hover:text-foreground underline ml-1"
                    >Padrão</button>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Deixe em branco para usar a cor padrão do status</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditElementDialogOpen(false)}>Cancelar</Button>
            <Button
              disabled={updateCeoMut.isPending || updateCtoMut.isPending}
              onClick={() => {
                if (!editElementForm.name.trim()) { toast.error("Nome obrigatório"); return; }
                const el = sidePanel?.kind === "element" ? sidePanel.element : null;
                if (!el) return;
                if (el.type === "cto") {
                  updateCtoMut.mutate({ id: el.referenceId, name: editElementForm.name, capacity: editElementForm.capacity, status: editElementForm.status as any });
                } else {
                  updateCeoMut.mutate({ id: el.referenceId, name: editElementForm.name, status: editElementForm.status as any });
                }
                // Salvar cor personalizada no elemento do mapa
                (upsertElementMut.mutate as any)({ type: el.type, referenceId: el.referenceId, lat: el.lat, lng: el.lng, color: editElementForm.color || null });
              }}
            >
              {updateCeoMut.isPending || updateCtoMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de Edição de Cabo */}
      <Dialog open={editRouteDialogOpen} onOpenChange={setEditRouteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><span className="text-base">✏️</span> Editar Cabo</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input value={editRouteForm.name} onChange={e => setEditRouteForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Cabo Principal Setor A" />
            </div>
            {/* Seletores De / Para com busca */}
            {(() => {
              const allEls = (elements as any[]).map((el: any) => {
                const ref = el.type === "cto"
                  ? (ctos as any[]).find((c: any) => c.id === el.referenceId)
                  : (ceos as any[]).find((c: any) => c.id === el.referenceId);
                return { ...el, label: ref?.name ?? `${el.type.toUpperCase()}-${el.referenceId}` };
              });
              const filteredFrom = allEls.filter(el => el.label.toLowerCase().includes(fromSearch.toLowerCase()) || el.type.toLowerCase().includes(fromSearch.toLowerCase()));
              const filteredTo   = allEls.filter(el => el.label.toLowerCase().includes(toSearch.toLowerCase())   || el.type.toLowerCase().includes(toSearch.toLowerCase()));
              const fromLabel = allEls.find(el => el.id === editRouteForm.fromElementId)?.label;
              const toLabel   = allEls.find(el => el.id === editRouteForm.toElementId)?.label;
              return (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1"><span className="text-emerald-400 text-xs font-bold">DE</span> Origem</Label>
                    <Select
                      value={editRouteForm.fromElementId != null ? String(editRouteForm.fromElementId) : "none"}
                      onValueChange={v => { setEditRouteForm(f => ({ ...f, fromElementId: v === "none" ? null : Number(v) })); setFromSearch(""); }}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Nenhum">{fromLabel ?? "Nenhum"}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <div className="px-2 py-1.5 sticky top-0 bg-popover z-10">
                          <div className="flex items-center gap-1.5 border border-border rounded px-2 py-1">
                            <Search className="w-3 h-3 text-muted-foreground shrink-0" />
                            <input
                              className="flex-1 text-xs bg-transparent outline-none"
                              placeholder="Buscar CEO/CTO..."
                              value={fromSearch}
                              onChange={e => setFromSearch(e.target.value)}
                              onKeyDown={e => e.stopPropagation()}
                            />
                          </div>
                        </div>
                        <SelectItem value="none">Nenhum</SelectItem>
                        {filteredFrom.map((el: any) => (
                          <SelectItem key={el.id} value={String(el.id)}>
                            <span className="flex items-center gap-1">
                              <span className={`text-[10px] font-bold ${el.type === "cto" ? "text-purple-400" : "text-blue-400"}`}>{el.type.toUpperCase()}</span>
                              {el.label}
                            </span>
                          </SelectItem>
                        ))}
                        {filteredFrom.length === 0 && <div className="px-2 py-3 text-xs text-muted-foreground text-center">Nenhum resultado</div>}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1"><span className="text-cyan-400 text-xs font-bold">PARA</span> Destino</Label>
                    <Select
                      value={editRouteForm.toElementId != null ? String(editRouteForm.toElementId) : "none"}
                      onValueChange={v => { setEditRouteForm(f => ({ ...f, toElementId: v === "none" ? null : Number(v) })); setToSearch(""); }}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Nenhum">{toLabel ?? "Nenhum"}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <div className="px-2 py-1.5 sticky top-0 bg-popover z-10">
                          <div className="flex items-center gap-1.5 border border-border rounded px-2 py-1">
                            <Search className="w-3 h-3 text-muted-foreground shrink-0" />
                            <input
                              className="flex-1 text-xs bg-transparent outline-none"
                              placeholder="Buscar CEO/CTO..."
                              value={toSearch}
                              onChange={e => setToSearch(e.target.value)}
                              onKeyDown={e => e.stopPropagation()}
                            />
                          </div>
                        </div>
                        <SelectItem value="none">Nenhum</SelectItem>
                        {filteredTo.map((el: any) => (
                          <SelectItem key={el.id} value={String(el.id)}>
                            <span className="flex items-center gap-1">
                              <span className={`text-[10px] font-bold ${el.type === "cto" ? "text-purple-400" : "text-blue-400"}`}>{el.type.toUpperCase()}</span>
                              {el.label}
                            </span>
                          </SelectItem>
                        ))}
                        {filteredTo.length === 0 && <div className="px-2 py-3 text-xs text-muted-foreground text-center">Nenhum resultado</div>}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              );
            })()}
            {/* Seletores de Tubo */}
            <TubeSelectors
              fromElId={editRouteForm.fromElementId}
              toElId={editRouteForm.toElementId}
              fromTubeId={editRouteForm.fromTubeId}
              toTubeId={editRouteForm.toTubeId}
              onChange={(field, value) => setEditRouteForm(f => ({ ...f, [field]: value }))}
            />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo de Cabo</Label>
                <Select value={editRouteForm.cableType} onValueChange={v => setEditRouteForm(f => ({ ...f, cableType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FO">FO - Fibra Óptica</SelectItem>
                    <SelectItem value="FO-ADSS">FO-ADSS</SelectItem>
                    <SelectItem value="FO-OPGW">FO-OPGW</SelectItem>
                    <SelectItem value="FO-Drop">FO-Drop</SelectItem>
                    <SelectItem value="Coaxial">Coaxial</SelectItem>
                    <SelectItem value="UTP">UTP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Nº de Fibras</Label>
                <Input type="number" min={1} max={288} value={editRouteForm.fiberCount} onChange={e => setEditRouteForm(f => ({ ...f, fiberCount: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Cor do Cabo no Mapa</Label>
              <div className="flex gap-2 items-center">
                <input type="color" value={editRouteForm.color} onChange={e => setEditRouteForm(f => ({ ...f, color: e.target.value }))} className="w-10 h-8 rounded cursor-pointer border border-border" />
                <span className="text-xs text-muted-foreground">{editRouteForm.color}</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Input value={editRouteForm.notes} onChange={e => setEditRouteForm(f => ({ ...f, notes: e.target.value }))} placeholder="Observações opcionais" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRouteDialogOpen(false)}>Cancelar</Button>
            <Button
              disabled={updateRouteMut.isPending}
              onClick={() => {
                const r = sidePanel?.kind === "route" ? sidePanel.route : null;
                if (!r) return;
                updateRouteMut.mutate({
                  id: r.id,
                  name: editRouteForm.name,
                  cableType: editRouteForm.cableType,
                  fiberCount: editRouteForm.fiberCount,
                  color: editRouteForm.color,
                  notes: editRouteForm.notes,
                  fromElementId: editRouteForm.fromElementId,
                  toElementId: editRouteForm.toElementId,
                  fromTubeId: editRouteForm.fromTubeId,
                  toTubeId: editRouteForm.toTubeId,
                });
              }}
            >
              {updateRouteMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Diálogo de Divisão de Cabo ────────────────────────────────────── */}
      <Dialog open={splitRouteOpen} onOpenChange={v => { if (!v) setSplitRouteOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-purple-400">✂</span>
              Dividir Cabo no Ponto {splitRoutePointIdx !== null ? splitRoutePointIdx + 1 : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="text-xs text-muted-foreground mb-3">
            O cabo será dividido em dois segmentos. Seleccione o equipamento (CEO/CTO) a inserir no ponto de divisão.
            O ponto de divisão pode ser ajustado arrastando os vértices no mapa antes de clicar em "Dividir Cabo".
          </div>
          {editingRoutePath.length >= 3 && splitRoutePointIdx !== null && (
            <div className="mb-3 p-2 bg-muted/30 rounded text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Ponto de divisão:</span> vértice {splitRoutePointIdx + 1} de {editingRoutePath.length}
              <div className="flex items-center gap-2 mt-1.5">
                <button disabled={splitRoutePointIdx <= 1} onClick={() => setSplitRoutePointIdx(p => p !== null ? Math.max(1, p - 1) : p)}
                  className="px-2 py-0.5 bg-muted rounded text-xs disabled:opacity-40 hover:bg-muted/80">◀</button>
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${((splitRoutePointIdx) / (editingRoutePath.length - 1)) * 100}%` }} />
                </div>
                <button disabled={splitRoutePointIdx >= editingRoutePath.length - 2} onClick={() => setSplitRoutePointIdx(p => p !== null ? Math.min(editingRoutePath.length - 2, p + 1) : p)}
                  className="px-2 py-0.5 bg-muted rounded text-xs disabled:opacity-40 hover:bg-muted/80">▶</button>
              </div>
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Equipamento no ponto de divisão *</label>
            <input
              type="text"
              placeholder="Buscar CEO/CTO..."
              value={splitRouteSearch}
              onChange={e => setSplitRouteSearch(e.target.value)}
              className="w-full bg-muted/50 border border-border rounded px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary mb-1.5"
            />
            <div className="max-h-40 overflow-y-auto rounded border border-border bg-muted/20 space-y-0.5 p-1">
              {(elements as any[])
                .filter((e: any) => !splitRouteSearch || (e.name ?? "").toLowerCase().includes(splitRouteSearch.toLowerCase()))
                .slice(0, 25)
                .map((e: any) => (
                  <button
                    key={e.id}
                    className={`w-full text-left px-2 py-1 rounded text-xs transition-colors ${splitRouteSelectedEl === e.id ? "bg-purple-500/30 text-purple-300" : "hover:bg-muted/50 text-foreground"}`}
                    onClick={() => setSplitRouteSelectedEl(e.id)}
                  >
                    <span className={`inline-block w-2 h-2 rounded-sm mr-1.5 ${e.type === "cto" ? "bg-purple-400" : "bg-blue-400"}`} />
                    {e.name ?? `Elemento ${e.id}`}
                    <span className="text-muted-foreground ml-1 text-[10px]">{e.type?.toUpperCase()}</span>
                  </button>
                ))}
            </div>
            {splitRouteSelectedEl !== null && (
              <div className="text-[10px] text-purple-400 mt-1">
                ✓ {(elements as any[]).find((e: any) => e.id === splitRouteSelectedEl)?.name ?? `Elemento ${splitRouteSelectedEl}`}
              </div>
            )}
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setSplitRouteOpen(false)}>Cancelar</Button>
            <Button
              className="bg-purple-600 hover:bg-purple-700 text-white"
              disabled={splitRouteSelectedEl === null || splitRoutePointIdx === null || splitRouteMut.isPending}
              onClick={() => {
                if (!editingRouteId || splitRoutePointIdx === null || splitRouteSelectedEl === null) return;
                splitRouteMut.mutate({
                  id: editingRouteId,
                  splitPointIndex: splitRoutePointIdx,
                  elementId: splitRouteSelectedEl,
                });
              }}
            >
              {splitRouteMut.isPending ? <><span className="animate-spin mr-1">⟳</span> Dividindo...</> : <>✂ Dividir Cabo</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Janela flutuante arrastável de Associação de Extremos de Cabo ── */}
      {linkEndpointsOpen && (() => {
        const winX = linkEndpointsPos?.x ?? Math.max(20, (window.innerWidth - 420) / 2);
        const winY = linkEndpointsPos?.y ?? Math.max(20, (window.innerHeight - 560) / 2);
        return (
          <div
            style={{
              position: "fixed", left: winX, top: winY, zIndex: 10000,
              width: 420, maxWidth: "calc(100vw - 32px)",
              background: "var(--background)", border: "1px solid var(--border)",
              borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
              display: "flex", flexDirection: "column",
              userSelect: linkEndpointsDragRef.current ? "none" : "auto",
            }}
          >
            {/* Cabeçalho arrastável */}
            <div
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "12px 16px", borderBottom: "1px solid var(--border)",
                cursor: "grab", flexShrink: 0,
              }}
              onMouseDown={e => {
                linkEndpointsDragRef.current = { startX: e.clientX, startY: e.clientY, origX: winX, origY: winY };
                const onMove = (ev: MouseEvent) => {
                  if (!linkEndpointsDragRef.current) return;
                  const dx = ev.clientX - linkEndpointsDragRef.current.startX;
                  const dy = ev.clientY - linkEndpointsDragRef.current.startY;
                  setLinkEndpointsPos({
                    x: Math.max(0, Math.min(window.innerWidth - 420, linkEndpointsDragRef.current.origX + dx)),
                    y: Math.max(0, Math.min(window.innerHeight - 100, linkEndpointsDragRef.current.origY + dy)),
                  });
                };
                const onUp = () => {
                  linkEndpointsDragRef.current = null;
                  window.removeEventListener("mousemove", onMove);
                  window.removeEventListener("mouseup", onUp);
                };
                window.addEventListener("mousemove", onMove);
                window.addEventListener("mouseup", onUp);
                e.preventDefault();
              }}
            >
              <Cable className="w-4 h-4 text-emerald-400" style={{ flexShrink: 0 }} />
              <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>Associar Equipamentos ao Cabo</span>
              <button
                onClick={() => { setLinkEndpointsOpen(false); setLinkEndpointsRouteId(null); setLinkEndpointsPickMode(null); setLinkEndpointsPos(null); }}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: 4, lineHeight: 1 }}
              >✕</button>
            </div>
            {/* Corpo */}
            <div style={{ padding: "12px 16px", overflowY: "auto", maxHeight: "calc(100vh - 200px)" }}>
              {/* Dica de modo de seleção */}
              {linkEndpointsPickMode && (
                <div style={{
                  background: linkEndpointsPickMode === "from" ? "rgba(34,197,94,0.15)" : "rgba(59,130,246,0.15)",
                  border: `1px solid ${linkEndpointsPickMode === "from" ? "#22c55e" : "#3b82f6"}`,
                  borderRadius: 6, padding: "6px 10px", marginBottom: 10,
                  fontSize: 11, color: linkEndpointsPickMode === "from" ? "#22c55e" : "#60a5fa",
                  display: "flex", alignItems: "center", gap: 6,
                }}>
                  <span style={{ fontSize: 14 }}>🖱️</span>
                  Clique em um CEO/CTO no mapa para definir o <strong>{linkEndpointsPickMode === "from" ? "Extremo Origem" : "Extremo Destino"}</strong>
                  <button
                    onClick={() => setLinkEndpointsPickMode(null)}
                    style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: 12, padding: 0 }}
                  >✕ Cancelar</button>
                </div>
              )}
              <div className="text-xs text-muted-foreground mb-4">
                Seleccione os equipamentos (CEO/CTO) a ligar aos extremos deste cabo. Pode deixar um extremo sem equipamento.
              </div>
          <div className="space-y-4">
            {/* Extremo Origem */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-muted-foreground">Extremo Origem (Início)</label>
                <button
                  className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${linkEndpointsPickMode === "from" ? "bg-emerald-500/20 border-emerald-500 text-emerald-400" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40"}`}
                  onClick={() => setLinkEndpointsPickMode(prev => prev === "from" ? null : "from")}
                  title="Clique em um elemento no mapa para selecioná-lo"
                >
                  🖱️ {linkEndpointsPickMode === "from" ? "Aguardando clique..." : "Selecionar no mapa"}
                </button>
              </div>
              <input
                type="text"
                placeholder="Buscar CEO/CTO..."
                value={linkEndpointsFromSearch}
                onChange={e => setLinkEndpointsFromSearch(e.target.value)}
                className="w-full bg-muted/50 border border-border rounded px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary mb-1.5"
              />
              <div className="max-h-32 overflow-y-auto rounded border border-border bg-muted/20 space-y-0.5 p-1">
                <button
                  className={`w-full text-left px-2 py-1 rounded text-xs transition-colors ${linkEndpointsFrom === null ? "bg-primary/20 text-primary" : "hover:bg-muted/50 text-muted-foreground"}`}
                  onClick={() => setLinkEndpointsFrom(null)}
                >
                  — Sem equipamento
                </button>
                {(elements as any[])
                  .map((e: any) => {
                    const ref = e.type === "cto" ? (ctos as any[]).find((c: any) => c.id === e.referenceId) : ceos.find((c: any) => c.id === e.referenceId);
                    return { ...e, displayName: ref?.name ?? (e.type === "cto" ? `CTO-${e.referenceId}` : `CEO-${e.referenceId}`) };
                  })
                  .filter((e: any) => !linkEndpointsFromSearch || e.displayName.toLowerCase().includes(linkEndpointsFromSearch.toLowerCase()) || e.type.toLowerCase().includes(linkEndpointsFromSearch.toLowerCase()))
                  .slice(0, 20)
                  .map((e: any) => (
                    <button
                      key={e.id}
                      className={`w-full text-left px-2 py-1 rounded text-xs transition-colors ${linkEndpointsFrom === e.id ? "bg-emerald-500/20 text-emerald-400" : "hover:bg-muted/50 text-foreground"}`}
                      onClick={() => setLinkEndpointsFrom(e.id)}
                    >
                      <span className={`inline-block w-2 h-2 rounded-sm mr-1.5 ${e.type === "cto" ? "bg-purple-400" : "bg-blue-400"}`} />
                      {e.displayName}
                      <span className="text-muted-foreground ml-1 text-[10px]">{e.type?.toUpperCase()}</span>
                    </button>
                  ))}
              </div>
              {linkEndpointsFrom !== null && (() => {
                const el = (elements as any[]).find((e: any) => e.id === linkEndpointsFrom);
                const ref = el ? (el.type === "cto" ? (ctos as any[]).find((c: any) => c.id === el.referenceId) : ceos.find((c: any) => c.id === el.referenceId)) : null;
                const name = ref?.name ?? (el ? (el.type === "cto" ? `CTO-${el.referenceId}` : `CEO-${el.referenceId}`) : `Elemento ${linkEndpointsFrom}`);
                return <div className="text-[10px] text-emerald-400 mt-1">✓ {name}</div>;
              })()}
            </div>
            {/* Extremo Destino */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-muted-foreground">Extremo Destino (Fim)</label>
                <button
                  className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${linkEndpointsPickMode === "to" ? "bg-blue-500/20 border-blue-500 text-blue-400" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40"}`}
                  onClick={() => setLinkEndpointsPickMode(prev => prev === "to" ? null : "to")}
                  title="Clique em um elemento no mapa para selecioná-lo"
                >
                  🖱️ {linkEndpointsPickMode === "to" ? "Aguardando clique..." : "Selecionar no mapa"}
                </button>
              </div>
              <input
                type="text"
                placeholder="Buscar CEO/CTO..."
                value={linkEndpointsToSearch}
                onChange={e => setLinkEndpointsToSearch(e.target.value)}
                className="w-full bg-muted/50 border border-border rounded px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary mb-1.5"
              />
              <div className="max-h-32 overflow-y-auto rounded border border-border bg-muted/20 space-y-0.5 p-1">
                <button
                  className={`w-full text-left px-2 py-1 rounded text-xs transition-colors ${linkEndpointsTo === null ? "bg-primary/20 text-primary" : "hover:bg-muted/50 text-muted-foreground"}`}
                  onClick={() => setLinkEndpointsTo(null)}
                >
                  — Sem equipamento
                </button>
                {(elements as any[])
                  .map((e: any) => {
                    const ref = e.type === "cto" ? (ctos as any[]).find((c: any) => c.id === e.referenceId) : ceos.find((c: any) => c.id === e.referenceId);
                    return { ...e, displayName: ref?.name ?? (e.type === "cto" ? `CTO-${e.referenceId}` : `CEO-${e.referenceId}`) };
                  })
                  .filter((e: any) => !linkEndpointsToSearch || e.displayName.toLowerCase().includes(linkEndpointsToSearch.toLowerCase()) || e.type.toLowerCase().includes(linkEndpointsToSearch.toLowerCase()))
                  .slice(0, 20)
                  .map((e: any) => (
                    <button
                      key={e.id}
                      className={`w-full text-left px-2 py-1 rounded text-xs transition-colors ${linkEndpointsTo === e.id ? "bg-emerald-500/20 text-emerald-400" : "hover:bg-muted/50 text-foreground"}`}
                      onClick={() => setLinkEndpointsTo(e.id)}
                    >
                      <span className={`inline-block w-2 h-2 rounded-sm mr-1.5 ${e.type === "cto" ? "bg-purple-400" : "bg-blue-400"}`} />
                      {e.displayName}
                      <span className="text-muted-foreground ml-1 text-[10px]">{e.type?.toUpperCase()}</span>
                    </button>
                  ))}
              </div>
              {linkEndpointsTo !== null && (() => {
                const el = (elements as any[]).find((e: any) => e.id === linkEndpointsTo);
                const ref = el ? (el.type === "cto" ? (ctos as any[]).find((c: any) => c.id === el.referenceId) : ceos.find((c: any) => c.id === el.referenceId)) : null;
                const name = ref?.name ?? (el ? (el.type === "cto" ? `CTO-${el.referenceId}` : `CEO-${el.referenceId}`) : `Elemento ${linkEndpointsTo}`);
                return <div className="text-[10px] text-emerald-400 mt-1">✓ {name}</div>;
              })()}
            </div>
          </div>
              <div className="flex gap-2 mt-4 justify-end">
                <Button variant="outline" size="sm" onClick={() => { setLinkEndpointsOpen(false); setLinkEndpointsRouteId(null); setLinkEndpointsPickMode(null); setLinkEndpointsPos(null); }}>Cancelar</Button>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={linkEndpointsFrom === null && linkEndpointsTo === null}
                  onClick={() => {
                    if (!linkEndpointsRouteId) return;
                    updateRoutePathMut.mutate({
                      id: linkEndpointsRouteId,
                      fromElementId: linkEndpointsFrom,
                      toElementId: linkEndpointsTo,
                    }, {
                      onSuccess: () => {
                        toast.success("Extremos associados com sucesso");
                        setLinkEndpointsOpen(false);
                        setLinkEndpointsRouteId(null);
                        setLinkEndpointsPickMode(null);
                        setLinkEndpointsPos(null);
                      },
                      onError: (e) => toast.error(e.message ?? "Erro ao associar extremos"),
                    });
                  }}
                >
                  <span className="text-xs mr-1">🔗</span> Associar
                </Button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── Diálogo de Pré-visualização KML ─────────────────────────────────── */}
      <Dialog open={kmlPreviewOpen} onOpenChange={v => { if (!v && !kmlImportingPreview) { setKmlPreviewOpen(false); setKmlPreviewItems([]); setKmlPreviewFilter("all"); } }}>
        <DialogContent className="max-w-3xl h-[90vh] flex flex-col overflow-hidden p-0">
          <div className="flex flex-col h-full overflow-hidden px-6 pt-6 pb-4">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Pré-visualização da Importação KML
              <span className="ml-auto text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {kmlPreviewItems.filter(i => i.include).length} de {kmlPreviewItems.length} seleccionados
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="text-xs text-muted-foreground mt-2 mb-3 flex-shrink-0">
            Verifique os elementos detectados. Pode corrigir o tipo e a cor de cada elemento antes de confirmar a importação.
          </div>
          {/* Filtros por tipo */}
          <div className="flex items-center gap-1.5 mb-2 flex-shrink-0 flex-wrap">
            {(["all", "cabo", "cto", "ceo", "poste", "reserva", "poi"] as const).map(f => {
              const labels: Record<string, string> = { all: "Todos", cabo: "Cabos", cto: "CTOs", ceo: "CEOs", poste: "Postes", reserva: "Reservas", poi: "POIs" };
              const counts: Record<string, number> = {
                all: kmlPreviewItems.length,
                cabo: kmlPreviewItems.filter(i => i.type === "cabo").length,
                cto: kmlPreviewItems.filter(i => i.type === "cto").length,
                ceo: kmlPreviewItems.filter(i => i.type === "ceo").length,
                poste: kmlPreviewItems.filter(i => i.type === "poste").length,
                reserva: kmlPreviewItems.filter(i => i.type === "reserva").length,
                poi: kmlPreviewItems.filter(i => i.type === "poi").length,
              };
              if (f !== "all" && counts[f] === 0) return null;
              const colors: Record<string, string> = { all: "bg-muted text-foreground", cabo: "bg-cyan-500/20 text-cyan-400 border-cyan-500/40", cto: "bg-purple-500/20 text-purple-400 border-purple-500/40", ceo: "bg-amber-500/20 text-amber-400 border-amber-500/40", poste: "bg-orange-500/20 text-orange-400 border-orange-500/40", reserva: "bg-pink-500/20 text-pink-400 border-pink-500/40", poi: "bg-indigo-500/20 text-indigo-400 border-indigo-500/40" };
              const activeColors: Record<string, string> = { all: "bg-muted-foreground/20 text-foreground border-foreground/40", cabo: "bg-cyan-500/40 text-cyan-300 border-cyan-400", cto: "bg-purple-500/40 text-purple-300 border-purple-400", ceo: "bg-amber-500/40 text-amber-300 border-amber-400", poste: "bg-orange-500/40 text-orange-300 border-orange-400", reserva: "bg-pink-500/40 text-pink-300 border-pink-400", poi: "bg-indigo-500/40 text-indigo-300 border-indigo-400" };
              return (
                <button key={f} onClick={() => setKmlPreviewFilter(f)}
                  className={`px-2.5 py-0.5 rounded-full text-xs border transition-colors ${kmlPreviewFilter === f ? activeColors[f] : colors[f]}`}>
                  {labels[f]} <span className="opacity-70">({counts[f]})</span>
                </button>
              );
            })}
            {/* Botão painel de reconhecimento por ícone */}
            {kmlPreviewItems.some(i => i.iconHref) && (
              <button onClick={() => setKmlIconPanelOpen(v => !v)}
                className={`ml-auto px-2.5 py-0.5 rounded-full text-xs border transition-colors ${kmlIconPanelOpen ? "bg-primary/20 text-primary border-primary/40" : "bg-muted text-muted-foreground border-border"}`}>
                🔍 Por ícone
              </button>
            )}
          </div>
          {/* Painel de reconhecimento por ícone */}
          {kmlIconPanelOpen && (() => {
            const iconGroups: Record<string, { href: string; count: number; items: string[] }> = {};
            kmlPreviewItems.forEach(it => {
              if (!it.iconHref) return;
              const key = it.iconHref;
              if (!iconGroups[key]) iconGroups[key] = { href: key, count: 0, items: [] };
              iconGroups[key].count++;
              if (iconGroups[key].items.length < 3) iconGroups[key].items.push(it.name);
            });
            const uniqueIcons = Object.values(iconGroups);
            if (uniqueIcons.length === 0) return null;
            return (
              <div className="mb-3 flex-shrink-0 rounded-lg border border-border bg-muted/30 p-3">
                <div className="text-xs font-medium text-foreground mb-2">Ícones detetados no KML — mapear para tipo:</div>
                <div className="space-y-1.5">
                  {uniqueIcons.map(ig => {
                    const shortHref = ig.href.split("/").pop()?.split("?")[0] ?? ig.href;
                    // Extrair cor do nome do ícone do Google Earth: icon-SHAPE_COLORIDX_0
                    // Paleta de cores do Google Earth (índice 0-7)
                    const geColorPalette = ["#e53935","#e91e63","#9c27b0","#3f51b5","#2196f3","#00bcd4","#4caf50","#ff9800","#ff5722","#795548","#607d8b","#f44336","#ff4081"];
                    const geMatch = shortHref.match(/^icon-\d+_(\d+)_/);
                    const geColorIdx = geMatch ? parseInt(geMatch[1]) % geColorPalette.length : -1;
                    const geFallbackColor = geColorIdx >= 0 ? geColorPalette[geColorIdx] : "#607d8b";
                    // Tentar URL pública do Google Earth para ícones internos
                    const isGEInternal = /^icon-\d+_\d+_/.test(shortHref);
                    const gePublicUrl = isGEInternal
                      ? `https://maps.gstatic.com/mapfiles/ms2/micons/${shortHref}`
                      : ig.href;
                    return (
                      <div key={ig.href} className="flex items-center gap-2">
                        <div className="w-6 h-6 flex-shrink-0 rounded overflow-hidden bg-muted border border-border flex items-center justify-center relative">
                          <img
                            src={gePublicUrl}
                            alt=""
                            className="w-full h-full object-contain absolute inset-0"
                            onError={e => {
                              const img = e.target as HTMLImageElement;
                              img.style.display = "none";
                              // Mostrar fallback colorido
                              const parent = img.parentElement;
                              if (parent) {
                                parent.style.backgroundColor = geFallbackColor;
                                parent.style.borderColor = geFallbackColor;
                                const dot = document.createElement("span");
                                dot.style.cssText = "color:white;font-size:10px;font-weight:bold;z-index:1;";
                                dot.textContent = shortHref.charAt(0).toUpperCase();
                                parent.appendChild(dot);
                              }
                            }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground flex-1 truncate" title={ig.href}>{shortHref} <span className="opacity-60">({ig.count}x)</span></span>
                        <select
                          defaultValue=""
                          onChange={e => {
                            const newType = e.target.value as KmlPreviewItem["type"];
                            if (!newType) return;
                            setKmlPreviewItems(prev => prev.map(it => it.iconHref === ig.href ? { ...it, type: newType } : it));
                          }}
                          className="bg-muted border border-border rounded px-1.5 py-0.5 text-xs text-foreground focus:outline-none"
                        >
                          <option value="">Manter atual</option>
                          <option value="cto">CTO</option>
                          <option value="ceo">CEO</option>
                          <option value="poste">Poste</option>
                          <option value="reserva">Reserva</option>
                          <option value="poi">Ponto de Interesse</option>
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
          {/* Barra de edição em lote */}
          {kmlPreviewItems.some(i => i.selected && (kmlPreviewFilter === "all" || i.type === kmlPreviewFilter)) && (
            <div className="mb-2 flex-shrink-0 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2">
              <span className="text-xs text-primary font-medium">
                {kmlPreviewItems.filter(i => i.selected && (kmlPreviewFilter === "all" || i.type === kmlPreviewFilter)).length} selecionados
              </span>
              <span className="text-xs text-muted-foreground">Alterar tipo para:</span>
              <select
                value={kmlBatchType}
                onChange={e => setKmlBatchType(e.target.value)}
                className="bg-muted border border-border rounded px-2 py-0.5 text-xs text-foreground focus:outline-none"
              >
                <option value="">Escolher tipo...</option>
                <option value="cto">CTO</option>
                <option value="ceo">CEO</option>
                <option value="cabo">Cabo</option>
                <option value="poste">Poste</option>
                <option value="reserva">Reserva Técnica</option>
                <option value="poi">Ponto de Interesse</option>
              </select>
              <button
                disabled={!kmlBatchType}
                onClick={() => {
                  if (!kmlBatchType) return;
                  setKmlPreviewItems(prev => prev.map(it => it.selected ? { ...it, type: kmlBatchType as KmlPreviewItem["type"], selected: false } : it));
                  setKmlBatchType("");
                }}
                className="px-2.5 py-0.5 rounded text-xs bg-primary text-primary-foreground disabled:opacity-40 hover:bg-primary/90 transition-colors"
              >
                Aplicar
              </button>
              <button
                onClick={() => setKmlPreviewItems(prev => prev.map(it => ({ ...it, selected: false })))}
                className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Limpar seleção
              </button>
            </div>
          )}
          <ScrollArea className="flex-1 min-h-0 rounded-md border border-border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left font-medium w-8">
                    {/* Incluir/excluir todos */}
                    <input
                      type="checkbox"
                      checked={kmlPreviewItems.filter(i => kmlPreviewFilter === "all" || i.type === kmlPreviewFilter).length > 0 && kmlPreviewItems.filter(i => kmlPreviewFilter === "all" || i.type === kmlPreviewFilter).every(i => i.include)}
                      onChange={e => setKmlPreviewItems(prev => prev.map(it => (kmlPreviewFilter === "all" || it.type === kmlPreviewFilter) ? { ...it, include: e.target.checked } : it))}
                      className="rounded border-border"
                    />
                  </th>
                  <th className="px-2 py-2 text-left font-medium w-6" title="Selecionar para edição em lote">
                    {/* Selecionar todos para lote */}
                    <input
                      type="checkbox"
                      checked={kmlPreviewItems.filter(i => kmlPreviewFilter === "all" || i.type === kmlPreviewFilter).length > 0 && kmlPreviewItems.filter(i => kmlPreviewFilter === "all" || i.type === kmlPreviewFilter).every(i => i.selected)}
                      onChange={e => setKmlPreviewItems(prev => prev.map(it => (kmlPreviewFilter === "all" || it.type === kmlPreviewFilter) ? { ...it, selected: e.target.checked } : it))}
                      className="rounded border-border accent-primary"
                      title="Selecionar todos para edição em lote"
                    />
                  </th>
                  <th className="px-3 py-2 text-left font-medium">Nome</th>
                  <th className="px-3 py-2 text-left font-medium w-28 hidden md:table-cell">Pasta KML</th>
                  <th className="px-3 py-2 text-left font-medium w-32">Tipo</th>
                  <th className="px-3 py-2 text-left font-medium w-20">Extra</th>
                  <th className="px-3 py-2 text-left font-medium w-24">Cor</th>
                </tr>
              </thead>
              <tbody>
                {kmlPreviewItems.filter(i => kmlPreviewFilter === "all" || i.type === kmlPreviewFilter).map((item) => {
                  const i = kmlPreviewItems.indexOf(item);
                  return (
                  <tr key={item.id} className={`border-b border-border/50 transition-colors ${item.selected ? "bg-primary/5" : item.include ? "hover:bg-muted/30" : "opacity-40 hover:bg-muted/20"}`}>
                    <td className="px-3 py-1.5">
                      <input
                        type="checkbox"
                        checked={item.include}
                        onChange={e => setKmlPreviewItems(prev => prev.map((it, j) => j === i ? { ...it, include: e.target.checked } : it))}
                        className="rounded border-border"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={e => setKmlPreviewItems(prev => prev.map((it, j) => j === i ? { ...it, selected: e.target.checked } : it))}
                        className="rounded border-border accent-primary"
                        title="Selecionar para edição em lote"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="text"
                        value={item.name}
                        onChange={e => setKmlPreviewItems(prev => prev.map((it, j) => j === i ? { ...it, name: e.target.value } : it))}
                        className="w-full bg-transparent border-0 border-b border-transparent hover:border-border focus:border-primary focus:outline-none text-xs py-0.5 text-foreground"
                        disabled={!item.include}
                      />
                    </td>
                    <td className="px-3 py-1.5 hidden md:table-cell">
                      <span className="text-[10px] text-muted-foreground truncate max-w-[6rem] block" title={item.folderName}>{item.folderName || "—"}</span>
                    </td>
                    <td className="px-3 py-1.5">
                      <select
                        value={item.type}
                        onChange={e => setKmlPreviewItems(prev => prev.map((it, j) => j === i ? { ...it, type: e.target.value as any } : it))}
                        disabled={!item.include}
                        className="w-full bg-muted/50 border border-border rounded px-1.5 py-0.5 text-xs text-foreground focus:outline-none focus:border-primary disabled:opacity-50"
                      >
                        <option value="cto">CTO</option>
                        <option value="ceo">CEO</option>
                        <option value="cabo">Cabo</option>
                        <option value="poste">Poste</option>
                        <option value="reserva">Reserva</option>
                        <option value="poi">POI</option>
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      {item.type === "cabo" && (
                        <input type="number" min={1} max={288} value={item.fiberCount}
                          onChange={e => setKmlPreviewItems(prev => prev.map((it, j) => j === i ? { ...it, fiberCount: parseInt(e.target.value) || 12 } : it))}
                          disabled={!item.include}
                          className="w-14 bg-muted/50 border border-border rounded px-1.5 py-0.5 text-xs text-foreground focus:outline-none focus:border-primary disabled:opacity-50"
                          title="Nº de fibras"
                        />
                      )}
                      {item.type === "cto" && (
                        <input type="number" min={1} max={64} value={item.capacity}
                          onChange={e => setKmlPreviewItems(prev => prev.map((it, j) => j === i ? { ...it, capacity: parseInt(e.target.value) || 8 } : it))}
                          disabled={!item.include}
                          className="w-14 bg-muted/50 border border-border rounded px-1.5 py-0.5 text-xs text-foreground focus:outline-none focus:border-primary disabled:opacity-50"
                          title="Capacidade"
                        />
                      )}
                      {item.type === "reserva" && (
                        <input type="number" min={0} value={item.sizeMeters}
                          onChange={e => setKmlPreviewItems(prev => prev.map((it, j) => j === i ? { ...it, sizeMeters: parseInt(e.target.value) || 0 } : it))}
                          disabled={!item.include}
                          className="w-14 bg-muted/50 border border-border rounded px-1.5 py-0.5 text-xs text-foreground focus:outline-none focus:border-primary disabled:opacity-50"
                          title="Tamanho (m)"
                        />
                      )}
                      {(item.type === "ceo" || item.type === "poste") && <span className="text-muted-foreground text-[10px]">—</span>}
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1.5">
                        {item.type === "cabo" ? (
                          <>
                            <input
                              type="color"
                              value={item.color ?? "#22d3ee"}
                              onChange={e => setKmlPreviewItems(prev => prev.map((it, j) => j === i ? { ...it, color: e.target.value } : it))}
                              disabled={!item.include}
                              className="w-6 h-6 rounded cursor-pointer border border-border/50 bg-transparent p-0 disabled:opacity-40 disabled:cursor-not-allowed"
                              title="Clique para alterar a cor"
                            />
                            <span className="font-mono text-[10px] text-muted-foreground hidden sm:inline">{item.color ?? "—"}</span>
                          </>
                        ) : <span className="text-muted-foreground text-[10px]">—</span>}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollArea>
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border text-xs text-muted-foreground flex-wrap">
            {kmlPreviewItems.filter(i => i.type === "cabo").length > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-400 inline-block" />{kmlPreviewItems.filter(i => i.type === "cabo").length} cabos</span>}
            {kmlPreviewItems.filter(i => i.type === "cto").length > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-400 inline-block" />{kmlPreviewItems.filter(i => i.type === "cto").length} CTOs</span>}
            {kmlPreviewItems.filter(i => i.type === "ceo").length > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />{kmlPreviewItems.filter(i => i.type === "ceo").length} CEOs</span>}
            {kmlPreviewItems.filter(i => i.type === "poste").length > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />{kmlPreviewItems.filter(i => i.type === "poste").length} Postes</span>}
            {kmlPreviewItems.filter(i => i.type === "reserva").length > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-pink-400 inline-block" />{kmlPreviewItems.filter(i => i.type === "reserva").length} Reservas</span>}
          </div>
          {/* Grupo de destino manual */}
          <div className="flex items-center gap-2 mt-2 flex-shrink-0">
            <label className="text-xs text-muted-foreground whitespace-nowrap">Grupo de destino (opcional):</label>
            <select
              value={kmlImportTargetGroupId ?? ""}
              onChange={e => setKmlImportTargetGroupId(e.target.value ? parseInt(e.target.value) : null)}
              className="flex-1 bg-muted/50 border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
            >
              <option value="">Auto (usar pasta KML)</option>
              {(mapGroups as any[]).filter((g: any) => !g.parentId).map((g: any) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          {/* Barra de progresso */}
          {kmlImportingPreview && kmlImportTotal > 0 && (
            <div className="mt-2 flex-shrink-0">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Importando...</span>
                <span>{kmlImportProgress} / {kmlImportTotal}</span>
              </div>
              <div className="w-full bg-muted rounded-full h-1.5">
                <div className="bg-cyan-500 h-1.5 rounded-full transition-all duration-200" style={{ width: `${Math.round((kmlImportProgress / kmlImportTotal) * 100)}%` }} />
              </div>
            </div>
          )}
          <DialogFooter className="mt-2 flex-shrink-0">
            <Button variant="outline" onClick={() => { setKmlPreviewOpen(false); setKmlPreviewItems([]); }} disabled={kmlImportingPreview}>Cancelar</Button>
            <Button
              className="bg-cyan-600 hover:bg-cyan-700 text-white"
              disabled={kmlImportingPreview || kmlPreviewItems.filter(i => i.include).length === 0}
              onClick={confirmKmlImport}
            >
              {kmlImportingPreview ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />Importando {kmlImportProgress}/{kmlImportTotal}...</> : <><Check className="w-3.5 h-3.5 mr-1" />Confirmar Importação ({kmlPreviewItems.filter(i => i.include).length})</>}
            </Button>
          </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
            {/* Importação de posições via KML */}
      <Dialog open={kmlImportOpen} onOpenChange={v => { setKmlImportOpen(v); if (!v) setKmlImportResult(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Upload className="w-4 h-4" />Importar Posições via KML</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Selecione um arquivo <strong>.kml</strong> ou <strong>.kmz</strong> exportado do Google Earth, Google Maps ou outro sistema.</p>
              <p className="text-xs">Elementos com "CTO" no nome serão importados como CTOs; os demais como CEOs.</p>
            </div>
            <div className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => kmlFileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleKmlImport(f); }}>
              {kmlImportLoading ? (
                <div className="flex flex-col items-center gap-2"><Loader2 className="w-8 h-8 animate-spin text-primary" /><span className="text-sm text-muted-foreground">Importando...</span></div>
              ) : (
                <div className="flex flex-col items-center gap-2"><Upload className="w-8 h-8 text-muted-foreground" /><span className="text-sm text-muted-foreground">Clique ou arraste o arquivo KML/KMZ aqui</span><span className="text-xs text-muted-foreground">Arquivos .kml ou .kmz</span></div>
              )}
            </div>
            <input ref={kmlFileRef} type="file" accept=".kml,.kmz" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleKmlImport(f); e.target.value = ""; }} />
            {kmlImportResult && (
              <div className="rounded-lg border border-border p-3 space-y-1.5">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {kmlImportResult.added > 0 ? <span className="text-emerald-400">✓ {kmlImportResult.added} elemento{kmlImportResult.added !== 1 ? "s" : ""} importado{kmlImportResult.added !== 1 ? "s" : ""}</span> : <span className="text-red-400">Nenhum elemento importado</span>}
                </div>
                {kmlImportResult.byType && Object.keys(kmlImportResult.byType).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(kmlImportResult.byType).map(([k, v]) => (
                      <span key={k} className="text-xs bg-muted px-2 py-0.5 rounded-full text-foreground">{v} {k}</span>
                    ))}
                  </div>
                )}
                {kmlImportResult.skipped > 0 && <div className="text-xs text-muted-foreground">{kmlImportResult.skipped} ignorado{kmlImportResult.skipped !== 1 ? "s" : ""} (sem coordenadas de ponto)</div>}
                {kmlImportResult.errors.length > 0 && (
                  <div className="text-xs text-red-400 space-y-0.5">{kmlImportResult.errors.slice(0, 5).map((e, i) => <div key={i}>⚠ {e}</div>)}{kmlImportResult.errors.length > 5 && <div>...e mais {kmlImportResult.errors.length - 5} erros</div>}</div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKmlImportOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Diálogo Adicionar Tubo/Splitter */}
      <Dialog open={addTubeDialogOpen} onOpenChange={setAddTubeDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              {sidePanel?.kind === "element" && sidePanel.element.type === "cto" ? "Adicionar Tubo/Splitter à CTO" : "Adicionar Tubo/Splitter ao CEO"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <Select value={addTubeForm.type} onValueChange={v => setAddTubeForm(f => ({ ...f, type: v as "tube" | "splitter" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tube">Tubo</SelectItem>
                  <SelectItem value="splitter">Splitter</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Identificador *</Label>
              <Input
                value={addTubeForm.identifier}
                onChange={e => setAddTubeForm(f => ({ ...f, identifier: e.target.value }))}
                placeholder={addTubeForm.type === "splitter" ? "Ex: Splitter 1:8, SP-01" : "Ex: Tubo Azul, T-01"}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Total de Vias *</Label>
              <Input
                type="number" min={1} max={288}
                value={addTubeForm.totalVias}
                onChange={e => setAddTubeForm(f => ({ ...f, totalVias: Number(e.target.value) }))}
              />
              <p className="text-xs text-muted-foreground">As vias serão criadas automaticamente (1 a {addTubeForm.totalVias})</p>
            </div>
            <div className="space-y-1.5">
              <Label>Cor de identificação</Label>
              <Select value={addTubeForm.color || ""} onValueChange={v => setAddTubeForm(f => ({ ...f, color: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecionar cor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="azul">🔵 Azul</SelectItem>
                  <SelectItem value="laranja">🟠 Laranja</SelectItem>
                  <SelectItem value="verde">🟢 Verde</SelectItem>
                  <SelectItem value="marrom">🟤 Marrom</SelectItem>
                  <SelectItem value="cinza">⚫ Cinza</SelectItem>
                  <SelectItem value="branco">⚪ Branco</SelectItem>
                  <SelectItem value="vermelho">🔴 Vermelho</SelectItem>
                  <SelectItem value="preto">⬛ Preto</SelectItem>
                  <SelectItem value="amarelo">🟡 Amarelo</SelectItem>
                  <SelectItem value="violeta">🟣 Violeta</SelectItem>
                  <SelectItem value="rosa">🩷 Rosa</SelectItem>
                  <SelectItem value="aqua">🩵 Aqua</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Input
                value={addTubeForm.notes}
                onChange={e => setAddTubeForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Observações opcionais"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTubeDialogOpen(false)}>Cancelar</Button>
            <Button
              disabled={createCtoTubeMut.isPending || createCeoTubeMut.isPending}
              onClick={() => {
                if (!addTubeForm.identifier.trim()) { toast.error("Identificador obrigatório"); return; }
                if (addTubeForm.totalVias < 1) { toast.error("Total de vias deve ser pelo menos 1"); return; }
                const el = sidePanel?.kind === "element" ? sidePanel.element : null;
                if (!el) return;
                if (el.type === "cto") {
                  createCtoTubeMut.mutate({
                    ctoId: el.referenceId,
                    identifier: addTubeForm.identifier,
                    type: addTubeForm.type,
                    totalVias: addTubeForm.totalVias,
                    color: addTubeForm.color || undefined,
                    notes: addTubeForm.notes || undefined,
                  });
                } else {
                  createCeoTubeMut.mutate({
                    ceoId: el.referenceId,
                    identifier: addTubeForm.identifier,
                    type: addTubeForm.type,
                    totalVias: addTubeForm.totalVias,
                    color: addTubeForm.color || undefined,
                    notes: addTubeForm.notes || undefined,
                  });
                }
              }}
            >
              {createCtoTubeMut.isPending || createCeoTubeMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Adicionar Tubo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Diálogo Editar Tubo */}
      <Dialog open={editTubeDialogOpen} onOpenChange={setEditTubeDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Pencil className="w-4 h-4" /> Editar Tubo/Splitter</DialogTitle>
          </DialogHeader>
          {editingTube && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={editingTube.type} onValueChange={v => setEditingTube(t => t ? { ...t, type: v as "tube" | "splitter" } : t)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tube">Tubo</SelectItem>
                    <SelectItem value="splitter">Splitter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Identificador *</Label>
                <Input value={editingTube.identifier} onChange={e => setEditingTube(t => t ? { ...t, identifier: e.target.value } : t)} placeholder="Ex: Tubo Azul, SP-01" />
              </div>
              <div className="space-y-1.5">
                <Label>Cor de identificação</Label>
                <Select value={editingTube.color || ""} onValueChange={v => setEditingTube(t => t ? { ...t, color: v } : t)}>
                  <SelectTrigger><SelectValue placeholder="Selecionar cor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="azul">🔵 Azul</SelectItem>
                    <SelectItem value="laranja">🟠 Laranja</SelectItem>
                    <SelectItem value="verde">🟢 Verde</SelectItem>
                    <SelectItem value="marrom">🟤 Marrom</SelectItem>
                    <SelectItem value="cinza">⚫ Cinza</SelectItem>
                    <SelectItem value="branco">⚪ Branco</SelectItem>
                    <SelectItem value="vermelho">🔴 Vermelho</SelectItem>
                    <SelectItem value="preto">⬛ Preto</SelectItem>
                    <SelectItem value="amarelo">🟡 Amarelo</SelectItem>
                    <SelectItem value="violeta">🟣 Violeta</SelectItem>
                    <SelectItem value="rosa">🩷 Rosa</SelectItem>
                    <SelectItem value="aqua">🩵 Aqua</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Observações</Label>
                <Input value={editingTube.notes} onChange={e => setEditingTube(t => t ? { ...t, notes: e.target.value } : t)} placeholder="Observações opcionais" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTubeDialogOpen(false)}>Cancelar</Button>
            <Button
              disabled={updateCtoTubeMut.isPending || updateCeoTubeMut.isPending}
              onClick={() => {
                if (!editingTube) return;
                if (!editingTube.identifier.trim()) { toast.error("Identificador obrigatório"); return; }
                if (editingTube.isCto) {
                  updateCtoTubeMut.mutate({ id: editingTube.id, identifier: editingTube.identifier, type: editingTube.type, color: editingTube.color || undefined, notes: editingTube.notes || undefined });
                } else {
                  updateCeoTubeMut.mutate({ id: editingTube.id, identifier: editingTube.identifier, type: editingTube.type, color: editingTube.color || undefined, notes: editingTube.notes || undefined });
                }
              }}
            >
              {updateCtoTubeMut.isPending || updateCeoTubeMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação Excluir Tubo */}
      <Dialog open={deleteTubeId !== null} onOpenChange={() => setDeleteTubeId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Excluir Tubo</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Deseja excluir este tubo e todas as suas vias? Esta ação não pode ser desfeita.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTubeId(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={deleteCtoTubeMut.isPending || deleteCeoTubeMut.isPending}
              onClick={() => {
                if (!deleteTubeId) return;
                if (deleteTubeId.isCto) deleteCtoTubeMut.mutate({ id: deleteTubeId.id });
                else deleteCeoTubeMut.mutate({ id: deleteTubeId.id });
              }}
            >
              {deleteCtoTubeMut.isPending || deleteCeoTubeMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo Confirmar Desfazer Fusão */}
      <Dialog open={clearFusionConfirm !== null} onOpenChange={() => setClearFusionConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar Desfazer Fusão</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-foreground mb-2">
              Tem certeza que deseja remover a fusão da <span className="font-semibold">VIA {clearFusionConfirm?.viaNumber}</span>?
            </p>
            <p className="text-xs text-muted-foreground">Esta ação não pode ser desfeita.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearFusionConfirm(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => {
              if (clearFusionConfirm) {
                if (clearFusionConfirm.isCto) clearCtoFusionMut.mutate({ viaId: clearFusionConfirm.id });
                else clearCeoFusionMut.mutate({ viaId: clearFusionConfirm.id });
                setClearFusionConfirm(null);
              }
            }} disabled={clearCtoFusionMut.isPending || clearCeoFusionMut.isPending}>
              {(clearCtoFusionMut.isPending || clearCeoFusionMut.isPending) ? "Removendo..." : "Remover Fusão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo Fusão de Splitter */}
      <Dialog open={splFusionDialogOpen} onOpenChange={setSplFusionDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Link2 className="w-4 h-4" /> Identificar Fusão — VIA {splFusionSourceVia?.viaNumber === 0 ? "00 (Entrada)" : splFusionSourceVia?.viaNumber}</DialogTitle>
          </DialogHeader>
          {splFusionSourceVia && (() => {
            const tubes = ceoTubesQuery.data as any[] | undefined;
            const allVias = ceoViasQuery.data as any[] | undefined;
            const allSplVias = ceoSplitterViasQuery.data as any[] | undefined;
            const targetTube = (tubes ?? []).find((t: any) => t.id === Number(splFusionTargetTubeId));
            const targetVias = targetTube ? (allVias ?? []).filter((v: any) => v.tubeId === targetTube.id) : [];
            return (
              <div className="space-y-4">
                <div className="rounded-lg bg-muted/30 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Origem:</span> Via <strong>{splFusionSourceVia.viaNumber === 0 ? "00 (Entrada)" : splFusionSourceVia.viaNumber}</strong> do Splitter
                </div>
                <div className="space-y-1.5">
                  <Label>Tipo de destino</Label>
                  <Select value={splFusionTargetType} onValueChange={v => { setSplFusionTargetType(v as any); setSplFusionTargetTubeId(""); setSplFusionTargetViaId(""); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tube">Tubo</SelectItem>
                      <SelectItem value="splitter">Splitter</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {splFusionTargetType === "tube" && (
                  <div className="space-y-1.5">
                    <Label>Tubo de destino *</Label>
                    <Select value={splFusionTargetTubeId} onValueChange={v => { setSplFusionTargetTubeId(v); setSplFusionTargetViaId(""); }}>
                      <SelectTrigger><SelectValue placeholder="Selecionar tubo" /></SelectTrigger>
                      <SelectContent>
                        {(tubes ?? []).map((t: any) => (
                          <SelectItem key={t.id} value={String(t.id)}>{t.type === "splitter" ? "⊕" : "○"} {t.identifier}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {splFusionTargetType === "tube" && splFusionTargetTubeId && (
                  <div className="space-y-1.5">
                    <Label>Via de destino *</Label>
                    <Select value={splFusionTargetViaId} onValueChange={setSplFusionTargetViaId}>
                      <SelectTrigger><SelectValue placeholder="Selecionar via" /></SelectTrigger>
                      <SelectContent>
                        {targetVias.length === 0 && <SelectItem value="__none" disabled>Nenhuma via disponível</SelectItem>}
                        {targetVias.map((v: any) => (
                          <SelectItem key={v.id} value={String(v.id)}>Via {v.viaNumber}{v.label ? ` — ${v.label}` : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {splFusionTargetType === "splitter" && (
                  <div className="space-y-1.5">
                    <Label>Via de Splitter de destino *</Label>
                    <Select value={splFusionTargetViaId} onValueChange={setSplFusionTargetViaId}>
                      <SelectTrigger><SelectValue placeholder="Selecionar via" /></SelectTrigger>
                      <SelectContent>
                        {(allSplVias ?? []).filter((v: any) => v.splitterId !== splFusionSourceVia.splitterId).map((v: any) => (
                          <SelectItem key={v.id} value={String(v.id)}>Via {v.viaNumber} · Splitter #{v.splitterId}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSplFusionDialogOpen(false)}>Cancelar</Button>
            <Button
              disabled={!splFusionTargetViaId || createSplFusionMut.isPending}
              onClick={() => {
                if (!splFusionSourceVia || !splFusionTargetViaId) return;
                createSplFusionMut.mutate({
                  ceoId: sidePanelRefId,
                  sourceType: "splitter",
                  sourceViaId: splFusionSourceVia.id,
                  targetType: splFusionTargetType,
                  targetViaId: parseInt(splFusionTargetViaId),
                });
              }}
            >
              {createSplFusionMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar Fusão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Diálogo Registrar Fusão */}
      <Dialog open={fusionDialogOpen} onOpenChange={setFusionDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><GitMerge className="w-4 h-4" /> Registrar Fusão</DialogTitle>
          </DialogHeader>
          {fusionSourceVia && (() => {
            const rawTubes = (fusionSourceVia.isCto ? ctoTubesQuery.data : ceoTubesQuery.data) as any[] | undefined;
            const rawSplitters = (!fusionSourceVia.isCto ? ceoSplittersQuery.data : undefined) as any[] | undefined;
            // Para CTO: splitters são tubos com type="splitter" na mesma tabela cto_tubes
            const rawCtoSplitters = fusionSourceVia.isCto
              ? (rawTubes ?? []).filter((t: any) => t.type === "splitter")
              : [];
            const rawCtoNormalTubes = fusionSourceVia.isCto
              ? (rawTubes ?? []).filter((t: any) => t.type !== "splitter")
              : [];
            // Combine tubes + splitters (splitters marked with prefixed id "spl_<id>")
            const tubes = fusionSourceVia.isCto
              ? [
                  ...rawCtoNormalTubes,
                  ...rawCtoSplitters.map((s: any) => ({ ...s, _isSplitter: true, _splId: s.id, id: `spl_${s.id}` })),
                ]
              : [
                  ...(rawTubes ?? []),
                  ...(rawSplitters ?? []).map((s: any) => ({ ...s, _isSplitter: true, _splId: s.id, id: `spl_${s.id}`, type: "splitter" })),
                ];
            const allVias = (fusionSourceVia.isCto ? ctoViasQuery.data : ceoViasQuery.data) as any[] | undefined;
            const allSplVias = (!fusionSourceVia.isCto ? ceoSplitterViasQuery.data : undefined) as any[] | undefined;
            // Para CTO: vias dos splitters vêm da mesma tabela cto_vias
            const allCtoSplVias = fusionSourceVia.isCto ? (allVias ?? []).filter((v: any) => {
              const splTube = rawCtoSplitters.find((s: any) => s.id === v.tubeId);
              return !!splTube;
            }) : [];
            const targetTube = tubes.find((t: any) => String(t.id) === fusionTargetTubeId);
            const isSplitterTarget = targetTube?.type === "splitter";
            const targetSplId = isSplitterTarget ? targetTube?._splId : null;
            const targetVias = targetTube
              ? isSplitterTarget
                ? fusionSourceVia.isCto
                  // CTO splitter: vias vêm de cto_vias filtradas por tubeId do splitter
                  ? allCtoSplVias.filter((v: any) => v.tubeId === targetSplId)
                  // CEO splitter: vias vêm de ceo_splitter_vias filtradas por splitterId
                  : (allSplVias ?? []).filter((v: any) => v.splitterId === targetSplId)
                : (allVias ?? []).filter((v: any) => v.tubeId === Number(fusionTargetTubeId) && v.fusedToViaId === null && v.id !== fusionSourceVia.id)
              : [];
            return (
              <div className="space-y-4">
                <div className="rounded-lg bg-muted/30 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Origem:</span> Via <strong>{fusionSourceVia.viaNumber}</strong>
                </div>
                <div className="space-y-1.5">
                  <Label>Tubo / Splitter de destino *</Label>
                  <Select value={fusionTargetTubeId} onValueChange={v => { setFusionTargetTubeId(v); setFusionTargetViaId(""); }}>
                    <SelectTrigger><SelectValue placeholder="Selecionar tubo ou splitter" /></SelectTrigger>
                    <SelectContent>
                      {(tubes ?? []).map((t: any) => (
                        <SelectItem key={t.id} value={String(t.id)}>{t.type === "splitter" ? "⊕" : "○"} {t.identifier}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {fusionTargetTubeId && (
                  <div className="space-y-1.5">
                    <Label>Via de destino *</Label>
                    <Select value={fusionTargetViaId} onValueChange={setFusionTargetViaId}>
                      <SelectTrigger><SelectValue placeholder="Selecionar via" /></SelectTrigger>
                      <SelectContent>
                        {targetVias.length === 0 && <SelectItem value="__none" disabled>Nenhuma via disponível</SelectItem>}
                        {targetVias.map((v: any) => (
                          <SelectItem key={v.id} value={String(v.id)}>{isSplitterTarget ? (v.viaNumber === 0 ? "ENT (Entrada)" : `Saída ${v.viaNumber}`) : `Via ${v.viaNumber}`}{v.label ? ` — ${v.label}` : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {/* Preview da via de destino seleccionada */}
                {fusionTargetTubeId && fusionTargetViaId && fusionTargetViaId !== "__none" && (() => {
                  const destVia = targetVias.find((v: any) => String(v.id) === fusionTargetViaId);
                  const srcVia = fusionSourceVia;
                  if (!destVia || !srcVia) return null;
                  return (
                    <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-3 space-y-2">
                      <p className="text-xs font-semibold text-cyan-400 uppercase tracking-wide">Confirmar Fusão</p>
                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                        <div className="rounded-md bg-muted/40 px-2.5 py-2 text-center">
                          <p className="text-[10px] text-muted-foreground mb-0.5">Origem</p>
                          <p className="text-sm font-bold text-white">Via {srcVia.viaNumber}</p>
                          {srcVia.label && <p className="text-[11px] text-zinc-400 truncate">{srcVia.label}</p>}
                        </div>
                        <div className="text-cyan-400 text-lg font-bold">⇄</div>
                        <div className="rounded-md bg-muted/40 px-2.5 py-2 text-center">
                          <p className="text-[10px] text-muted-foreground mb-0.5">Destino</p>
                          <p className="text-sm font-bold text-white">Via {destVia.viaNumber}</p>
                          {destVia.label && <p className="text-[11px] text-zinc-400 truncate">{destVia.label}</p>}
                        </div>
                      </div>
                      <p className="text-[11px] text-zinc-500 text-center">Tubo: <span className="text-zinc-300">{targetTube?.identifier}</span></p>
                    </div>
                  );
                })()}
              </div>
            );
          })()}
           <DialogFooter>
            <Button variant="outline" onClick={() => setFusionDialogOpen(false)}>Cancelar</Button>
            <Button
              disabled={!fusionTargetTubeId || !fusionTargetViaId || setCtoFusionMut.isPending || setCeoFusionMut.isPending || createSplFusionMut.isPending || createCtoSplFusionMut.isPending}
              onClick={() => {
                if (!fusionSourceVia || !fusionTargetTubeId || !fusionTargetViaId) return;
                const isSplDest = fusionTargetTubeId.startsWith("spl_");
                if (isSplDest && fusionSourceVia.isCto) {
                  // Via de tubo CTO -> via de splitter CTO: usar associação CTO
                  createCtoSplFusionMut.mutate({
                    ctoId: sidePanelRefId,
                    sourceType: "tube",
                    sourceViaId: fusionSourceVia.id,
                    targetType: "splitter",
                    targetViaId: Number(fusionTargetViaId),
                  });
                } else if (isSplDest && !fusionSourceVia.isCto) {
                  // Via de tubo CEO -> via de splitter CEO: usar associação CEO
                  createSplFusionMut.mutate({
                    ceoId: sidePanelRefId,
                    sourceType: "tube",
                    sourceViaId: fusionSourceVia.id,
                    targetType: "splitter",
                    targetViaId: Number(fusionTargetViaId),
                  });
                  setFusionDialogOpen(false);
                } else if (fusionSourceVia.isCto) {
                  setCtoFusionMut.mutate({ viaId: fusionSourceVia.id, fusedToTubeId: Number(fusionTargetTubeId), fusedToViaId: Number(fusionTargetViaId) });
                } else {
                  setCeoFusionMut.mutate({ viaId: fusionSourceVia.id, fusedToTubeId: Number(fusionTargetTubeId), fusedToViaId: Number(fusionTargetViaId) });
                }
              }}
            >
              {setCtoFusionMut.isPending || setCeoFusionMut.isPending || createSplFusionMut.isPending || createCtoSplFusionMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Registrar Fusão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Diálogo de Edição de Via */}
      <Dialog open={editViaDialogOpen} onOpenChange={setEditViaDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-4 h-4" />
              Editar Via {editViaData?.viaNumber}
            </DialogTitle>
          </DialogHeader>
          {editViaData && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Etiqueta / Label</Label>
                <Input
                  className="h-8 text-sm mt-1"
                  placeholder="Ex: Cliente João Silva"
                  value={editViaData.label}
                  onChange={(e) => setEditViaData({ ...editViaData, label: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Observações</Label>
                <Textarea
                  className="text-sm mt-1 resize-none"
                  rows={3}
                  placeholder="Observações sobre esta via..."
                  value={editViaData.notes}
                  onChange={(e) => setEditViaData({ ...editViaData, notes: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditViaDialogOpen(false)}>Cancelar</Button>
            <Button
              size="sm"
              disabled={updateCtoViaMut.isPending || updateCeoViaMut.isPending}
              onClick={() => {
                if (!editViaData) return;
                const label = editViaData.label.trim() || null;
                const notes = editViaData.notes.trim() || null;
                if (editViaData.isCto) {
                  updateCtoViaMut.mutate({ id: editViaData.id, label: label ?? undefined, notes: notes ?? undefined });
                } else {
                  updateCeoViaMut.mutate({ id: editViaData.id, label, notes });
                }
              }}
            >
              {updateCtoViaMut.isPending || updateCeoViaMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Diálogo de Relatório de Cabos */}
      <Dialog open={cablesReportOpen} onOpenChange={open => { setCablesReportOpen(open); if (!open) setCablesGroupSummary(null); }}>
        <DialogContent className="max-w-xl flex flex-col" style={{maxHeight:"88vh"}}>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><FileText className="w-4 h-4" /> Relatório de Cabos</DialogTitle></DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            <p className="text-sm text-muted-foreground">
              Exporta todos os cabos cadastrados no mapa com nome, tipo, quantidade de fibras, origem, destino, comprimento estimado do traçado e status de conexão.
            </p>
            <div className="rounded-lg border border-border p-3 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Total de cabos</span><span className="font-medium">{(routes as any[]).length}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Cabos soltos</span><span className="font-medium text-amber-400">{(routes as any[]).filter((r: any) => !(elements as any[]).find((e: any) => e.id === r.fromElementId) || !(elements as any[]).find((e: any) => e.id === r.toElementId)).length}</span></div>
            </div>
            {/* Filtro por grupo */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Filtrar por grupo (CSV / PDF)</Label>
                <button
                  className="text-xs text-cyan-400 hover:underline"
                  onClick={() => setCablesFilterGroups(new Set(["all"]))}
                >Limpar</button>
              </div>
              <div className="rounded-lg border border-border divide-y divide-border max-h-40 overflow-y-auto">
                {/* Opção: Todos */}
                <label className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/20">
                  <input type="checkbox" className="accent-cyan-500"
                    checked={cablesFilterGroups.has("all")}
                    onChange={e => {
                      const s = new Set(cablesFilterGroups);
                      if (e.target.checked) { s.clear(); s.add("all"); }
                      else { s.delete("all"); }
                      setCablesFilterGroups(s);
                    }}
                  />
                  <span className="font-medium">Todos os grupos</span>
                </label>
                {/* Opção: Sem grupo */}
                <label className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/20">
                  <input type="checkbox" className="accent-cyan-500"
                    checked={cablesFilterGroups.has("none")}
                    onChange={e => {
                      const s = new Set(cablesFilterGroups);
                      s.delete("all");
                      if (e.target.checked) s.add("none"); else s.delete("none");
                      if (s.size === 0) s.add("all");
                      setCablesFilterGroups(s);
                    }}
                  />
                  <span className="text-muted-foreground italic">Sem grupo</span>
                </label>
                {/* Grupos existentes */}
                {(mapGroups as any[]).map((g: any) => (
                  <label key={g.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/20">
                    <input type="checkbox" className="accent-cyan-500"
                      checked={cablesFilterGroups.has(String(g.id))}
                      onChange={e => {
                        const s = new Set(cablesFilterGroups);
                        s.delete("all");
                        if (e.target.checked) s.add(String(g.id)); else s.delete(String(g.id));
                        if (s.size === 0) s.add("all");
                        setCablesFilterGroups(s);
                      }}
                    />
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{background: g.color ?? '#888'}} />
                    <span className="truncate">{g.name}</span>
                  </label>
                ))}
              </div>
              {!cablesFilterGroups.has("all") && (
                <p className="text-xs text-cyan-400">{cablesFilterGroups.size} grupo{cablesFilterGroups.size !== 1 ? 's' : ''} selecionado{cablesFilterGroups.size !== 1 ? 's' : ''}</p>
              )}
            </div>
            {/* Resumo por grupo */}
            {cablesGroupSummary && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">Resumo por Grupo / Pasta</Label>
                  <span className="text-xs text-muted-foreground">{(cablesGroupSummary as any[]).length} grupos</span>
                </div>
                <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
                  {(cablesGroupSummary as any[]).map((g: any) => (
                    <div key={g.groupId ?? 'none'} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{background: g.groupColor ?? '#888'}} />
                      <span className="flex-1 font-medium truncate">{g.groupName}</span>
                      <span className="text-xs text-muted-foreground">{g.cabos} cabo{g.cabos !== 1 ? 's' : ''}</span>
                      <span className="text-xs font-mono text-cyan-400 ml-2">{g.metros >= 1000 ? `${(g.metros/1000).toFixed(2)} km` : `${Math.round(g.metros)} m`}</span>
                    </div>
                  ))}
                  {(cablesGroupSummary as any[]).length > 0 && (
                    <div className="flex items-center gap-3 px-3 py-2 text-sm bg-muted/20 font-semibold">
                      <span className="w-3 h-3 flex-shrink-0" />
                      <span className="flex-1">Total</span>
                      <span className="text-xs text-muted-foreground">{(cablesGroupSummary as any[]).reduce((s: number, g: any) => s + g.cabos, 0)} cabos</span>
                      <span className="text-xs font-mono text-cyan-400 ml-2">{(() => { const t = (cablesGroupSummary as any[]).reduce((s: number, g: any) => s + g.metros, 0); return t >= 1000 ? `${(t/1000).toFixed(2)} km` : `${Math.round(t)} m`; })()}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 flex-shrink-0 pt-2">
            <Button variant="outline" onClick={() => { setCablesReportOpen(false); setCablesGroupSummary(null); }}>Cancelar</Button>
            <Button
              variant="outline"
              disabled={cablesReportLoading}
              onClick={async () => {
                setCablesReportLoading(true);
                try {
                  const result = await exportCablesMut.mutateAsync({ format: "group_summary" });
                  const summaryArr = Array.isArray(result.summary) ? result.summary : Object.values(result.summary ?? {});
                  setCablesGroupSummary(summaryArr);
                  toast.success("Resumo por grupo carregado");
                } catch (e: any) { toast.error(e.message ?? "Erro ao carregar resumo"); }
                finally { setCablesReportLoading(false); }
              }}
            >
              {cablesReportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Folder className="w-3.5 h-3.5" /> Resumo por Grupo</>}
            </Button>
            <Button
              variant="outline"
              disabled={cablesReportLoading}
              onClick={async () => {
                setCablesReportLoading(true);
                try {
                  const filterGroupIds = cablesFilterGroups.has("all") ? undefined : Array.from(cablesFilterGroups);
                  const result = await exportCablesMut.mutateAsync({ format: "csv", filterGroupIds });
                  const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8;" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  const groupLabel = cablesFilterGroups.has("all") ? "todos" : `${cablesFilterGroups.size}-grupos`;
                  a.href = url; a.download = `cabos-${groupLabel}-${new Date().toISOString().slice(0,10)}.csv`;
                  a.click(); URL.revokeObjectURL(url);
                  toast.success("CSV exportado com sucesso");
                } catch (e: any) { toast.error(e.message ?? "Erro ao exportar"); }
                finally { setCablesReportLoading(false); }
              }}
            >
              {cablesReportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Download className="w-3.5 h-3.5" /> Exportar CSV</>}
            </Button>
            <Button
              disabled={cablesReportLoading}
              onClick={async () => {
                setCablesReportLoading(true);
                try {
                  const filterGroupIds2 = cablesFilterGroups.has("all") ? undefined : Array.from(cablesFilterGroups);
                  const result = await exportCablesMut.mutateAsync({ format: "pdf", filterGroupIds: filterGroupIds2 });
                  const rows = result.rows as any[];
                  const groupLabelPdf = cablesFilterGroups.has("all") ? "Todos" : cablesFilterGroups.has("none") && cablesFilterGroups.size === 1 ? "Sem grupo" : `${cablesFilterGroups.size} grupos selecionados`;
                  // Gerar PDF via HTML/CSS usando window.print
                  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relatório de Cabos</title><style>
                    body{font-family:Arial,sans-serif;font-size:11px;margin:20px;color:#111}
                    h1{font-size:16px;margin-bottom:4px}p{margin:0 0 12px;color:#555;font-size:10px}
                    table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}
                    th{background:#1e293b;color:#fff;font-size:10px}tr:nth-child(even){background:#f8fafc}
                    .solto{color:#d97706;font-weight:bold}.conectado{color:#16a34a}
                    @media print{body{margin:10px}}
                  </style></head><body>
                    <h1>Relatório de Cabos — FiberDoc</h1>
                    <p>Gerado em ${new Date().toLocaleString("pt-BR")} · Grupo: ${groupLabelPdf} · Total: ${rows.length} cabos</p>
                    <table><thead><tr>
                      <th>#</th><th>Nome</th><th>Tipo</th><th>Fibras</th><th>De</th><th>Para</th><th>Comp. (km)</th><th>Status</th><th>Notas</th>
                    </tr></thead><tbody>
                    ${rows.map((r: any) => `<tr>
                      <td>${r.id}</td><td>${r.nome}</td><td>${r.tipo}</td><td>${r.fibras}</td>
                      <td>${r.de}</td><td>${r.para}</td><td>${r.comprimento_km}</td>
                      <td class="${r.status === 'Solto' ? 'solto' : 'conectado'}">${r.status}</td>
                      <td>${r.notas}</td>
                    </tr>`).join("")}
                    </tbody></table></body></html>`;
                  const w = window.open("", "_blank");
                  if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 500); }
                  toast.success("PDF aberto para impressão");
                } catch (e: any) { toast.error(e.message ?? "Erro ao gerar PDF"); }
                finally { setCablesReportLoading(false); }
              }}
            >
              {cablesReportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><FileText className="w-3.5 h-3.5" /> Gerar PDF</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Vincular CTO ao SGP ───────────────────────────────────────── */}
      <Dialog open={linkSgpDialogOpen} onOpenChange={setLinkSgpDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-4 h-4 text-cyan-400" />
              Vincular CTO ao SGP
              {/* Contagem de CTOs disponíveis */}
              {!sgpCtosQuery.isLoading && !sgpCtosQuery.data?.error && (
                <span className="ml-auto text-[11px] font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {(sgpCtosQuery.data?.ctos ?? []).length} CTOs
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Selecione a CTO correspondente no SGP para vincular e mostrar os clientes/ONUs.
            </p>
            {/* Banner de sugestão automática */}
            {autoMatchQuery.data?.match && (
              <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-md px-3 py-2">
                <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-emerald-300">Correspondência automática detectada</div>
                  <div className="text-[11px] text-emerald-400/80 truncate">
                    <span className="font-mono">{autoMatchQuery.data.match.sgpName}</span>
                    <span className="ml-1.5 bg-emerald-500/20 text-emerald-300 px-1 rounded text-[10px]">{autoMatchQuery.data.match.score}%</span>
                  </div>
                </div>
              </div>
            )}
            <Input
              placeholder="Buscar CTO no SGP..."
              value={linkSgpSearch}
              onChange={e => setLinkSgpSearch(e.target.value)}
              className="h-8 text-sm"
              disabled={sgpCtosQuery.isLoading}
            />
            {sgpCtosQuery.isLoading ? (
              <div className="border border-border rounded-md p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                  <span>A carregar CTOs do SGP...</span>
                </div>
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded animate-pulse">
                    <div className="h-3 bg-muted rounded flex-1" style={{ width: `${55 + i * 7}%`, opacity: 1 - i * 0.12 }} />
                    <div className="h-3 bg-muted rounded w-8" />
                  </div>
                ))}
              </div>
            ) : sgpCtosQuery.data?.error ? (
              <div className="flex flex-col gap-2 border border-red-500/20 bg-red-500/5 rounded-md px-3 py-3">
                <div className="flex items-center gap-2 text-sm text-red-400">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1">{sgpCtosQuery.data.error}</span>
                </div>
                <button
                  className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 self-start"
                  onClick={() => sgpCtosQuery.refetch()}
                >
                  <RefreshCw className="w-3 h-3" /> Tentar novamente
                </button>
              </div>
            ) : (() => {
              const linkedIds = new Set(linkedSgpIdsQuery.data?.ids ?? []);
              // Excluir o sgpId da CTO actual (para não marcar como já vinculada a si própria)
              const currentSgpId = sidePanel?.kind === "element" ? sidePanel.element.sgpId : null;
              if (currentSgpId) linkedIds.delete(currentSgpId);
              const nameMap = (linkedSgpIdsQuery.data as any)?.nameMap ?? {};
              const filtered = ((sgpCtosQuery.data?.ctos ?? []) as any[])
                .filter((c: any) => {
                  const q = linkSgpSearchDebounced.toLowerCase();
                  return !q || (c.ident ?? c.name ?? "").toLowerCase().includes(q) || String(c.id).includes(q);
                })
                // Ordenar: não vinculadas primeiro, vinculadas no fundo
                .sort((a: any, b: any) => {
                  const aLinked = linkedIds.has(a.id) ? 1 : 0;
                  const bLinked = linkedIds.has(b.id) ? 1 : 0;
                  return aLinked - bLinked;
                });
              return (
                <div className="max-h-64 overflow-y-auto space-y-1 border border-border rounded-md p-1">
                  {filtered.map((c: any) => {
                    const alreadyLinked = linkedIds.has(c.id);
                    const isSelected = linkSgpSelectedId === c.id;
                    const localCtoName: string | undefined = nameMap[c.id];
                    return (
                      <button
                        key={c.id}
                        className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 transition-colors ${
                          isSelected
                            ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                            : alreadyLinked
                            ? "opacity-50 cursor-not-allowed"
                            : "hover:bg-muted/50"
                        }`}
                        onClick={() => !alreadyLinked && setLinkSgpSelectedId(c.id)}
                        disabled={alreadyLinked}
                        title={alreadyLinked
                          ? localCtoName
                            ? `Já vinculada à CTO local: ${localCtoName}`
                            : "Já vinculada a outra CTO local"
                          : undefined}
                      >
                        {isSelected
                          ? <Check className="w-3 h-3 text-cyan-400 flex-shrink-0" />
                          : alreadyLinked
                          ? <Link2 className="w-3 h-3 text-amber-400/60 flex-shrink-0" />
                          : <div className="w-3 h-3 flex-shrink-0" />}
                        <span className="flex-1 truncate font-medium">{c.ident ?? c.name ?? `CTO #${c.id}`}</span>
                        {alreadyLinked && (
                          <span
                            className="text-[10px] text-amber-400/70 bg-amber-500/10 px-1.5 py-0.5 rounded flex-shrink-0 max-w-[100px] truncate"
                            title={localCtoName ? `Vinculada a: ${localCtoName}` : "Já vinculada"}
                          >
                            {localCtoName ? localCtoName : "vinculada"}
                          </span>
                        )}
                        <span className="text-muted-foreground font-mono">#{c.id}</span>
                      </button>
                    );
                  })}
                  {filtered.length === 0 && (
                    <div className="text-xs text-muted-foreground text-center py-6 flex flex-col items-center gap-1.5">
                      <Users className="w-5 h-5 opacity-30" />
                      {linkSgpSearchDebounced ? `Nenhuma CTO encontrada para "${linkSgpSearchDebounced}"` : "Nenhuma CTO disponível no SGP"}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setLinkSgpDialogOpen(false)}>Cancelar</Button>
            <Button
              size="sm"
              className="bg-cyan-600 hover:bg-cyan-700 text-white"
              disabled={!linkSgpSelectedId || linkCtoToSgpMut.isPending}
              onClick={() => {
                if (!linkSgpSelectedId || !sidePanel || sidePanel.kind !== "element") return;
                linkCtoToSgpMut.mutate({ ctoId: sidePanel.element.referenceId, sgpId: linkSgpSelectedId });
              }}
            >
              {linkCtoToSgpMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Vincular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Diálogo Criar OLT no Mapa ── */}
      <OltCreateDialog
        open={oltAddDialogOpen}
        onClose={() => setOltAddDialogOpen(false)}
        lat={oltAddLat}
        lng={oltAddLng}
        onCreated={() => { refetchOltElements(); }}
      />

      {/* ── Painel de Detalhes OLT ── */}
      {oltDetailPanelOpen && selectedOltElementId != null && (
        <OltDetailPanel
          oltElementId={selectedOltElementId}
          elements={elements as any[]}
          ceos={ceos}
          ctos={ctos as any[]}
          mapGroups={mapGroups as any[]}
          isMoving={movingOltId === selectedOltElementId}
          pendingMovePos={pendingOltMovePos?.id === selectedOltElementId ? pendingOltMovePos : null}
          onToggleMove={() => {
            if (movingOltId === selectedOltElementId) {
              setMovingOltId(null);
              setPendingOltMovePos(null);
              toast.info("Modo mover cancelado");
            } else {
              setMovingOltId(selectedOltElementId);
              setPendingOltMovePos(null);
              // Fechar o painel para liberar o mapa para o drag
              setOltDetailPanelOpen(false);
              toast.info("Arraste o marcador da OLT para reposicioná-la. Clique nele novamente para salvar.", { duration: 6000 });
            }
          }}
          onSaveMove={() => {
            const p = pendingOltMovePos;
            if (!p) return;
            updateOltElementMut.mutate({ id: p.id, lat: p.lat, lng: p.lng }, {
              onSuccess: () => { setMovingOltId(null); setPendingOltMovePos(null); }
            });
          }}
          onClose={() => { setOltDetailPanelOpen(false); setSelectedOltElementId(null); setMovingOltId(null); setPendingOltMovePos(null); }}
          onUpdated={() => { refetchOltElements(); refetchGroups(); }}
        />
      )}

      {/* ── Diálogo de Criação DGO ── */}
      <DgoCreateDialog
        open={dgoCreateDialogOpen}
        onClose={() => setDgoCreateDialogOpen(false)}
        lat={dgoCreateLat}
        lng={dgoCreateLng}
        onCreated={() => { refetchDgoElements(); }}
      />

      {/* ── Painel de Detalhes DGO ── */}
      {dgoDetailPanelOpen && selectedDgoElementId != null && (
        <DgoDetailPanel
          dgoElementId={selectedDgoElementId}
          mapGroups={mapGroups as any[]}
          pendingFiberLinkRouteId={pendingDgoFiberLinkRouteId}
          onFiberLinkRouteConsumed={() => setPendingDgoFiberLinkRouteId(null)}
          isMoving={movingDgoId === selectedDgoElementId}
          pendingMovePos={pendingDgoMovePos?.id === selectedDgoElementId ? pendingDgoMovePos : null}
          onToggleMove={() => {
            if (movingDgoId === selectedDgoElementId) {
              setMovingDgoId(null);
              setPendingDgoMovePos(null);
              toast.info("Modo mover cancelado");
            } else {
              setMovingDgoId(selectedDgoElementId);
              setPendingDgoMovePos(null);
              setDgoDetailPanelOpen(false);
              toast.info("Arraste o marcador do DGO para reposicioná-lo. Clique nele novamente para salvar.", { duration: 6000 });
            }
          }}
          onSaveMove={() => {
            const p = pendingDgoMovePos;
            if (!p) return;
            updateDgoElementMut.mutate({ id: p.id, lat: p.lat, lng: p.lng }, {
              onSuccess: () => { setMovingDgoId(null); setPendingDgoMovePos(null); }
            });
          }}
          onClose={() => { setDgoDetailPanelOpen(false); setSelectedDgoElementId(null); setMovingDgoId(null); setPendingDgoMovePos(null); }}
        />
      )}

      {/* ── Diálogo de Poste ───────────────────────────────────────────────────────────── */}
      <Dialog open={poleDialogOpen} onOpenChange={v => { if (!v) { setPoleDialogOpen(false); setEditingPoleId(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Milestone className="w-4 h-4 text-slate-400" />
              {editingPoleId ? "Editar Poste" : "Adicionar Poste"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input value={poleForm.name} onChange={e => setPoleForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Poste 001" />
            </div>
            <div className="space-y-1.5">
              <Label>Referência</Label>
              <Input value={poleForm.reference} onChange={e => setPoleForm(f => ({ ...f, reference: e.target.value }))} placeholder="Ex: P-001 / 12345" />
            </div>
            <div className="space-y-1.5">
              <Label>Esforço</Label>
              <Input value={poleForm.effort} onChange={e => setPoleForm(f => ({ ...f, effort: e.target.value }))} placeholder="Ex: Simples, Duplo, Âncora..." />
            </div>
            <div className="space-y-1.5">
              <Label>Localização GPS</Label>
              <div className="flex gap-2 items-center">
                <div className="flex-1 text-xs bg-muted rounded px-3 py-2 text-muted-foreground font-mono">
                  {poleDialogLat.toFixed(6)}, {poleDialogLng.toFixed(6)}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1 text-xs h-8"
                  onClick={() => {
                    if (!navigator.geolocation) { toast.error("Geolocalização não suportada pelo navegador"); return; }
                    navigator.geolocation.getCurrentPosition(
                      (pos) => { setPoleDialogLat(pos.coords.latitude); setPoleDialogLng(pos.coords.longitude); toast.success("Localização obtida"); },
                      () => toast.error("Não foi possível obter a localização")
                    );
                  }}
                >
                  <MapPin className="w-3 h-3" /> Pegar Localização
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1"><Folder className="w-3 h-3" /> Grupo / Pasta</Label>
              <Select
                value={(() => { const g = (mapGroups as any[]).find((g: any) => g.poles?.some((p: any) => p.poleId === editingPoleId)); return g ? String(g.id) : "none"; })()} 
                onValueChange={(val) => {
                  if (!editingPoleId) return;
                  const curGroup = (mapGroups as any[]).find((g: any) => g.poles?.some((p: any) => p.poleId === editingPoleId));
                  if (curGroup) removePoleFromGroupMut.mutate({ groupId: curGroup.id, poleId: editingPoleId });
                  if (val !== "none") assignPoleToGroupMut.mutate({ groupId: Number(val), poleId: editingPoleId });
                }}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Sem grupo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem grupo</SelectItem>
                  {(mapGroups as any[]).map((g: any) => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      <span className="flex items-center gap-1.5"><span style={{ background: g.color, width: 8, height: 8, borderRadius: "50%", display: "inline-block" }} />{g.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!editingPoleId && <p className="text-xs text-muted-foreground">Salve o poste primeiro para atribuir a um grupo.</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea value={poleForm.notes} onChange={e => setPoleForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Observações opcionais..." />
            </div>
          </div>
          <DialogFooter className="flex items-center justify-between">
            {editingPoleId && (
              <Button variant="destructive" size="sm" onClick={() => setDeletePoleId(editingPoleId)} className="mr-auto gap-1">
                <Trash2 className="w-3.5 h-3.5" /> Excluir
              </Button>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setPoleDialogOpen(false); setEditingPoleId(null); }}>Cancelar</Button>
              <Button
                disabled={createPoleMut.isPending || updatePoleMut.isPending}
                onClick={() => {
                  if (!poleForm.name.trim()) { toast.error("Nome obrigatório"); return; }
                  if (editingPoleId) {
                    updatePoleMut.mutate({ id: editingPoleId, name: poleForm.name, reference: poleForm.reference, effort: poleForm.effort, notes: poleForm.notes, lat: poleDialogLat, lng: poleDialogLng });
                  } else {
                    createPoleMut.mutate({ name: poleForm.name, reference: poleForm.reference, effort: poleForm.effort, notes: poleForm.notes, lat: poleDialogLat, lng: poleDialogLng });
                  }
                }}
              >
                {createPoleMut.isPending || updatePoleMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : (editingPoleId ? "Salvar" : "Adicionar")}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão de poste */}
      <Dialog open={deletePoleId !== null} onOpenChange={v => { if (!v) setDeletePoleId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Excluir Poste</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Tem certeza que deseja excluir este poste? Esta ação não pode ser desfeita.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletePoleId(null)}>Cancelar</Button>
            <Button variant="destructive" disabled={deletePoleMut.isPending} onClick={() => { if (deletePoleId) { deletePoleMut.mutate({ id: deletePoleId }); setPoleDialogOpen(false); setEditingPoleId(null); } }}>
              {deletePoleMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Diálogo de Reserva Técnica ────────────────────────────────────────────────────── */}
      <Dialog open={reserveDialogOpen} onOpenChange={v => { if (!v) { setReserveDialogOpen(false); setEditingReserveId(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Codesandbox className="w-4 h-4 text-cyan-400" />
              {editingReserveId ? "Editar Reserva Técnica" : "Adicionar Reserva Técnica"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input value={reserveForm.name} onChange={e => setReserveForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Reserva CEO-01" />
            </div>
            <div className="space-y-1.5">
              <Label>Tamanho da Reserva (metros)</Label>
              <Input type="number" min={0} step={1} value={reserveForm.sizeMeters} onChange={e => setReserveForm(f => ({ ...f, sizeMeters: Number(e.target.value) }))} placeholder="Ex: 20" />
              <p className="text-xs text-muted-foreground">Metros de cabo reservado. Será incluído no cálculo do OTDR Virtual e Balanço Óptico quando vinculado a um traçado.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Vincular a um Traçado (opcional)</Label>
              <Select
                value={reserveForm.routeId !== null ? String(reserveForm.routeId) : "none"}
                onValueChange={v => setReserveForm(f => ({ ...f, routeId: v === "none" ? null : Number(v) }))}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Sem vínculo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem vínculo</SelectItem>
                  {(routes as any[]).map((r: any) => (
                    <SelectItem key={r.id} value={String(r.id)}>{r.name ?? `Cabo #${r.id}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {reserveForm.routeId !== null && (() => {
                const r = (routes as any[]).find((rt: any) => rt.id === reserveForm.routeId);
                if (!r) return null;
                const fromEl = (elements as any[]).find((e: any) => e.id === r.fromElementId);
                const toEl = (elements as any[]).find((e: any) => e.id === r.toElementId);
                const fromRef = fromEl ? (fromEl.type === "cto" ? (ctos as any[]).find((c: any) => c.id === fromEl.referenceId) : (ceos as any[]).find((c: any) => c.id === fromEl.referenceId)) : null;
                const toRef = toEl ? (toEl.type === "cto" ? (ctos as any[]).find((c: any) => c.id === toEl.referenceId) : (ceos as any[]).find((c: any) => c.id === toEl.referenceId)) : null;
                return (
                  <div className="text-xs text-cyan-400 bg-cyan-500/10 rounded p-2 border border-cyan-500/20">
                    <span className="font-medium">{r.name ?? `Cabo #${r.id}`}</span>
                    {fromRef && toRef && <span className="text-muted-foreground ml-1">({fromRef.name} → {toRef.name})</span>}
                    <br />
                    <span className="text-muted-foreground">A reserva de <b className="text-cyan-300">{reserveForm.sizeMeters}m</b> será somada ao comprimento do traçado nos cálculos de OTDR e Balanço Óptico.</span>
                  </div>
                );
              })()}
            </div>
            <div className="space-y-1.5">
              <Label>Localização GPS</Label>
              <div className="text-xs bg-muted rounded px-3 py-2 text-muted-foreground font-mono">
                {reserveDialogLat.toFixed(6)}, {reserveDialogLng.toFixed(6)}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1"><Folder className="w-3 h-3" /> Grupo / Pasta</Label>
              <Select
                value={(() => { const g = (mapGroups as any[]).find((g: any) => g.reserves?.some((r: any) => r.reserveId === editingReserveId)); return g ? String(g.id) : "none"; })()} 
                onValueChange={(val) => {
                  if (!editingReserveId) return;
                  const curGroup = (mapGroups as any[]).find((g: any) => g.reserves?.some((r: any) => r.reserveId === editingReserveId));
                  if (curGroup) removeReserveFromGroupMut.mutate({ groupId: curGroup.id, reserveId: editingReserveId });
                  if (val !== "none") assignReserveToGroupMut.mutate({ groupId: Number(val), reserveId: editingReserveId });
                }}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Sem grupo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem grupo</SelectItem>
                  {(mapGroups as any[]).map((g: any) => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      <span className="flex items-center gap-1.5"><span style={{ background: g.color, width: 8, height: 8, borderRadius: "50%", display: "inline-block" }} />{g.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!editingReserveId && <p className="text-xs text-muted-foreground">Salve a reserva primeiro para atribuir a um grupo.</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea value={reserveForm.notes} onChange={e => setReserveForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Observações opcionais..." />
            </div>
          </div>
          <DialogFooter className="flex items-center justify-between">
            {editingReserveId && (
              <Button variant="destructive" size="sm" onClick={() => setDeleteReserveId(editingReserveId)} className="mr-auto gap-1">
                <Trash2 className="w-3.5 h-3.5" /> Excluir
              </Button>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setReserveDialogOpen(false); setEditingReserveId(null); }}>Cancelar</Button>
              <Button
                disabled={createReserveMut.isPending || updateReserveMut.isPending}
                onClick={() => {
                  if (!reserveForm.name.trim()) { toast.error("Nome obrigatório"); return; }
                  if (editingReserveId) {
                    updateReserveMut.mutate({ id: editingReserveId, name: reserveForm.name, sizeMeters: reserveForm.sizeMeters, routeId: reserveForm.routeId, notes: reserveForm.notes, lat: reserveDialogLat, lng: reserveDialogLng });
                  } else {
                    createReserveMut.mutate({ name: reserveForm.name, sizeMeters: reserveForm.sizeMeters, routeId: reserveForm.routeId, notes: reserveForm.notes, lat: reserveDialogLat, lng: reserveDialogLng });
                  }
                }}
              >
                {createReserveMut.isPending || updateReserveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : (editingReserveId ? "Salvar" : "Adicionar")}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão de reserva técnica */}
      <Dialog open={deleteReserveId !== null} onOpenChange={v => { if (!v) setDeleteReserveId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Excluir Reserva Técnica</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Tem certeza que deseja excluir esta reserva técnica?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteReserveId(null)}>Cancelar</Button>
            <Button variant="destructive" disabled={deleteReserveMut.isPending} onClick={() => { if (deleteReserveId) { deleteReserveMut.mutate({ id: deleteReserveId }); setReserveDialogOpen(false); setEditingReserveId(null); } }}>
              {deleteReserveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Diálogo de criação de POI ──────────────────────────────────────────────────────── */}
      <Dialog open={poiDialogOpen} onOpenChange={v => { if (!v) setPoiDialogOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-indigo-400" />
              Adicionar Ponto de Interesse
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input
                value={poiCreateForm.name}
                onChange={e => setPoiCreateForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Câmera Praça Central, Prédio Sede..."
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={poiCreateForm.category} onValueChange={v => setPoiCreateForm(f => ({ ...f, category: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="geral">Geral</SelectItem>
                  <SelectItem value="camera">Câmera</SelectItem>
                  <SelectItem value="predio">Prédio / Edifício</SelectItem>
                  <SelectItem value="antena">Antena</SelectItem>
                  <SelectItem value="torre">Torre</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1"><Folder className="w-3 h-3" /> Grupo / Pasta (opcional)</Label>
              <Select value={poiCreateForm.groupId !== null ? String(poiCreateForm.groupId) : "none"} onValueChange={v => setPoiCreateForm(f => ({ ...f, groupId: v === "none" ? null : Number(v) }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Sem grupo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem grupo</SelectItem>
                  {(mapGroups as any[]).map((g: any) => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      <span className="flex items-center gap-1.5"><span style={{ background: g.color, width: 8, height: 8, borderRadius: "50%", display: "inline-block" }} />{g.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Localização GPS</Label>
              <div className="text-xs bg-muted rounded px-3 py-2 text-muted-foreground font-mono">
                {poiDialogLat.toFixed(6)}, {poiDialogLng.toFixed(6)}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea value={poiCreateForm.notes} onChange={e => setPoiCreateForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Observações opcionais..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPoiDialogOpen(false)}>Cancelar</Button>
            <Button
              disabled={createPoiMut.isPending}
              onClick={async () => {
                if (!poiCreateForm.name.trim()) { toast.error("Nome obrigatório"); return; }
                try {
                  const poi = await createPoiMut.mutateAsync({
                    name: poiCreateForm.name.trim(),
                    category: poiCreateForm.category,
                    lat: poiDialogLat,
                    lng: poiDialogLng,
                    color: "#6366f1",
                    notes: poiCreateForm.notes || undefined,
                  });
                  if (poiCreateForm.groupId !== null) {
                    try { await addPoiToGroupMut.mutateAsync({ poiId: (poi as any).id, groupId: poiCreateForm.groupId }); } catch {}
                  }
                  setPoiDialogOpen(false);
                  toast.success(`POI "${poiCreateForm.name}" adicionado!`);
                } catch (e: any) {
                  toast.error(e.message ?? "Erro ao criar POI");
                }
              }}
            >
              {createPoiMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Adicionar POI"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ── Diálogo: Mover itens selecionados para pasta ── */}
      <Dialog open={moveToGroupDialogOpen} onOpenChange={setMoveToGroupDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Mover para pasta</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm text-muted-foreground mb-3">
              Selecione a pasta de destino para os {totalChecked} item{totalChecked !== 1 ? "s" : ""} selecionado{totalChecked !== 1 ? "s" : ""}.
            </p>
            <ScrollArea className="max-h-64">
              <div className="space-y-1">
                {(mapGroups as any[]).sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map((g: any) => (
                  <button
                    key={g.id}
                    className="w-full text-left px-3 py-1.5 rounded hover:bg-muted/30 text-sm flex items-center gap-2"
                    onClick={async () => {
                      const targetGroupId = g.id;
                      const fromGroupId = checkedGroupId;
                      const promises: Promise<any>[] = [];
                      // Primeiro remover do grupo atual (se houver), depois adicionar ao novo
                      if (fromGroupId !== null && fromGroupId !== targetGroupId) {
                        checkedItems.elements.forEach(id => promises.push(removeElementFromGroupMut.mutateAsync({ groupId: fromGroupId, elementId: id }).then(() => assignElementToGroupMut.mutateAsync({ groupId: targetGroupId, elementId: id }))));
                        checkedItems.routes.forEach(id => promises.push(removeRouteFromGroupMut.mutateAsync({ groupId: fromGroupId, routeId: id }).then(() => assignRouteToGroupMut.mutateAsync({ groupId: targetGroupId, routeId: id }))));
                        checkedItems.poles.forEach(id => promises.push(removePoleFromGroupMut.mutateAsync({ groupId: fromGroupId, poleId: id }).then(() => assignPoleToGroupMut.mutateAsync({ groupId: targetGroupId, poleId: id }))));
                        checkedItems.reserves.forEach(id => promises.push(removeReserveFromGroupMut.mutateAsync({ groupId: fromGroupId, reserveId: id }).then(() => assignReserveToGroupMut.mutateAsync({ groupId: targetGroupId, reserveId: id }))));
                        checkedItems.pois.forEach(id => promises.push(removePoiFromGroupMut.mutateAsync({ groupId: fromGroupId, poiId: id }).then(() => addPoiToGroupMut.mutateAsync({ poiId: id, groupId: targetGroupId }))));
                        checkedItems.olts.forEach(id => promises.push(removeOltFromGroupMut.mutateAsync({ groupId: fromGroupId, oltId: id }).then(() => assignOltToGroupMut.mutateAsync({ groupId: targetGroupId, oltId: id }))));
                      } else {
                        checkedItems.elements.forEach(id => promises.push(assignElementToGroupMut.mutateAsync({ groupId: targetGroupId, elementId: id })));
                        checkedItems.routes.forEach(id => promises.push(assignRouteToGroupMut.mutateAsync({ groupId: targetGroupId, routeId: id })));
                        checkedItems.poles.forEach(id => promises.push(assignPoleToGroupMut.mutateAsync({ groupId: targetGroupId, poleId: id })));
                        checkedItems.reserves.forEach(id => promises.push(assignReserveToGroupMut.mutateAsync({ groupId: targetGroupId, reserveId: id })));
                        checkedItems.pois.forEach(id => promises.push(addPoiToGroupMut.mutateAsync({ poiId: id, groupId: targetGroupId })));
                        checkedItems.olts.forEach(id => promises.push(assignOltToGroupMut.mutateAsync({ groupId: targetGroupId, oltId: id })));
                      }
                      try {
                        await Promise.all(promises);
                        toast.success(`${totalChecked} item${totalChecked !== 1 ? 's' : ''} movido${totalChecked !== 1 ? 's' : ''} para "${g.name}"`);
                        clearCheckedItems();
                        refetchGroups();
                        setMoveToGroupDialogOpen(false);
                      } catch (e: any) {
                        toast.error(e.message ?? 'Erro ao mover itens');
                      }
                    }}
                  >
                    <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: g.color ?? '#6366f1' }} />
                    <span className="truncate">{g.name}</span>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveToGroupDialogOpen(false)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Diálogo: Confirmar exclusão em massa ── */}
      <Dialog open={bulkDeleteConfirmOpen} onOpenChange={setBulkDeleteConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-400">Confirmar exclusão</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm text-muted-foreground">
              Tem certeza que deseja excluir permanentemente <strong className="text-foreground">{totalChecked} item{totalChecked !== 1 ? "s" : ""}</strong>?
            </p>
            <p className="text-xs text-red-400/80 mt-2">
              Esta ação não pode ser desfeita. Todos os dados associados (fusões, conexões, etc.) também serão removidos.
            </p>
            {checkedItems.elements.size > 0 && <p className="text-xs text-muted-foreground mt-1">{checkedItems.elements.size} elemento{checkedItems.elements.size !== 1 ? "s" : ""} (CEO/CTO)</p>}
            {checkedItems.routes.size > 0 && <p className="text-xs text-muted-foreground">{checkedItems.routes.size} cabo{checkedItems.routes.size !== 1 ? "s" : ""}</p>}
            {checkedItems.poles.size > 0 && <p className="text-xs text-muted-foreground">{checkedItems.poles.size} poste{checkedItems.poles.size !== 1 ? "s" : ""}</p>}
            {checkedItems.reserves.size > 0 && <p className="text-xs text-muted-foreground">{checkedItems.reserves.size} reserva{checkedItems.reserves.size !== 1 ? "s" : ""} técnica{checkedItems.reserves.size !== 1 ? "s" : ""}</p>}
            {checkedItems.pois.size > 0 && <p className="text-xs text-muted-foreground">{checkedItems.pois.size} POI{checkedItems.pois.size !== 1 ? "s" : ""}</p>}
            {checkedItems.olts.size > 0 && <p className="text-xs text-muted-foreground">{checkedItems.olts.size} OLT{checkedItems.olts.size !== 1 ? "s" : ""}</p>}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBulkDeleteConfirmOpen(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                const promises: Promise<any>[] = [];
                checkedItems.elements.forEach(id => promises.push(deleteElementMut.mutateAsync({ id })));
                checkedItems.routes.forEach(id => promises.push(deleteRouteMut.mutateAsync({ id })));
                checkedItems.poles.forEach(id => promises.push(deletePoleMut.mutateAsync({ id })));
                checkedItems.reserves.forEach(id => promises.push(deleteReserveMut.mutateAsync({ id })));
                checkedItems.pois.forEach(id => promises.push(deletePoiMut.mutateAsync({ id })));
                checkedItems.olts.forEach(id => promises.push(deleteOltElementMut.mutateAsync({ id })));
                try {
                  await Promise.all(promises);
                  toast.success(`${totalChecked} item${totalChecked !== 1 ? 's' : ''} excluído${totalChecked !== 1 ? 's' : ''} com sucesso`);
                  clearCheckedItems();
                  setBulkDeleteConfirmOpen(false);
                  refetchGroups();
                } catch (e: any) {
                  toast.error(e.message ?? 'Erro ao excluir itens');
                }
              }}
            >
              Excluir {totalChecked} item{totalChecked !== 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Painel de detalhes CEO/CTO sobreposto ao mapa (redimensionável) ── */}
      <ResizableDetailPanel
        open={detailPanel !== null}
        onClose={() => setDetailPanel(null)}
        title={detailPanel?.type === "cto" ? "Detalhes da CTO" : "Detalhes da CEO"}
      >
        {detailPanel !== null && (
          <iframe
            key={`${detailPanel.type}-${detailPanel.id}`}
            src={detailPanel.type === "cto" ? tenantUrl(`/cto/${detailPanel.id}`) : tenantUrl(`/ceo/${detailPanel.id}`)}
            className="w-full border-0"
            style={{ height: "calc(100vh - 56px)", minHeight: 600 }}
            title={detailPanel.type === "cto" ? `CTO ${detailPanel.id}` : `CEO ${detailPanel.id}`}
          />
        )}
      </ResizableDetailPanel>
    </div>
  );
}
