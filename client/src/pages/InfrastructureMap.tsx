import { useState, useRef, useCallback, useEffect } from "react";
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
  FileDown, MousePointer2, Search
} from "lucide-react";
import L from "leaflet";

type MapElement = {
  id: number; type: "ceo" | "cto"; referenceId: number;
  lat: number; lng: number; name?: string; status?: string;
  capacity?: number; usedPorts?: number;
};
type MapRoute = {
  id: number; fromElementId: number; toElementId: number;
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

export default function InfrastructureMap() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const { data: elements = [], refetch: refetchElements } = trpc.infraMap.elements.useQuery();
  const { data: routes = [], refetch: refetchRoutes } = trpc.infraMap.routes.useQuery();
  const { data: ctos = [] } = trpc.ctos.list.useQuery();
  const { data: ceosRaw = [] } = trpc.ceos.list.useQuery({});
  const ceos = ceosRaw as any[];

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Record<number, L.Marker>>({});
  const polylinesRef = useRef<Record<number, L.Polyline>>({});
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
  const [deleteElementId, setDeleteElementId] = useState<number | null>(null);
  const [deleteRouteId, setDeleteRouteId] = useState<number | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
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
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);

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
  const deleteElementMut = trpc.infraMap.deleteElement.useMutation({
    onSuccess: () => { refetchElements(); setDeleteElementId(null); setSidePanel(null); toast.success("Elemento removido"); },
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

  // Inicializar mapa Leaflet
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, { center: [-15.7801, -47.9292], zoom: 5, zoomControl: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    setMapReady(true);
    return () => { map.remove(); mapRef.current = null; };
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
      const polyline = L.polyline(latlngs, { color: r.color ?? "#22d3ee", weight: isSelected ? 6 : 3, opacity: 0.9 }).addTo(mapRef.current!);
      polyline.on("click", () => {
        if (groupSelectMode) { toggleGroupRoute(r.id); return; }
        setSidePanel({ kind: "route", route: r });
      });
      polylinesRef.current[r.id] = polyline;
    });
  }, [routes, elements, showRoutes, mapReady, groupSelectMode, groupSelectedRoutes, toggleGroupRoute]);

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
      setPickDialogOpen(false); refetchElements();
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

  // Painel lateral
  const renderSidePanel = () => {
    if (!sidePanel) return null;
    if (sidePanel.kind === "route") {
      const r = sidePanel.route;
      const fromEl = (elements as any[]).find((e: any) => e.id === r.fromElementId) as any;
      const toEl = (elements as any[]).find((e: any) => e.id === r.toElementId) as any;
      const fromRef = fromEl?.type === "cto" ? (ctos as any[]).find((c: any) => c.id === fromEl?.referenceId) : ceos.find((c: any) => c.id === fromEl?.referenceId);
      const toRef = toEl?.type === "cto" ? (ctos as any[]).find((c: any) => c.id === toEl?.referenceId) : ceos.find((c: any) => c.id === toEl?.referenceId);
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2"><Cable className="w-5 h-5 text-cyan-400" /><h3 className="font-semibold">{r.name ?? `Cabo ${r.id}`}</h3></div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Tipo</span><span>{r.cableType ?? "FO"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Fibras</span><span>{r.fiberCount ?? "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">De</span><span>{(fromRef as any)?.name ?? `El. ${r.fromElementId}`}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Para</span><span>{(toRef as any)?.name ?? `El. ${r.toElementId}`}</span></div>
            {r.notes && <div className="pt-1 text-muted-foreground text-xs">{r.notes}</div>}
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
        {isAdmin && <Button variant="destructive" size="sm" className="w-full gap-2" onClick={() => { setDeleteElementId(el.id); setSidePanel(null); }}><Trash2 className="w-3.5 h-3.5" /> Remover do Mapa</Button>}
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
          <Button size="sm" variant={groupSelectMode ? "default" : "outline"} className={`h-7 gap-1 text-xs ${groupSelectMode ? "bg-cyan-600 hover:bg-cyan-700 border-cyan-500" : ""}`} onClick={toggleGroupSelectMode}>
            <MousePointer2 className="w-3 h-3" />{groupSelectMode ? `Seleção (${groupTotalSelected})` : "Selecionar"}
          </Button>
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={openExportDialog}>
            <FileDown className="w-3 h-3" />Exportar KML/KMZ
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
                <div className="space-y-1.5"><Label>Endereço</Label><Input value={pickNewAddress} onChange={e => setPickNewAddress(e.target.value)} placeholder="Endereço (opcional)" /></div>
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
          <DialogHeader><DialogTitle>Remover do Mapa</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Deseja remover este elemento do mapa? O CEO/CTO não será excluído do sistema.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteElementId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteElementId && deleteElementMut.mutate({ id: deleteElementId })} disabled={deleteElementMut.isPending}>{deleteElementMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Remover"}</Button>
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
    </div>
  );
}
