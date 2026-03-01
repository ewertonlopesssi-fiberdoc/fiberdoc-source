import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Map, Download, Plus, X, Eye, EyeOff, Loader2,
  Radio, Box, Cable, Navigation, Users, Trash2,
  FileDown, MousePointer2, Search, Layers, Upload,
  Folder, FolderPlus, FolderOpen, ChevronRight, Check, Tag,
  Pencil, Link2, Link2Off, GitMerge, AlertTriangle, FileText
} from "lucide-react";
import L from "leaflet";

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
  capacity?: number; usedPorts?: number;
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

function createLeafletIcon(type: "ceo" | "cto", status: string, name: string, selected = false) {
  const color = STATUS_COLOR[status] ?? "#6b7280";
  const outline = selected ? "3px solid #22d3ee" : "3px solid white";
  const shape = type === "cto"
    ? `<rect x="3" y="3" width="18" height="18" rx="2" fill="white"/>`
    : `<circle cx="12" cy="12" r="7" fill="white"/>`;
  const safeName = name.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const iconHtml = `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;"><div style="width:28px;height:28px;background:${color};border:${outline};border-radius:${type === "cto" ? "4px" : "50%"};box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;"><svg width="14" height="14" viewBox="0 0 24 24">${shape}</svg></div><div style="background:rgba(0,0,0,0.75);color:white;font-size:10px;font-weight:600;padding:1px 4px;border-radius:3px;margin-top:2px;white-space:nowrap;max-width:80px;overflow:hidden;text-overflow:ellipsis;">${safeName}</div></div>`;
  return L.divIcon({ html: iconHtml, className: "", iconSize: [80, 46], iconAnchor: [40, 14] });
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
  const [editElementForm, setEditElementForm] = useState({ name: "", address: "", capacity: 8, status: "active", notes: "" });
  const [editRouteDialogOpen, setEditRouteDialogOpen] = useState(false);
  const [editRouteForm, setEditRouteForm] = useState({ name: "", cableType: "FO", fiberCount: 12, color: "#22d3ee", notes: "", fromElementId: null as number | null, toElementId: null as number | null, fromTubeId: null as number | null, toTubeId: null as number | null });
  const [fromSearch, setFromSearch] = useState("");
  const [toSearch, setToSearch] = useState("");

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
      refetchElements();
      refetchCeos();
      setEditElementDialogOpen(false);
      if (sidePanel?.kind === "element") {
        setSidePanel({ ...sidePanel, element: { ...sidePanel.element, name: editElementForm.name, status: editElementForm.status } });
      }
      toast.success("CEO atualizado");
    },
    onError: (e) => toast.error(e.message),
  });
  const updateCtoMut = trpc.ctos.update.useMutation({
    onSuccess: () => {
      refetchElements();
      refetchCtos();
      setEditElementDialogOpen(false);
      if (sidePanel?.kind === "element") {
        setSidePanel({ ...sidePanel, element: { ...sidePanel.element, name: editElementForm.name, status: editElementForm.status, capacity: editElementForm.capacity } });
      }
      toast.success("CTO atualizada");
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
      ceoTubesQuery.refetch();
      ceoViasQuery.refetch();
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
    onSuccess: () => { ceoTubesQuery.refetch(); setEditTubeDialogOpen(false); toast.success("Tubo atualizado"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteCtoTubeMut = trpc.ctoTubes.delete.useMutation({
    onSuccess: () => { ctoTubesQuery.refetch(); ctoViasQuery.refetch(); setDeleteTubeId(null); toast.success("Tubo excluído"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteCeoTubeMut = trpc.ceoTubes.delete.useMutation({
    onSuccess: () => { ceoTubesQuery.refetch(); ceoViasQuery.refetch(); setDeleteTubeId(null); toast.success("Tubo excluído"); },
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
    onSuccess: () => { ceoViasQuery.refetch(); setEditViaDialogOpen(false); toast.success("Via atualizada"); },
    onError: (e) => toast.error(e.message),
  });

  // ─── Fusões pelo Mapa ─────────────────────────────────────────────────────
  const [fusionDialogOpen, setFusionDialogOpen] = useState(false);
  const [fusionPdfLoading, setFusionPdfLoading] = useState(false);
  const [fusionSourceVia, setFusionSourceVia] = useState<{ id: number; viaNumber: number; tubeId: number; isCto: boolean; isFused: boolean; label?: string | null } | null>(null);
  const [fusionTargetTubeId, setFusionTargetTubeId] = useState<string>("");
  const [fusionTargetViaId, setFusionTargetViaId] = useState<string>("");
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
      ceoViasQuery.refetch();
      // Invalidar queries do menu CEO para sincronização bidirecional
      mapUtils.ceoVias.byCeo.invalidate({ ceoId: sidePanelRefId });
      mapUtils.ceoVias.byTube.invalidate();
      setFusionDialogOpen(false);
      toast.success("Fusão registrada");
    },
    onError: (e) => toast.error(e.message),
  });
  const clearCeoFusionMut = trpc.ceoVias.clearFusion.useMutation({
    onSuccess: () => {
      ceoViasQuery.refetch();
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
    onSuccess: () => { refetchElements(); toast.success("Posição salva"); },
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
  const deleteRouteMut = trpc.infraMap.deleteRoute.useMutation({
    onSuccess: () => { refetchRoutes(); setDeleteRouteId(null); setSidePanel(null); toast.success("Rota excluída"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteGroupMut = trpc.infraMap.deleteElement.useMutation();
  const deleteGroupRouteMut = trpc.infraMap.deleteRoute.useMutation();
  const sgpQuery = trpc.sgp.queryClientsByCto.useQuery(
    { ctoName: sidePanel?.kind === "element" && sidePanel.element.type === "cto" ? (sidePanel.element.name ?? "") : "" },
    { enabled: sidePanel?.kind === "element" && sidePanel.element.type === "cto" && !!sidePanel.element.name }
  );
  // Queries de tubos/vias para o painel lateral
  const sidePanelRefId = sidePanel?.kind === "element" ? sidePanel.element.referenceId : 0;
  const sidePanelType = sidePanel?.kind === "element" ? sidePanel.element.type : null;
  const [expandedTubeIds, setExpandedTubeIds] = useState<Set<number>>(new Set());
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
      const icon = createLeafletIcon(el.type, status, name, isSelected);
      const marker = L.marker([Number(el.lat), Number(el.lng)], { icon, draggable: isAdmin }).addTo(mapRef.current!);
      if (isAdmin) {
        marker.on("dragend", () => {
          const pos = marker.getLatLng();
          upsertElementMut.mutate({ type: el.type, referenceId: el.referenceId, lat: pos.lat, lng: pos.lng });
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
        setSidePanel({ kind: "element", element: { ...el, name, status, capacity: ref?.capacity, usedPorts: ref?.usedPorts } });
      });
      markersRef.current[el.id] = marker;
    });
  }, [elements, ctos, ceos, showCeos, showCtos, mapReady, addingRouteMode, groupSelectMode, groupSelectedElements, toggleGroupElement, isAdmin]);

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
      const SNAP_THRESHOLD_DEG = 0.008; // ~800m em graus
      let dragging = false;
      cm.on("mousedown", (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        dragging = true;
        mapRef.current!.dragging.disable();
        const onMove = (ev: L.LeafletMouseEvent) => {
          if (!dragging) return;
          let moveLat = ev.latlng.lat;
          let moveLng = ev.latlng.lng;
          // Snap apenas para endpoints
          let snappedEl: any = null;
          if (isEndpoint) {
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
          // Indicador visual de snap
          if (snapIndicatorRef.current) { snapIndicatorRef.current.remove(); snapIndicatorRef.current = null; }
          if (snappedEl && mapRef.current) {
            snapIndicatorRef.current = L.circleMarker([moveLat, moveLng], {
              radius: 14, color: "#22c55e", fillColor: "#22c55e", fillOpacity: 0.25, weight: 3,
            }).addTo(mapRef.current);
          }
          // Atualizar marcadores de ponto médio
          editRouteMidMarkersRef.current.forEach(m => m.remove());
          editRouteMidMarkersRef.current = [];
          renderMidpoints(newPath, routeColor);
        };
        const onUp = () => {
          dragging = false;
          mapRef.current!.dragging.enable();
          mapRef.current!.off("mousemove", onMove);
          mapRef.current!.off("mouseup", onUp);
          if (snapIndicatorRef.current) { snapIndicatorRef.current.remove(); snapIndicatorRef.current = null; }
          // Atualizar snap ID se endpoint grudou em um elemento
          if (isEndpoint) {
            const finalPt = editingRoutePathRef.current[idx];
            let snappedId: number | null = null;
            (elements as any[]).forEach((el: any) => {
              if (Math.abs(finalPt.lat - Number(el.lat)) < 0.0001 && Math.abs(finalPt.lng - Number(el.lng)) < 0.0001) {
                snappedId = el.id;
              }
            });
            if (idx === 0) snapFromIdRef.current = snappedId;
            else snapToIdRef.current = snappedId;
          }
          setEditingRoutePath([...editingRoutePathRef.current]);
        };
        mapRef.current!.on("mousemove", onMove);
        mapRef.current!.on("mouseup", onUp);
      });

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

  // Renderizar pontos médios entre vértices
  const renderMidpoints = useCallback((path: { lat: number; lng: number }[], routeColor: string) => {
    if (!mapRef.current) return;
    editRouteMidMarkersRef.current.forEach(m => m.remove());
    editRouteMidMarkersRef.current = [];
    for (let i = 0; i < path.length - 1; i++) {
      const midLat = (path[i].lat + path[i + 1].lat) / 2;
      const midLng = (path[i].lng + path[i + 1].lng) / 2;
      const mid = L.circleMarker([midLat, midLng], {
        radius: 5,
        color: "white",
        fillColor: routeColor,
        fillOpacity: 0.5,
        weight: 1.5,
        bubblingMouseEvents: false,
      }).addTo(mapRef.current!);
      mid.getElement()?.setAttribute("title", "Clique para adicionar ponto");
      mid.on("click", (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        const insertIdx = i + 1;
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
    const fromEl = (elements as any[]).find((e: any) => e.id === route.fromElementId);
    const toEl   = (elements as any[]).find((e: any) => e.id === route.toElementId);
    const pts: { lat: number; lng: number }[] = [];
    if (fromEl) pts.push({ lat: Number(fromEl.lat), lng: Number(fromEl.lng) });
    if (route.path) { try { (JSON.parse(route.path) as any[]).forEach((p: any) => pts.push({ lat: p.lat, lng: p.lng })); } catch {} }
    if (toEl)   pts.push({ lat: Number(toEl.lat),   lng: Number(toEl.lng) });
    setEditingRouteId(route.id);
    setEditingRoutePath(pts);
    editingRoutePathRef.current = pts;
    snapFromIdRef.current = route.fromElementId ?? null;
    snapToIdRef.current = route.toElementId ?? null;
    renderEditRouteMarkers(pts, route.color ?? "#22d3ee");
    setSidePanel(null);
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

  // Importar posições CEO/CTO via KML
  const handleKmlImport = useCallback(async (file: File) => {
    setKmlImportLoading(true);
    setKmlImportResult(null);
    try {
      const text = await file.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "application/xml");
      const placemarks = Array.from(doc.querySelectorAll("Placemark"));
      let added = 0; let skipped = 0; const errors: string[] = [];
      for (const pm of placemarks) {
        const name = pm.querySelector("name")?.textContent?.trim() ?? "";
        const coordText = pm.querySelector("Point > coordinates")?.textContent?.trim();
        if (!coordText) { skipped++; continue; }
        const parts = coordText.split(",");
        if (parts.length < 2) { skipped++; continue; }
        const lng = parseFloat(parts[0]); const lat = parseFloat(parts[1]);
        if (isNaN(lat) || isNaN(lng)) { errors.push(`Coordenadas inválidas: ${name}`); continue; }
        // Detectar tipo pelo nome ou pela descrição
        const desc = pm.querySelector("description")?.textContent?.toLowerCase() ?? "";
        const nameLower = name.toLowerCase();
        const isCto = nameLower.includes("cto") || desc.includes("cto");
        const type: "ceo" | "cto" = isCto ? "cto" : "ceo";
        try {
          if (type === "cto") {
            const cto = await createCtoMut.mutateAsync({ name: name || `CTO-KML-${added + 1}`, capacity: 8, lat, lng });
            await upsertElementMut.mutateAsync({ type: "cto", referenceId: (cto as any).id, lat, lng });
          } else {
            const ceo = await createCeoMut.mutateAsync({ name: name || `CEO-KML-${added + 1}`, location: "" });
            await upsertElementMut.mutateAsync({ type: "ceo", referenceId: (ceo as any).id, lat, lng });
          }
          added++;
        } catch (e: any) { errors.push(`${name}: ${e.message}`); }
      }
      setKmlImportResult({ added, skipped, errors });
      if (added > 0) { refetchElements(); toast.success(`${added} elemento${added !== 1 ? "s" : ""} importado${added !== 1 ? "s" : ""} do KML`); }
      else toast.error("Nenhum elemento importado");
    } catch (e: any) { toast.error("Erro ao processar KML: " + (e.message ?? "")); }
    finally { setKmlImportLoading(false); }
  }, [createCtoMut, createCeoMut, upsertElementMut, refetchElements]);

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
      const result = await (trpc as any).infraMap.exportKml.query({ format: exportFormat, elementIds, routeIds, includeFibers: exportIncludeFibers });
      if (exportFormat === "kmz" && result.kmzBase64) {
        const binary = atob(result.kmzBase64); const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: "application/vnd.google-earth.kmz" });
        const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `fiberdoc-infraestrutura-${new Date().toISOString().slice(0, 10)}.kmz`; a.click(); URL.revokeObjectURL(url);
        toast.success("KMZ exportado com sucesso");
      } else {
        const blob = new Blob([result.kml], { type: "application/vnd.google-earth.kml+xml" });
        const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `fiberdoc-infraestrutura-${new Date().toISOString().slice(0, 10)}.kml`; a.click(); URL.revokeObjectURL(url);
        toast.success("KML exportado com sucesso");
      }
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
        setSidePanel({ kind: "element", element: { ...el, name: ref?.name ?? el.type.toUpperCase(), status: ref?.status, capacity: ref?.capacity, usedPorts: ref?.usedPorts } });
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
          {isAdmin && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1 gap-2" onClick={() => {
                setEditRouteForm({ name: r.name ?? "", cableType: r.cableType ?? "FO", fiberCount: r.fiberCount ?? 12, color: r.color ?? "#22d3ee", notes: r.notes ?? "", fromElementId: r.fromElementId ?? null, toElementId: r.toElementId ?? null, fromTubeId: (r as any).fromTubeId ?? null, toTubeId: (r as any).toTubeId ?? null });
                setEditRouteDialogOpen(true);
              }}><span className="text-xs">✏️</span> Editar</Button>
              <Button variant="outline" size="sm" className="flex-1 gap-2 border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10" onClick={() => startEditRoutePath(r)}>
                <Cable className="w-3.5 h-3.5" /> Traçado
              </Button>
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
          <div className="border-t border-border pt-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5"><Users className="w-3.5 h-3.5" /> Clientes SGP</div>
            {sgpQuery.isLoading ? (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Consultando SGP...</div>
            ) : sgpQuery.data?.clients?.length ? (
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {sgpQuery.data.clients.map((c: any, i: number) => (
                  <div key={i} className="text-xs flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" /><span className="truncate">{c.name ?? c.login ?? `Cliente ${i + 1}`}</span></div>
                ))}
              </div>
            ) : <div className="text-xs text-muted-foreground">Nenhum cliente vinculado</div>}
          </div>
        )}
        {/* Botões de ação */}
        <div className="flex gap-2">
          <a
            href={isCto ? `/cto/${el.referenceId}` : `/ceo/${el.referenceId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1"
          >
            <Button variant="outline" size="sm" className="w-full gap-1.5">
              <Link2 className="w-3.5 h-3.5" /> Abrir detalhes
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
              });
              setEditElementDialogOpen(true);
            }}>
              <Pencil className="w-3.5 h-3.5" /> Editar
            </Button>
          )}
        </div>
        {/* Botão Exportar PDF de Fusões */}
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-1.5 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/10"
          disabled={fusionPdfLoading}
          onClick={async () => {
            setFusionPdfLoading(true);
            try {
              const refId = el.referenceId;
              const name = el.name ?? (isCto ? "CTO" : "CEO");
              const res = await fetch(`/api/fusion-report/${isCto ? "cto" : "ceo"}/${refId}`, { credentials: "include" });
              if (!res.ok) throw new Error("Falha ao gerar relatório");
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = `fusoes_${name.replace(/\s+/g, "_")}.pdf`;
              document.body.appendChild(a); a.click();
              document.body.removeChild(a); URL.revokeObjectURL(url);
            } catch { /* ignora */ } finally { setFusionPdfLoading(false); }
          }}
        >
          {fusionPdfLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
          Exportar Fusões PDF
        </Button>
        {/* Painel de Tubos e Vias */}
        {(() => {
          const tubes = (isCto ? ctoTubesQuery.data : ceoTubesQuery.data) as any[] | undefined;
          const allVias = (isCto ? ctoViasQuery.data : ceoViasQuery.data) as any[] | undefined;
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
          return (
            <div className="border-t border-border pt-2">
              <div className="text-xs text-muted-foreground mb-2 font-medium flex items-center gap-1">
                <Layers className="w-3 h-3" /> Tubos e Vias
                {tubes && tubes.length > 0 && <span className="ml-auto text-muted-foreground/60">{tubes.length} tubo{tubes.length !== 1 ? "s" : ""}</span>}
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
                            return (
                              <div key={via.id} className="flex items-center gap-0.5 group">
                                <button
                                  className={`flex-1 flex items-center gap-1.5 text-xs py-0.5 px-1 rounded hover:bg-accent/30 text-left transition-colors ${isFused ? "" : "hover:bg-emerald-500/10"}`}
                                  title={isFused ? "Clique para remover fusão" : "Clique para registrar fusão"}
                                  onClick={() => {
                                    if (isFused) {
                                      if (isCto) clearCtoFusionMut.mutate({ viaId: via.id });
                                      else clearCeoFusionMut.mutate({ viaId: via.id });
                                    } else {
                                      setFusionSourceVia({ id: via.id, viaNumber: via.viaNumber, tubeId: tube.id, isCto, isFused: false, label: via.label });
                                      setFusionTargetTubeId("");
                                      setFusionTargetViaId("");
                                      setFusionDialogOpen(true);
                                    }
                                  }}
                                >
                                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isFused ? "bg-emerald-400" : "bg-muted-foreground/30"}`} />
                                  <span className="text-muted-foreground w-5 shrink-0">{via.viaNumber}</span>
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
          <Button size="sm" variant={groupsPanelOpen ? "default" : "outline"} className={`h-7 gap-1 text-xs ${groupsPanelOpen ? "bg-violet-600 hover:bg-violet-700 border-violet-500" : ""}`} onClick={() => setGroupsPanelOpen(v => !v)} title="Grupos/Pastas de setores">
            <Folder className="w-3 h-3" />Grupos {(mapGroups as any[]).length > 0 && <span className="ml-0.5 bg-white/20 rounded px-1">{(mapGroups as any[]).length}</span>}
          </Button>
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={openExportDialog}>
            <FileDown className="w-3 h-3" />Exportar KML/KMZ
          </Button>
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setCablesReportOpen(true)}>
            <FileText className="w-3 h-3" />Rel. Cabos
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
            <span className="font-semibold">Editando traçado</span> — Arraste os pontos para mover. Clique no ponto semitransparente entre dois vértices para inserir. Duplo clique em um vértice intermediário para remover.
            <span className="ml-2 text-amber-300">{editingRoutePath.length} pontos</span>
          </span>
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
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Exportar KML / KMZ</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button size="sm" variant={exportFormat === "kmz" ? "default" : "outline"} onClick={() => setExportFormat("kmz")} className="flex-1">KMZ (Google Earth)</Button>
              <Button size="sm" variant={exportFormat === "kml" ? "default" : "outline"} onClick={() => setExportFormat("kml")} className="flex-1">KML (XML)</Button>
            </div>
            <div className="flex items-center gap-2"><input type="checkbox" id="incFibers" checked={exportIncludeFibers} onChange={e => setExportIncludeFibers(e.target.checked)} /><Label htmlFor="incFibers" className="text-sm cursor-pointer">Incluir dados de fibras ópticas</Label></div>
            <div className="space-y-2">
              <div className="flex items-center justify-between"><Label className="text-sm">Seleção</Label><button onClick={toggleExportSelectAll} className="text-xs text-primary underline">{exportSelectAll ? "Desmarcar tudo" : "Selecionar tudo"}</button></div>
              <div className="border border-border rounded-lg divide-y divide-border max-h-48 overflow-y-auto">
                {(elements as any[]).map((el: any) => {
                  const ref = el.type === "cto" ? (ctos as any[]).find((c: any) => c.id === el.referenceId) : ceos.find((c: any) => c.id === el.referenceId);
                  return (<label key={`el-${el.id}`} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/30"><input type="checkbox" checked={exportSelectedElements.has(el.id)} onChange={() => toggleElement(el.id)} /><span className="text-xs">{el.type.toUpperCase()} — {ref?.name ?? el.referenceId}</span></label>);
                })}
                {(routes as any[]).map((r: any) => (<label key={`rt-${r.id}`} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/30"><input type="checkbox" checked={exportSelectedRoutes.has(r.id)} onChange={() => toggleRoute(r.id)} /><span className="text-xs">Cabo — {r.name ?? `Rota ${r.id}`}</span></label>))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleExportKml} disabled={exportLoading}>{exportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Download className="w-4 h-4 mr-1" />Exportar</>}</Button>
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

      {/* Importação de posições via KML */}
      <Dialog open={kmlImportOpen} onOpenChange={v => { setKmlImportOpen(v); if (!v) setKmlImportResult(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Upload className="w-4 h-4" />Importar Posições via KML</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Selecione um arquivo <strong>.kml</strong> exportado do Google Earth, Google Maps ou outro sistema.</p>
              <p className="text-xs">Elementos com "CTO" no nome serão importados como CTOs; os demais como CEOs.</p>
            </div>
            <div className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => kmlFileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleKmlImport(f); }}>
              {kmlImportLoading ? (
                <div className="flex flex-col items-center gap-2"><Loader2 className="w-8 h-8 animate-spin text-primary" /><span className="text-sm text-muted-foreground">Importando...</span></div>
              ) : (
                <div className="flex flex-col items-center gap-2"><Upload className="w-8 h-8 text-muted-foreground" /><span className="text-sm text-muted-foreground">Clique ou arraste o arquivo KML aqui</span><span className="text-xs text-muted-foreground">Apenas arquivos .kml</span></div>
              )}
            </div>
            <input ref={kmlFileRef} type="file" accept=".kml" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleKmlImport(f); e.target.value = ""; }} />
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
    </div>
  );
}
