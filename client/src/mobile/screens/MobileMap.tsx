import { useState, useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useMobileAuth } from "../MobileAuthContext";
import { createMobileTrpcClient, isOnline, saveOfflineCache, loadOfflineCache } from "../mobileTrpc";
import { createStreetLayer, createSatelliteLayer, clampZoomForStreet } from "@/lib/mapTiles";
import {
  Cable, Radio, MapPin, X, ChevronRight, Edit2, Check, ChevronLeft,
  Layers, Link2, Link2Off, RefreshCw, Loader2, AlertCircle, LocateFixed, Plus, Trash2, Users, Unlink,
  BarChart2, Zap, Copy, Satellite,
} from "lucide-react";

// ─── Cores de tubo ─────────────────────────────────────────────────────────
const TUBE_COLORS: Record<string, string> = {
  blue: "bg-blue-500", orange: "bg-orange-500", green: "bg-emerald-500",
  brown: "bg-amber-800", slate: "bg-slate-400", white: "bg-white",
  red: "bg-red-500", black: "bg-zinc-900 border border-zinc-600",
  yellow: "bg-yellow-400", violet: "bg-violet-500", rose: "bg-pink-400",
  aqua: "bg-cyan-400",
};
const TUBE_COLOR_HEX: Record<string, string> = {
  blue: "#3b82f6", orange: "#f97316", green: "#10b981", brown: "#92400e",
  slate: "#94a3b8", white: "#ffffff", red: "#ef4444", black: "#18181b",
  yellow: "#facc15", violet: "#8b5cf6", rose: "#f472b6", aqua: "#22d3ee",
};
const TUBE_COLOR_LABELS: Record<string, string> = {
  blue: "Azul", orange: "Laranja", green: "Verde", brown: "Marrom",
  slate: "Cinza", white: "Branco", red: "Vermelho", black: "Preto",
  yellow: "Amarelo", violet: "Violeta", rose: "Rosa", aqua: "Aqua",
};
const VIA_FIBER_COLORS: Record<number, { dot: string }> = {
  1: { dot: "bg-green-500" }, 2: { dot: "bg-yellow-400" }, 3: { dot: "bg-white" },
  4: { dot: "bg-blue-500" }, 5: { dot: "bg-red-500" }, 6: { dot: "bg-violet-500" },
  7: { dot: "bg-amber-700" }, 8: { dot: "bg-pink-400" },
  9: { dot: "bg-zinc-900 border border-zinc-500" }, 10: { dot: "bg-slate-400" },
  11: { dot: "bg-orange-500" }, 12: { dot: "bg-cyan-400" },
};

// ─── Tipos ─────────────────────────────────────────────────────────────────
type MapEl = { id: number; type: string; referenceId: number; lat: number; lng: number };
type Ceo = { id: number; name: string; location?: string | null; type?: string | null; notes?: string | null; status?: string | null };
type Cto = { id: number; name: string; address?: string | null; lat?: string | null; lng?: string | null; capacity?: number | null; usedPorts?: number | null; status?: string | null; notes?: string | null; sgpId?: number | null };
type Tube = { id: number; identifier: string; type: string; totalVias: number; color: string | null; notes?: string | null };
type Via = { id: number; tubeId: number; viaNumber: number; label?: string | null; fusedToViaId?: number | null; fusedToTubeId?: number | null; notes?: string | null };

type PanelView = "detail" | "editMain" | "tubes" | "editTube" | "newTube" | "vias" | "editVia" | "setFusion";

const STATUS_LABEL: Record<string, string> = { active: "Ativo", inactive: "Inativo", maintenance: "Manutenção" };
const STATUS_COLOR: Record<string, string> = {
  active: "bg-emerald-500/20 text-emerald-300",
  inactive: "bg-zinc-500/20 text-zinc-400",
  maintenance: "bg-amber-500/20 text-amber-300",
};

// ─── Ícones de marcador (igual à versão web) ────────────────────────────────
const STATUS_COLOR_HEX: Record<string, string> = {
  active: "#22c55e", maintenance: "#f59e0b", inactive: "#ef4444",
};

function makeCeoIcon(status = "active", name = "", selected = false) {
  const statusColor = STATUS_COLOR_HEX[status] ?? "#6b7280";
  const safeName = name.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const selectedRing = selected ? `<div style="position:absolute;inset:-3px;border:3px solid #22d3ee;border-radius:4px;pointer-events:none;"></div>` : "";
  const nameHtml = `<div style="background:rgba(0,0,0,0.75);color:white;font-size:10px;font-weight:600;padding:1px 4px;border-radius:3px;margin-top:2px;white-space:nowrap;max-width:80px;overflow:hidden;text-overflow:ellipsis;">${safeName}</div>`;
  const html = `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;"><div style="position:relative;display:inline-flex;"><img src="/icons/ceo.png" style="width:48px;height:48px;object-fit:contain;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.6));" />${selectedRing}<div style="position:absolute;bottom:-4px;left:50%;transform:translateX(-50%);width:10px;height:4px;background:${statusColor};border-radius:2px;"></div></div>${nameHtml}</div>`;
  return L.divIcon({ html, className: "", iconSize: [80, 58], iconAnchor: [40, 24] });
}

function makeCtoIcon(status = "active", name = "", selected = false) {
  const statusColor = STATUS_COLOR_HEX[status] ?? "#6b7280";
  const safeName = name.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const selectedRing = selected ? `<div style="position:absolute;inset:-3px;border:3px solid #22d3ee;border-radius:4px;pointer-events:none;"></div>` : "";
  const nameHtml = `<div style="background:rgba(0,0,0,0.75);color:white;font-size:10px;font-weight:600;padding:1px 4px;border-radius:3px;margin-top:2px;white-space:nowrap;max-width:80px;overflow:hidden;text-overflow:ellipsis;">${safeName}</div>`;
  const html = `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;"><div style="position:relative;display:inline-flex;"><img src="/icons/cto.png" style="width:48px;height:48px;object-fit:contain;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.6));" />${selectedRing}<div style="position:absolute;bottom:-4px;left:50%;transform:translateX(-50%);width:10px;height:4px;background:${statusColor};border-radius:2px;"></div></div>${nameHtml}</div>`;
  return L.divIcon({ html, className: "", iconSize: [80, 58], iconAnchor: [40, 24] });
}

interface MobileMapProps {
  onOpenDetail?: (type: "ceo" | "cto", id: number) => void;
  focusType?: "ceo" | "cto" | "coords" | null;
  focusId?: number | null;
  focusCoords?: { lat: number; lng: number } | null;
  onFocusConsumed?: () => void;
}

export default function MobileMap({ onOpenDetail, focusType, focusId, focusCoords, onFocusConsumed }: MobileMapProps = {}) {
  const { serverUrl, token, user: mobileUser } = useMobileAuth();
  const isMobileAdmin = mobileUser?.role === "admin" || mobileUser?.role === "operator";
  const client = createMobileTrpcClient(serverUrl, token);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Record<number, L.Marker>>({});
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const [isSatellite, setIsSatellite] = useState(false);

  // ─── Dados do mapa ──────────────────────────────────────────────────────
  const [elements, setElements] = useState<MapEl[]>([]);
  const [ceos, setCeos] = useState<Ceo[]>([]);
  const [ctos, setCtos] = useState<Cto[]>([]);
  const [loading, setLoading] = useState(true);

  // ─── Painel lateral ─────────────────────────────────────────────────────
  const [panelOpen, setPanelOpen]       = useState(false);
  const [panelType, setPanelType]       = useState<"ceo" | "cto">("ceo");
  const [panelView, setPanelView]       = useState<PanelView>("detail");
  const [selectedEl, setSelectedEl]     = useState<MapEl | null>(null);
  const [selectedCeo, setSelectedCeo]   = useState<Ceo | null>(null);
  const [selectedCto, setSelectedCto]   = useState<Cto | null>(null);

  // Tubos
  const [tubes, setTubes]               = useState<Tube[]>([]);
  const [selectedTube, setSelectedTube] = useState<Tube | null>(null);
  const [editTubeForm, setEditTubeForm] = useState<Partial<Tube>>({});
  const [newTubeForm, setNewTubeForm]   = useState({ identifier: "", color: "blue", totalVias: 12, type: "tube", bandejaId: null as number | null });
  const [bandejas, setBandejas] = useState<{ id: number; number: number; label: string | null }[]>([]);
  const [bandejasLoading, setBandejasLoading] = useState(false);

  // Vias
  const [vias, setVias]               = useState<Via[]>([]);
  const [allVias, setAllVias]         = useState<Via[]>([]);
  const [selectedVia, setSelectedVia] = useState<Via | null>(null);
  const [editViaForm, setEditViaForm] = useState({ label: "", notes: "" });
  const [fusionTubeId, setFusionTubeId] = useState("");
  const [fusionViaId, setFusionViaId]   = useState("");

  // Editar CEO/CTO
  const [editMainForm, setEditMainForm] = useState<any>({});
  const [geoLoading, setGeoLoading]     = useState(false);

  // UI
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  // Filtros e GPS
  const [filterType, setFilterType] = useState<"all" | "ceo" | "cto">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
  const [gpsLocating, setGpsLocating] = useState(false);
  const myLocationMarkerRef = useRef<L.CircleMarker | null>(null);
  // ─── Cabos/Rotas no mapa ────────────────────────────────────────────────
  const [routes, setRoutes] = useState<any[]>([]);
  const polylinesRef = useRef<Record<number, L.Polyline>>({});
  const [showCables, setShowCables] = useState(true);

  // ─── Viabilidade ────────────────────────────────────────────────────────
  const [viabOpen, setViabOpen] = useState(false);
  const [viabLat, setViabLat] = useState("");
  const [viabLng, setViabLng] = useState("");
  const [viabRadius, setViabRadius] = useState("500");
  const [viabResults, setViabResults] = useState<any[]>([]);
  const [viabLoading, setViabLoading] = useState(false);
  const [viabError, setViabError] = useState<string | null>(null);
  const [viabLocating, setViabLocating] = useState(false);
  const viabCircleRef = useRef<L.Circle | null>(null);

  function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  async function runViabilidade() {
    const lat = parseFloat(viabLat);
    const lng = parseFloat(viabLng);
    const radius = parseFloat(viabRadius);
    if (isNaN(lat) || isNaN(lng)) { setViabError("Informe as coordenadas"); return; }
    if (isNaN(radius) || radius <= 0) { setViabError("Raio inválido"); return; }
    setViabLoading(true); setViabError(null); setViabResults([]);
    // Desenhar círculo no mapa
    if (viabCircleRef.current) { try { viabCircleRef.current.remove(); } catch {} }
    if (mapRef.current) {
      viabCircleRef.current = L.circle([lat, lng], {
        radius, color: "#22d3ee", fillColor: "#22d3ee", fillOpacity: 0.08, weight: 2, dashArray: "6 4",
      }).addTo(mapRef.current);
      mapRef.current.setView([lat, lng], 15, { animate: true });
    }
    try {
      // Filtrar CTOs dentro do raio com portas livres
      const allCtos = ctos;
      const allEls = elements.filter(e => e.type === "cto");
      const nearby = allEls
        .map(el => {
          const cto = allCtos.find(c => c.id === el.referenceId);
          if (!cto) return null;
          const dist = haversineKm(lat, lng, el.lat, el.lng) * 1000;
          if (dist > radius) return null;
          const free = (cto.capacity ?? 0) - (cto.usedPorts ?? 0);
          return { cto, el, dist: Math.round(dist), free, total: cto.capacity ?? 0 };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => a.dist - b.dist);
      setViabResults(nearby as any[]);
      if (nearby.length === 0) setViabError("Nenhuma CTO encontrada no raio informado");
    } catch (e: any) { setViabError(e.message ?? "Erro ao calcular viabilidade"); }
    setViabLoading(false);
  }

  async function viabUseGps() {
    setViabLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setViabLat(pos.coords.latitude.toFixed(6));
        setViabLng(pos.coords.longitude.toFixed(6));
        setViabLocating(false);
      },
      () => { setViabError("Não foi possível obter localização"); setViabLocating(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  // ─── Balanço Óptico e OTDR no mapa ──────────────────────────────────────
  const [mapBalanceOpen, setMapBalanceOpen] = useState(false);
  const [mapBalance, setMapBalance] = useState<any | null>(null);
  const [mapBalanceLoading, setMapBalanceLoading] = useState(false);
  const [mapBalanceError, setMapBalanceError] = useState<string | null>(null);
  const [mapOtdrOpen, setMapOtdrOpen] = useState(false);
  const [mapOtdrTubes, setMapOtdrTubes] = useState<any[]>([]);
  const [mapOtdrTubeId, setMapOtdrTubeId] = useState("");
  const [mapOtdrViaNum, setMapOtdrViaNum] = useState("");
  const [mapOtdrDist, setMapOtdrDist] = useState("");
  const [mapOtdrResult, setMapOtdrResult] = useState<any | null>(null);
  const [mapOtdrRunning, setMapOtdrRunning] = useState(false);
  const [mapOtdrError, setMapOtdrError] = useState<string | null>(null);
  const [mapOtdrCopied, setMapOtdrCopied] = useState(false);

  // ─── Carregar rotas/cabos ──────────────────────────────────────────────
  const loadRoutes = useCallback(async () => {
    try {
      if (isOnline()) {
        const data = await client.infraMap.routes.query();
        setRoutes(data as any[]);
      }
    } catch { setRoutes([]); }
  }, [serverUrl, token]);

  async function handleMapBalance() {
    if (!selectedEl) { setMapBalanceError("Elemento não encontrado no mapa"); return; }
    setMapBalance(null); setMapBalanceError(null); setMapBalanceLoading(true); setMapBalanceOpen(true);
    try {
      const result = await client.infraMap.opticalBalance.query({ ctoElementId: selectedEl.id });
      setMapBalance(result);
    } catch (e: any) { setMapBalanceError(e?.message ?? "Erro ao calcular balanço"); }
    setMapBalanceLoading(false);
  }

  async function handleMapOtdrOpen() {
    if (!selectedEl) return;
    setMapOtdrTubes([]); setMapOtdrTubeId(""); setMapOtdrViaNum(""); setMapOtdrDist(""); setMapOtdrResult(null); setMapOtdrError(null); setMapOtdrOpen(true);
    try {
      const data = await client.infraMap.tubesByElement.query({ elementId: selectedEl.id });
      setMapOtdrTubes(data as any[]);
    } catch { setMapOtdrTubes([]); }
  }

  async function runMapOtdr() {
    if (!selectedEl || !mapOtdrTubeId || !mapOtdrViaNum || !mapOtdrDist) { setMapOtdrError("Preencha todos os campos"); return; }
    setMapOtdrRunning(true); setMapOtdrError(null); setMapOtdrResult(null);
    try {
      const result = await client.infraMap.traceOtdr.query({
        elementId: selectedEl.id,
        tubeId: parseInt(mapOtdrTubeId),
        viaNumber: parseInt(mapOtdrViaNum),
        distanceMeters: parseFloat(mapOtdrDist),
      });
      setMapOtdrResult(result);
    } catch (e: any) { setMapOtdrError(e?.message ?? "Erro ao executar OTDR"); }
    setMapOtdrRunning(false);
  }

  // ─── Vincular CTO ao SGP (mobile) ──────────────────────────────────
  const [linkSgpOpen, setLinkSgpOpen] = useState(false);
  const [linkSgpSearch, setLinkSgpSearch] = useState("");
  const [linkSgpSearchDebounced, setLinkSgpSearchDebounced] = useState("");
  const [linkSgpSelectedId, setLinkSgpSelectedId] = useState<number | null>(null);
  const [linkSgpCtos, setLinkSgpCtos] = useState<any[]>([]);
  const [linkSgpLoading, setLinkSgpLoading] = useState(false);
  const [linkSgpSaving, setLinkSgpSaving] = useState(false);
  const [linkSgpError, setLinkSgpError] = useState<string | null>(null);
  const [linkSgpLinkedIds, setLinkSgpLinkedIds] = useState<Set<number>>(new Set());
  const [linkSgpNameMap, setLinkSgpNameMap] = useState<Record<number, string>>({});
  // Debounce de 300ms na pesquisa SGP (mobile)
  useEffect(() => {
    const t = setTimeout(() => setLinkSgpSearchDebounced(linkSgpSearch), 300);
    return () => clearTimeout(t);
  }, [linkSgpSearch]);

  // ─── Clientes SGP (mobile) ─────────────────────────────────────────────
  const [sgpClients, setSgpClients] = useState<any[]>([]);
  const [sgpClientsLoading, setSgpClientsLoading] = useState(false);
  useEffect(() => {
    if (!selectedCto?.sgpId || !isOnline()) { setSgpClients([]); return; }
    setSgpClientsLoading(true);
    client.sgp.queryClientsByCto.query({ ctoName: selectedCto.name ?? "", sgpId: selectedCto.sgpId })
      .then((res: any) => { setSgpClients(res.clients ?? []); })
      .catch(() => { setSgpClients([]); })
      .finally(() => setSgpClientsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCto?.id, selectedCto?.sgpId]);

  // ─── Carregar bandejas ao abrir formulário Novo Tubo (CEO) ─────────────
  useEffect(() => {
    if (panelView !== "newTube" || panelType !== "ceo") return;
    const ceoId = selectedCeo?.id;
    if (!ceoId) return;
    setBandejasLoading(true);
    client.ceoBandejas.byCeo.query({ ceoId })
      .then((data: any) => setBandejas(data ?? []))
      .catch(() => setBandejas([]))
      .finally(() => setBandejasLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelView, panelType, selectedCeo?.id]);

  // ─── Carregar dados ─────────────────────────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadRoutes(); }, [loadRoutes]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (isOnline()) {
        const [els, ceoList, ctoList] = await Promise.all([
          client.infraMap.elements.query(),
          client.ceos.list.query({}),
          client.ctos.list.query(),
        ]);
        setElements(els as MapEl[]);
        setCeos(ceoList as Ceo[]);
        setCtos(ctoList as Cto[]);
        await saveOfflineCache("map_elements", els);
        await saveOfflineCache("ceos_list", ceoList);
        await saveOfflineCache("ctos_list", ctoList);
      } else {
        const [els, ceoList, ctoList] = await Promise.all([
          loadOfflineCache<MapEl[]>("map_elements"),
          loadOfflineCache<Ceo[]>("ceos_list"),
          loadOfflineCache<Cto[]>("ctos_list"),
        ]);
        setElements(els ?? []);
        setCeos(ceoList ?? []);
        setCtos(ctoList ?? []);
      }
    } catch {
      const [els, ceoList, ctoList] = await Promise.all([
        loadOfflineCache<MapEl[]>("map_elements"),
        loadOfflineCache<Ceo[]>("ceos_list"),
        loadOfflineCache<Cto[]>("ctos_list"),
      ]);
      setElements(els ?? []);
      setCeos(ceoList ?? []);
      setCtos(ctoList ?? []);
    } finally { setLoading(false); }
  }, [serverUrl, token]);

  const loadTubes = async (refId: number, type: "ceo" | "cto") => {
    try {
      if (isOnline()) {
        const data = type === "ceo"
          ? await client.ceoTubes.byCeo.query({ ceoId: refId })
          : await client.ctoTubes.byCto.query({ ctoId: refId });
        setTubes(data as unknown as Tube[]);
      }
    } catch { setTubes([]); }
  };

  const loadVias = async (tubeId: number, type: "ceo" | "cto") => {
    try {
      if (isOnline()) {
        const data = type === "ceo"
          ? await client.ceoVias.byTube.query({ tubeId })
          : await client.ctoVias.byTube.query({ tubeId });
        setVias(data as unknown as Via[]);
      }
    } catch { setVias([]); }
  };

  const loadAllVias = async (refId: number, type: "ceo" | "cto") => {
    try {
      if (isOnline()) {
        const data = type === "ceo"
          ? await client.ceoVias.byCeo.query({ ceoId: refId })
          : await client.ctoVias.byCto.query({ ctoId: refId });
        setAllVias(data as unknown as Via[]);
      }
    } catch { setAllVias([]); }
  };

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Auto-focus em CEO/CTO/coords quando vindo de outra tela ────────────
  useEffect(() => {
    if (!focusType || loading) return;
    if (focusType === "coords" && focusCoords && mapRef.current) {
      mapRef.current.setView([focusCoords.lat, focusCoords.lng], 17, { animate: true });
      // Adicionar marcador temporário
      const pinIcon = L.divIcon({
        html: `<div style="position:relative;width:28px;height:28px">
          <div style="position:absolute;inset:0;border-radius:50%;background:#f59e0b;opacity:0.25;animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite"></div>
          <div style="position:absolute;inset:4px;border-radius:50%;background:#f59e0b;border:2px solid white;box-shadow:0 0 8px rgba(245,158,11,0.8)"></div>
        </div>`,
        className: "", iconSize: [28, 28], iconAnchor: [14, 14],
      });
      const m = L.marker([focusCoords.lat, focusCoords.lng], { icon: pinIcon }).addTo(mapRef.current);
      m.bindPopup(`<b>Ponto OTDR</b><br><small>${focusCoords.lat.toFixed(6)}, ${focusCoords.lng.toFixed(6)}</small>`).openPopup();
      setTimeout(() => { try { m.remove(); } catch {} }, 10000);
      onFocusConsumed?.();
      return;
    }
    if (!focusId) return;
    const el = elements.find(e => e.type === focusType && e.referenceId === focusId);
    if (!el || !mapRef.current) return;
    const ref = focusType === "ceo"
      ? ceos.find(c => c.id === focusId)
      : ctos.find(c => c.id === focusId);
    if (!ref) return;
    mapRef.current.setView([el.lat, el.lng], 17, { animate: true });
    setSelectedEl(el);
    setPanelType(focusType as "ceo" | "cto");
    if (focusType === "ceo") { setSelectedCeo(ref as Ceo); setSelectedCto(null); }
    else { setSelectedCto(ref as Cto); setSelectedCeo(null); }
    setTubes([]); setVias([]); setAllVias([]);
    setPanelView("detail");
    setError(null);
    setPanelOpen(true);
    loadTubes(focusId, focusType as "ceo" | "cto");
    onFocusConsumed?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusType, focusId, focusCoords, loading, elements, ceos, ctos]);

  // ─── Inicializar mapa ───────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: [-15.7801, -47.9292], zoom: 13,
      zoomControl: true,
    });
    const tile = createStreetLayer();
    tile.addTo(map);
    tileLayerRef.current = tile;
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; tileLayerRef.current = null; };
  }, []);

  // ─── Trocar camada base (Mapa / Satélite) ─────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // Remove tile layer atual
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
    }
    const newTile = isSatellite ? createSatelliteLayer() : createStreetLayer();
    if (!isSatellite) clampZoomForStreet(map);
    newTile.addTo(map);
    // Garantir que o tile fique abaixo dos markers
    newTile.bringToBack();
    tileLayerRef.current = newTile;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSatellite]);

  // ─── Função de localização do técnico ─────────────────────────────────────────────────────
  const handleMyLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Geolocalização não suportada neste dispositivo");
      return;
    }
    setGpsLocating(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        const map = mapRef.current;
        if (!map) {
          setGpsLocating(false);
          setError("Mapa não inicializado. Aguarde e tente novamente.");
          return;
        }
        // Remove marcador anterior
        if (myLocationMarkerRef.current) {
          try { (myLocationMarkerRef.current as any).remove(); } catch {}
          myLocationMarkerRef.current = null;
        }
        const myIcon = L.divIcon({
          html: `<div style="position:relative;width:32px;height:32px">
            <div style="position:absolute;inset:-6px;border-radius:50%;background:#3b82f6;opacity:0.15;animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite"></div>
            <div style="position:absolute;inset:0;border-radius:50%;background:#3b82f6;border:3px solid white;box-shadow:0 0 12px rgba(59,130,246,0.9);display:flex;align-items:center;justify-content:center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><circle cx="12" cy="12" r="5"/></svg>
            </div>
          </div>`,
          className: "",
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });
        // Navega até a posição e coloca o marcador
        map.setView([lat, lng], 17, { animate: true });
        const marker = L.marker([lat, lng], { icon: myIcon }).addTo(map);
        marker.bindPopup(
          `<b>&#128205; Você está aqui</b><br><small>${lat.toFixed(6)}, ${lng.toFixed(6)}</small><br><small>Precisão: ~${Math.round(accuracy)}m</small>`
        ).openPopup();
        myLocationMarkerRef.current = marker as unknown as L.CircleMarker;
        setGpsLocating(false);
      },
      (err) => {
        setGpsLocating(false);
        const msg =
          err.code === 1 ? "Permissão de GPS negada. Habilite a localização no navegador."
          : err.code === 2 ? "GPS indisponível. Verifique se o GPS está ativado."
          : "Tempo esgotado ao obter GPS. Tente novamente ao ar livre.";
        setError(msg);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }, []);

  // ─── Renderizar cabos/rotas ─────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || loading || routes.length === 0) return;
    // Limpar polylines antigas
    Object.values(polylinesRef.current).forEach(p => p.remove());
    polylinesRef.current = {};
    if (!showCables) return;
    routes.forEach((r: any) => {
      const latlngs: L.LatLngExpression[] = [];
      const fromEl = elements.find((e: any) => e.id === r.fromElementId);
      const toEl = elements.find((e: any) => e.id === r.toElementId);
      if (fromEl) latlngs.push([Number(fromEl.lat), Number(fromEl.lng)]);
      if (r.path) { try { (JSON.parse(r.path) as any[]).forEach((pt: any) => latlngs.push([pt.lat, pt.lng])); } catch {} }
      if (toEl) latlngs.push([Number(toEl.lat), Number(toEl.lng)]);
      if (latlngs.length < 2) return;
      const color = r.color ?? "#22d3ee";
      const polyline = L.polyline(latlngs, { color, weight: 3, opacity: 0.85 }).addTo(mapRef.current!);
      polyline.bindTooltip(r.name ?? "Cabo", { sticky: true, className: "leaflet-cable-tooltip" });
      polylinesRef.current[r.id] = polyline;
    });
  }, [routes, elements, loading, showCables]);

  // ─── Renderizar marcadores ──────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || loading) return;
    // Remover marcadores antigos
    Object.values(markersRef.current).forEach(m => m.remove());
    markersRef.current = {};

    const bounds: L.LatLngExpression[] = [];

    // Aplicar filtros
    const filteredElements = elements.filter(el => {
      if (filterType !== "all" && el.type !== filterType) return false;
      if (filterStatus !== "all") {
        const ref = el.type === "ceo"
          ? ceos.find(c => c.id === el.referenceId)
          : ctos.find(c => c.id === el.referenceId);
        const status = (ref as any)?.status ?? "active";
        if (filterStatus === "active" && status !== "active") return false;
        if (filterStatus === "inactive" && status === "active") return false;
      }
      return true;
    });

    filteredElements.forEach(el => {
      const isCeo = el.type === "ceo";
      const ref = isCeo
        ? ceos.find(c => c.id === el.referenceId)
        : ctos.find(c => c.id === el.referenceId);
      const status = (ref as any)?.status ?? "active";
      const name = (ref as any)?.name ?? "";
      const icon = isCeo ? makeCeoIcon(status, name) : makeCtoIcon(status, name);
      const marker = L.marker([el.lat, el.lng], { icon }).addTo(mapRef.current!);
      marker.on("click", () => {
        if (!ref) return;
        setSelectedEl(el);
        setPanelType(isCeo ? "ceo" : "cto");
        if (isCeo) { setSelectedCeo(ref as Ceo); setSelectedCto(null); }
        else { setSelectedCto(ref as Cto); setSelectedCeo(null); }
        setTubes([]); setVias([]); setAllVias([]);
        setPanelView("detail");
        setError(null);
        setPanelOpen(true);
        loadTubes(el.referenceId, isCeo ? "ceo" : "cto");
      });
      markersRef.current[el.id] = marker;
      bounds.push([el.lat, el.lng]);
    });

    if (bounds.length > 0) {
      try { mapRef.current.fitBounds(bounds as L.LatLngBoundsExpression, { padding: [40, 40], maxZoom: 16 }); }
      catch { /* ignora */ }
    }
  }, [elements, ceos, ctos, loading, filterType, filterStatus]);

  // ─── GPS ────────────────────────────────────────────────────────────────
  function handleGetGps() {
    if (!navigator.geolocation) { setError("Geolocalização não suportada"); return; }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude.toFixed(8);
        const lng = pos.coords.longitude.toFixed(8);
        let address = `${lat}, ${lng}`;
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=pt-BR`);
          const data = await res.json();
          if (data?.display_name) address = data.display_name;
        } catch { /* ignora */ }
        if (panelType === "ceo") setEditMainForm((f: any) => ({ ...f, location: address }));
        else setEditMainForm((f: any) => ({ ...f, address, lat, lng }));
        setGeoLoading(false);
      },
      () => { setGeoLoading(false); setError("Não foi possível obter a localização."); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  // ─── Helper de UI ───────────────────────────────────────────────────────
  function ErrorBox() {
    if (!error) return null;
    return (
      <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
        <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-red-300">{error}</p>
      </div>
    );
  }

  // ─── Painel: cabeçalho ──────────────────────────────────────────────────
  function PanelHeader({ title, onBack, backLabel }: { title: string; onBack?: () => void; backLabel?: string }) {
    return (
      <div className="bg-zinc-900 border-b border-zinc-800 px-4 pt-3 pb-2.5 flex-shrink-0">
        {onBack && (
          <button onClick={onBack} className="flex items-center gap-1 text-cyan-400 text-xs mb-2">
            <ChevronLeft className="w-3.5 h-3.5" /> {backLabel ?? "Voltar"}
          </button>
        )}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">{title}</h2>
          <button onClick={() => setPanelOpen(false)} className="text-zinc-500 hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAINEL: DETAIL
  // ═══════════════════════════════════════════════════════════════════════════
  function PanelDetail() {
    const name = panelType === "ceo" ? selectedCeo?.name : selectedCto?.name;
    const addr = panelType === "ceo" ? selectedCeo?.location : selectedCto?.address;
    const status = panelType === "ceo" ? selectedCeo?.status : selectedCto?.status;
    const notes = panelType === "ceo" ? selectedCeo?.notes : selectedCto?.notes;
    const pct = panelType === "cto" && selectedCto?.capacity
      ? Math.round(((selectedCto.usedPorts ?? 0) / selectedCto.capacity) * 100)
      : null;

    return (
      <>
        <PanelHeader
          title={name ?? ""}
          onBack={undefined}
        />
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* Tipo badge */}
          <div className="flex items-center gap-2">
            {panelType === "ceo"
              ? <div className="flex items-center gap-1.5 bg-violet-500/10 border border-violet-500/20 rounded-lg px-2 py-1"><Cable className="w-3.5 h-3.5 text-violet-400" /><span className="text-xs text-violet-300">CEO</span></div>
              : <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2 py-1"><Radio className="w-3.5 h-3.5 text-emerald-400" /><span className="text-xs text-emerald-300">CTO</span></div>
            }
            {status && <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_COLOR[status] ?? "bg-zinc-500/20 text-zinc-400"}`}>{STATUS_LABEL[status] ?? status}</span>}
          </div>

          {/* Endereço */}
          {addr && (
            <div className="flex items-start gap-2">
              <MapPin className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-zinc-300">{addr}</p>
            </div>
          )}

          {/* Capacidade CTO */}
          {panelType === "cto" && selectedCto?.capacity != null && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500">Capacidade</span>
                <span className="text-zinc-200">{selectedCto.usedPorts ?? 0} / {selectedCto.capacity} portas</span>
              </div>
              {pct !== null && (
                <div className="w-full bg-zinc-800 rounded-full h-1.5">
                  <div className={`h-1.5 rounded-full ${pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
              )}
            </div>
          )}

          {/* Observações */}
          {notes && <p className="text-xs text-zinc-400 italic">{notes}</p>}

          {/* Botão deep-link para aba CEO/CTO */}
          {onOpenDetail && (
            <button
              onClick={() => {
                const id = panelType === "ceo" ? selectedCeo?.id : selectedCto?.id;
                if (id) { onOpenDetail(panelType, id); setPanelOpen(false); }
              }}
              className="w-full flex items-center justify-center gap-2 bg-cyan-500/10 border border-cyan-500/30 rounded-xl py-2.5 text-xs text-cyan-300 hover:bg-cyan-500/20 transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
              Abrir na aba {panelType === "ceo" ? "CEO" : "CTO"}
            </button>
          )}
          {/* Botões de ação */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            {isOnline() && (
              <button
                onClick={() => { setEditMainForm(panelType === "ceo" ? { ...selectedCeo } : { ...selectedCto }); setError(null); setPanelView("editMain"); }}
                className="flex items-center justify-center gap-1.5 bg-zinc-800 border border-zinc-700 rounded-xl py-2.5 text-xs text-white"
              >
                <Edit2 className="w-3.5 h-3.5" /> Editar
              </button>
            )}
            <button
              onClick={() => { setPanelView("tubes"); }}
              className="flex items-center justify-center gap-1.5 bg-zinc-800 border border-zinc-700 rounded-xl py-2.5 text-xs text-white"
            >
              <Layers className="w-3.5 h-3.5" /> Tubos ({tubes.length})
            </button>
          </div>
          {/* Vincular ao SGP (apenas CTO, apenas admin) */}
          {panelType === "cto" && isOnline() && isMobileAdmin && (
            <div className="border-t border-zinc-800 pt-2">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <Users className="w-3.5 h-3.5" /> Vínculo SGP
                </div>
                {selectedCto?.sgpId ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-emerald-400 font-mono">ID {selectedCto.sgpId}</span>
                    <button
                      className="text-[10px] text-red-400"
                      onClick={async () => {
                        if (!selectedCto?.id) return;
                        try {
                          await client.sgp.unlinkCtoFromSgp.mutate({ ctoId: selectedCto.id });
                          setSelectedCto(prev => prev ? { ...prev, sgpId: null } : prev);
                          setCtos(prev => prev.map(c => c.id === selectedCto.id ? { ...c, sgpId: null } : c));
                        } catch (e: any) { setError(e.message ?? "Erro ao desvincular"); }
                      }}
                    >
                      <Unlink className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    className="text-[10px] text-cyan-400 underline"
                    onClick={async () => {
                      setLinkSgpSearch("");
                      setLinkSgpSelectedId(null);
                      setLinkSgpError(null);
                      setLinkSgpLoading(true);
                      setLinkSgpOpen(true);
                      try {
                        const [ctosRes, linkedRes] = await Promise.all([
                          client.sgp.listCtos.query(),
                          client.sgp.linkedSgpIds.query(),
                        ]);
                        const ctosData = ctosRes as any;
                        if (ctosData.error) {
                          setLinkSgpError(ctosData.error);
                          setLinkSgpCtos([]);
                        } else {
                          setLinkSgpCtos(ctosData.ctos ?? []);
                        }
                        const linkedData = linkedRes as any;
                        const ids = linkedData.ids ?? [];
                        const nameMap = linkedData.nameMap ?? {};
                        // Excluir o sgpId da CTO actual
                        const currentSgpId = selectedCto?.sgpId;
                        const filteredIds = ids.filter((id: number) => id !== currentSgpId);
                        setLinkSgpLinkedIds(new Set(filteredIds));
                        setLinkSgpNameMap(nameMap);
                      } catch (e: any) {
                        setLinkSgpError(e.message ?? "Erro ao carregar CTOs");
                        setLinkSgpCtos([]);
                      } finally { setLinkSgpLoading(false); }
                    }}
                  >
                    + Vincular ao SGP
                  </button>
                )}
              </div>
            </div>
          )}
          {/* Clientes SGP (apenas CTO com sgpId) */}
          {panelType === "cto" && selectedCto?.sgpId && isOnline() && (
            <div className="border-t border-zinc-800 pt-2">
              <div className="flex items-center gap-1.5 text-xs text-zinc-400 mb-1.5">
                <Users className="w-3.5 h-3.5" /> ONUs SGP
              </div>
              {sgpClientsLoading ? (
                <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                  <Loader2 className="w-3 h-3 animate-spin" /> Consultando SGP...
                </div>
              ) : sgpClients.length > 0 ? (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {sgpClients.map((c: any, i: number) => {
                    const isOnlineStatus = String(c.status ?? '').toLowerCase() === 'online';
                    return (
                      <div key={i} className="text-xs rounded bg-zinc-800/60 px-1.5 py-1 space-y-0.5">
                        {/* Nome do cliente + status */}
                        <div className="flex items-center gap-1.5">
                          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isOnlineStatus ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                          <span className="truncate text-zinc-200 font-medium">{c.name ?? c.login ?? `ONU ${i + 1}`}</span>
                          <span className={`ml-auto text-[10px] flex-shrink-0 ${isOnlineStatus ? 'text-emerald-400' : 'text-zinc-500'}`}>{c.status ?? ''}</span>
                        </div>
                        {/* Login do serviço */}
                        {c.login && c.login !== c.name && (
                          <div className="text-[10px] text-zinc-500 pl-3">Login: {c.login}</div>
                        )}
                        {/* MAC */}
                        {c.phy_addr && <div className="text-[10px] text-zinc-500 font-mono pl-3">MAC: {c.phy_addr}</div>}
                        {/* OLT / Slot / PON / Porta CTO */}
                        {(c.olt || c.slot != null || c.pon != null || c.ctoport != null) && (
                          <div className="text-[10px] text-zinc-500 pl-3">
                            {c.olt && <span>{c.olt}</span>}
                            {c.slot != null && <span className="ml-1">Slot {c.slot}</span>}
                            {c.pon != null && <span className="ml-1">PON {c.pon}</span>}
                            {c.ctoport != null && <span className="ml-1">&middot; Porta {c.ctoport}</span>}
                          </div>
                        )}
                        {/* Sinal RX/TX */}
                        {(c.rx != null || c.tx != null) && (
                          <div className="text-[10px] text-zinc-500 pl-3">
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
              ) : (
                <div className="text-xs text-zinc-500">Nenhuma ONU vinculada</div>
              )}
            </div>
          )}
          {/* Botões Balanço Óptico e OTDR (apenas CTO online) */}
          {panelType === "cto" && isOnline() && selectedEl && (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleMapBalance}
                className="flex items-center justify-center gap-1.5 bg-cyan-500/10 border border-cyan-500/30 rounded-xl py-2.5 text-xs text-cyan-300 hover:bg-cyan-500/20 transition-colors"
              >
                <BarChart2 className="w-3.5 h-3.5" /> Balanço Óptico
              </button>
              <button
                onClick={handleMapOtdrOpen}
                className="flex items-center justify-center gap-1.5 bg-amber-500/10 border border-amber-500/30 rounded-xl py-2.5 text-xs text-amber-300 hover:bg-amber-500/20 transition-colors"
              >
                <Zap className="w-3.5 h-3.5" /> OTDR Virtual
              </button>
            </div>
          )}
          {/* Botão Exportar PDF de Fusões */}
          {isOnline() && (() => {
            const name = panelType === "ceo" ? selectedCeo?.name : selectedCto?.name;
            const status = panelType === "ceo" ? selectedCeo?.status : selectedCto?.status;
            if (!name) return null;
            return (
              <button
                onClick={async () => {
                  try {
                    // Garantir que todas as vias estejam carregadas antes de gerar o PDF
                    const refId = panelType === "ceo" ? selectedCeo?.id : selectedCto?.id;
                    if (!refId) { setError("Elemento não selecionado"); return; }
                    // Buscar tubos se ainda não carregados
                    let pdfTubes = tubes;
                    if (pdfTubes.length === 0) {
                      const tData = panelType === "ceo"
                        ? await client.ceoTubes.byCeo.query({ ceoId: refId })
                        : await client.ctoTubes.byCto.query({ ctoId: refId });
                      pdfTubes = tData as unknown as Tube[];
                      setTubes(pdfTubes);
                    }
                    // Sempre buscar TODAS as vias do CEO/CTO para o PDF (não depender do estado allVias)
                    const vData = panelType === "ceo"
                      ? await client.ceoVias.byCeo.query({ ceoId: refId })
                      : await client.ctoVias.byCto.query({ ctoId: refId });
                    const pdfAllVias = vData as unknown as Via[];
                    setAllVias(pdfAllVias);
                    // Para CEO: buscar splitters, vias de splitters e associações
                    type Splitter = { id: number; identifier: string; type: string; ratio: string; bandejaId?: number | null; notes?: string | null };
                    type SplitterVia = { id: number; splitterId: number; viaNumber: number; label: string | null; lossDb: number | null; notes: string | null };
                    type ViaAssoc = { id: number; sourceType: string; sourceViaId: number; targetType: string; targetViaId: number };
                    let pdfSplitters: Splitter[] = [];
                    let pdfSplitterVias: SplitterVia[] = [];
                    let pdfAssociations: ViaAssoc[] = [];
                    if (panelType === "ceo") {
                      try {
                        const [splData, assocData] = await Promise.all([
                          (client as any).ceoSplitters.byCeo.query({ ceoId: refId }),
                          (client as any).ceoViaAssociations.byCeo.query({ ceoId: refId }),
                        ]);
                        pdfSplitters = splData as Splitter[];
                        pdfAssociations = assocData as ViaAssoc[];
                        // Buscar vias de cada splitter em paralelo
                        const splViaArrays = await Promise.all(
                          pdfSplitters.map((s: Splitter) =>
                            (client as any).ceoSplitterVias.bySplitter.query({ splitterId: s.id }).catch(() => [])
                          )
                        );
                        pdfSplitterVias = splViaArrays.flat() as SplitterVia[];
                      } catch { /* ignora erro — continua sem splitters */ }
                    }
                    // Gerar HTML localmente (igual à versão web) e abrir em nova aba
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
                        blue: { bg: "#dbeafe", text: "#1d4ed8", border: "#93c5fd" }, green: { bg: "#dcfce7", text: "#15803d", border: "#86efac" },
                        yellow: { bg: "#fef9c3", text: "#854d0e", border: "#fde047" }, red: { bg: "#fee2e2", text: "#b91c1c", border: "#fca5a5" },
                        orange: { bg: "#ffedd5", text: "#c2410c", border: "#fdba74" }, purple: { bg: "#f3e8ff", text: "#7e22ce", border: "#d8b4fe" },
                        pink: { bg: "#fce7f3", text: "#be185d", border: "#f9a8d4" }, white: { bg: "#f9fafb", text: "#374151", border: "#d1d5db" },
                        black: { bg: "#1f2937", text: "#f9fafb", border: "#374151" }, gray: { bg: "#f3f4f6", text: "#374151", border: "#d1d5db" },
                        brown: { bg: "#fef3c7", text: "#78350f", border: "#fcd34d" }, cyan: { bg: "#cffafe", text: "#0e7490", border: "#67e8f9" },
                      };
                      const st = cm[colorName.toLowerCase().trim()] ?? { bg: "#f3f4f6", text: "#374151", border: "#d1d5db" };
                      return `<span style='background:${st.bg};color:${st.text};border:1px solid ${st.border};padding:1px 6px;border-radius:3px;font-size:7pt;font-weight:700;margin-left:6mm'>${colorName.toUpperCase()}</span>`;
                    };
                    const viaById: Record<number, Via> = {};
                    for (const v of pdfAllVias) viaById[v.id] = v;
                    const tubeById: Record<number, Tube> = {};
                    for (const t of pdfTubes) tubeById[t.id] = t;
                    const viasByTube: Record<number, Via[]> = {};
                    for (const v of pdfAllVias) {
                      if (!viasByTube[v.tubeId]) viasByTube[v.tubeId] = [];
                      viasByTube[v.tubeId].push(v);
                    }
                    for (const k of Object.keys(viasByTube)) viasByTube[Number(k)].sort((a, b) => a.viaNumber - b.viaNumber);
                    const splitterViaById: Record<number, SplitterVia> = {};
                    for (const sv of pdfSplitterVias) splitterViaById[sv.id] = sv;
                    const assocByViaId: Record<number, ViaAssoc> = {};
                    for (const a of pdfAssociations) {
                      assocByViaId[a.sourceViaId] = a;
                      assocByViaId[a.targetViaId] = a;
                    }
                    const totalVias = pdfTubes.reduce((s, t) => s + t.totalVias, 0);
                    const fusedVias = pdfAllVias.filter(v => v.fusedToViaId !== null || assocByViaId[v.id] !== undefined).length;
                    const now = new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
                    const renderTubeHtml = (tube: Tube): string => {
                      const vias = viasByTube[tube.id] ?? [];
                      const fused = vias.filter(v => v.fusedToViaId !== null || assocByViaId[v.id] !== undefined).length;
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
                        ${vias.map((via, idx) => {
                          const ft = via.fusedToTubeId ? tubeById[via.fusedToTubeId] : null;
                          const fv = via.fusedToViaId ? viaById[via.fusedToViaId] : null;
                          const ok = !!(ft && fv);
                          // Verificar associação com splitter
                          const assoc = assocByViaId[via.id];
                          const hasAssoc = !!assoc;
                          const bg = idx % 2 === 0 ? "#fff" : "#f8f9fa";
                          const lbl = via.label ? "<b>" + escH(via.label) + "</b>" : "<span style='color:#9ca3af;font-style:italic'>&mdash;</span>";
                          let st: string;
                          let fc: string;
                          let ft2: string;
                          if (ok) {
                            st = "<span style='background:#d1fae5;color:#059669;padding:1px 5px;border-radius:3px;font-size:7pt;font-weight:700'>FUSIONADA</span>";
                            fc = "#059669";
                            ft2 = "VIA " + fv!.viaNumber + " do " + escH(ft!.identifier) + (fv!.label ? " (" + escH(fv!.label) + ")" : "");
                          } else if (hasAssoc) {
                            st = "<span style='background:#f0fdf4;color:#16a34a;padding:1px 5px;border-radius:3px;font-size:7pt;font-weight:700'>ASSOCIADA</span>";
                            fc = "#16a34a";
                            const isSrc = assoc.sourceViaId === via.id;
                            const otherId = isSrc ? assoc.targetViaId : assoc.sourceViaId;
                            const otherType = isSrc ? assoc.targetType : assoc.sourceType;
                            if (otherType === "splitter") {
                              const sv = splitterViaById[otherId];
                              const sp = sv ? pdfSplitters.find(s => s.id === sv.splitterId) : null;
                              ft2 = sv && sp ? `VIA ${String(sv.viaNumber).padStart(2,"0")} do Splitter ${escH(sp.identifier)}` : `Splitter Via #${otherId}`;
                            } else {
                              const ov = viaById[otherId];
                              const ot = ov ? tubeById[ov.tubeId] : null;
                              ft2 = ov && ot ? `VIA ${ov.viaNumber} do ${escH(ot.identifier)}` : `Via #${otherId}`;
                            }
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
                    };
                    // Renderizar seção de splitter para o PDF (CEO)
                    const splitterViasBySplitter: Record<number, SplitterVia[]> = {};
                    for (const sv of pdfSplitterVias) {
                      if (!splitterViasBySplitter[sv.splitterId]) splitterViasBySplitter[sv.splitterId] = [];
                      splitterViasBySplitter[sv.splitterId].push(sv);
                    }
                    for (const k of Object.keys(splitterViasBySplitter)) splitterViasBySplitter[Number(k)].sort((a, b) => a.viaNumber - b.viaNumber);
                    const renderSplitterHtml = (spl: Splitter): string => {
                      const vias = splitterViasBySplitter[spl.id] ?? [];
                      const entrada = vias.find(v => v.viaNumber === 0);
                      const saidas = vias.filter(v => v.viaNumber > 0);
                      const typeLabel = spl.type === "balanced" ? "Balanceado" : "Desbalanceado";
                      const rows = [...(entrada ? [entrada] : []), ...saidas];
                      return `<div class="tube-section">
                        <div class="tube-title splitter-title">
                          ⊕ SPLITTER &mdash; ${escH(spl.identifier)}
                          <span style="font-weight:400;font-size:7.5pt;margin-left:4mm;color:#92400e">${typeLabel} &middot; ${escH(spl.ratio)}</span>
                          <span style="font-weight:400;font-size:8pt;margin-left:6mm;color:#6b7280">${vias.length} vias (1 entrada + ${saidas.length} saídas)</span>
                        </div>
                        <table><thead><tr>
                          <th style="width:8%">VIA</th><th style="width:12%">TIPO</th><th style="width:18%">ETIQUETA</th>
                          <th style="width:10%">PERDA (dB)</th><th style="width:32%">ASSOCIAÇÃO</th><th>OBSERVAÇÕES</th>
                        </tr></thead><tbody>
                        ${rows.map((via, idx) => {
                          const isEntrada = via.viaNumber === 0;
                          const bg = idx % 2 === 0 ? "#fff" : "#f8f9fa";
                          const lbl = via.label ? "<b>" + escH(via.label) + "</b>" : "<span style='color:#9ca3af;font-style:italic'>&mdash;</span>";
                          const tipoTag = isEntrada
                            ? "<span style='background:#fef3c7;color:#92400e;padding:1px 4px;border-radius:3px;font-size:6.5pt;font-weight:700'>ENTRADA</span>"
                            : "<span style='background:#e0f2fe;color:#0c4a6e;padding:1px 4px;border-radius:3px;font-size:6.5pt'>SAÍDA</span>";
                          const loss = isEntrada ? "0 dB" : (via.lossDb !== null ? `~${via.lossDb} dB` : "&mdash;");
                          const myAssocs = pdfAssociations.filter(a =>
                            (a.sourceType === "splitter" && a.sourceViaId === via.id) ||
                            (a.targetType === "splitter" && a.targetViaId === via.id)
                          );
                          const assocText = myAssocs.map(a => {
                            const isSrc = a.sourceType === "splitter" && a.sourceViaId === via.id;
                            const otherId = isSrc ? a.targetViaId : a.sourceViaId;
                            const otherType = isSrc ? a.targetType : a.sourceType;
                            if (otherType === "tube") {
                              const ov = viaById[otherId];
                              const ot = ov ? tubeById[ov.tubeId] : null;
                              return ov && ot ? `VIA ${String(ov.viaNumber).padStart(2,"0")} · ${escH(ot.identifier)}` : `Via #${otherId}`;
                            } else {
                              const sv = splitterViaById[otherId];
                              const sp = sv ? pdfSplitters.find(s => s.id === sv.splitterId) : null;
                              return sv && sp ? `VIA ${String(sv.viaNumber).padStart(2,"0")} · ${escH(sp.identifier)}` : `Via #${otherId}`;
                            }
                          }).join(", ");
                          const viaNum = isEntrada ? "<span style='background:#f3e8ff;color:#7c3aed;border:1px solid #c4b5fd;padding:2px 7px;border-radius:3px;font-size:8pt;font-weight:700'>ENT</span>" : `<b>${String(via.viaNumber).padStart(2,"0")}</b>`;
                          return `<tr style='background:${bg}'><td style='text-align:center'>${viaNum}</td><td style='text-align:center'>${tipoTag}</td><td>${lbl}</td><td style='text-align:center;color:#6b7280'>${loss}</td><td style='font-size:8pt;color:${myAssocs.length > 0 ? "#059669" : "#9ca3af"}'>${assocText || "&mdash;"}</td><td style='font-size:8pt;color:#6b7280'>${escH(via.notes)}</td></tr>`;
                        }).join("")}
                        </tbody></table></div>`;
                    };
                    const splitterContent = pdfSplitters.map(s => renderSplitterHtml(s)).join("");
                    const allContent = pdfTubes.map(t => renderTubeHtml(t)).join("") + splitterContent;
                    const elNameSafe = escH(name);
                    const statusColor = status === "active" ? "#059669" : "#d97706";
                    const statusLabel = status === "active" ? "Ativo" : status === "maintenance" ? "Manuten&ccedil;&atilde;o" : "Inativo";
                    const statsHtml = [
                      { l: "Tubos", v: pdfTubes.length },
                      { l: "Splitters", v: pdfSplitters.length },
                      { l: "Total de Vias", v: totalVias },
                      { l: "Vias Fusionadas", v: fusedVias },
                      { l: "Vias Livres", v: totalVias - fusedVias },
                      { l: "Ocupa&ccedil;&atilde;o", v: totalVias > 0 ? Math.round((fusedVias / totalVias) * 100) + "%" : "0%" },
                    ].map(s => `<div class='stat'><div class='stat-val'>${s.v}</div><div class='stat-lbl'>${s.l}</div></div>`).join("");
                    const html = `<!DOCTYPE html><html lang="pt-BR"><head>
                      <meta charset="UTF-8">
                      <title>Mapa de Fus&otilde;es &mdash; ${panelType.toUpperCase()} ${elNameSafe}</title>
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
                          <h1>MAPA DE FUS&Otilde;ES &mdash; ${panelType.toUpperCase()}</h1>
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
                    const win = window.open("", "_blank");
                    if (!win) { setError("Popup bloqueado. Permita popups para este site."); return; }
                    win.document.write(html);
                    win.document.close();
                    win.focus();
                    setTimeout(() => win.print(), 600);
                  } catch { setError("Erro ao gerar PDF"); }
                }}
                className="w-full flex items-center justify-center gap-1.5 bg-cyan-500/10 border border-cyan-500/30 rounded-xl py-2.5 text-xs text-cyan-300 hover:bg-cyan-500/20 transition-colors"
              >
                <Layers className="w-3.5 h-3.5" /> Exportar Fusões PDF
              </button>
            );
          })()}
        </div>
      </>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAINEL: EDIT MAIN (CEO ou CTO)
  // ═══════════════════════════════════════════════════════════════════════════
  function PanelEditMain() {
    const isCeo = panelType === "ceo";
    return (
      <>
        <PanelHeader title={`Editar ${isCeo ? "CEO" : "CTO"}`} onBack={() => setPanelView("detail")} backLabel="Cancelar" />
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <ErrorBox />
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Nome *</label>
            <input
              type="text" value={editMainForm.name ?? ""}
              onChange={e => setEditMainForm((f: any) => ({ ...f, name: e.target.value }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">{isCeo ? "Localização" : "Endereço"}</label>
            <button
              type="button" onClick={handleGetGps} disabled={geoLoading}
              className="w-full h-9 flex items-center justify-center gap-2 text-xs font-medium border border-cyan-500/40 text-cyan-400 bg-transparent hover:bg-cyan-500/10 rounded-xl mb-1.5 disabled:opacity-60"
            >
              {geoLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Obtendo GPS...</> : <><LocateFixed className="w-4 h-4" /> Usar Minha Localização</>}
            </button>
            <input
              type="text"
              value={isCeo ? (editMainForm.location ?? "") : (editMainForm.address ?? "")}
              onChange={e => setEditMainForm((f: any) => isCeo ? { ...f, location: e.target.value || null } : { ...f, address: e.target.value || null })}
              placeholder={isCeo ? "Endereço ou coordenadas" : "Rua, número, bairro"}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
            />
          </div>
          {!isCeo && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Latitude</label>
                <input type="number" step="any" value={editMainForm.lat ?? ""} onChange={e => setEditMainForm((f: any) => ({ ...f, lat: e.target.value || null }))} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500" />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Longitude</label>
                <input type="number" step="any" value={editMainForm.lng ?? ""} onChange={e => setEditMainForm((f: any) => ({ ...f, lng: e.target.value || null }))} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500" />
              </div>
            </div>
          )}
          {!isCeo && (
            <div>
              <label className="text-xs text-zinc-400 mb-1.5 block">Status</label>
              <div className="grid grid-cols-3 gap-1.5">
                {[["active", "Ativo"], ["inactive", "Inativo"], ["maintenance", "Manutenção"]].map(([val, label]) => (
                  <button key={val} onClick={() => setEditMainForm((f: any) => ({ ...f, status: val }))}
                    className={`py-2 rounded-xl text-xs font-medium border transition-colors ${editMainForm.status === val ? "bg-cyan-500 border-cyan-500 text-zinc-900" : "bg-zinc-800 border-zinc-700 text-zinc-300"}`}
                  >{label}</button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Observações</label>
            <textarea value={editMainForm.notes ?? ""} onChange={e => setEditMainForm((f: any) => ({ ...f, notes: e.target.value || null }))} rows={2}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 resize-none" />
          </div>
          <button
            onClick={async () => {
              if (!editMainForm.name?.trim()) { setError("O nome é obrigatório"); return; }
              setSaving(true); setError(null);
              try {
                if (isCeo) {
                  await client.ceos.update.mutate({ id: selectedCeo!.id, name: editMainForm.name, location: editMainForm.location ?? undefined, notes: editMainForm.notes ?? undefined });
                  setSelectedCeo({ ...selectedCeo!, ...editMainForm });
                } else {
                  await client.ctos.update.mutate({
                    id: selectedCto!.id, name: editMainForm.name,
                    address: editMainForm.address ?? undefined,
                    lat: editMainForm.lat != null ? parseFloat(String(editMainForm.lat)) : undefined,
                    lng: editMainForm.lng != null ? parseFloat(String(editMainForm.lng)) : undefined,
                    status: editMainForm.status ?? undefined,
                    capacity: editMainForm.capacity ?? undefined,
                    notes: editMainForm.notes ?? undefined,
                  });
                  setSelectedCto({ ...selectedCto!, ...editMainForm });
                }
                await loadData();
                setPanelView("detail");
              } catch (e: any) { setError(e?.message ?? "Erro ao salvar"); }
              finally { setSaving(false); }
            }}
            disabled={saving || !editMainForm.name?.trim()}
            className="w-full bg-cyan-500 disabled:opacity-50 text-zinc-900 font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2"
          >
            {saving ? <div className="w-4 h-4 border-2 border-zinc-900/30 border-t-zinc-900 rounded-full animate-spin" /> : <><Check className="w-4 h-4" /> Salvar</>}
          </button>
        </div>
      </>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAINEL: TUBES LIST
  // ═══════════════════════════════════════════════════════════════════════════
  function PanelTubes() {
    const name = panelType === "ceo" ? selectedCeo?.name : selectedCto?.name;
    return (
      <>
        <PanelHeader title={`Tubos — ${name}`} onBack={() => setPanelView("detail")} backLabel={name} />
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {isOnline() && (
            <button
              onClick={() => { setNewTubeForm({ identifier: `Tubo ${tubes.length + 1}`, color: "blue", totalVias: 12, type: "tube", bandejaId: null }); setError(null); setPanelView("newTube"); }}
              className="w-full flex items-center justify-center gap-1.5 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 rounded-xl py-2.5 text-xs font-medium"
            >
              <Plus className="w-3.5 h-3.5" /> Novo Tubo
            </button>
          )}
          {tubes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-24 text-zinc-600 gap-2 border border-dashed border-zinc-800 rounded-xl">
              <Layers className="w-6 h-6 opacity-40" />
              <p className="text-xs">Nenhum tubo cadastrado</p>
            </div>
          ) : tubes.map(tube => (
            <button
              key={tube.id}
              onClick={() => {
                setSelectedTube(tube);
                const refId = panelType === "ceo" ? selectedCeo!.id : selectedCto!.id;
                loadVias(tube.id, panelType);
                loadAllVias(refId, panelType);
                setPanelView("vias");
              }}
              className="w-full flex items-center gap-3 bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-3 py-2.5 hover:bg-zinc-800 transition-colors text-left"
            >
              <div className={`w-3.5 h-3.5 rounded-full flex-shrink-0 ${TUBE_COLORS[tube.color ?? ""] ?? "bg-zinc-500"}`} />
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium text-white">{tube.identifier}</span>
                <p className="text-[11px] text-zinc-500">{TUBE_COLOR_LABELS[tube.color ?? ""] ?? tube.color} · {tube.totalVias} vias</p>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
            </button>
          ))}
        </div>
      </>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAINEL: NEW TUBE
  // ═══════════════════════════════════════════════════════════════════════════
  function PanelNewTube() {
    const refId = panelType === "ceo" ? selectedCeo!.id : selectedCto!.id;
    // Bandejas são carregadas pelo useEffect no nível do componente principal
    return (
      <>
        <PanelHeader title="Novo Tubo" onBack={() => { setPanelView("tubes"); setBandejas([]); }} backLabel="Cancelar" />
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <ErrorBox />
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Identificador</label>
            <input type="text" value={newTubeForm.identifier} onChange={e => setNewTubeForm(f => ({ ...f, identifier: e.target.value }))} placeholder="ex: Tubo 1" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500" />
          </div>
          {/* Seleção de Bandeja — apenas para CEO */}
          {panelType === "ceo" && (
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Bandeja (opcional)</label>
              {bandejasLoading ? (
                <div className="flex items-center gap-2 py-2 text-zinc-500 text-xs">
                  <div className="w-3 h-3 border border-zinc-600 border-t-cyan-400 rounded-full animate-spin" />
                  Carregando bandejas...
                </div>
              ) : bandejas.length === 0 ? (
                <p className="text-xs text-zinc-500 py-1">Nenhuma bandeja cadastrada neste CEO</p>
              ) : (
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => setNewTubeForm(f => ({ ...f, bandejaId: null }))}
                    className={`py-2 rounded-xl text-xs font-medium border transition-colors ${
                      newTubeForm.bandejaId === null
                        ? "bg-cyan-500 border-cyan-500 text-zinc-900"
                        : "bg-zinc-800 border-zinc-700 text-zinc-300"
                    }`}
                  >
                    Sem bandeja
                  </button>
                  {bandejas.map((b: any) => (
                    <button
                      key={b.id}
                      onClick={() => setNewTubeForm(f => ({ ...f, bandejaId: b.id }))}
                      className={`py-2 rounded-xl text-xs font-medium border transition-colors ${
                        newTubeForm.bandejaId === b.id
                          ? "bg-cyan-500 border-cyan-500 text-zinc-900"
                          : "bg-zinc-800 border-zinc-700 text-zinc-300"
                      }`}
                    >
                      {b.label ? b.label : `Bandeja ${b.number}`}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div>
            <label className="text-xs text-zinc-400 mb-1.5 block">Tipo</label>
            <div className="grid grid-cols-2 gap-2">
              {[["tube", "Tubo"], ["splitter", "Splitter"]].map(([val, label]) => (
                <button key={val} onClick={() => setNewTubeForm(f => ({ ...f, type: val }))} className={`py-2 rounded-xl text-xs font-medium border transition-colors ${newTubeForm.type === val ? "bg-cyan-500 border-cyan-500 text-zinc-900" : "bg-zinc-800 border-zinc-700 text-zinc-300"}`}>{label}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1.5 block">Total de Vias</label>
            <div className="grid grid-cols-4 gap-1.5">
              {[4, 8, 12, 24].map(n => (
                <button key={n} onClick={() => setNewTubeForm(f => ({ ...f, totalVias: n }))} className={`py-2 rounded-xl text-xs font-medium border transition-colors ${newTubeForm.totalVias === n ? "bg-cyan-500 border-cyan-500 text-zinc-900" : "bg-zinc-800 border-zinc-700 text-zinc-300"}`}>{n}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1.5 block">Cor</label>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(TUBE_COLORS).map(([color, cls]) => (
                <button key={color} onClick={() => setNewTubeForm(f => ({ ...f, color }))} className={`w-7 h-7 rounded-full ${cls} border-2 transition-all ${newTubeForm.color === color ? "border-white scale-110" : "border-transparent"}`} title={TUBE_COLOR_LABELS[color]} />
              ))}
            </div>
          </div>
          <button
            onClick={async () => {
              if (!newTubeForm.identifier.trim()) { setError("Informe o identificador"); return; }
              setSaving(true); setError(null);
              try {
                if (panelType === "ceo") {
                  await client.ceoTubes.create.mutate({ ceoId: refId, identifier: newTubeForm.identifier, type: newTubeForm.type as "tube" | "splitter", totalVias: newTubeForm.totalVias, color: newTubeForm.color, ...(newTubeForm.bandejaId ? { bandejaId: newTubeForm.bandejaId } : {}) });
                } else {
                  await client.ctoTubes.create.mutate({ ctoId: refId, identifier: newTubeForm.identifier, type: newTubeForm.type as "tube" | "splitter", totalVias: newTubeForm.totalVias, color: newTubeForm.color });
                }
                await loadTubes(refId, panelType);
                setNewTubeForm({ identifier: "", color: "blue", totalVias: 12, type: "tube", bandejaId: null });
                setBandejas([]);
                setPanelView("tubes");
              } catch (e: any) { setError(e?.message ?? "Erro ao criar tubo"); }
              finally { setSaving(false); }
            }}
            disabled={saving || !newTubeForm.identifier.trim()}
            className="w-full bg-cyan-500 disabled:opacity-50 text-zinc-900 font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2"
          >
            {saving ? <div className="w-4 h-4 border-2 border-zinc-900/30 border-t-zinc-900 rounded-full animate-spin" /> : <><Plus className="w-4 h-4" /> Criar Tubo</>}
          </button>
        </div>
      </>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAINEL: VIAS LIST
  // ═══════════════════════════════════════════════════════════════════════════
  function PanelVias() {
    if (!selectedTube) return null;
    const fused = vias.filter(v => v.fusedToViaId != null).length;
    return (
      <>
        <PanelHeader title={selectedTube.identifier} onBack={() => setPanelView("tubes")} backLabel="Tubos">
        </PanelHeader>
        <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between">
          <p className="text-[11px] text-zinc-500">{vias.length} vias · {fused} fusionadas · {vias.length - fused} livres</p>
          {isOnline() && (
            <button onClick={() => { setEditTubeForm({ ...selectedTube }); setError(null); setPanelView("editTube"); }} className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white">
              <Edit2 className="w-3 h-3" /> Editar tubo
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {vias.length === 0 ? (
            <div className="flex items-center justify-center h-20 text-zinc-600 text-xs">Nenhuma via</div>
          ) : vias.map(via => {
            const fc = VIA_FIBER_COLORS[via.viaNumber];
            const isFused = via.fusedToViaId != null;
            const fusedTube = isFused ? tubes.find(t => t.id === via.fusedToTubeId) : null;
            const fusedVia = isFused ? allVias.find(v => v.id === via.fusedToViaId) : null;
            return (
              <button
                key={via.id}
                onClick={() => { setSelectedVia(via); setEditViaForm({ label: via.label ?? "", notes: via.notes ?? "" }); setFusionTubeId(""); setFusionViaId(""); setError(null); setPanelView("editVia"); }}
                className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2 transition-colors text-left border ${isFused ? "bg-cyan-500/5 border-cyan-500/25 hover:bg-cyan-500/10" : "bg-zinc-900 border-zinc-800 hover:bg-zinc-800/50"}`}
              >
                <div className={`w-5 h-5 rounded-full flex-shrink-0 border border-white/10 flex items-center justify-center text-[9px] font-bold text-white ${fc?.dot ?? "bg-zinc-700"}`}>{via.viaNumber}</div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium text-white">Via {via.viaNumber}</span>
                  {via.label && <span className="text-[11px] text-zinc-400"> — {via.label}</span>}
                  {isFused ? (
                    <p className="text-[10px] text-cyan-300 flex items-center gap-1"><Link2 className="w-2.5 h-2.5" />{fusedTube?.identifier ?? "?"} · Via {fusedVia?.viaNumber ?? "?"}</p>
                  ) : (
                    <p className="text-[10px] text-zinc-600">Livre</p>
                  )}
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
              </button>
            );
          })}
        </div>
      </>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAINEL: EDIT TUBE
  // ═══════════════════════════════════════════════════════════════════════════
  function PanelEditTube() {
    if (!selectedTube) return null;
    const refId = panelType === "ceo" ? selectedCeo!.id : selectedCto!.id;
    return (
      <>
        <PanelHeader title={`Editar ${selectedTube.identifier}`} onBack={() => setPanelView("vias")} backLabel="Cancelar" />
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <ErrorBox />
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Identificador</label>
            <input type="text" value={editTubeForm.identifier ?? ""} onChange={e => setEditTubeForm(f => ({ ...f, identifier: e.target.value }))} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500" />
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1.5 block">Cor</label>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(TUBE_COLORS).map(([color, cls]) => (
                <button key={color} onClick={() => setEditTubeForm(f => ({ ...f, color }))} className={`w-7 h-7 rounded-full ${cls} border-2 transition-all ${editTubeForm.color === color ? "border-white scale-110" : "border-transparent"}`} title={TUBE_COLOR_LABELS[color]} />
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                setSaving(true); setError(null);
                try {
                  if (panelType === "ceo") {
                    await client.ceoTubes.update.mutate({ id: selectedTube.id, identifier: editTubeForm.identifier ?? selectedTube.identifier, color: editTubeForm.color ?? selectedTube.color ?? undefined });
                  } else {
                    await client.ctoTubes.update.mutate({ id: selectedTube.id, identifier: editTubeForm.identifier ?? selectedTube.identifier, color: editTubeForm.color ?? selectedTube.color ?? undefined });
                  }
                  await loadTubes(refId, panelType);
                  setSelectedTube({ ...selectedTube, ...editTubeForm } as Tube);
                  setPanelView("vias");
                } catch (e: any) { setError(e?.message ?? "Erro"); }
                finally { setSaving(false); }
              }}
              disabled={saving}
              className="flex-1 bg-cyan-500 text-zinc-900 font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2"
            >
              {saving ? <div className="w-4 h-4 border-2 border-zinc-900/30 border-t-zinc-900 rounded-full animate-spin" /> : <><Check className="w-4 h-4" /> Salvar</>}
            </button>
            <button
              onClick={async () => {
                if (!confirm("Excluir este tubo e todas as suas vias?")) return;
                setSaving(true);
                try {
                  if (panelType === "ceo") await client.ceoTubes.delete.mutate({ id: selectedTube.id });
                  else await client.ctoTubes.delete.mutate({ id: selectedTube.id });
                  await loadTubes(refId, panelType);
                  setPanelView("tubes");
                } catch (e: any) { setError(e?.message ?? "Erro"); }
                finally { setSaving(false); }
              }}
              disabled={saving}
              className="bg-red-500/10 border border-red-500/30 text-red-400 py-2.5 px-3 rounded-xl text-sm"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAINEL: EDIT VIA
  // ═══════════════════════════════════════════════════════════════════════════
  function PanelEditVia() {
    if (!selectedVia || !selectedTube) return null;
    const isFused = selectedVia.fusedToViaId != null;
    const fusedTube = isFused ? tubes.find(t => t.id === selectedVia.fusedToTubeId) : null;
    const fusedVia = isFused ? allVias.find(v => v.id === selectedVia.fusedToViaId) : null;
    return (
      <>
        <PanelHeader title={`Via ${selectedVia.viaNumber}`} onBack={() => setPanelView("vias")} backLabel={selectedTube.identifier} />
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <ErrorBox />
          {isFused ? (
            <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Link2 className="w-3.5 h-3.5 text-cyan-400" />
                <div>
                  <p className="text-xs font-semibold text-cyan-300">Fusão identificada</p>
                  <p className="text-[10px] text-cyan-200/70">{fusedTube?.identifier ?? "?"} · Via {fusedVia?.viaNumber ?? "?"}</p>
                </div>
              </div>
              <button
                onClick={async () => {
                  setSaving(true);
                  try {
                    if (panelType === "ceo") await client.ceoVias.clearFusion.mutate({ viaId: selectedVia.id });
                    else await client.ctoVias.clearFusion.mutate({ viaId: selectedVia.id });
                    await loadVias(selectedTube.id, panelType);
                    setSelectedVia({ ...selectedVia, fusedToViaId: null, fusedToTubeId: null });
                    setPanelView("vias");
                  } catch (e: any) { setError(e?.message ?? "Erro"); }
                  finally { setSaving(false); }
                }}
                disabled={saving}
                className="flex items-center gap-1 text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-2 py-1"
              >
                <Link2Off className="w-3 h-3" /> Remover
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setFusionTubeId(""); setFusionViaId(""); setPanelView("setFusion"); }}
              className="w-full flex items-center justify-center gap-2 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 rounded-xl py-2.5 text-xs font-medium hover:bg-cyan-500/20"
            >
              <Link2 className="w-3.5 h-3.5" /> Identificar Fusão
            </button>
          )}
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Etiqueta</label>
            <input type="text" value={editViaForm.label} onChange={e => setEditViaForm(f => ({ ...f, label: e.target.value }))} placeholder="ex: Cliente A" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500" />
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Observações</label>
            <textarea value={editViaForm.notes} onChange={e => setEditViaForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 resize-none" />
          </div>
          <button
            onClick={async () => {
              setSaving(true); setError(null);
              try {
                if (panelType === "ceo") {
                  await client.ceoVias.updateLabel.mutate({ id: selectedVia.id, label: editViaForm.label || undefined, notes: editViaForm.notes || undefined });
                } else {
                  await client.ctoVias.update.mutate({ id: selectedVia.id, label: editViaForm.label || undefined, notes: editViaForm.notes || undefined });
                }
                await loadVias(selectedTube.id, panelType);
                setPanelView("vias");
              } catch (e: any) { setError(e?.message ?? "Erro"); }
              finally { setSaving(false); }
            }}
            disabled={saving}
            className="w-full bg-cyan-500 disabled:opacity-50 text-zinc-900 font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2"
          >
            {saving ? <div className="w-4 h-4 border-2 border-zinc-900/30 border-t-zinc-900 rounded-full animate-spin" /> : <><Check className="w-4 h-4" /> Salvar</>}
          </button>
        </div>
      </>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAINEL: SET FUSION
  // ═══════════════════════════════════════════════════════════════════════════
  function PanelSetFusion() {
    if (!selectedVia || !selectedTube) return null;
    const targetTubeVias = allVias.filter(v => v.tubeId === parseInt(fusionTubeId) && v.id !== selectedVia.id);
    return (
      <>
        <PanelHeader title="Identificar Fusão" onBack={() => setPanelView("editVia")} backLabel="Cancelar" />
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <ErrorBox />
          <p className="text-[11px] text-zinc-500">{selectedTube.identifier} · Via {selectedVia.viaNumber}</p>
          <div>
            <label className="text-xs text-zinc-400 mb-1.5 block">Tubo destino</label>
            <div className="space-y-1.5">
              {tubes.filter(t => t.id !== selectedTube.id).map(tube => (
                <button key={tube.id} onClick={() => { setFusionTubeId(String(tube.id)); setFusionViaId(""); }}
                  className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 border transition-colors text-left ${fusionTubeId === String(tube.id) ? "bg-cyan-500/10 border-cyan-500/40" : "bg-zinc-900 border-zinc-800 hover:bg-zinc-800/50"}`}
                >
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 ${TUBE_COLORS[tube.color ?? ""] ?? "bg-zinc-500"}`} />
                  <span className="text-xs text-white">{tube.identifier}</span>
                  {fusionTubeId === String(tube.id) && <Check className="w-3.5 h-3.5 text-cyan-400 ml-auto" />}
                </button>
              ))}
            </div>
          </div>
          {fusionTubeId && (
            <div>
              <label className="text-xs text-zinc-400 mb-1.5 block">Via destino</label>
              {targetTubeVias.length === 0 ? (
                <p className="text-xs text-zinc-500 italic">Nenhuma via disponível</p>
              ) : (
                <div className="grid grid-cols-4 gap-1.5">
                  {targetTubeVias.map(via => {
                    const fc = VIA_FIBER_COLORS[via.viaNumber];
                    const alreadyFused = via.fusedToViaId != null;
                    return (
                      <button key={via.id} onClick={() => !alreadyFused && setFusionViaId(String(via.id))} disabled={alreadyFused}
                        className={`flex flex-col items-center gap-1 rounded-xl py-2 border transition-colors ${fusionViaId === String(via.id) ? "bg-cyan-500/20 border-cyan-500/50" : alreadyFused ? "bg-zinc-800/30 border-zinc-800 opacity-40 cursor-not-allowed" : "bg-zinc-900 border-zinc-800 hover:bg-zinc-800/50"}`}
                      >
                        <div className={`w-4 h-4 rounded-full ${fc?.dot ?? "bg-zinc-600"}`} />
                        <span className="text-[10px] text-zinc-300 font-medium">{via.viaNumber}</span>
                        {alreadyFused && <span className="text-[8px] text-zinc-500">fusionada</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {/* Preview da via de destino seleccionada */}
          {fusionTubeId && fusionViaId && (() => {
            const destVia = targetTubeVias.find(v => String(v.id) === fusionViaId);
            const destTube = tubes.find(t => String(t.id) === fusionTubeId);
            if (!destVia || !destTube || !selectedVia || !selectedTube) return null;
            return (
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3 space-y-2">
                <p className="text-[10px] font-semibold text-cyan-400 uppercase tracking-wide">Confirmar Fusão</p>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <div className="rounded-lg bg-zinc-800/60 px-2 py-2 text-center">
                    <p className="text-[9px] text-zinc-500 mb-0.5">Origem</p>
                    <p className="text-sm font-bold text-white">Via {selectedVia.viaNumber}</p>
                    {selectedVia.label && <p className="text-[10px] text-zinc-400 truncate">{selectedVia.label}</p>}
                    <p className="text-[9px] text-zinc-500 mt-0.5">{selectedTube.identifier}</p>
                  </div>
                  <div className="text-cyan-400 text-xl font-bold">⇄</div>
                  <div className="rounded-lg bg-zinc-800/60 px-2 py-2 text-center">
                    <p className="text-[9px] text-zinc-500 mb-0.5">Destino</p>
                    <p className="text-sm font-bold text-white">Via {destVia.viaNumber}</p>
                    {destVia.label && <p className="text-[10px] text-zinc-400 truncate">{destVia.label}</p>}
                    <p className="text-[9px] text-zinc-500 mt-0.5">{destTube.identifier}</p>
                  </div>
                </div>
              </div>
            );
          })()}
          <button
            onClick={async () => {
              if (!fusionTubeId || !fusionViaId) { setError("Selecione o tubo e a via destino"); return; }
              setSaving(true); setError(null);
              try {
                const refId = panelType === "ceo" ? selectedCeo!.id : selectedCto!.id;
                if (panelType === "ceo") {
                  await client.ceoVias.setFusion.mutate({ viaId: selectedVia.id, fusedToTubeId: parseInt(fusionTubeId), fusedToViaId: parseInt(fusionViaId) });
                } else {
                  await client.ctoVias.setFusion.mutate({ viaId: selectedVia.id, fusedToTubeId: parseInt(fusionTubeId), fusedToViaId: parseInt(fusionViaId) });
                }
                await loadVias(selectedTube.id, panelType);
                await loadAllVias(refId, panelType);
                setPanelView("vias");
              } catch (e: any) { setError(e?.message ?? "Erro ao identificar fusão"); }
              finally { setSaving(false); }
            }}
            disabled={saving || !fusionTubeId || !fusionViaId}
            className="w-full bg-cyan-500 disabled:opacity-50 text-zinc-900 font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2"
          >
            {saving ? <div className="w-4 h-4 border-2 border-zinc-900/30 border-t-zinc-900 rounded-full animate-spin" /> : <><Link2 className="w-4 h-4" /> Confirmar Fusão</>}
          </button>
        </div>
      </>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER PRINCIPAL
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col h-full relative">
      {/* Cabeçalho */}
      <div className="bg-zinc-900 border-b border-zinc-800 px-4 pt-3 pb-2.5 flex-shrink-0">
        <div className="flex items-center justify-between mb-2.5">
          <h1 className="text-lg font-bold text-white">Mapa</h1>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">{elements.length} elem.</span>
            <button onClick={loadData} className="text-zinc-400 hover:text-white p-1">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
        {/* Filtros rápidos */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
          {(["all", "ceo", "cto"] as const).map(t => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                filterType === t
                  ? t === "ceo" ? "bg-violet-600 border-violet-500 text-white" : t === "cto" ? "bg-emerald-600 border-emerald-500 text-white" : "bg-cyan-600 border-cyan-500 text-white"
                  : "bg-zinc-800 border-zinc-700 text-zinc-400"
              }`}
            >
              {t === "all" ? "Todos" : t.toUpperCase()}
            </button>
          ))}
          <div className="w-px bg-zinc-700 flex-shrink-0 mx-0.5" />
          {(["all", "active", "inactive"] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                filterStatus === s
                  ? s === "active" ? "bg-emerald-700 border-emerald-600 text-white" : s === "inactive" ? "bg-zinc-600 border-zinc-500 text-white" : "bg-zinc-700 border-zinc-600 text-zinc-200"
                  : "bg-zinc-800 border-zinc-700 text-zinc-400"
              }`}
            >
              {s === "all" ? "Todos status" : s === "active" ? "Activos" : "Inativos"}
            </button>
          ))}
          <div className="w-px bg-zinc-700 flex-shrink-0 mx-0.5" />
          <button
            onClick={() => { setViabOpen(true); setViabResults([]); setViabError(null); }}
            className="flex-shrink-0 flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-semibold border transition-colors bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-cyan-500/10 hover:border-cyan-500/40 hover:text-cyan-300"
          >
            <BarChart2 className="w-3 h-3" /> Viabilidade
          </button>
        </div>
      </div>

      {/* Mapa */}
      <div className="flex-1 relative">
        <div ref={mapContainerRef} className="absolute inset-0" style={{ zIndex: 0 }} />

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 bg-zinc-950/70 flex items-center justify-center" style={{ zIndex: 10 }}>
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-2 border-zinc-700 border-t-cyan-400 rounded-full animate-spin" />
              <p className="text-xs text-zinc-400">Carregando mapa...</p>
            </div>
          </div>
        )}



        {/* Controles de camada — canto superior direito */}
        <div className="absolute top-3 right-3 flex flex-col gap-1.5" style={{ zIndex: 5 }}>
          {/* Botão toggle de cabos */}
          <button
            onClick={() => setShowCables(v => !v)}
            className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-xl border transition-colors ${
              showCables
                ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300"
                : "bg-zinc-800/80 border-zinc-700 text-zinc-400"
            }`}
          >
            <Cable className="w-3.5 h-3.5" /> Cabos
          </button>
          {/* Botão toggle de satélite */}
          <button
            onClick={() => setIsSatellite(v => !v)}
            className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-xl border transition-colors ${
              isSatellite
                ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                : "bg-zinc-800/80 border-zinc-700 text-zinc-400"
            }`}
          >
            <Satellite className="w-3.5 h-3.5" /> {isSatellite ? "Satélite" : "Mapa"}
          </button>
        </div>

        {/* Botão Minha Localização — rodapé do mapa */}
        <button
          onClick={handleMyLocation}
          disabled={gpsLocating}
          className="absolute bottom-4 right-4 flex items-center gap-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-60 text-white text-xs font-semibold px-4 py-2.5 rounded-2xl shadow-lg shadow-blue-900/40 transition-colors"
          style={{ zIndex: 25 }}
        >
          {gpsLocating
            ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Localizando...</>
            : <><LocateFixed className="w-4 h-4" /> Onde estou</>}
        </button>

        {/* Painel deslizante */}
        {panelOpen && (
          <div
            className="absolute bottom-0 left-0 right-0 bg-zinc-950 border-t border-zinc-800 flex flex-col"
            style={{ zIndex: 20, maxHeight: "70vh" }}
          >
            {panelView === "detail"    && <PanelDetail />}
            {panelView === "editMain"  && <PanelEditMain />}
            {panelView === "tubes"     && <PanelTubes />}
            {panelView === "newTube"   && <PanelNewTube />}
            {panelView === "vias"      && <PanelVias />}
            {panelView === "editTube"  && <PanelEditTube />}
            {panelView === "editVia"   && <PanelEditVia />}
            {panelView === "setFusion" && <PanelSetFusion />}
          </div>
        )}

        {/* ─── Modal: Balanço Óptico ─────────────────────────────────────────────────────── */}
        {mapBalanceOpen && (
          <div className="absolute inset-0 bg-black/70 flex items-end" style={{ zIndex: 30 }}>
            <div className="w-full bg-zinc-950 border-t border-zinc-800 rounded-t-2xl p-4 space-y-3 max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-cyan-400" />
                  <span className="text-sm font-bold text-white">Balanço Óptico</span>
                  <span className="text-xs text-zinc-400">{selectedCto?.name}</span>
                </div>
                <button onClick={() => setMapBalanceOpen(false)} className="text-zinc-500 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {mapBalanceLoading ? (
                <div className="flex-1 flex items-center justify-center gap-2 text-zinc-400 text-xs py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-cyan-400" /> Calculando balanço...
                </div>
              ) : mapBalanceError ? (
                <div className="flex items-center gap-2 text-red-400 text-xs p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" /> {mapBalanceError}
                </div>
              ) : mapBalance ? (() => {
                const b = mapBalance as any;
                // O servidor retorna rxPowerDbm (campo real)
                const rxPower: number | null = b.rxPowerDbm ?? b.estimatedRxPower ?? null;
                const found: boolean = b.found ?? false;
                const q: string = b.signalQuality ?? b.quality ?? "";
                const qColor = q === "excellent" ? "text-emerald-400"
                  : q === "good" ? "text-cyan-400"
                  : q === "marginal" ? "text-amber-400"
                  : q === "poor" ? "text-orange-400"
                  : "text-red-400";
                const qLabel = q === "excellent" ? "Excelente"
                  : q === "good" ? "Bom"
                  : q === "marginal" ? "Marginal"
                  : q === "poor" ? "Fraco"
                  : q === "no_signal" ? "Sem Sinal"
                  : q || "--";
                return (
                  <div className="flex-1 overflow-y-auto">
                    {!found && (
                      <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl mb-3 text-xs text-amber-300">
                        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span>{b.warnings?.[0] ?? "Não foi possível rastrear até a OLT. Verifique se a OLT está posicionada no mapa e as portas vinculadas."}</span>
                      </div>
                    )}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-zinc-400">Potência RX Estimada</span>
                        <div className="text-right">
                          <span className={`text-2xl font-bold ${qColor}`}>
                            {rxPower != null ? rxPower.toFixed(2) : "--"}
                          </span>
                          <span className={`text-sm font-semibold ml-1 ${qColor}`}>dBm</span>
                        </div>
                      </div>
                      {found && (
                        <div className="mt-2 flex items-center justify-between text-xs">
                          <span className="text-zinc-500">Qualidade</span>
                          <span className={`font-semibold ${qColor}`}>{qLabel}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })() : null}
            </div>
          </div>
        )}

        {/* ─── Modal: OTDR Virtual ────────────────────────────────────────────────────────────── */}
        {mapOtdrOpen && (
          <div className="absolute inset-0 bg-black/70 flex items-end" style={{ zIndex: 30 }}>
            <div className="w-full bg-zinc-950 border-t border-zinc-800 rounded-t-2xl p-4 space-y-3 max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-bold text-white">OTDR Virtual</span>
                  <span className="text-xs text-zinc-400">{panelType === "cto" ? selectedCto?.name : selectedCeo?.name}</span>
                </div>
                <button onClick={() => setMapOtdrOpen(false)} className="text-zinc-500 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-3">
                {mapOtdrTubes.length === 0 ? (
                  <div className="text-xs text-zinc-500 text-center py-4">Nenhum tubo encontrado neste elemento</div>
                ) : (
                  <>
                    <div>
                      <label className="text-xs text-zinc-400 mb-1 block">Tubo</label>
                      <select
                        value={mapOtdrTubeId}
                        onChange={e => setMapOtdrTubeId(e.target.value)}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                      >
                        <option value="">Selecionar tubo...</option>
                        {mapOtdrTubes.map((t: any) => (
                          <option key={t.id} value={String(t.id)}>{t.identifier} ({t.totalVias} vias)</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-zinc-400 mb-1 block">Nº da Via</label>
                        <input type="number" min="1" value={mapOtdrViaNum} onChange={e => setMapOtdrViaNum(e.target.value)}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                          placeholder="1" />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-400 mb-1 block">Distância (m)</label>
                        <input type="number" min="1" value={mapOtdrDist} onChange={e => setMapOtdrDist(e.target.value)}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                          placeholder="500" />
                      </div>
                    </div>
                    {mapOtdrError && (
                      <div className="flex items-center gap-2 text-red-400 text-xs p-2 bg-red-500/10 border border-red-500/30 rounded-xl">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {mapOtdrError}
                      </div>
                    )}
                    {mapOtdrResult && (() => {
                      const r = mapOtdrResult as any;
                      return (
                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 space-y-2">
                          <p className="text-xs font-semibold text-amber-300">Resultado OTDR</p>
                          {r.lat != null && r.lng != null && (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-xs text-zinc-400">Coordenadas estimadas</p>
                                  <p className="text-xs text-white font-mono">{r.lat?.toFixed(6)}, {r.lng?.toFixed(6)}</p>
                                </div>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(`${r.lat?.toFixed(6)},${r.lng?.toFixed(6)}`);
                                    setMapOtdrCopied(true);
                                    setTimeout(() => setMapOtdrCopied(false), 2000);
                                  }}
                                  className="flex items-center gap-1 text-xs text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 rounded-lg px-2 py-1"
                                >
                                  {mapOtdrCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                  {mapOtdrCopied ? "Copiado" : "Copiar"}
                                </button>
                              </div>
                              {/* Botão Ver no Mapa — centraliza o mapa nas coordenadas */}
                              <button
                                onClick={() => {
                                  if (mapRef.current) {
                                    mapRef.current.setView([r.lat, r.lng], 17, { animate: true });
                                    const pinIcon = L.divIcon({
                                      html: `<div style="position:relative;width:28px;height:28px"><div style="position:absolute;inset:0;border-radius:50%;background:#f59e0b;opacity:0.25;animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite"></div><div style="position:absolute;inset:4px;border-radius:50%;background:#f59e0b;border:2px solid white;box-shadow:0 0 8px rgba(245,158,11,0.8)"></div></div>`,
                                      className: "", iconSize: [28, 28], iconAnchor: [14, 14],
                                    });
                                    const m = L.marker([r.lat, r.lng], { icon: pinIcon }).addTo(mapRef.current!);
                                    m.bindPopup(`<b>Ponto OTDR</b><br><small>${r.lat?.toFixed(6)}, ${r.lng?.toFixed(6)}</small>`).openPopup();
                                    setTimeout(() => { try { m.remove(); } catch {} }, 15000);
                                    setMapOtdrOpen(false);
                                  }
                                }}
                                className="w-full flex items-center justify-center gap-1.5 bg-amber-500/10 border border-amber-500/30 rounded-xl py-2 text-xs text-amber-300 hover:bg-amber-500/20 transition-colors"
                              >
                                <MapPin className="w-3.5 h-3.5" /> Ver no Mapa
                              </button>
                            </div>
                          )}
                          {r.distanceFromStart != null && (
                            <div className="flex justify-between text-xs">
                              <span className="text-zinc-400">Distância da origem</span>
                              <span className="text-zinc-200">{r.distanceFromStart?.toFixed(0)} m</span>
                            </div>
                          )}
                          {r.segmentName && (
                            <div className="flex justify-between text-xs">
                              <span className="text-zinc-400">Segmento</span>
                              <span className="text-zinc-200 truncate ml-2">{r.segmentName}</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
              <button
                onClick={runMapOtdr}
                disabled={mapOtdrRunning || !mapOtdrTubeId || !mapOtdrViaNum || !mapOtdrDist}
                className="w-full py-3 rounded-xl text-sm font-semibold bg-amber-600 text-white disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {mapOtdrRunning ? <><Loader2 className="w-4 h-4 animate-spin" /> Calculando...</> : <><Zap className="w-4 h-4" /> Executar OTDR</>}
              </button>
            </div>
          </div>
        )}

        {/* ─── Modal: Viabilidade ─────────────────────────────────────────────────────────────────────── */}
        {viabOpen && (
          <div className="absolute inset-0 bg-black/70 flex items-end" style={{ zIndex: 30 }}>
            <div className="w-full bg-zinc-950 border-t border-zinc-800 rounded-t-2xl flex flex-col" style={{ maxHeight: "85vh" }}>
              {/* Cabeçalho */}
              <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-zinc-800 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-cyan-400" />
                  <span className="text-sm font-bold text-white">Análise de Viabilidade</span>
                </div>
                <button onClick={() => {
                  setViabOpen(false);
                  if (viabCircleRef.current) { try { viabCircleRef.current.remove(); } catch {} viabCircleRef.current = null; }
                }} className="text-zinc-500 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Formulário */}
              <div className="px-4 py-3 space-y-3 flex-shrink-0 border-b border-zinc-800">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-zinc-400 uppercase tracking-wider">Latitude</label>
                    <input
                      type="text"
                      value={viabLat}
                      onChange={e => setViabLat(e.target.value)}
                      placeholder="-8.797526"
                      className="w-full mt-1 bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-400 uppercase tracking-wider">Longitude</label>
                    <input
                      type="text"
                      value={viabLng}
                      onChange={e => setViabLng(e.target.value)}
                      placeholder="-36.505970"
                      className="w-full mt-1 bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none"
                    />
                  </div>
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="text-[10px] text-zinc-400 uppercase tracking-wider">Raio (metros)</label>
                    <input
                      type="number"
                      value={viabRadius}
                      onChange={e => setViabRadius(e.target.value)}
                      placeholder="500"
                      className="w-full mt-1 bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none"
                    />
                  </div>
                  <button
                    onClick={viabUseGps}
                    disabled={viabLocating}
                    className="flex items-center gap-1.5 bg-blue-600/20 border border-blue-500/30 rounded-xl px-3 py-2 text-xs text-blue-300 hover:bg-blue-600/30 transition-colors disabled:opacity-50"
                  >
                    {viabLocating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LocateFixed className="w-3.5 h-3.5" />}
                    GPS
                  </button>
                  <button
                    onClick={runViabilidade}
                    disabled={viabLoading}
                    className="flex items-center gap-1.5 bg-cyan-600 rounded-xl px-3 py-2 text-xs text-white font-semibold hover:bg-cyan-500 transition-colors disabled:opacity-50"
                  >
                    {viabLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />}
                    Analisar
                  </button>
                </div>
              </div>

              {/* Resultados */}
              <div className="flex-1 overflow-y-auto">
                {viabError && viabResults.length === 0 && (
                  <div className="flex items-center gap-2 text-amber-400 text-xs p-4">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" /> {viabError}
                  </div>
                )}
                {viabResults.length > 0 && (
                  <div className="p-3 space-y-2">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider px-1">
                      {viabResults.length} CTO{viabResults.length !== 1 ? "s" : ""} encontrada{viabResults.length !== 1 ? "s" : ""} no raio de {viabRadius}m
                    </p>
                    {viabResults.map((r: any) => {
                      const pct = r.total > 0 ? Math.round(((r.total - r.free) / r.total) * 100) : 0;
                      const hasSignal = r.free > 0;
                      return (
                        <button
                          key={r.cto.id}
                          onClick={() => {
                            // Centralizar no mapa e fechar modal
                            if (mapRef.current) mapRef.current.setView([r.el.lat, r.el.lng], 17, { animate: true });
                            setViabOpen(false);
                          }}
                          className="w-full text-left bg-zinc-900 border border-zinc-800 rounded-xl p-3 space-y-2 hover:border-zinc-700 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-sm ${hasSignal ? "bg-emerald-500" : "bg-rose-500"}`} />
                              <span className="text-sm font-semibold text-white">{r.cto.name}</span>
                            </div>
                            <span className="text-xs text-zinc-400">{r.dist}m</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex-1">
                              <div className="w-full bg-zinc-700 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${pct >= 90 ? "bg-rose-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500"}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                            <span className={`text-xs font-semibold ${hasSignal ? "text-emerald-400" : "text-rose-400"}`}>
                              {r.free} livre{r.free !== 1 ? "s" : ""} / {r.total}
                            </span>
                          </div>
                          {r.cto.address && (
                            <p className="text-[10px] text-zinc-500 truncate">{r.cto.address}</p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
                {!viabLoading && viabResults.length === 0 && !viabError && (
                  <div className="flex flex-col items-center justify-center h-32 text-zinc-600 gap-2">
                    <BarChart2 className="w-8 h-8 opacity-30" />
                    <p className="text-xs">Informe as coordenadas e clique em Analisar</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── Modal: Vincular CTO ao SGP ──────────────────── */}
        {linkSgpOpen && (
          <div className="absolute inset-0 bg-black/70 flex items-end" style={{ zIndex: 30 }}>
            <div className="w-full bg-zinc-950 border-t border-zinc-800 rounded-t-2xl p-4 space-y-3 max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-cyan-400" />
                  <span className="text-sm font-bold text-white">Vincular ao SGP</span>
                  {/* Contagem de CTOs */}
                  {!linkSgpLoading && !linkSgpError && linkSgpCtos.length > 0 && (
                    <span className="text-[10px] text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded-full">
                      {linkSgpCtos.length} CTOs
                    </span>
                  )}
                </div>
                <button onClick={() => setLinkSgpOpen(false)} className="text-zinc-500 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-zinc-400">Selecione a CTO correspondente no SGP.</p>
              <input
                type="text"
                placeholder="Buscar CTO no SGP..."
                value={linkSgpSearch}
                onChange={e => setLinkSgpSearch(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none"
                disabled={linkSgpLoading}
              />
              {linkSgpLoading ? (
                <div className="flex-1 space-y-2 py-1">
                  <div className="flex items-center gap-2 text-xs text-zinc-400 mb-3">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                    <span>A carregar CTOs do SGP...</span>
                  </div>
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 animate-pulse">
                      <div className="h-3 bg-zinc-700 rounded flex-1" style={{ width: `${50 + i * 8}%`, opacity: 1 - i * 0.12 }} />
                      <div className="h-3 bg-zinc-700 rounded w-8" />
                    </div>
                  ))}
                </div>
              ) : linkSgpError ? (
                <div className="flex-1 flex flex-col gap-3 items-center justify-center py-6">
                  <div className="flex items-center gap-2 text-red-400 text-xs">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{linkSgpError}</span>
                  </div>
                  <button
                    className="flex items-center gap-1.5 text-xs text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 rounded-xl px-4 py-2"
                    onClick={async () => {
                      setLinkSgpError(null);
                      setLinkSgpLoading(true);
                      try {
                        const [ctosRes, linkedRes] = await Promise.all([
                          client.sgp.listCtos.query(),
                          client.sgp.linkedSgpIds.query(),
                        ]);
                        const ctosData = ctosRes as any;
                        if (ctosData.error) {
                          setLinkSgpError(ctosData.error);
                          setLinkSgpCtos([]);
                        } else {
                          setLinkSgpCtos(ctosData.ctos ?? []);
                        }
                        const linkedData2 = linkedRes as any;
                        const ids2 = linkedData2.ids ?? [];
                        const nameMap2 = linkedData2.nameMap ?? {};
                        const currentSgpId = selectedCto?.sgpId;
                        setLinkSgpLinkedIds(new Set(ids2.filter((id: number) => id !== currentSgpId)));
                        setLinkSgpNameMap(nameMap2);
                      } catch (e: any) {
                        setLinkSgpError(e.message ?? "Erro ao carregar CTOs");
                      } finally { setLinkSgpLoading(false); }
                    }}
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Tentar novamente
                  </button>
                </div>
              ) : (() => {
                const filtered = linkSgpCtos
                  .filter((c: any) => {
                    const q = linkSgpSearchDebounced.toLowerCase();
                    return !q || (c.ident ?? c.name ?? "").toLowerCase().includes(q) || String(c.id).includes(q);
                  })
                  // Ordenar: não vinculadas primeiro, vinculadas no fundo
                  .sort((a: any, b: any) => {
                    const aL = linkSgpLinkedIds.has(a.id) ? 1 : 0;
                    const bL = linkSgpLinkedIds.has(b.id) ? 1 : 0;
                    return aL - bL;
                  });
                return (
                  <div className="flex-1 overflow-y-auto space-y-1">
                    {filtered.map((c: any) => {
                      const alreadyLinked = linkSgpLinkedIds.has(c.id);
                      const isSelected = linkSgpSelectedId === c.id;
                      const localCtoName: string | undefined = linkSgpNameMap[c.id];
                      return (
                        <button
                          key={c.id}
                          className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center gap-2 transition-colors ${
                            isSelected
                              ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                              : alreadyLinked
                              ? "opacity-50 cursor-not-allowed bg-zinc-900 border border-zinc-800"
                              : "bg-zinc-900 border border-zinc-800 text-white"
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
                            ? <Check className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                            : alreadyLinked
                            ? <Link2 className="w-3.5 h-3.5 text-amber-400/60 flex-shrink-0" />
                            : <div className="w-3.5 h-3.5 flex-shrink-0" />}
                          <span className="flex-1 truncate font-medium">{c.ident ?? c.name ?? `CTO #${c.id}`}</span>
                          {alreadyLinked && (
                            <span
                              className="text-[10px] text-amber-400/70 bg-amber-500/10 px-1.5 py-0.5 rounded flex-shrink-0 max-w-[90px] truncate"
                              title={localCtoName ? `Vinculada a: ${localCtoName}` : "Já vinculada"}
                            >
                              {localCtoName ?? "vinculada"}
                            </span>
                          )}
                          <span className="text-zinc-500 font-mono text-[10px]">#{c.id}</span>
                        </button>
                      );
                    })}
                    {filtered.length === 0 && (
                      <div className="flex flex-col items-center gap-2 text-zinc-500 text-xs text-center py-8">
                        <Users className="w-6 h-6 opacity-30" />
                        {linkSgpSearchDebounced ? `Nenhuma CTO encontrada para "${linkSgpSearchDebounced}"` : "Nenhuma CTO disponível no SGP"}
                      </div>
                    )}
                  </div>
                );
              })()}
              <button
                disabled={!linkSgpSelectedId || linkSgpSaving}
                className="w-full py-3 rounded-xl text-sm font-semibold bg-cyan-600 text-white disabled:opacity-40 flex items-center justify-center gap-2"
                onClick={async () => {
                  if (!linkSgpSelectedId || !selectedCto?.id) return;
                  setLinkSgpSaving(true);
                  try {
                    await client.sgp.linkCtoToSgp.mutate({ ctoId: selectedCto.id, sgpId: linkSgpSelectedId });
                    setSelectedCto(prev => prev ? { ...prev, sgpId: linkSgpSelectedId } : prev);
                    setCtos(prev => prev.map(c => c.id === selectedCto.id ? { ...c, sgpId: linkSgpSelectedId } : c));
                    setLinkSgpOpen(false);
                    setLinkSgpSelectedId(null);
                  } catch (e: any) { setError(e.message ?? "Erro ao vincular"); }
                  finally { setLinkSgpSaving(false); }
                }}
              >
                {linkSgpSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Vincular
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
