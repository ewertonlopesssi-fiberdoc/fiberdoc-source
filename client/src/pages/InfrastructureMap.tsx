import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { MapView } from "@/components/Map";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Map, Layers, Download, Plus, X, Eye, EyeOff, Loader2,
  Radio, Box, Cable, Navigation, Users, ChevronRight, Trash2,
  ToggleLeft, ToggleRight, Filter, FileDown, CheckSquare, Square,
  MousePointer2, Boxes
} from "lucide-react";

// ─── Tipos ───────────────────────────────────────────────────────────────────
type MapElement = {
  id: number;
  type: "ceo" | "cto";
  referenceId: number;
  lat: number;
  lng: number;
  name?: string;
  status?: string;
  capacity?: number;
  usedPorts?: number;
};

type MapRoute = {
  id: number;
  fromElementId: number;
  toElementId: number;
  name?: string | null;
  cableType?: string | null;
  fiberCount?: number | null;
  color?: string | null;
  notes?: string | null;
  path?: string | null;
};

type SidePanelContent =
  | { kind: "element"; element: MapElement }
  | { kind: "route"; route: MapRoute }
  | null;

// ─── Cores de status ─────────────────────────────────────────────────────────
const STATUS_COLOR: Record<string, string> = {
  active: "#22c55e",
  maintenance: "#f59e0b",
  inactive: "#ef4444",
};

// ─── Componente principal ─────────────────────────────────────────────────────
export default function InfrastructureMap() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  // Dados do servidor
  const { data: elements = [], refetch: refetchElements } = trpc.infraMap.elements.useQuery();
  const { data: routes = [], refetch: refetchRoutes } = trpc.infraMap.routes.useQuery();
  const { data: ctos = [] } = trpc.ctos.list.useQuery();
  const { data: ceosRaw = [] } = trpc.ceos.list.useQuery({});
  const ceos = ceosRaw as any[];

  // Mapa
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Record<number, any>>({});
  const polylinesRef = useRef<Record<number, any>>({});
  const [mapReady, setMapReady] = useState(false);

  // UI state
  const [sidePanel, setSidePanel] = useState<SidePanelContent>(null);
  const [showCeos, setShowCeos] = useState(true);
  const [showCtos, setShowCtos] = useState(true);
  const [showRoutes, setShowRoutes] = useState(true);
  const [addingMode, setAddingMode] = useState<"ceo" | "cto" | null>(null);
  const [addingRouteMode, setAddingRouteMode] = useState(false);
  const [routeFrom, setRouteFrom] = useState<number | null>(null);
  const [routeDialogOpen, setRouteDialogOpen] = useState(false);
  const [routeForm, setRouteForm] = useState({
    name: "", cableType: "FO", fiberCount: 12, color: "#22d3ee", notes: ""
  });
  const [deleteRouteId, setDeleteRouteId] = useState<number | null>(null);
  const [deleteElementId, setDeleteElementId] = useState<number | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<"kml" | "kmz">("kml");
  const [exportIncludeFibers, setExportIncludeFibers] = useState(false);
  const [exportSelectedElements, setExportSelectedElements] = useState<Set<number>>(new Set());
  const [exportSelectedRoutes, setExportSelectedRoutes] = useState<Set<number>>(new Set());
  const [exportSelectAll, setExportSelectAll] = useState(true);
  const [sgpLoading, setSgpLoading] = useState(false);
  const [sgpClients, setSgpClients] = useState<any[]>([]);

  // ─── Modo de seleção em grupo ─────────────────────────────────────────────────
  const [groupSelectMode, setGroupSelectMode] = useState(false);
  const [groupSelectedElements, setGroupSelectedElements] = useState<Set<number>>(new Set());
  const [groupSelectedRoutes, setGroupSelectedRoutes] = useState<Set<number>>(new Set());
  const [groupDeleteConfirm, setGroupDeleteConfirm] = useState(false);
  // ─── Diálogo de seleção/criação de CEO/CTO ao clicar no mapa ─────────────────
  const [pickDialogOpen, setPickDialogOpen] = useState(false);
  const [pickDialogType, setPickDialogType] = useState<"ceo" | "cto">("ceo");
  const [pickDialogLat, setPickDialogLat] = useState(0);
  const [pickDialogLng, setPickDialogLng] = useState(0);
  const [pickSelectedId, setPickSelectedId] = useState<number | null>(null);
  const [pickCreateNew, setPickCreateNew] = useState(false);
  const [pickNewName, setPickNewName] = useState("");
  const [pickNewAddress, setPickNewAddress] = useState("");
  const [pickNewCapacity, setPickNewCapacity] = useState(8);

  const toggleGroupSelectMode = useCallback(() => {
    setGroupSelectMode(v => {
      if (v) {
        // Sair do modo: limpar seleção
        setGroupSelectedElements(new Set());
        setGroupSelectedRoutes(new Set());
      } else {
        // Entrar no modo: fechar painel lateral e outros modos
        setSidePanel(null);
        setAddingMode(null);
        setAddingRouteMode(false);
      }
      return !v;
    });
  }, []);

  const toggleGroupElement = useCallback((id: number) => {
    setGroupSelectedElements(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleGroupRoute = useCallback((id: number) => {
    setGroupSelectedRoutes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAllGroup = useCallback(() => {
    setGroupSelectedElements(new Set((elements as any[]).map((e: any) => e.id)));
    setGroupSelectedRoutes(new Set((routes as any[]).map((r: any) => r.id)));
  }, [elements, routes]);

  const clearGroupSelection = useCallback(() => {
    setGroupSelectedElements(new Set());
    setGroupSelectedRoutes(new Set());
  }, []);

  const groupTotalSelected = groupSelectedElements.size + groupSelectedRoutes.size;

  // Mutations
  const upsertElementMut = trpc.infraMap.upsertElement.useMutation({
    onSuccess: () => { refetchElements(); toast.success("Posição salva"); },
    onError: (e) => toast.error(e.message),
  });
  const createCeoMut = trpc.ceos.create.useMutation({
    onError: (e) => toast.error(e.message),
  });
  const createCtoMut = trpc.ctos.create.useMutation({
    onError: (e) => toast.error(e.message),
  });
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
  const sgpQuery = trpc.sgp.queryClientsByCto.useQuery(
    { ctoName: sidePanel?.kind === "element" && sidePanel.element.type === "cto"
        ? (sidePanel.element.name ?? "") : "" },
    { enabled: sidePanel?.kind === "element" && sidePanel.element.type === "cto" && !!sidePanel.element.name }
  );

  // ─── Helpers para criar marcadores ───────────────────────────────────────────
  const createMarkerContent = useCallback((type: "ceo" | "cto", status: string, name: string) => {
    const color = STATUS_COLOR[status] ?? "#6b7280";
    const div = document.createElement("div");
    div.style.cssText = `
      display: flex; flex-direction: column; align-items: center; cursor: pointer;
    `;
    const icon = document.createElement("div");
    if (type === "cto") {
      icon.style.cssText = `
        width: 28px; height: 28px; background: ${color}; border: 3px solid white;
        border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        display: flex; align-items: center; justify-content: center;
      `;
      icon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="white"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>`;
    } else {
      icon.style.cssText = `
        width: 28px; height: 28px; background: ${color}; border: 3px solid white;
        border-radius: 50%; box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        display: flex; align-items: center; justify-content: center;
      `;
      icon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="white"><circle cx="12" cy="12" r="7"/></svg>`;
    }
    const label = document.createElement("div");
    label.style.cssText = `
      background: rgba(0,0,0,0.75); color: white; font-size: 10px; font-weight: 600;
      padding: 1px 4px; border-radius: 3px; margin-top: 2px; white-space: nowrap;
      max-width: 80px; overflow: hidden; text-overflow: ellipsis;
    `;
    label.textContent = name;
    div.appendChild(icon);
    div.appendChild(label);
    return div;
  }, []);

  // ─── Renderizar marcadores no mapa ────────────────────────────────────────────
  const renderMarkers = useCallback(() => {
    if (!mapRef.current || !mapReady) return;

    // Limpar marcadores existentes
    Object.values(markersRef.current).forEach((m: any) => { m.map = null; });
    markersRef.current = {};

    elements.forEach((el: any) => {
      const isCto = el.type === "cto";
      if (isCto && !showCtos) return;
      if (!isCto && !showCeos) return;

      const ref = isCto
        ? (ctos as any[]).find((c: any) => c.id === el.referenceId)
        : ceos.find((c: any) => c.id === el.referenceId);
      const name = ref?.name ?? (isCto ? `CTO-${el.referenceId}` : `CEO-${el.referenceId}`);
      const status = ref?.status ?? "active";

      const marker = new google.maps.marker.AdvancedMarkerElement({
        map: mapRef.current!,
        position: { lat: Number(el.lat), lng: Number(el.lng) },
        title: name,
        content: createMarkerContent(el.type, status, name),
        gmpDraggable: isAdmin,
      });

      const elId = el.id;
      const elType = el.type;
      const elRefId = el.referenceId;

      // Salvar nova posição ao soltar o marcador
      if (isAdmin) {
        marker.addListener("dragend", () => {
          const pos = marker.position as google.maps.LatLng | google.maps.LatLngLiteral | null;
          if (!pos) return;
          const lat = typeof (pos as any).lat === "function" ? (pos as any).lat() : (pos as any).lat;
          const lng = typeof (pos as any).lng === "function" ? (pos as any).lng() : (pos as any).lng;
          upsertElementMut.mutate({ type: elType, referenceId: elRefId, lat, lng });
        });
      }

      marker.addListener("click", () => {
        if (groupSelectMode) {
          toggleGroupElement(elId);
          // Atualizar visual do marcador
          const isSelected = !groupSelectedElements.has(elId);
          const content = marker.content as HTMLElement;
          if (content) {
            const icon = content.querySelector("div") as HTMLElement | null;
            if (icon) icon.style.outline = isSelected ? "3px solid #22d3ee" : "none";
          }
          return;
        }
        if (addingRouteMode) {
          if (routeFrom === null) {
            setRouteFrom(elId);
            toast.info(`Ponto de origem: ${name}. Clique no destino.`);
          } else if (routeFrom !== elId) {
            setRouteDialogOpen(true);
            setRouteForm(f => ({ ...f, name: "" }));
            setDeleteRouteId(elId); // reuso temporário para guardar routeTo
          }
        } else {
          setSidePanel({ kind: "element", element: { ...el, name, status, capacity: ref?.capacity, usedPorts: ref?.usedPorts } });
        }
      });

      markersRef.current[el.id] = marker;
    });
  }, [elements, ctos, ceos, showCeos, showCtos, mapReady, addingRouteMode, routeFrom, createMarkerContent, groupSelectMode, groupSelectedElements, toggleGroupElement]);

  // ─── Renderizar rotas no mapa ─────────────────────────────────────────────────
  const renderRoutes = useCallback(() => {
    if (!mapRef.current || !mapReady) return;

    Object.values(polylinesRef.current).forEach((p: any) => p.setMap(null));
    polylinesRef.current = {};

    if (!showRoutes) return;

    routes.forEach((r: any) => {
      const fromEl = elements.find((e: any) => e.id === r.fromElementId);
      const toEl = elements.find((e: any) => e.id === r.toElementId);
      if (!fromEl || !toEl) return;

      const path: google.maps.LatLngLiteral[] = [
        { lat: Number(fromEl.lat), lng: Number(fromEl.lng) },
      ];
      if (r.path) {
        try { path.push(...JSON.parse(r.path)); } catch {}
      }
      path.push({ lat: Number(toEl.lat), lng: Number(toEl.lng) });

      const polyline = new google.maps.Polyline({
        path,
        map: mapRef.current!,
        strokeColor: r.color ?? "#22d3ee",
        strokeWeight: 3,
        strokeOpacity: 0.9,
        clickable: true,
      });

      polyline.addListener("click", () => {
        if (groupSelectMode) {
          toggleGroupRoute(r.id);
          // Atualizar visual da polyline
          const isSelected = !groupSelectedRoutes.has(r.id);
          polyline.setOptions({
            strokeWeight: isSelected ? 6 : 3,
            strokeColor: isSelected ? "#22d3ee" : (r.color ?? "#22d3ee"),
          });
          return;
        }
        setSidePanel({ kind: "route", route: r });
      });

      polylinesRef.current[r.id] = polyline;
    });
  }, [routes, elements, showRoutes, mapReady, groupSelectMode, groupSelectedRoutes, toggleGroupRoute]);

  // Re-renderizar quando dados mudam
  useEffect(() => { renderMarkers(); }, [renderMarkers]);
  useEffect(() => { renderRoutes(); }, [renderRoutes]);

  // ─── Modo de adição de elemento ───────────────────────────────────────────────
  const handleMapReady = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    setMapReady(true);
  }, []);

  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    if (!addingMode) {
      mapRef.current.setOptions({ draggableCursor: "" });
      return;
    }
    mapRef.current.setOptions({ draggableCursor: "crosshair" });
    const listener = mapRef.current.addListener("click", (e: google.maps.MapMouseEvent) => {
      if (!e.latLng || !addingMode) return;
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      // Abrir diálogo moderno de seleção/criação
      setPickDialogType(addingMode);
      setPickDialogLat(lat);
      setPickDialogLng(lng);
      setPickSelectedId(null);
      setPickCreateNew(false);
      setPickNewName("");
      setPickNewAddress("");
      setPickNewCapacity(8);
      setPickDialogOpen(true);
      setAddingMode(null);
    });
    return () => { google.maps.event.removeListener(listener); };
  }, [addingMode, mapReady]);

  //   // ─── Exportar KML/KMZ ──────────────────────────────────────────────────
  const openExportDialog = () => {
    // Inicializar seleção com todos os elementos
    setExportSelectedElements(new Set((elements as any[]).map((e: any) => e.id)));
    setExportSelectedRoutes(new Set((routes as any[]).map((r: any) => r.id)));
    setExportSelectAll(true);
    setExportDialogOpen(true);
  };

  const toggleExportSelectAll = () => {
    if (exportSelectAll) {
      setExportSelectedElements(new Set());
      setExportSelectedRoutes(new Set());
    } else {
      setExportSelectedElements(new Set((elements as any[]).map((e: any) => e.id)));
      setExportSelectedRoutes(new Set((routes as any[]).map((r: any) => r.id)));
    }
    setExportSelectAll(!exportSelectAll);
  };

  const toggleElement = (id: number) => {
    setExportSelectedElements(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleRoute = (id: number) => {
    setExportSelectedRoutes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleExportKml = async () => {
    setExportLoading(true);
    try {
      const elementIds = exportSelectAll ? undefined : Array.from(exportSelectedElements);
      const routeIds = exportSelectAll ? undefined : Array.from(exportSelectedRoutes);
      const result = await (trpc as any).infraMap.exportKml.query({
        format: exportFormat,
        elementIds,
        routeIds,
        includeFibers: exportIncludeFibers,
      });
      if (exportFormat === "kmz" && result.kmzBase64) {
        const binary = atob(result.kmzBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: "application/vnd.google-earth.kmz" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `fiberdoc-infraestrutura-${new Date().toISOString().slice(0, 10)}.kmz`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("KMZ exportado com sucesso");
      } else {
        const blob = new Blob([result.kml], { type: "application/vnd.google-earth.kml+xml" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `fiberdoc-infraestrutura-${new Date().toISOString().slice(0, 10)}.kml`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("KML exportado com sucesso");
      }
      setExportDialogOpen(false);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao exportar");
    } finally {
      setExportLoading(false);
    }
  };

  // ─── Criar rota ───────────────────────────────────────────────────────────────
  const handleCreateRoute = () => {
    if (routeFrom === null || deleteRouteId === null) return;
    const toId = deleteRouteId;
    createRouteMut.mutate({
      fromElementId: routeFrom,
      toElementId: toId,
      name: routeForm.name || undefined,
      cableType: routeForm.cableType || undefined,
      fiberCount: routeForm.fiberCount || undefined,
      color: routeForm.color || undefined,
      notes: routeForm.notes || undefined,
    });
    setDeleteRouteId(null);
  };

  // ─── Painel lateral ───────────────────────────────────────────────────────────
  const renderSidePanel = () => {
    if (!sidePanel) return null;

    if (sidePanel.kind === "route") {
      const r = sidePanel.route;
      const fromEl = elements.find((e: any) => e.id === r.fromElementId) as any;
      const toEl = elements.find((e: any) => e.id === r.toElementId) as any;
      const fromRef = fromEl?.type === "cto"
        ? (ctos as any[]).find((c: any) => c.id === fromEl?.referenceId)
        : ceos.find((c: any) => c.id === fromEl?.referenceId);
      const toRef = toEl?.type === "cto"
        ? (ctos as any[]).find((c: any) => c.id === toEl?.referenceId)
        : ceos.find((c: any) => c.id === toEl?.referenceId);

      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Cable className="w-5 h-5 text-cyan-400" />
            <h3 className="font-semibold">{r.name ?? `Cabo ${r.id}`}</h3>
          </div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tipo</span>
              <span>{r.cableType ?? "FO"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Fibras</span>
              <span>{r.fiberCount ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">De</span>
              <span>{(fromRef as any)?.name ?? `El. ${r.fromElementId}`}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Para</span>
              <span>{(toRef as any)?.name ?? `El. ${r.toElementId}`}</span>
            </div>
            {r.notes && (
              <div className="pt-1 text-muted-foreground text-xs">{r.notes}</div>
            )}
          </div>
          {isAdmin && (
            <Button
              variant="destructive" size="sm" className="w-full gap-2"
              onClick={() => { setDeleteRouteId(r.id); setSidePanel(null); }}
            >
              <Trash2 className="w-3.5 h-3.5" /> Excluir Rota
            </Button>
          )}
        </div>
      );
    }

    // Element panel
    const el = sidePanel.element;
    const isCto = el.type === "cto";
    const statusColor = STATUS_COLOR[el.status ?? "active"];

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          {isCto
            ? <Box className="w-5 h-5" style={{ color: statusColor }} />
            : <Radio className="w-5 h-5" style={{ color: statusColor }} />
          }
          <h3 className="font-semibold">{el.name}</h3>
          <Badge
            className="ml-auto text-xs"
            style={{ background: statusColor + "33", color: statusColor, border: `1px solid ${statusColor}55` }}
          >
            {el.status === "active" ? "Ativo" : el.status === "maintenance" ? "Manutenção" : "Inativo"}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground">
          {isCto ? "CTO — Caixa de Terminação Óptica" : "CEO — Caixa de Emenda Óptica"}
        </div>
        {isCto && (
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Capacidade</span>
              <span>{el.capacity ?? "—"} portas</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Usadas</span>
              <span>{el.usedPorts ?? 0} portas</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Livres</span>
              <span className="text-emerald-400">{(el.capacity ?? 0) - (el.usedPorts ?? 0)} portas</span>
            </div>
          </div>
        )}
        <div className="text-xs text-muted-foreground">
          {Number(el.lat).toFixed(6)}, {Number(el.lng).toFixed(6)}
        </div>

        {/* SGP Clientes */}
        {isCto && (
          <div className="border-t border-border pt-3">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-cyan-400" />
              <span className="text-sm font-medium">Clientes SGP</span>
            </div>
            {sgpQuery.isLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" /> Consultando SGP...
              </div>
            ) : sgpQuery.data?.error ? (
              <div className="text-xs text-muted-foreground">{sgpQuery.data.error}</div>
            ) : sgpQuery.data?.clients?.length ? (
              <div className="space-y-1">
                {sgpQuery.data.clients.slice(0, 5).map((c: any, i: number) => (
                  <div key={i} className="text-xs flex justify-between">
                    <span>{c.nome ?? c.name ?? `Cliente ${i + 1}`}</span>
                    <span className="text-muted-foreground">{c.porta ?? c.port ?? ""}</span>
                  </div>
                ))}
                {sgpQuery.data.clients.length > 5 && (
                  <div className="text-xs text-muted-foreground">+{sgpQuery.data.clients.length - 5} mais</div>
                )}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">Nenhum cliente encontrado</div>
            )}
          </div>
        )}

        {isAdmin && (
          <Button
            variant="destructive" size="sm" className="w-full gap-2"
            onClick={() => setDeleteElementId(el.id)}
          >
            <Trash2 className="w-3.5 h-3.5" /> Remover do Mapa
          </Button>
        )}
      </div>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col -m-6 h-[calc(100vh-4rem)] relative">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-background flex-shrink-0 flex-wrap">
        <Map className="w-5 h-5 text-cyan-400 mr-1" />
        <span className="font-semibold text-sm mr-2">Mapa de Infraestrutura</span>

        {/* Layer toggles */}
        <div className="flex items-center gap-1 border border-border rounded-md px-2 py-1">
          <button
            onClick={() => setShowCeos(v => !v)}
            className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded transition-colors ${showCeos ? "text-blue-400" : "text-muted-foreground"}`}
          >
            <Radio className="w-3 h-3" /> CEO
          </button>
          <button
            onClick={() => setShowCtos(v => !v)}
            className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded transition-colors ${showCtos ? "text-purple-400" : "text-muted-foreground"}`}
          >
            <Box className="w-3 h-3" /> CTO
          </button>
          <button
            onClick={() => setShowRoutes(v => !v)}
            className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded transition-colors ${showRoutes ? "text-cyan-400" : "text-muted-foreground"}`}
          >
            <Cable className="w-3 h-3" /> Cabos
          </button>
        </div>

        {isAdmin && (
          <>
            <div className="h-4 w-px bg-border mx-1" />
            <Button
              size="sm" variant={addingMode === "ceo" ? "default" : "outline"}
              className="h-7 gap-1 text-xs"
              onClick={() => setAddingMode(m => m === "ceo" ? null : "ceo")}
            >
              <Plus className="w-3 h-3" />
              {addingMode === "ceo" ? "Cancelar CEO" : "Add CEO"}
            </Button>
            <Button
              size="sm" variant={addingMode === "cto" ? "default" : "outline"}
              className="h-7 gap-1 text-xs"
              onClick={() => setAddingMode(m => m === "cto" ? null : "cto")}
            >
              <Plus className="w-3 h-3" />
              {addingMode === "cto" ? "Cancelar CTO" : "Add CTO"}
            </Button>
            <Button
              size="sm" variant={addingRouteMode ? "default" : "outline"}
              className="h-7 gap-1 text-xs"
              onClick={() => {
                setAddingRouteMode(v => !v);
                setRouteFrom(null);
              }}
            >
              <Cable className="w-3 h-3" />
              {addingRouteMode ? "Cancelar Rota" : "Add Cabo"}
            </Button>
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant={groupSelectMode ? "default" : "outline"}
            className={`h-7 gap-1 text-xs ${groupSelectMode ? "bg-cyan-600 hover:bg-cyan-700 border-cyan-500" : ""}`}
            onClick={toggleGroupSelectMode}
          >
            <MousePointer2 className="w-3 h-3" />
            {groupSelectMode ? `Seleção (${groupTotalSelected})` : "Selecionar"}
          </Button>
          <Button
            size="sm" variant="outline" className="h-7 gap-1 text-xs"
            onClick={openExportDialog}
          >
            <FileDown className="w-3 h-3" />
            Exportar KML/KMZ
          </Button>
        </div>
      </div>

      {/* Banner modo de seleção em grupo */}
      {groupSelectMode && (
        <div className="px-4 py-2 bg-cyan-500/10 border-b border-cyan-500/30 text-cyan-400 text-xs flex items-center gap-3">
          <MousePointer2 className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="flex-1">
            Modo de seleção ativo — clique nos marcadores (CEO/CTO) ou cabos para selecionar.
            {groupTotalSelected > 0 && (
              <span className="font-semibold ml-1">{groupTotalSelected} selecionado{groupTotalSelected !== 1 ? "s" : ""}</span>
            )}
          </span>
          <button onClick={selectAllGroup} className="text-cyan-300 hover:text-cyan-200 underline text-xs">Selecionar tudo</button>
          <button onClick={clearGroupSelection} className="text-cyan-300 hover:text-cyan-200 underline text-xs">Limpar</button>
        </div>
      )}

      {/* Instruções de modo */}
      {(addingMode || addingRouteMode) && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/30 text-amber-400 text-xs flex items-center gap-2">
          <Navigation className="w-3.5 h-3.5" />
          {addingMode
            ? `Clique no mapa para posicionar um ${addingMode.toUpperCase()}`
            : routeFrom === null
              ? "Clique no marcador de ORIGEM do cabo"
              : "Agora clique no marcador de DESTINO do cabo"
          }
        </div>
      )}

      {/* Área principal: mapa + painel lateral */}
      <div className="flex flex-1 overflow-hidden">
        {/* Mapa */}
        <div className="flex-1 relative">
          <MapView
            className="w-full h-full"
            initialCenter={{ lat: -15.7801, lng: -47.9292 }}
            initialZoom={5}
            onMapReady={handleMapReady}
          />

          {/* Legenda */}
          <div className="absolute bottom-4 left-4 bg-background/90 backdrop-blur-sm border border-border rounded-lg p-3 text-xs space-y-1.5">
            <div className="font-semibold text-foreground mb-1">Legenda</div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-emerald-500 border-2 border-white" />
              <span className="text-muted-foreground">Ativo</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-amber-500 border-2 border-white" />
              <span className="text-muted-foreground">Manutenção</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-red-500 border-2 border-white" />
              <span className="text-muted-foreground">Inativo</span>
            </div>
            <div className="border-t border-border pt-1.5 mt-1">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-blue-400 border-2 border-white" />
                <span className="text-muted-foreground">CEO (círculo)</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <div className="w-4 h-4 rounded bg-purple-400 border-2 border-white" />
                <span className="text-muted-foreground">CTO (quadrado)</span>
              </div>
            </div>
          </div>

          {/* Contador de elementos */}
          <div className="absolute top-4 left-4 bg-background/90 backdrop-blur-sm border border-border rounded-lg px-3 py-2 text-xs">
            <span className="text-muted-foreground">{elements.length} elementos · {routes.length} cabos</span>
          </div>

          {/* Painel flutuante de ações em grupo */}
          {groupSelectMode && groupTotalSelected > 0 && (
            <div className="absolute top-4 right-4 bg-background/95 backdrop-blur-sm border border-cyan-500/50 rounded-xl shadow-lg p-4 min-w-[220px] z-10">
              <div className="flex items-center gap-2 mb-3">
                <Boxes className="w-4 h-4 text-cyan-400" />
                <span className="font-semibold text-sm">{groupTotalSelected} selecionado{groupTotalSelected !== 1 ? "s" : ""}</span>
              </div>
              {groupSelectedElements.size > 0 && (
                <div className="text-xs text-muted-foreground mb-1">
                  {groupSelectedElements.size} elemento{groupSelectedElements.size !== 1 ? "s" : ""} (CEO/CTO)
                </div>
              )}
              {groupSelectedRoutes.size > 0 && (
                <div className="text-xs text-muted-foreground mb-3">
                  {groupSelectedRoutes.size} cabo{groupSelectedRoutes.size !== 1 ? "s" : ""}
                </div>
              )}
              <div className="space-y-2">
                <Button
                  size="sm" variant="outline" className="w-full h-8 gap-2 text-xs"
                  onClick={() => {
                    setExportSelectedElements(new Set(groupSelectedElements));
                    setExportSelectedRoutes(new Set(groupSelectedRoutes));
                    setExportSelectAll(false);
                    setExportDialogOpen(true);
                  }}
                >
                  <FileDown className="w-3.5 h-3.5" />
                  Exportar seleção
                </Button>
                {isAdmin && (
                  <Button
                    size="sm" variant="destructive" className="w-full h-8 gap-2 text-xs"
                    onClick={() => setGroupDeleteConfirm(true)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remover seleção
                  </Button>
                )}
                <Button
                  size="sm" variant="ghost" className="w-full h-8 text-xs text-muted-foreground"
                  onClick={clearGroupSelection}
                >
                  Limpar seleção
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Painel lateral */}
        {sidePanel && (
          <div className="w-72 border-l border-border bg-card flex flex-col overflow-y-auto">
            <div className="flex items-center justify-between p-3 border-b border-border">
              <span className="text-sm font-medium">Detalhes</span>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setSidePanel(null)}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="p-4">
              {renderSidePanel()}
            </div>
          </div>
        )}
      </div>

      {/* Dialog de criação de rota */}
      <Dialog open={routeDialogOpen} onOpenChange={(o) => { if (!o) { setRouteDialogOpen(false); setRouteFrom(null); setAddingRouteMode(false); setDeleteRouteId(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Cabo / Rota</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Nome (opcional)</Label>
              <Input value={routeForm.name} onChange={e => setRouteForm(f => ({ ...f, name: e.target.value }))} placeholder="Cabo-01" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Tipo de cabo</Label>
                <Select value={routeForm.cableType} onValueChange={v => setRouteForm(f => ({ ...f, cableType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FO">Fibra Óptica</SelectItem>
                    <SelectItem value="ADSS">ADSS</SelectItem>
                    <SelectItem value="OPGW">OPGW</SelectItem>
                    <SelectItem value="Metalico">Metálico</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Nº de fibras</Label>
                <Input type="number" min={1} value={routeForm.fiberCount} onChange={e => setRouteForm(f => ({ ...f, fiberCount: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Cor da linha no mapa</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={routeForm.color} onChange={e => setRouteForm(f => ({ ...f, color: e.target.value }))} className="w-10 h-8 rounded cursor-pointer border border-border" />
                <Input value={routeForm.color} onChange={e => setRouteForm(f => ({ ...f, color: e.target.value }))} className="font-mono text-sm" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Observações</Label>
              <Textarea value={routeForm.notes} onChange={e => setRouteForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Comprimento, tipo de passagem, etc." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRouteDialogOpen(false); setRouteFrom(null); setAddingRouteMode(false); setDeleteRouteId(null); }}>
              Cancelar
            </Button>
            <Button onClick={handleCreateRoute} disabled={createRouteMut.isPending}>
              Criar Cabo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmação de exclusão de rota */}
      <Dialog open={deleteRouteId !== null && !routeDialogOpen} onOpenChange={() => setDeleteRouteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Excluir Rota</DialogTitle></DialogHeader>
          <p className="text-muted-foreground text-sm">Tem certeza que deseja excluir esta rota de cabo?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteRouteId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteRouteId && deleteRouteMut.mutate({ id: deleteRouteId })} disabled={deleteRouteMut.isPending}>
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Exportação KML/KMZ */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileDown className="w-5 h-5 text-cyan-400" />
              Exportar KML / KMZ
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Formato */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Formato de saída</Label>
              <div className="flex gap-3">
                {(["kml", "kmz"] as const).map(fmt => (
                  <button
                    key={fmt}
                    onClick={() => setExportFormat(fmt)}
                    className={`flex-1 py-2 px-4 rounded-lg border text-sm font-medium transition-colors ${
                      exportFormat === fmt
                        ? "border-cyan-500 bg-cyan-500/10 text-cyan-400"
                        : "border-border bg-muted/20 text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    .{fmt.toUpperCase()}
                    <span className="block text-xs font-normal mt-0.5">
                      {fmt === "kml" ? "Google Earth / GPS" : "Compactado (Google Earth Desktop)"}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            {/* Incluir fibras */}
            <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20">
              <button onClick={() => setExportIncludeFibers(v => !v)} className="flex-shrink-0">
                {exportIncludeFibers
                  ? <CheckSquare className="w-5 h-5 text-cyan-400" />
                  : <Square className="w-5 h-5 text-muted-foreground" />}
              </button>
              <div>
                <p className="text-sm font-medium">Incluir Fibras Ópticas</p>
                <p className="text-xs text-muted-foreground">Adiciona as fibras com coordenadas de rota como linhas no mapa</p>
              </div>
            </div>
            {/* Seleção de elementos */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Elementos e Rotas</Label>
                <button
                  onClick={toggleExportSelectAll}
                  className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                >
                  {exportSelectAll ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                  {exportSelectAll ? "Desmarcar tudo" : "Selecionar tudo"}
                </button>
              </div>
              {/* CEOs e CTOs */}
              {(elements as any[]).length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Equipamentos ({(elements as any[]).length})</p>
                  <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
                    {(elements as any[]).map((el: any) => {
                      const isCto = el.type === "cto";
                      const ref = isCto
                        ? (ctos as any[]).find((c: any) => c.id === el.referenceId)
                        : ceos.find((c: any) => c.id === el.referenceId);
                      const name = ref?.name ?? (isCto ? `CTO-${el.referenceId}` : `CEO-${el.referenceId}`);
                      const checked = exportSelectedElements.has(el.id);
                      return (
                        <button
                          key={el.id}
                          onClick={() => toggleElement(el.id)}
                          className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/40 text-sm text-left"
                        >
                          {checked ? <CheckSquare className="w-4 h-4 text-cyan-400 flex-shrink-0" /> : <Square className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                          <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                            isCto ? "bg-purple-500/20 text-purple-400" : "bg-blue-500/20 text-blue-400"
                          }`}>{el.type.toUpperCase()}</span>
                          <span className="truncate">{name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {/* Rotas de cabo */}
              {(routes as any[]).length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Rotas de Cabo ({(routes as any[]).length})</p>
                  <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
                    {(routes as any[]).map((r: any) => {
                      const checked = exportSelectedRoutes.has(r.id);
                      return (
                        <button
                          key={r.id}
                          onClick={() => toggleRoute(r.id)}
                          className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/40 text-sm text-left"
                        >
                          {checked ? <CheckSquare className="w-4 h-4 text-cyan-400 flex-shrink-0" /> : <Square className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: r.color ?? "#22d3ee" }} />
                          <span className="truncate">{r.name ?? `Cabo ${r.id}`}</span>
                          <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">{r.cableType} • {r.fiberCount}F</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {(elements as any[]).length === 0 && (routes as any[]).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum elemento no mapa para exportar</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleExportKml}
              disabled={exportLoading || (exportSelectedElements.size === 0 && exportSelectedRoutes.size === 0 && !exportSelectAll)}
              className="gap-2"
            >
              {exportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              Exportar .{exportFormat.toUpperCase()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmação de exclusão em grupo */}
      <Dialog open={groupDeleteConfirm} onOpenChange={setGroupDeleteConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Remover Seleção do Mapa</DialogTitle></DialogHeader>
          <p className="text-muted-foreground text-sm">
            Remover {groupSelectedElements.size > 0 && `${groupSelectedElements.size} elemento${groupSelectedElements.size !== 1 ? "s" : ""} (CEO/CTO)`}
            {groupSelectedElements.size > 0 && groupSelectedRoutes.size > 0 && " e "}
            {groupSelectedRoutes.size > 0 && `${groupSelectedRoutes.size} cabo${groupSelectedRoutes.size !== 1 ? "s" : ""}`}
            {" "}do mapa? Os CEOs/CTOs não serão excluídos, apenas suas posições no mapa.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupDeleteConfirm(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                const elIds = Array.from(groupSelectedElements);
                const rtIds = Array.from(groupSelectedRoutes);
                for (const id of elIds) {
                  await deleteElementMut.mutateAsync({ id });
                }
                for (const id of rtIds) {
                  await deleteRouteMut.mutateAsync({ id });
                }
                setGroupDeleteConfirm(false);
                setGroupSelectedElements(new Set());
                setGroupSelectedRoutes(new Set());
                toast.success(`${elIds.length + rtIds.length} item${elIds.length + rtIds.length !== 1 ? "s" : ""} removido${elIds.length + rtIds.length !== 1 ? "s" : ""} do mapa`);
              }}
              disabled={deleteElementMut.isPending || deleteRouteMut.isPending}
            >
              {(deleteElementMut.isPending || deleteRouteMut.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmação de exclusão de elemento */}
      <Dialog open={deleteElementId !== null} onOpenChange={() => setDeleteElementId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Remover do Mapa</DialogTitle></DialogHeader>
          <p className="text-muted-foreground text-sm">Remover este elemento do mapa? O CEO/CTO não será excluído, apenas sua posição no mapa.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteElementId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteElementId && deleteElementMut.mutate({ id: deleteElementId })} disabled={deleteElementMut.isPending}>
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de seleção/criação de CEO ou CTO ao clicar no mapa */}
      <Dialog open={pickDialogOpen} onOpenChange={(o) => { if (!o) setPickDialogOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {pickDialogType === "ceo"
                ? <Radio className="w-5 h-5 text-blue-400" />
                : <Box className="w-5 h-5 text-purple-400" />
              }
              Posicionar {pickDialogType.toUpperCase()} no Mapa
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground">
              Coordenadas: {pickDialogLat.toFixed(6)}, {pickDialogLng.toFixed(6)}
            </p>

            {/* Tabs: Selecionar existente / Criar novo */}
            <div className="flex gap-1 p-1 bg-muted rounded-lg">
              <button
                onClick={() => setPickCreateNew(false)}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  !pickCreateNew ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Selecionar existente
              </button>
              <button
                onClick={() => setPickCreateNew(true)}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  pickCreateNew ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Criar novo
              </button>
            </div>

            {!pickCreateNew ? (
              /* Selecionar existente */
              <div className="space-y-2">
                <Label className="text-sm">Selecione o {pickDialogType.toUpperCase()}</Label>
                {(() => {
                  const available = pickDialogType === "cto"
                    ? (ctos as any[]).filter((c: any) => !elements.find((el: any) => el.type === "cto" && el.referenceId === c.id))
                    : ceos.filter((c: any) => !elements.find((el: any) => el.type === "ceo" && el.referenceId === c.id));
                  if (available.length === 0) {
                    return (
                      <div className="text-sm text-muted-foreground py-4 text-center border border-dashed border-border rounded-lg">
                        Nenhum {pickDialogType.toUpperCase()} disponível.<br />
                        <button onClick={() => setPickCreateNew(true)} className="text-cyan-400 underline text-xs mt-1">Criar novo</button>
                      </div>
                    );
                  }
                  return (
                    <div className="max-h-48 overflow-y-auto space-y-1 border border-border rounded-lg p-2">
                      {available.map((c: any) => (
                        <button
                          key={c.id}
                          onClick={() => setPickSelectedId(c.id)}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-left transition-colors ${
                            pickSelectedId === c.id
                              ? "bg-cyan-500/20 border border-cyan-500/50 text-foreground"
                              : "hover:bg-muted/60 text-muted-foreground"
                          }`}
                        >
                          {pickSelectedId === c.id
                            ? <CheckSquare className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                            : <Square className="w-4 h-4 flex-shrink-0" />
                          }
                          <span className="font-medium">{c.name}</span>
                          {c.status && (
                            <span className={`ml-auto text-xs px-1.5 py-0.5 rounded-full ${
                              c.status === "active" ? "bg-emerald-500/20 text-emerald-400" :
                              c.status === "maintenance" ? "bg-amber-500/20 text-amber-400" :
                              "bg-red-500/20 text-red-400"
                            }`}>
                              {c.status === "active" ? "Ativo" : c.status === "maintenance" ? "Manutenção" : "Inativo"}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
            ) : (
              /* Criar novo */
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-sm">Nome *</Label>
                  <Input
                    value={pickNewName}
                    onChange={e => setPickNewName(e.target.value)}
                    placeholder={pickDialogType === "ceo" ? "CEO-01" : "CTO-01"}
                    autoFocus
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm">{pickDialogType === "ceo" ? "Localização" : "Endereço"}</Label>
                  <Input
                    value={pickNewAddress}
                    onChange={e => setPickNewAddress(e.target.value)}
                    placeholder="Rua, número, bairro"
                  />
                </div>
                {pickDialogType === "cto" && (
                  <div className="space-y-1">
                    <Label className="text-sm">Capacidade (portas)</Label>
                    <Input
                      type="number" min={1} max={256}
                      value={pickNewCapacity}
                      onChange={e => setPickNewCapacity(Number(e.target.value))}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPickDialogOpen(false)}>Cancelar</Button>
            <Button
              disabled={
                upsertElementMut.isPending || createCeoMut.isPending || createCtoMut.isPending ||
                (!pickCreateNew && pickSelectedId === null) ||
                (pickCreateNew && !pickNewName.trim())
              }
              onClick={async () => {
                try {
                  let refId = pickSelectedId;
                  if (pickCreateNew) {
                    if (pickDialogType === "ceo") {
                      await createCeoMut.mutateAsync({
                        name: pickNewName.trim(),
                        location: pickNewAddress.trim() || undefined,
                        status: "active",
                      });
                      // Buscar o ID do CEO recém criado
                      const allCeos = await trpc.useUtils().ceos.list.fetch({});
                      const newCeo = (allCeos as any[]).find((c: any) => c.name === pickNewName.trim());
                      refId = newCeo?.id ?? null;
                    } else {
                      const result = await createCtoMut.mutateAsync({
                        name: pickNewName.trim(),
                        address: pickNewAddress.trim() || undefined,
                        capacity: pickNewCapacity,
                        status: "active",
                      });
                      refId = result.id;
                    }
                  }
                  if (!refId) { toast.error("Nenhum item selecionado"); return; }
                  await upsertElementMut.mutateAsync({
                    type: pickDialogType,
                    referenceId: refId,
                    lat: pickDialogLat,
                    lng: pickDialogLng,
                  });
                  setPickDialogOpen(false);
                  toast.success(`${pickDialogType.toUpperCase()} posicionado no mapa`);
                } catch (e: any) {
                  toast.error(e.message ?? "Erro ao posicionar");
                }
              }}
            >
              {(upsertElementMut.isPending || createCeoMut.isPending || createCtoMut.isPending)
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Plus className="w-4 h-4" />
              }
              {pickCreateNew ? `Criar e Posicionar` : `Posicionar`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
