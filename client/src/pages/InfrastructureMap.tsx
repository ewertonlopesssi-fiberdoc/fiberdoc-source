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
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Map, Download, Plus, X, Eye, EyeOff, Loader2,
  Radio, Box, Cable, Navigation, Users, Trash2,
  FileDown, MousePointer2, Search, Layers, Upload,
  Folder, FolderPlus, FolderOpen, ChevronRight, Check, Tag,
  Pencil, Link2, Link2Off, GitMerge, AlertTriangle, FileText, Unlink, RefreshCw,
  Lock, Unlock, ExternalLink, Move, CheckCircle2,
  Zap, Crosshair, MapPin, Copy
} from "lucide-react";
import L from "leaflet";
import { unzipSync, strFromU8 } from "fflate";

// Cores padrão de fibras ópticas (norma ABNT NBR 14772)
const FIBER_VIA_COLORS: Record<number, string> = {
  1: "#3b82f6",   // azul
  2: "#f97316",   // laranja
  3: "#22c55e",   // verde
  4: "#92400e",   // marrom
  5: "#6b7280",   // cinza
  6: "#f3f4f6",   // branco
  7: "#ef4444",   // vermelho
  8: "#111827",   // preto
  9: "#eab308",   // amarelo
  10: "#8b5cf6",  // violeta
  11: "#ec4899",  // rosa
  12: "#06b6d4",  // aqua/turquesa
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
type SidePanelContent = { kind: "element"; element: MapElement } | { kind: "route"; route: MapRoute } | null;

const STATUS_COLOR: Record<string, string> = {
  active: "#22c55e", maintenance: "#f59e0b", inactive: "#ef4444",
};

function createLeafletIcon(
  type: "ceo" | "cto",
  status: string,
  name: string,
  selected = false,
  onuBadge?: { total: number; online?: number } | null,
  customColor?: string | null
) {
  const color = customColor ?? STATUS_COLOR[status] ?? "#6b7280";
  const outline = selected ? "3px solid #22d3ee" : "3px solid white";
  const shape = type === "cto"
    ? `<rect x="3" y="3" width="18" height="18" rx="2" fill="white"/>`
    : `<circle cx="12" cy="12" r="7" fill="white"/>`;
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
  const iconHtml = `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;"><div style="width:28px;height:28px;background:${color};border:${outline};border-radius:${type === "cto" ? "4px" : "50%"};box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;"><svg width="14" height="14" viewBox="0 0 24 24">${shape}</svg></div><div style="background:rgba(0,0,0,0.75);color:white;font-size:10px;font-weight:600;padding:1px 4px;border-radius:3px;margin-top:2px;white-space:nowrap;max-width:80px;overflow:hidden;text-overflow:ellipsis;">${safeName}</div>${badgeHtml}</div>`;
  return L.divIcon({ html: iconHtml, className: "", iconSize: [80, onuBadge && onuBadge.total > 0 ? 58 : 46], iconAnchor: [40, 14] });
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
  const isAdmin = user?.role === "admin";

  const utils = trpc.useUtils();
  const { data: elements = [], refetch: refetchElements } = trpc.infraMap.elements.useQuery();
  const { data: routes = [], refetch: refetchRoutes } = trpc.infraMap.routes.useQuery();
  const { data: routesOccupancy = [] } = trpc.infraMap.routesOccupancy.useQuery();
  const { data: ctos = [], refetch: refetchCtos } = trpc.ctos.list.useQuery();
  const { data: ceosRaw = [], refetch: refetchCeos } = trpc.ceos.list.useQuery({});
  const ceos = ceosRaw as any[];
  const { data: sysConfig } = trpc.systemConfig.get.useQuery();
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
    const pct = occupancyMap[routeId];
    if (pct === undefined) return baseColor;
    if (pct === 0) return "#22c55e";        // verde — livre
    if (pct < 50)  return "#22d3ee";        // ciano — uso baixo
    if (pct < 80)  return "#eab308";        // amarelo — parcial
    if (pct < 100) return "#f97316";        // laranja — quase saturado
    return "#ef4444";                       // vermelho — saturado
  }, [occupancyMap]);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Record<number, L.Marker>>({});
  const polylinesRef = useRef<Record<number, L.Polyline>>({});
  const routeLabelsRef = useRef<Record<number, L.Marker>>({});
  const previewPolylineRef = useRef<L.Polyline | null>(null);
  const mousePolylineRef = useRef<L.Polyline | null>(null);
  const drawingMarkersRef = useRef<L.CircleMarker[]>([]);
  const [mapReady, setMapReady] = useState(false);

  const [sidePanel, setSidePanel] = useState<SidePanelContent>(null);
  const [showCeos, setShowCeos] = useState(true);
  const [showCtos, setShowCtos] = useState(true);
  const [showRoutes, setShowRoutes] = useState(true);
  // Modo edição: quando false, os markers ficam bloqueados (não arrastáveis)
  const [editMode, setEditMode] = useState(false);
  // Elemento em modo de mover individualmente (drag individual sem modo edição global)
  const [movingElementId, setMovingElementId] = useState<number | null>(null);
  // Posição pendente após drag — aguarda confirmação do utilizador
  const [pendingMovePos, setPendingMovePos] = useState<{ id: number; lat: number; lng: number } | null>(null);
  // Painel de detalhes sobreposto ao mapa (Sheet)
  const [detailPanel, setDetailPanel] = useState<{ type: "ceo" | "cto"; id: number } | null>(null);
  const [addingMode, setAddingMode] = useState<"ceo" | "cto" | null>(null);
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
  const [exportFormat, setExportFormat] = useState<"kml" | "kmz">("kmz");
  const [exportLoading, setExportLoading] = useState(false);
  const [exportSelectedElements, setExportSelectedElements] = useState<Set<number>>(new Set());
  const [exportSelectedRoutes, setExportSelectedRoutes] = useState<Set<number>>(new Set());
  const [exportSelectAll, setExportSelectAll] = useState(true);
  const [exportIncludeFibers, setExportIncludeFibers] = useState(false);
  const [exportTypeCto, setExportTypeCto] = useState(true);
  const [exportTypeCeo, setExportTypeCeo] = useState(true);
  const [exportTypeCabo, setExportTypeCabo] = useState(true);
  const [groupSelectMode, setGroupSelectMode] = useState(false);
  const [groupSelectedElements, setGroupSelectedElements] = useState<Set<number>>(new Set());
  const [groupSelectedRoutes, setGroupSelectedRoutes] = useState<Set<number>>(new Set());
  const [pickDialogOpen, setPickDialogOpen] = useState(false);
  const [pickDialogType, setPickDialogType] = useState<"ceo" | "cto">("cto");
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
  const [kmlImportResult, setKmlImportResult] = useState<{ added: number; skipped: number; errors: string[] } | null>(null);
  const kmlFileRef = useRef<HTMLInputElement | null>(null);
  // Pré-visualização KML
  type KmlPreviewItem = {
    id: string;
    name: string;
    type: "cto" | "ceo" | "cabo";
    color: string | null;
    lat: number | null;
    lng: number | null;
    path: string | null;
    fiberName: string | null;
    include: boolean;
  };
  const [kmlPreviewItems, setKmlPreviewItems] = useState<KmlPreviewItem[]>([]);
  const [kmlPreviewOpen, setKmlPreviewOpen] = useState(false);
  const [kmlImportingPreview, setKmlImportingPreview] = useState(false);
  const [kmlPreviewFilter, setKmlPreviewFilter] = useState<"all" | "cto" | "ceo" | "cabo">("all");

  // ─── Edição de Traçado de Cabo ────────────────────────────────────────────
  const [editingRouteId, setEditingRouteId] = useState<number | null>(null);
  const [editingRoutePath, setEditingRoutePath] = useState<{ lat: number; lng: number }[]>([]);
  const editRouteMarkersRef = useRef<L.CircleMarker[]>([]);
  const editRouteMidMarkersRef = useRef<L.CircleMarker[]>([]);
  const editRoutePolylineRef = useRef<L.Polyline | null>(null);
  const editingRoutePathRef = useRef<{ lat: number; lng: number }[]>([]);
  // Snap: IDs dos elementos vinculados durante edição (podem mudar ao arrastar endpoints)
  const snapFromIdRef = useRef<number | null>(null);
  const snapToIdRef = useRef<number | null>(null);
  const snapIndicatorRef = useRef<L.CircleMarker | null>(null);

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

  // Grupos/Pastas
  const { data: mapGroups = [], refetch: refetchGroups } = trpc.mapGroups.list.useQuery();
  const [groupsPanelOpen, setGroupsPanelOpen] = useState(false);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupForm, setGroupForm] = useState({ name: "", color: "#6366f1", description: "" });
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [activeGroupFilter, setActiveGroupFilter] = useState<number | null>(null);
  const [assignGroupDialogOpen, setAssignGroupDialogOpen] = useState(false);
  const [assignGroupId, setAssignGroupId] = useState<number | null>(null);

  const createGroupMut = trpc.mapGroups.create.useMutation({
    onSuccess: () => { refetchGroups(); setGroupDialogOpen(false); setGroupForm({ name: "", color: "#6366f1", description: "" }); toast.success("Grupo criado"); },
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

  const toggleGroupSelectMode = useCallback(() => {
    setGroupSelectMode(v => {
      if (v) { setGroupSelectedElements(new Set()); setGroupSelectedRoutes(new Set()); }
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
  const selectAllGroup = useCallback(() => {
    setGroupSelectedElements(new Set((elements as any[]).map((e: any) => e.id)));
    setGroupSelectedRoutes(new Set((routes as any[]).map((r: any) => r.id)));
  }, [elements, routes]);
  const clearGroupSelection = useCallback(() => { setGroupSelectedElements(new Set()); setGroupSelectedRoutes(new Set()); }, []);
  const groupTotalSelected = groupSelectedElements.size + groupSelectedRoutes.size;

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
      otdrPolylineRef.current?.remove();
      otdrPolylineRef.current = null;
      otdrMarkerRef.current?.remove();
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
    otdrPolylineRef.current?.remove();
    otdrMarkerRef.current?.remove();
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

  // Auto-expandir todos os tubos quando carregados no painel lateral
  useEffect(() => {
    const tubes = (sidePanelType === "cto" ? ctoTubesQuery.data : ceoTubesQuery.data) as any[] | undefined;
    if (tubes && tubes.length > 0) {
      setExpandedTubeIds(new Set(tubes.map((t: any) => t.id)));
    }
  }, [ctoTubesQuery.data, ceoTubesQuery.data, sidePanelType]);

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
    mapRef.current = map;
    setMapReady(true);
    // Forçar recalculo do tamanho após mount (corrige mapa em branco após F5)
    setTimeout(() => { map.invalidateSize(); }, 100);
    setTimeout(() => { map.invalidateSize(); }, 500);
    return () => { map.remove(); mapRef.current = null; tileLayerRef.current = null; };
  }, []);

  // Renderizar marcadores
  const renderMarkers = useCallback(() => {
    if (!mapRef.current || !mapReady) return;
    Object.values(markersRef.current).forEach(m => m.remove());
    markersRef.current = {};
    (elements as any[]).forEach((el: any) => {
      const isCto = el.type === "cto";
      if (isCto && !showCtos) return;
      if (!isCto && !showCeos) return;
      const ref = isCto ? (ctos as any[]).find((c: any) => c.id === el.referenceId) : ceos.find((c: any) => c.id === el.referenceId);
      const name = ref?.name ?? (isCto ? `CTO-${el.referenceId}` : `CEO-${el.referenceId}`);
      const status = ref?.status ?? "active";
      const isSelected = groupSelectedElements.has(el.id);
      // Badge de ONUs: usar sgpId da CTO para buscar contagem no onuCountMap
      const sgpIdForBadge = isCto ? (ref?.sgpId ?? null) : null;
      const onuBadgeData = sgpIdForBadge != null ? (onuCountMap[sgpIdForBadge] ?? null) : null;
      const icon = createLeafletIcon(el.type, status, name, isSelected, onuBadgeData, el.color ?? null);
      // Drag só ativo em modo edição global OU quando este elemento específico está em modo mover
      const isDraggable = isAdmin && (editMode || movingElementId === el.id);
      const marker = L.marker([Number(el.lat), Number(el.lng)], { icon, draggable: isDraggable }).addTo(mapRef.current!);
      if (isAdmin) {
        marker.on("dragend", () => {
          if (!editMode && movingElementId !== el.id) return;
          const pos = marker.getLatLng();
          if (movingElementId === el.id) {
            // Modo mover individual: guardar posição pendente, aguardar confirmação
            setPendingMovePos({ id: el.id, lat: pos.lat, lng: pos.lng });
          } else {
            // Modo edição global: salvar imediatamente
            upsertElementMut.mutate({ type: el.type, referenceId: el.referenceId, lat: pos.lat, lng: pos.lng });
          }
        });
      }
      marker.on("click", () => {
        if (groupSelectMode) { toggleGroupElement(el.id); return; }
        if (addingRouteMode) {
          const pos = marker.getLatLng();
          setDrawingPath(prev => [...prev, { lat: pos.lat, lng: pos.lng }]);
          toast.info(`Ponto adicionado: ${name}`);
          return;
        }
        // Modo OTDR: seleccionar elemento de partida
        if (otdrMode) {
          setOtdrElementId(el.id);
          setOtdrTubeId("");
          setOtdrViaNumber("");
          setOtdrResult(null);
          setOtdrPanelOpen(true);
          toast.info(`OTDR: ${name} seleccionado como ponto de partida`);
          return;
        }
        setSidePanel({ kind: "element", element: { ...el, name, status, capacity: ref?.capacity, usedPorts: ref?.usedPorts, sgpId: ref?.sgpId ?? null, color: el.color ?? null } });
      });
      markersRef.current[el.id] = marker;
    });
  }, [elements, ctos, ceos, showCeos, showCtos, mapReady, addingRouteMode, groupSelectMode, groupSelectedElements, toggleGroupElement, isAdmin, editMode, movingElementId, onuCountMap, otdrMode]);

  // Renderizar rotas
  const renderRoutes = useCallback(() => {
    if (!mapRef.current || !mapReady) return;
    Object.values(polylinesRef.current).forEach(p => p.remove());
    polylinesRef.current = {};
    Object.values(routeLabelsRef.current).forEach(m => m.remove());
    routeLabelsRef.current = {};
    if (!showRoutes) return;
    (routes as any[]).forEach((r: any) => {
      const fromEl = (elements as any[]).find((e: any) => e.id === r.fromElementId);
      const toEl = (elements as any[]).find((e: any) => e.id === r.toElementId);
      const latlngs: L.LatLngExpression[] = [];
      if (fromEl) latlngs.push([Number(fromEl.lat), Number(fromEl.lng)]);
      if (r.path) { try { (JSON.parse(r.path) as any[]).forEach((pt: any) => latlngs.push([pt.lat, pt.lng])); } catch {} }
      if (toEl) latlngs.push([Number(toEl.lat), Number(toEl.lng)]);
      if (latlngs.length < 2) return;
      const isSelected = groupSelectedRoutes.has(r.id);
      // Ocultar a polyline da rota que está sendo editada (evita duplicação)
      const isBeingEdited = r.id === editingRouteId;
      // Cor baseada na ocupação de fibras
      const routeColor = getOccupancyColor(r.id, r.color ?? "#22d3ee");
      const polyline = L.polyline(latlngs, { color: routeColor, weight: isSelected ? 6 : 3, opacity: isBeingEdited ? 0 : 0.9 }).addTo(mapRef.current!);
      polyline.on("click", () => {
        if (groupSelectMode) { toggleGroupRoute(r.id); return; }
        setSidePanel({ kind: "route", route: r });
      });
      polylinesRef.current[r.id] = polyline;
      // Rótulo de distância no ponto médio do cabo
      const distMeters = haversineDistance(latlngs);
      const distText = formatDistance(distMeters);
      const midIdx = Math.floor(latlngs.length / 2);
      const midPt = latlngs[midIdx] as [number, number];
      const labelIcon = L.divIcon({
        html: `<div style="background:rgba(0,0,0,0.72);color:#fff;font-size:10px;font-weight:600;padding:2px 5px;border-radius:4px;white-space:nowrap;pointer-events:none;border:1px solid rgba(255,255,255,0.15);">${distText}</div>`,
        className: "", iconSize: [0, 0], iconAnchor: [0, 0],
      });
      const labelMarker = L.marker(midPt, { icon: labelIcon, interactive: false, keyboard: false, opacity: isBeingEdited ? 0 : 1 } as any).addTo(mapRef.current!);
      routeLabelsRef.current[r.id] = labelMarker;
    });
  }, [routes, elements, showRoutes, mapReady, groupSelectMode, groupSelectedRoutes, toggleGroupRoute, editingRouteId, occupancyMap, getOccupancyColor]);

  useEffect(() => { renderMarkers(); }, [renderMarkers]);
  useEffect(() => { renderRoutes(); }, [renderRoutes]);

  // Modo de adição de elemento
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const map = mapRef.current;
    if (!addingMode) { map.getContainer().style.cursor = ""; return; }
    map.getContainer().style.cursor = "crosshair";
    const handler = (e: L.LeafletMouseEvent) => {
      setPickDialogType(addingMode); setPickDialogLat(e.latlng.lat); setPickDialogLng(e.latlng.lng);
      setPickSelectedId(null); setPickCreateNew(false); setPickNewName(""); setPickNewAddress(""); setPickNewCapacity(8);
      setPickDialogOpen(true); setAddingMode(null); map.getContainer().style.cursor = "";
    };
    map.once("click", handler);
    return () => { map.off("click", handler); map.getContainer().style.cursor = ""; };
  }, [addingMode, mapReady]);

  // Traçado livre — prévia
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    if (!addingRouteMode) {
      if (previewPolylineRef.current) { previewPolylineRef.current.remove(); previewPolylineRef.current = null; }
      if (mousePolylineRef.current) { mousePolylineRef.current.remove(); mousePolylineRef.current = null; }
      drawingMarkersRef.current.forEach(m => m.remove()); drawingMarkersRef.current = [];
      return;
    }
    if (!previewPolylineRef.current) {
      previewPolylineRef.current = L.polyline([], { color: "#22d3ee", weight: 3, opacity: 0.9 }).addTo(mapRef.current!);
    }
    previewPolylineRef.current.setLatLngs(drawingPath.map(p => [p.lat, p.lng]));
    drawingMarkersRef.current.forEach(m => m.remove()); drawingMarkersRef.current = [];
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
    editRouteMarkersRef.current.forEach(m => m.remove());
    editRouteMarkersRef.current = [];
    editRouteMidMarkersRef.current.forEach(m => m.remove());
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
      }).addTo(mapRef.current!);

      // Arrastar vértice (com snap ao CEO/CTO mais próximo para endpoints)
      // Suporta mouse E touch events
      const SNAP_THRESHOLD_DEG = 0.008; // ~800m em graus
      let dragging = false;

      // Helper: converter clientX/Y para LatLng do mapa
      const clientToLatLng = (clientX: number, clientY: number): { lat: number; lng: number } | null => {
        if (!mapRef.current) return null;
        const rect = mapRef.current.getContainer().getBoundingClientRect();
        const pt = L.point(clientX - rect.left, clientY - rect.top);
        const ll = mapRef.current.containerPointToLatLng(pt);
        return { lat: ll.lat, lng: ll.lng };
      };

      // Lógica comum de movimento (mouse ou touch)
      const handleDragMove = (rawLat: number, rawLng: number) => {
        let moveLat = rawLat;
        let moveLng = rawLng;
        let snappedEl: any = null;
        // Snap activo para TODOS os pontos (não apenas endpoints)
        {
          let bestDist = SNAP_THRESHOLD_DEG;
          (elements as any[]).forEach((el: any) => {
            const d = Math.hypot(moveLat - Number(el.lat), moveLng - Number(el.lng));
            if (d < bestDist) { bestDist = d; snappedEl = el; }
          });
          if (snappedEl) { moveLat = Number(snappedEl.lat); moveLng = Number(snappedEl.lng); }
        }
        cm.setLatLng([moveLat, moveLng]);
        const newPath = [...editingRoutePathRef.current];
        newPath[idx] = { lat: moveLat, lng: moveLng };
        editingRoutePathRef.current = newPath;
        if (editRoutePolylineRef.current) {
          editRoutePolylineRef.current.setLatLngs(newPath.map(p => [p.lat, p.lng] as L.LatLngExpression));
        }
        if (snapIndicatorRef.current) { snapIndicatorRef.current.remove(); snapIndicatorRef.current = null; }
        if (snappedEl && mapRef.current) {
          // Indicador verde para snap em elemento
          const snapColor = isEndpoint ? "#22c55e" : "#f59e0b"; // verde para endpoints, âmbar para pontos do meio
          snapIndicatorRef.current = L.circleMarker([moveLat, moveLng], {
            radius: 14, color: snapColor, fillColor: snapColor, fillOpacity: 0.25, weight: 3,
          }).addTo(mapRef.current);
        }
        editRouteMidMarkersRef.current.forEach(m => m.remove());
        editRouteMidMarkersRef.current = [];
        renderMidpoints(newPath, routeColor);
      };

      // Lógica comum de fim de drag
      const handleDragEnd = () => {
        if (!dragging) return;
        dragging = false;
        mapRef.current!.dragging.enable();
        if (snapIndicatorRef.current) { snapIndicatorRef.current.remove(); snapIndicatorRef.current = null; }
        // Usar a posição actual do marcador (não o idx que pode estar desactualizado)
        const cmLatLng = cm.getLatLng();
        const finalLat = cmLatLng.lat;
        const finalLng = cmLatLng.lng;
        // Detectar snap com a mesma tolerância usada no handleDragMove
        let snappedId: number | null = null;
        let snappedEl: any = null;
        {
          let bestDist = SNAP_THRESHOLD_DEG;
          (elements as any[]).forEach((el: any) => {
            const d = Math.hypot(finalLat - Number(el.lat), finalLng - Number(el.lng));
            if (d < bestDist) { bestDist = d; snappedEl = el; snappedId = el.id; }
          });
        }
        // Encontrar o índice actual do ponto no array (pode ter mudado)
        let currentIdx = idx;
        const pts = editingRoutePathRef.current;
        // Procurar o índice do ponto mais próximo da posição actual do marcador
        let minDist = Infinity;
        pts.forEach((p, i) => {
          const d = Math.hypot(p.lat - finalLat, p.lng - finalLng);
          if (d < minDist) { minDist = d; currentIdx = i; }
        });
        const isCurrentEndpoint = currentIdx === 0 || currentIdx === pts.length - 1;
        if (isCurrentEndpoint) {
          // Endpoints: actualizar snap normal
          if (currentIdx === 0) snapFromIdRef.current = snappedId;
          else snapToIdRef.current = snappedId;
        } else if (snappedId !== null && snappedEl !== null) {
          // Ponto do meio arrastado para cima de um elemento:
          // Tornar este ponto uma nova extremidade
          const isCloserToStart = currentIdx < pts.length / 2;
          if (isCloserToStart) {
            // Truncar: manter apenas do ponto arrastado até ao fim
            const newPath = pts.slice(currentIdx);
            editingRoutePathRef.current = newPath;
            snapFromIdRef.current = snappedId;
            toast.success(`Origem vinculada a "${snappedEl.name ?? `El. ${snappedId}`}"`);
          } else {
            // Truncar: manter apenas do início até ao ponto arrastado
            const newPath = pts.slice(0, currentIdx + 1);
            editingRoutePathRef.current = newPath;
            snapToIdRef.current = snappedId;
            toast.success(`Destino vinculado a "${snappedEl.name ?? `El. ${snappedId}`}"`);
          }
          setEditingRoutePath([...editingRoutePathRef.current]);
          renderEditRouteMarkers([...editingRoutePathRef.current], routeColor);
          return;
        }
        setEditingRoutePath([...editingRoutePathRef.current]);
      };

      // ── Mouse events ──────────────────────────────────────────────────────
      cm.on("mousedown", (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        dragging = true;
        mapRef.current!.dragging.disable();
        const onMove = (ev: L.LeafletMouseEvent) => { if (dragging) handleDragMove(ev.latlng.lat, ev.latlng.lng); };
        const onUp = () => {
          mapRef.current!.off("mousemove", onMove);
          mapRef.current!.off("mouseup", onUp);
          handleDragEnd();
        };
        mapRef.current!.on("mousemove", onMove);
        mapRef.current!.on("mouseup", onUp);
      });

      // ── Touch events ──────────────────────────────────────────────────────
      const cmEl = (cm as any).getElement?.();
      if (cmEl) {
        cmEl.addEventListener("touchstart", (e: TouchEvent) => {
          e.stopPropagation();
          e.preventDefault();
          dragging = true;
          mapRef.current!.dragging.disable();
        }, { passive: false });
        cmEl.addEventListener("touchmove", (e: TouchEvent) => {
          if (!dragging) return;
          e.stopPropagation();
          e.preventDefault();
          const touch = e.touches[0];
          const ll = clientToLatLng(touch.clientX, touch.clientY);
          if (ll) handleDragMove(ll.lat, ll.lng);
        }, { passive: false });
        cmEl.addEventListener("touchend", (e: TouchEvent) => {
          e.stopPropagation();
          handleDragEnd();
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
    editRouteMidMarkersRef.current.forEach(m => m.remove());
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
    const fromEl = (elements as any[]).find((e: any) => e.id === newFromId);
    const toEl   = (elements as any[]).find((e: any) => e.id === newToId);
    // Remover os endpoints (fromEl e toEl) do path salvo — eles são inferidos pelos elementos
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
      fromElementId: newFromId ?? undefined,
      toElementId: newToId ?? undefined,
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
        { attribution: "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community", maxZoom: 19 }
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
      doc.querySelectorAll("Style").forEach(style => {
        const id = style.getAttribute("id");
        const href = style.querySelector("IconStyle > Icon > href")?.textContent ?? "";
        if (id) styleIconMap["#" + id] = href.toLowerCase();
        const kmlColor = style.querySelector("LineStyle > color")?.textContent?.trim();
        if (id && kmlColor && kmlColor.length === 8) {
          const rr = kmlColor.slice(6, 8); const gg = kmlColor.slice(4, 6); const bb = kmlColor.slice(2, 4);
          styleColorMap["#" + id] = `#${rr}${gg}${bb}`;
        }
      });
      const kmlColorToHex = (kmlColor: string): string | null => {
        if (!kmlColor || kmlColor.length !== 8) return null;
        const rr = kmlColor.slice(6, 8); const gg = kmlColor.slice(4, 6); const bb = kmlColor.slice(2, 4);
        return `#${rr}${gg}${bb}`;
      };
      const extractFiberName = (rawName: string, desc: string): string => {
        const pattern = /^(.+?)\s+(?:para|sentido|sent)\s+/i;
        const namePara = rawName.match(pattern);
        if (namePara) return namePara[1].trim();
        const descPara = desc.match(pattern);
        if (descPara) return descPara[1].trim();
        return rawName;
      };
      const detectType = (pm: Element, folderName: string): "cto" | "ceo" | "cabo" | null => {
        const name = pm.querySelector("name")?.textContent?.trim().toLowerCase() ?? "";
        const desc = pm.querySelector("description")?.textContent?.toLowerCase() ?? "";
        const styleUrl = pm.querySelector("styleUrl")?.textContent?.trim() ?? "";
        const iconHref = styleIconMap[styleUrl] ?? "";
        const folderLower = folderName.toLowerCase();
        const hasLine = !!pm.querySelector("LineString");
        if (hasLine) {
          const isCabo = name.includes("cabo") || name.includes("fibra") || name.includes("caminho") ||
            desc.includes("cabo") || desc.includes("fibra") || folderLower.includes("cabo") ||
            folderLower.includes("fibra") || folderLower.includes("caminho");
          return isCabo ? "cabo" : null;
        }
        if (folderLower.includes("cto") || folderLower.includes("splitter")) return "cto";
        if (folderLower.includes("ceo") || folderLower.includes("caixa")) return "ceo";
        if (iconHref.includes("square") || iconHref.includes("cto")) return "cto";
        if (iconHref.includes("donut") || iconHref.includes("ceo")) return "ceo";
        if (name.includes("cto") || desc.includes("cto") || name.startsWith("sp ")) return "cto";
        if (name.includes("ceo") || desc.includes("ceo")) return "ceo";
        return "ceo";
      };
      const getFolderName = (pm: Element): string => {
        let parent = pm.parentElement;
        while (parent) {
          if (parent.tagName === "Folder") return parent.querySelector(":scope > name")?.textContent?.trim() ?? "";
          parent = parent.parentElement;
        }
        return "";
      };
      const placemarks = Array.from(doc.querySelectorAll("Placemark"));
      const items: KmlPreviewItem[] = [];
      let idx = 0;
      for (const pm of placemarks) {
        const name = pm.querySelector("name")?.textContent?.trim() ?? "";
        const folderName = getFolderName(pm);
        const type = detectType(pm, folderName);
        if (!type) continue;
        if (type === "cabo") {
          const coordsText = pm.querySelector("LineString > coordinates")?.textContent?.trim() ?? "";
          if (!coordsText) continue;
          const pathPoints = coordsText.trim().split(/\s+/).map(c => {
            const p = c.split(","); return { lat: parseFloat(p[1]), lng: parseFloat(p[0]) };
          }).filter(p => !isNaN(p.lat) && !isNaN(p.lng));
          if (pathPoints.length < 2) continue;
          const desc = pm.querySelector("description")?.textContent?.trim() ?? "";
          const fiberName = extractFiberName(name || `Cabo-KML-${idx + 1}`, desc);
          const styleUrl = pm.querySelector("styleUrl")?.textContent?.trim() ?? "";
          const inlineColor = pm.querySelector("LineStyle > color")?.textContent?.trim();
          const cableColor = (inlineColor ? kmlColorToHex(inlineColor) : null) ?? styleColorMap[styleUrl] ?? "#22d3ee";
          items.push({ id: `kml-${idx}`, name: fiberName, type: "cabo", color: cableColor, lat: null, lng: null, path: JSON.stringify(pathPoints), fiberName, include: true });
        } else {
          const coordText = pm.querySelector("Point > coordinates")?.textContent?.trim();
          if (!coordText) continue;
          const parts = coordText.split(",");
          if (parts.length < 2) continue;
          const lng = parseFloat(parts[0]); const lat = parseFloat(parts[1]);
          if (isNaN(lat) || isNaN(lng)) continue;
          items.push({ id: `kml-${idx}`, name: name || `${type.toUpperCase()}-KML-${idx + 1}`, type, color: null, lat, lng, path: null, fiberName: null, include: true });
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
    let added = 0; const errors: string[] = [];
    for (const item of toImport) {
      try {
        if (item.type === "cabo") {
          await createRouteMut.mutateAsync({ name: item.name, path: item.path!, fiberCount: 12, cableType: "FO", color: item.color ?? "#22d3ee" });
          added++;
        } else if (item.type === "cto") {
          const cto = await createCtoMut.mutateAsync({ name: item.name, capacity: 8, lat: item.lat!, lng: item.lng! });
          await upsertElementMut.mutateAsync({ type: "cto", referenceId: (cto as any).id, lat: item.lat!, lng: item.lng! });
          added++;
        } else {
          const ceo = await createCeoMut.mutateAsync({ name: item.name, location: "" });
          await upsertElementMut.mutateAsync({ type: "ceo", referenceId: (ceo as any).id, lat: item.lat!, lng: item.lng! });
          added++;
        }
      } catch (e: any) { errors.push(`${item.name}: ${e.message}`); }
    }
    setKmlImportingPreview(false);
    setKmlPreviewOpen(false);
    setKmlPreviewItems([]);
    setKmlImportResult({ added, skipped: kmlPreviewItems.length - toImport.length, errors });
    setKmlImportOpen(true);
    if (added > 0) { refetchElements(); refetchRoutes?.(); toast.success(`${added} elemento${added !== 1 ? "s" : ""} importado${added !== 1 ? "s" : ""} do KML/KMZ`); }
    else toast.error("Nenhum elemento importado");
  }, [kmlPreviewItems, createCtoMut, createCeoMut, upsertElementMut, createRouteMut, refetchElements, refetchRoutes]);

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
      const elementIds = exportSelectAll ? undefined : Array.from(exportSelectedElements);
      const routeIds = exportSelectAll ? undefined : Array.from(exportSelectedRoutes);
      // Usar endpoint HTTP directo para evitar limitações do tRPC batch link com payloads grandes
      const resp = await fetch("/api/export-kml", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ format: exportFormat, elementIds, routeIds, includeFibers: exportIncludeFibers, exportTypes: { cto: exportTypeCto, ceo: exportTypeCeo, cabo: exportTypeCabo } }),
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
    try {
      if (pickCreateNew) {
        if (!pickNewName.trim()) { toast.error("Informe o nome"); return; }
        if (pickDialogType === "cto") {
          const cto = await createCtoMut.mutateAsync({ name: pickNewName, address: pickNewAddress || undefined, capacity: pickNewCapacity, lat: pickDialogLat, lng: pickDialogLng });
          await upsertElementMut.mutateAsync({ type: "cto", referenceId: (cto as any).id, lat: pickDialogLat, lng: pickDialogLng });
        } else {
          const ceo = await createCeoMut.mutateAsync({ name: pickNewName, location: pickNewAddress || undefined });
          await upsertElementMut.mutateAsync({ type: "ceo", referenceId: (ceo as any).id, lat: pickDialogLat, lng: pickDialogLng });
        }
        toast.success(`${pickDialogType.toUpperCase()} criado e adicionado ao mapa`);
      } else {
        if (!pickSelectedId) { toast.error("Selecione um item"); return; }
        await upsertElementMut.mutateAsync({ type: pickDialogType, referenceId: pickSelectedId, lat: pickDialogLat, lng: pickDialogLng });
        toast.success(`${pickDialogType.toUpperCase()} adicionado ao mapa`);
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
    setGroupSelectedElements(new Set()); setGroupSelectedRoutes(new Set());
    refetchElements(); refetchRoutes(); toast.success("Itens excluídos");
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
          {/* Selecção de tubo inline */}
          {(fromEl || toEl) && (
            <div className="border border-border rounded-lg p-3 space-y-2.5">
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
                  title="Desvincular extremidade de origem"
                  onClick={() => {
                    updateRouteMut.mutate({ id: r.id, fromElementId: null });
                    setSidePanel({ kind: "route", route: { ...r, fromElementId: 0 } });
                  }}
                >
                  <Unlink className="w-3 h-3" /> Orig.
                </Button>
              ) : null}
              {r.toElementId ? (
                <Button
                  variant="outline" size="sm"
                  className="flex-1 gap-1 border-orange-500/40 text-orange-400 hover:bg-orange-500/10 text-xs"
                  disabled={updateRouteMut.isPending}
                  title="Desvincular extremidade de destino"
                  onClick={() => {
                    updateRouteMut.mutate({ id: r.id, toElementId: null });
                    setSidePanel({ kind: "route", route: { ...r, toElementId: 0 } });
                  }}
                >
                  <Unlink className="w-3 h-3" /> Dest.
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
            href={isCto ? `/cto/${el.referenceId}` : `/ceo/${el.referenceId}`}
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
            {pendingMovePos?.id === el.id && (
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
              const fusedVias = allVias.filter((v: any) => v.fusedToViaId !== null).length;
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
                const fused = vias.filter((v: any) => v.fusedToViaId !== null).length;
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
                    const bg = idx % 2 === 0 ? "#fff" : "#f8f9fa";
                    const lbl = via.label ? "<b>" + escH(via.label) + "</b>" : "<span style='color:#9ca3af;font-style:italic'>&mdash;</span>";
                    const st = ok ? "<span style='background:#d1fae5;color:#059669;padding:1px 5px;border-radius:3px;font-size:7pt;font-weight:700'>FUSIONADA</span>" : "<span style='background:#f3f4f6;color:#9ca3af;padding:1px 5px;border-radius:3px;font-size:7pt'>LIVRE</span>";
                    const fc = ok ? "#059669" : "#9ca3af";
                    const ft2 = ok ? "VIA " + fv!.viaNumber + " do " + escH(ft!.identifier) + (fv!.label ? " (" + escH(fv!.label) + ")" : "") : "&mdash;";
                    const vc = PRINT_VIA_COLORS[via.viaNumber];
                    const vc2 = vc ? `<span style='background:${vc.bg};color:${vc.text};border:1px solid ${vc.border};padding:2px 7px;border-radius:3px;font-size:8pt;font-weight:700'>${via.viaNumber}</span>` : `<b>${via.viaNumber}</b>`;
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
                    <th style="width:10%">VIA</th><th style="width:25%">ETIQUETA</th><th>OBSERVA&Ccedil;&Otilde;ES</th>
                  </tr></thead><tbody>
                  ${vias.map((via: any, idx: number) => {
                    const bg = idx % 2 === 0 ? "#fff" : "#f8f9fa";
                    const lbl = via.label ? "<b>" + escH2(via.label) + "</b>" : "<span style='color:#9ca3af;font-style:italic'>&mdash;</span>";
                    const viaLabel = via.viaNumber === 0 ? "ENT" : String(via.viaNumber).padStart(2, "0");
                    return `<tr style='background:${bg}'><td style='text-align:center;font-weight:700;color:#7c3aed'>${viaLabel}</td><td>${lbl}</td><td style='font-size:8pt;color:#6b7280'>${escH2(via.notes)}</td></tr>`;
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
          return (
            <div className="border-t border-border pt-2">
              <div className="text-xs text-muted-foreground mb-2 font-medium flex items-center gap-1">
                <Layers className="w-3 h-3" /> Tubos e Vias
                {(tubeCount > 0 || splitterCount > 0) && <span className="ml-auto text-muted-foreground/60">{tubeCount} tubo{tubeCount !== 1 ? "s" : ""}{splitterCount > 0 ? ` · ${splitterCount} splitter${splitterCount !== 1 ? "s" : ""}` : ""}</span>}
                {isAdmin && (
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
              {(!tubes || tubes.length === 0) && (
                <div className="text-xs text-muted-foreground/60 italic py-1">Nenhum tubo cadastrado. Clique em "Adicionar" para criar.</div>
              )}
              <div className="space-y-1">
                {(tubes ?? []).map((tube: any) => {
                  const tubVias = (allVias ?? []).filter((v: any) => v.tubeId === tube.id);
                  const fusedCount = tubVias.filter((v: any) => v.fusedToViaId !== null).length;
                  const total = tube.totalVias;
                  const pct = total > 0 ? Math.round((fusedCount / total) * 100) : 0;
                  // NOTE: For CEO, splitters are rendered separately below
                  const isExpanded = expandedTubeIds.has(tube.id);
                  const barColor = pct >= 90 ? "#ef4444" : pct >= 60 ? "#f59e0b" : "#22c55e";
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
                            const isFused = via.fusedToViaId !== null;
                            const viaColor = FIBER_VIA_COLORS[via.viaNumber] ?? "#6b7280";
                            return (
                              <div key={via.id} className="flex items-center gap-0.5 group">
                                <button
                                  className={`flex-1 flex items-center gap-1.5 text-xs py-0.5 px-1 rounded hover:bg-accent/30 text-left transition-colors ${isFused ? "" : "hover:bg-emerald-500/10"}`}
                                  title={isFused ? "Clique para remover fusão" : "Clique para registrar fusão"}
                                  onClick={() => {
                                    if (isFused) {
                                      setClearFusionConfirm({ id: via.id, viaNumber: via.viaNumber, isCto });
                                    } else {
                                      setFusionSourceVia({ id: via.id, viaNumber: via.viaNumber, tubeId: tube.id, isCto, isFused: false, label: via.label });
                                      setFusionTargetTubeId("");
                                      setFusionTargetViaId("");
                                      setFusionDialogOpen(true);
                                    }
                                  }}
                                >
                                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isFused ? "bg-emerald-400" : "bg-muted-foreground/30"}`} />
                                  <span
                                    className="shrink-0 flex items-center gap-0.5"
                                    style={{ minWidth: "2rem" }}
                                    title={`Via ${via.viaNumber}`}
                                  >
                                    <span
                                      className="inline-block w-2 h-2 rounded-full border border-white/20 shrink-0"
                                      style={{ background: viaColor }}
                                    />
                                    <span className="text-muted-foreground">{via.viaNumber}</span>
                                  </span>
                                  {via.label
                                    ? <span className="truncate font-medium">{via.label}</span>
                                    : <span className="text-muted-foreground/50 italic">livre</span>}
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
                          <div className="px-2 pb-1.5 space-y-0.5 max-h-40 overflow-y-auto">
                            {splVias.map((via: any) => (
                              <div key={via.id} className="flex items-center gap-1.5 text-xs py-0.5 px-1 rounded hover:bg-accent/20">
                                <div className="w-1.5 h-1.5 rounded-full shrink-0 bg-purple-400/50" />
                                <span className="text-muted-foreground shrink-0" style={{ minWidth: "2rem" }}>
                                  {via.viaNumber === 0 ? "ENT" : String(via.viaNumber).padStart(2, "0")}
                                </span>
                                {via.label
                                  ? <span className="truncate font-medium">{via.label}</span>
                                  : <span className="text-muted-foreground/50 italic">{via.viaNumber === 0 ? "entrada" : "livre"}</span>}
                              </div>
                            ))}
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
        <Map className="w-4 h-4 text-primary flex-shrink-0" />
        <span className="text-sm font-medium">Mapa de Infraestrutura</span>
        <div className="w-px h-4 bg-border mx-1" />
        <Button size="sm" variant={showCeos ? "default" : "outline"} className="h-7 gap-1 text-xs" onClick={() => setShowCeos(v => !v)}>
          <Radio className="w-3 h-3" />CEOs {showCeos ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
        </Button>
        <Button size="sm" variant={showCtos ? "default" : "outline"} className="h-7 gap-1 text-xs" onClick={() => setShowCtos(v => !v)}>
          <Box className="w-3 h-3" />CTOs {showCtos ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
        </Button>
        <Button size="sm" variant={showRoutes ? "default" : "outline"} className="h-7 gap-1 text-xs" onClick={() => setShowRoutes(v => !v)}>
          <Cable className="w-3 h-3" />Cabos {showRoutes ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
        </Button>
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
            <Button size="sm" variant={addingMode === "ceo" ? "default" : "outline"} className="h-7 gap-1 text-xs" onClick={() => setAddingMode(v => v === "ceo" ? null : "ceo")}>
              <Plus className="w-3 h-3" />{addingMode === "ceo" ? "Cancelar CEO" : "Add CEO"}
            </Button>
            <Button size="sm" variant={addingMode === "cto" ? "default" : "outline"} className="h-7 gap-1 text-xs" onClick={() => setAddingMode(v => v === "cto" ? null : "cto")}>
              <Plus className="w-3 h-3" />{addingMode === "cto" ? "Cancelar CTO" : "Add CTO"}
            </Button>
            <Button size="sm" variant={addingRouteMode ? "default" : "outline"} className="h-7 gap-1 text-xs" onClick={() => { setAddingRouteMode(v => !v); setRouteFrom(null); }}>
              <Cable className="w-3 h-3" />{addingRouteMode ? "Cancelar Rota" : "Add Cabo"}
            </Button>
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
          {groupTotalSelected > 0 && isAdmin && <button onClick={handleGroupDelete} className="text-red-400 hover:text-red-300 underline text-xs">Excluir seleção</button>}
          {groupTotalSelected > 0 && <button onClick={handleGroupExport} className="text-cyan-300 hover:text-cyan-200 underline text-xs">Exportar seleção</button>}
        </div>
      )}
      {addingMode && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/30 text-amber-400 text-xs flex items-center gap-2">
          <Navigation className="w-3.5 h-3.5" />Clique no mapa para posicionar um {addingMode.toUpperCase()}
          <button onClick={() => setAddingMode(null)} className="ml-auto text-amber-300 hover:text-amber-200 underline">Cancelar</button>
        </div>
      )}
      {otdrMode && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/30 text-amber-400 text-xs flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="flex-1">
            {otdrElementId == null
              ? "Modo OTDR Virtual ativo — clique num CEO ou CTO no mapa para seleccioná-lo como ponto de partida"
              : `Elemento selecionado: ${(elements as any[]).find((e: any) => e.id === otdrElementId)?.name ?? `#${otdrElementId}`} — configure o tubo, via e distância no painel`}
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
        <div className="flex-1 relative">
          <div ref={mapContainerRef} className="w-full h-full" style={{ zIndex: 0 }} />
          <div className="absolute bottom-8 left-4 bg-background/90 backdrop-blur-sm border border-border rounded-lg p-3 text-xs space-y-1.5" style={{ zIndex: 1000 }}>
            <div className="font-semibold text-foreground mb-1">Legenda</div>
            <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full bg-emerald-500 border-2 border-white" /><span className="text-muted-foreground">Ativo</span></div>
            <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full bg-amber-500 border-2 border-white" /><span className="text-muted-foreground">Manutenção</span></div>
            <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full bg-red-500 border-2 border-white" /><span className="text-muted-foreground">Inativo</span></div>
            <div className="border-t border-border pt-1.5 mt-1">
              <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full bg-blue-400 border-2 border-white" /><span className="text-muted-foreground">CEO (círculo)</span></div>
              <div className="flex items-center gap-2 mt-1"><div className="w-4 h-4 rounded bg-purple-400 border-2 border-white" /><span className="text-muted-foreground">CTO (quadrado)</span></div>
            </div>
          </div>
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
                        {(elements as any[]).find((e: any) => e.id === otdrElementId)?.name ?? `Elemento #${otdrElementId}`}
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
                        const utils = trpc.useUtils();
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
        {groupsPanelOpen && (
          <div className="w-72 border-l border-border bg-card/50 flex flex-col overflow-hidden flex-shrink-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Folder className="w-4 h-4 text-violet-400" />
                <span className="text-sm font-medium">Grupos / Setores</span>
              </div>
              <div className="flex items-center gap-1">
                {isAdmin && (
                  <button onClick={() => { setEditingGroupId(null); setGroupForm({ name: "", color: "#6366f1", description: "" }); setGroupDialogOpen(true); }} className="text-violet-400 hover:text-violet-300" title="Novo grupo">
                    <FolderPlus className="w-4 h-4" />
                  </button>
                )}
                <button onClick={() => setGroupsPanelOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
              </div>
            </div>
            {activeGroupFilter !== null && (
              <div className="px-3 py-2 bg-violet-500/10 border-b border-violet-500/20 flex items-center gap-2">
                <span className="text-xs text-violet-400 flex-1">Filtrando por grupo</span>
                <button onClick={() => setActiveGroupFilter(null)} className="text-xs text-violet-300 hover:text-violet-200 underline">Limpar filtro</button>
              </div>
            )}
            <div className="flex-1 overflow-y-auto">
              {(mapGroups as any[]).length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  <Folder className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p>Nenhum grupo criado.</p>
                  {isAdmin && <p className="text-xs mt-1">Clique em <strong>+</strong> para criar um grupo de setores.</p>}
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {(mapGroups as any[]).map((group: any) => {
                    const isActive = activeGroupFilter === group.id;
                    const elemCount = group.elements?.length ?? 0;
                    const routeCount = group.routes?.length ?? 0;
                    return (
                      <div key={group.id} className={`px-3 py-3 ${isActive ? "bg-violet-500/10" : "hover:bg-muted/30"}`}>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: group.color ?? "#6366f1" }} />
                          <span className="text-sm font-medium flex-1 truncate">{group.name}</span>
                          <div className="flex items-center gap-1">
                            <button onClick={() => setActiveGroupFilter(isActive ? null : group.id)} className={`text-xs px-1.5 py-0.5 rounded ${isActive ? "bg-violet-500 text-white" : "bg-muted text-muted-foreground hover:bg-muted/70"}`} title={isActive ? "Remover filtro" : "Filtrar mapa por este grupo"}>
                              {isActive ? <Check className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                            </button>
                            {isAdmin && (
                              <>
                                <button onClick={() => { setEditingGroupId(group.id); setGroupForm({ name: group.name, color: group.color ?? "#6366f1", description: group.description ?? "" }); setGroupDialogOpen(true); }} className="text-muted-foreground hover:text-foreground" title="Editar grupo">
                                  <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => deleteGroupMapMut.mutate({ id: group.id })} className="text-red-400/60 hover:text-red-400" title="Excluir grupo">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        {group.description && <p className="text-xs text-muted-foreground mt-1 truncate">{group.description}</p>}
                        <div className="flex gap-3 mt-1.5 text-xs text-muted-foreground">
                          <span>{elemCount} elemento{elemCount !== 1 ? "s" : ""}</span>
                          <span>{routeCount} cabo{routeCount !== 1 ? "s" : ""}</span>
                        </div>
                        {isAdmin && groupSelectMode && groupTotalSelected > 0 && (
                          <button onClick={() => {
                            Array.from(groupSelectedElements).forEach(elId => assignElementToGroupMut.mutate({ elementId: elId, groupId: group.id }));
                            Array.from(groupSelectedRoutes).forEach(rId => assignRouteToGroupMut.mutate({ routeId: rId, groupId: group.id }));
                          }} className="mt-2 w-full text-xs bg-violet-600 hover:bg-violet-700 text-white rounded px-2 py-1">
                            Adicionar seleção ({groupTotalSelected}) a este grupo
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {isAdmin && groupSelectMode && groupTotalSelected > 0 && (
              <div className="px-3 py-2 border-t border-border text-xs text-muted-foreground">
                <Tag className="w-3 h-3 inline mr-1" />{groupTotalSelected} selecionado{groupTotalSelected !== 1 ? "s" : ""} — clique em um grupo para atribuir
              </div>
            )}
            {!groupSelectMode && isAdmin && (
              <div className="px-3 py-2 border-t border-border">
                <button onClick={toggleGroupSelectMode} className="w-full text-xs text-center text-violet-400 hover:text-violet-300 underline">
                  Ativar seleção para atribuir elementos
                </button>
              </div>
            )}
          </div>
        )}
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
      <Dialog open={pickDialogOpen} onOpenChange={setPickDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Adicionar {pickDialogType.toUpperCase()} ao Mapa</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button size="sm" variant={!pickCreateNew ? "default" : "outline"} onClick={() => setPickCreateNew(false)} className="flex-1">Selecionar existente</Button>
              <Button size="sm" variant={pickCreateNew ? "default" : "outline"} onClick={() => setPickCreateNew(true)} className="flex-1">Criar novo</Button>
            </div>
            {!pickCreateNew ? (
              <div className="space-y-2">
                <Label>Selecione um {pickDialogType.toUpperCase()}</Label>
                <Select value={pickSelectedId?.toString() ?? ""} onValueChange={v => setPickSelectedId(Number(v))}>
                  <SelectTrigger><SelectValue placeholder={`Selecionar ${pickDialogType.toUpperCase()}...`} /></SelectTrigger>
                  <SelectContent>{(pickDialogType === "cto" ? (ctos as any[]) : ceos).map((item: any) => (<SelectItem key={item.id} value={item.id.toString()}>{item.name}</SelectItem>))}</SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1.5"><Label>Nome *</Label><Input value={pickNewName} onChange={e => setPickNewName(e.target.value)} placeholder={`Nome do ${pickDialogType.toUpperCase()}`} /></div>
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
                {pickDialogType === "cto" && <div className="space-y-1.5"><Label>Capacidade (portas)</Label><Input type="number" value={pickNewCapacity} onChange={e => setPickNewCapacity(Number(e.target.value))} min={1} /></div>}
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
        <DialogContent className="max-w-lg flex flex-col" style={{maxHeight:"85vh"}}>
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
              <Label className="text-xs text-muted-foreground uppercase tracking-wide mb-2 block">Exportar por Tipo</Label>
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
            </div>
            {/* Opções adicionais */}
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wide mb-2 block">Opções</Label>
              <div className="space-y-2">
                <div className="flex items-center gap-2"><input type="checkbox" id="incFibers" checked={exportIncludeFibers} onChange={e => setExportIncludeFibers(e.target.checked)} /><Label htmlFor="incFibers" className="text-sm cursor-pointer">Incluir dados de fibras ópticas</Label></div>
              </div>
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
            <div className="bg-muted/20 rounded-lg px-3 py-2 text-xs text-muted-foreground">
              Serão exportados: {exportTypeCto ? `${(elements as any[]).filter((e: any) => e.type === "cto").length} CTOs` : "0 CTOs"} · {exportTypeCeo ? `${(elements as any[]).filter((e: any) => e.type === "ceo").length} CEOs` : "0 CEOs"} · {exportTypeCabo ? `${(routes as any[]).length} Cabos` : "0 Cabos"}
            </div>
          </div>
          <DialogFooter className="flex-shrink-0 pt-2">
            <Button variant="outline" onClick={() => setExportDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleExportKml} disabled={exportLoading || (!exportTypeCto && !exportTypeCeo && !exportTypeCabo)}>{exportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Download className="w-4 h-4 mr-1" />Exportar {exportFormat.toUpperCase()}</>}</Button>
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

      {/* Diálogo criação/edição de grupo */}
      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Folder className="w-4 h-4 text-violet-400" />{editingGroupId ? "Editar Grupo" : "Novo Grupo"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>Nome do grupo *</Label><Input value={groupForm.name} onChange={e => setGroupForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Setor Norte, Bairro Centro..." /></div>
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
              {createGroupMut.isPending || updateGroupMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : editingGroupId ? "Salvar" : "Criar Grupo"}
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

      {/* ─── Diálogo de Associação de Extremos de Cabo ─────────────────────── */}
      <Dialog open={linkEndpointsOpen} onOpenChange={v => { if (!v) { setLinkEndpointsOpen(false); setLinkEndpointsRouteId(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cable className="w-4 h-4 text-emerald-400" />
              Associar Equipamentos ao Cabo
            </DialogTitle>
          </DialogHeader>
          <div className="text-xs text-muted-foreground mb-4">
            Seleccione os equipamentos (CEO/CTO) a ligar aos extremos deste cabo. Pode deixar um extremo sem equipamento.
          </div>
          <div className="space-y-4">
            {/* Extremo Origem */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Extremo Origem (Início)</label>
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
                  .filter((e: any) => !linkEndpointsFromSearch || (e.name ?? "").toLowerCase().includes(linkEndpointsFromSearch.toLowerCase()))
                  .slice(0, 20)
                  .map((e: any) => (
                    <button
                      key={e.id}
                      className={`w-full text-left px-2 py-1 rounded text-xs transition-colors ${linkEndpointsFrom === e.id ? "bg-emerald-500/20 text-emerald-400" : "hover:bg-muted/50 text-foreground"}`}
                      onClick={() => setLinkEndpointsFrom(e.id)}
                    >
                      <span className={`inline-block w-2 h-2 rounded-sm mr-1.5 ${e.type === "cto" ? "bg-purple-400" : "bg-blue-400"}`} />
                      {e.name ?? `Elemento ${e.id}`}
                      <span className="text-muted-foreground ml-1 text-[10px]">{e.type?.toUpperCase()}</span>
                    </button>
                  ))}
              </div>
              {linkEndpointsFrom !== null && (
                <div className="text-[10px] text-emerald-400 mt-1">
                  ✓ {(elements as any[]).find((e: any) => e.id === linkEndpointsFrom)?.name ?? `Elemento ${linkEndpointsFrom}`}
                </div>
              )}
            </div>
            {/* Extremo Destino */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Extremo Destino (Fim)</label>
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
                  .filter((e: any) => !linkEndpointsToSearch || (e.name ?? "").toLowerCase().includes(linkEndpointsToSearch.toLowerCase()))
                  .slice(0, 20)
                  .map((e: any) => (
                    <button
                      key={e.id}
                      className={`w-full text-left px-2 py-1 rounded text-xs transition-colors ${linkEndpointsTo === e.id ? "bg-emerald-500/20 text-emerald-400" : "hover:bg-muted/50 text-foreground"}`}
                      onClick={() => setLinkEndpointsTo(e.id)}
                    >
                      <span className={`inline-block w-2 h-2 rounded-sm mr-1.5 ${e.type === "cto" ? "bg-purple-400" : "bg-blue-400"}`} />
                      {e.name ?? `Elemento ${e.id}`}
                      <span className="text-muted-foreground ml-1 text-[10px]">{e.type?.toUpperCase()}</span>
                    </button>
                  ))}
              </div>
              {linkEndpointsTo !== null && (
                <div className="text-[10px] text-emerald-400 mt-1">
                  ✓ {(elements as any[]).find((e: any) => e.id === linkEndpointsTo)?.name ?? `Elemento ${linkEndpointsTo}`}
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setLinkEndpointsOpen(false)}>Cancelar</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={linkEndpointsFrom === null && linkEndpointsTo === null}
              onClick={() => {
                if (!linkEndpointsRouteId) return;
                updateRoutePathMut.mutate({
                  id: linkEndpointsRouteId,
                  fromElementId: linkEndpointsFrom ?? undefined,
                  toElementId: linkEndpointsTo ?? undefined,
                }, {
                  onSuccess: () => {
                    toast.success("Extremos associados com sucesso");
                    setLinkEndpointsOpen(false);
                    setLinkEndpointsRouteId(null);
                  },
                  onError: (e) => toast.error(e.message ?? "Erro ao associar extremos"),
                });
              }}
            >
              <span className="text-xs mr-1">🔗</span> Associar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            {(["all", "cabo", "cto", "ceo"] as const).map(f => {
              const labels: Record<string, string> = { all: "Todos", cabo: "Cabos", cto: "CTOs", ceo: "CEOs" };
              const counts: Record<string, number> = {
                all: kmlPreviewItems.length,
                cabo: kmlPreviewItems.filter(i => i.type === "cabo").length,
                cto: kmlPreviewItems.filter(i => i.type === "cto").length,
                ceo: kmlPreviewItems.filter(i => i.type === "ceo").length,
              };
              const colors: Record<string, string> = { all: "bg-muted text-foreground", cabo: "bg-cyan-500/20 text-cyan-400 border-cyan-500/40", cto: "bg-purple-500/20 text-purple-400 border-purple-500/40", ceo: "bg-amber-500/20 text-amber-400 border-amber-500/40" };
              const activeColors: Record<string, string> = { all: "bg-muted-foreground/20 text-foreground border-foreground/40", cabo: "bg-cyan-500/40 text-cyan-300 border-cyan-400", cto: "bg-purple-500/40 text-purple-300 border-purple-400", ceo: "bg-amber-500/40 text-amber-300 border-amber-400" };
              return (
                <button key={f} onClick={() => setKmlPreviewFilter(f)}
                  className={`px-2.5 py-0.5 rounded-full text-xs border transition-colors ${kmlPreviewFilter === f ? activeColors[f] : colors[f]}`}>
                  {labels[f]} <span className="opacity-70">({counts[f]})</span>
                </button>
              );
            })}
          </div>
          <ScrollArea className="flex-1 min-h-0 rounded-md border border-border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left font-medium w-8">
                    <input
                      type="checkbox"
                      checked={kmlPreviewItems.filter(i => kmlPreviewFilter === "all" || i.type === kmlPreviewFilter).length > 0 && kmlPreviewItems.filter(i => kmlPreviewFilter === "all" || i.type === kmlPreviewFilter).every(i => i.include)}
                      onChange={e => setKmlPreviewItems(prev => prev.map(it => (kmlPreviewFilter === "all" || it.type === kmlPreviewFilter) ? { ...it, include: e.target.checked } : it))}
                      className="rounded border-border"
                    />
                  </th>
                  <th className="px-3 py-2 text-left font-medium">Nome</th>
                  <th className="px-3 py-2 text-left font-medium w-32">Tipo</th>
                  <th className="px-3 py-2 text-left font-medium w-24">Cor</th>
                </tr>
              </thead>
              <tbody>
                {kmlPreviewItems.filter(i => kmlPreviewFilter === "all" || i.type === kmlPreviewFilter).map((item) => {
                  const i = kmlPreviewItems.indexOf(item);
                  return (
                  <tr key={item.id} className={`border-b border-border/50 transition-colors ${item.include ? "hover:bg-muted/30" : "opacity-40 hover:bg-muted/20"}`}>
                    <td className="px-3 py-1.5">
                      <input
                        type="checkbox"
                        checked={item.include}
                        onChange={e => setKmlPreviewItems(prev => prev.map((it, j) => j === i ? { ...it, include: e.target.checked } : it))}
                        className="rounded border-border"
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
                    <td className="px-3 py-1.5">
                      <select
                        value={item.type}
                        onChange={e => setKmlPreviewItems(prev => prev.map((it, j) => j === i ? { ...it, type: e.target.value as "cto" | "ceo" | "cabo" } : it))}
                        disabled={!item.include}
                        className="w-full bg-muted/50 border border-border rounded px-1.5 py-0.5 text-xs text-foreground focus:outline-none focus:border-primary disabled:opacity-50"
                      >
                        <option value="cto">CTO</option>
                        <option value="ceo">CEO</option>
                        <option value="cabo">Cabo</option>
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="color"
                          value={item.color ?? "#22d3ee"}
                          onChange={e => setKmlPreviewItems(prev => prev.map((it, j) => j === i ? { ...it, color: e.target.value } : it))}
                          disabled={!item.include}
                          className="w-6 h-6 rounded cursor-pointer border border-border/50 bg-transparent p-0 disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Clique para alterar a cor"
                        />
                        <span className="font-mono text-[10px] text-muted-foreground hidden sm:inline">{item.color ?? "—"}</span>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollArea>
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-400 inline-block" />{kmlPreviewItems.filter(i => i.type === "cabo").length} cabos</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />{kmlPreviewItems.filter(i => i.type === "cto").length} CTOs</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />{kmlPreviewItems.filter(i => i.type === "ceo").length} CEOs</span>
          </div>
          <DialogFooter className="mt-2 flex-shrink-0">
            <Button variant="outline" onClick={() => { setKmlPreviewOpen(false); setKmlPreviewItems([]); }} disabled={kmlImportingPreview}>Cancelar</Button>
            <Button
              className="bg-cyan-600 hover:bg-cyan-700 text-white"
              disabled={kmlImportingPreview || kmlPreviewItems.filter(i => i.include).length === 0}
              onClick={confirmKmlImport}
            >
              {kmlImportingPreview ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />Importando...</> : <><Check className="w-3.5 h-3.5 mr-1" />Confirmar Importação ({kmlPreviewItems.filter(i => i.include).length})</>}
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
                {kmlImportResult.skipped > 0 && <div className="text-xs text-muted-foreground">{kmlImportResult.skipped} ignorado{kmlImportResult.skipped !== 1 ? "s" : ""} (sem coordenadas de ponto)</div>}
                {kmlImportResult.errors.length > 0 && (
                  <div className="text-xs text-red-400 space-y-0.5">{kmlImportResult.errors.map((e, i) => <div key={i}>⚠ {e}</div>)}</div>
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

      {/* Diálogo Registrar Fusão */}
      <Dialog open={fusionDialogOpen} onOpenChange={setFusionDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><GitMerge className="w-4 h-4" /> Registrar Fusão</DialogTitle>
          </DialogHeader>
          {fusionSourceVia && (() => {
            const tubes = (fusionSourceVia.isCto ? ctoTubesQuery.data : ceoTubesQuery.data) as any[] | undefined;
            const allVias = (fusionSourceVia.isCto ? ctoViasQuery.data : ceoViasQuery.data) as any[] | undefined;
            const targetTube = (tubes ?? []).find((t: any) => t.id === Number(fusionTargetTubeId));
            const targetVias = targetTube ? (allVias ?? []).filter((v: any) => v.tubeId === targetTube.id && v.fusedToViaId === null && v.id !== fusionSourceVia.id) : [];
            return (
              <div className="space-y-4">
                <div className="rounded-lg bg-muted/30 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Origem:</span> Via <strong>{fusionSourceVia.viaNumber}</strong>
                </div>
                <div className="space-y-1.5">
                  <Label>Tubo de destino *</Label>
                  <Select value={fusionTargetTubeId} onValueChange={v => { setFusionTargetTubeId(v); setFusionTargetViaId(""); }}>
                    <SelectTrigger><SelectValue placeholder="Selecionar tubo" /></SelectTrigger>
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
                      <SelectTrigger><SelectValue placeholder="Selecionar via livre" /></SelectTrigger>
                      <SelectContent>
                        {targetVias.length === 0 && <SelectItem value="__none" disabled>Nenhuma via livre</SelectItem>}
                        {targetVias.map((v: any) => (
                          <SelectItem key={v.id} value={String(v.id)}>Via {v.viaNumber}{v.label ? ` — ${v.label}` : ""}</SelectItem>
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
              disabled={!fusionTargetTubeId || !fusionTargetViaId || setCtoFusionMut.isPending || setCeoFusionMut.isPending}
              onClick={() => {
                if (!fusionSourceVia || !fusionTargetTubeId || !fusionTargetViaId) return;
                if (fusionSourceVia.isCto) {
                  setCtoFusionMut.mutate({ viaId: fusionSourceVia.id, fusedToTubeId: Number(fusionTargetTubeId), fusedToViaId: Number(fusionTargetViaId) });
                } else {
                  setCeoFusionMut.mutate({ viaId: fusionSourceVia.id, fusedToTubeId: Number(fusionTargetTubeId), fusedToViaId: Number(fusionTargetViaId) });
                }
              }}
            >
              {setCtoFusionMut.isPending || setCeoFusionMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Registrar Fusão"}
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
      <Dialog open={cablesReportOpen} onOpenChange={setCablesReportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><FileText className="w-4 h-4" /> Relatório de Cabos</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Exporta todos os cabos cadastrados no mapa com nome, tipo, quantidade de fibras, origem, destino, comprimento estimado do traçado e status de conexão.
            </p>
            <div className="rounded-lg border border-border p-3 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Total de cabos</span><span className="font-medium">{(routes as any[]).length}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Cabos soltos</span><span className="font-medium text-amber-400">{(routes as any[]).filter((r: any) => !(elements as any[]).find((e: any) => e.id === r.fromElementId) || !(elements as any[]).find((e: any) => e.id === r.toElementId)).length}</span></div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCablesReportOpen(false)}>Cancelar</Button>
            <Button
              variant="outline"
              disabled={cablesReportLoading}
              onClick={async () => {
                setCablesReportLoading(true);
                try {
                  const result = await (trpc as any).infraMap.exportCables.query({ format: "csv" });
                  const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8;" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url; a.download = `cabos-${new Date().toISOString().slice(0,10)}.csv`;
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
                  const result = await (trpc as any).infraMap.exportCables.query({ format: "pdf" });
                  const rows = result.rows as any[];
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
                    <p>Gerado em ${new Date().toLocaleString("pt-BR")} · Total: ${rows.length} cabos</p>
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

      {/* ── Painel de detalhes CEO/CTO sobreposto ao mapa (redimensionável) ── */}
      <ResizableDetailPanel
        open={detailPanel !== null}
        onClose={() => setDetailPanel(null)}
        title={detailPanel?.type === "cto" ? "Detalhes da CTO" : "Detalhes da CEO"}
      >
        {detailPanel !== null && (
          <iframe
            key={`${detailPanel.type}-${detailPanel.id}`}
            src={detailPanel.type === "cto" ? `/cto/${detailPanel.id}` : `/ceo/${detailPanel.id}`}
            className="w-full border-0"
            style={{ height: "calc(100vh - 56px)", minHeight: 600 }}
            title={detailPanel.type === "cto" ? `CTO ${detailPanel.id}` : `CEO ${detailPanel.id}`}
          />
        )}
      </ResizableDetailPanel>
    </div>
  );
}
