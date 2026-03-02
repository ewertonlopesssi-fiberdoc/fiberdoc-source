import { useState, useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useMobileAuth } from "../MobileAuthContext";
import { createMobileTrpcClient, isOnline, saveOfflineCache, loadOfflineCache } from "../mobileTrpc";
import {
  Cable, Radio, MapPin, X, ChevronRight, Edit2, Check, ChevronLeft,
  Layers, Link2, Link2Off, RefreshCw, Loader2, AlertCircle, LocateFixed, Plus, Trash2, Users, Unlink,
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

// ─── Ícone SVG para CEO ─────────────────────────────────────────────────────
function makeCeoIcon() {
  return L.divIcon({
    html: `<div style="width:36px;height:36px;border-radius:50%;background:#7c3aed;border:3px solid #a78bfa;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(124,58,237,0.6)">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6z"/><path d="M14 15v4"/><path d="M10 15v4"/><path d="M6 19h12"/></svg>
    </div>`,
    className: "", iconSize: [36, 36], iconAnchor: [18, 18],
  });
}
function makeCtoIcon() {
  return L.divIcon({
    html: `<div style="width:36px;height:36px;border-radius:50%;background:#059669;border:3px solid #34d399;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(5,150,105,0.6)">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
    </div>`,
    className: "", iconSize: [36, 36], iconAnchor: [18, 18],
  });
}

interface MobileMapProps {
  onOpenDetail?: (type: "ceo" | "cto", id: number) => void;
}

export default function MobileMap({ onOpenDetail }: MobileMapProps = {}) {
  const { serverUrl, token } = useMobileAuth();
  const client = createMobileTrpcClient(serverUrl, token);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Record<number, L.Marker>>({});

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
  const [newTubeForm, setNewTubeForm]   = useState({ identifier: "", color: "blue", totalVias: 12, type: "tube" });

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
  // ─── Vincular CTO ao SGP (mobile) ──────────────────────────────────
  const [linkSgpOpen, setLinkSgpOpen] = useState(false);
  const [linkSgpSearch, setLinkSgpSearch] = useState("");
  const [linkSgpSelectedId, setLinkSgpSelectedId] = useState<number | null>(null);
  const [linkSgpCtos, setLinkSgpCtos] = useState<any[]>([]);
  const [linkSgpLoading, setLinkSgpLoading] = useState(false);
  const [linkSgpSaving, setLinkSgpSaving] = useState(false);
  const [linkSgpError, setLinkSgpError] = useState<string | null>(null);
  const [linkSgpLinkedIds, setLinkSgpLinkedIds] = useState<Set<number>>(new Set());

  // ─── Carregar dados ─────────────────────────────────────────────────────
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

  // ─── Inicializar mapa ───────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: [-15.7801, -47.9292], zoom: 13,
      zoomControl: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // ─── Função de localização do técnico ─────────────────────────────────
  function handleMyLocation() {
    if (!navigator.geolocation) { setError("Geolocalização não suportada neste dispositivo"); return; }
    setGpsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        if (mapRef.current) {
          // Remover marcador anterior
          if (myLocationMarkerRef.current) { myLocationMarkerRef.current.remove(); myLocationMarkerRef.current = null; }
          // Adicionar marcador pulsante de posição actual
          const circle = L.circleMarker([lat, lng], {
            radius: 10, color: "#3b82f6", fillColor: "#3b82f6",
            fillOpacity: 0.8, weight: 3, opacity: 1,
          }).addTo(mapRef.current);
          circle.bindPopup("<b>Você está aqui</b>").openPopup();
          myLocationMarkerRef.current = circle;
          mapRef.current.setView([lat, lng], 16, { animate: true });
        }
        setGpsLocating(false);
      },
      () => { setGpsLocating(false); setError("Não foi possível obter a localização. Verifique as permissões de GPS."); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

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
      const icon = isCeo ? makeCeoIcon() : makeCtoIcon();
      const marker = L.marker([el.lat, el.lng], { icon }).addTo(mapRef.current!);
      marker.on("click", () => {
        const ref = isCeo
          ? ceos.find(c => c.id === el.referenceId)
          : ctos.find(c => c.id === el.referenceId);
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
          {/* Vincular ao SGP (apenas CTO) */}
          {panelType === "cto" && isOnline() && (
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
                        const ids = (linkedRes as any).ids ?? [];
                        // Excluir o sgpId da CTO actual
                        const currentSgpId = selectedCto?.sgpId;
                        setLinkSgpLinkedIds(new Set(ids.filter((id: number) => id !== currentSgpId)));
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
          {/* Botão Exportar PDF de Fusões */}
          {isOnline() && (() => {
            const refId = panelType === "ceo" ? selectedCeo?.id : selectedCto?.id;
            const name = panelType === "ceo" ? selectedCeo?.name : selectedCto?.name;
            if (!refId) return null;
            return (
              <button
                onClick={async () => {
                  try {
                    const res = await fetch(`${serverUrl}/api/fusion-report/${panelType}/${refId}`, {
                      headers: token ? { Authorization: `Bearer ${token}` } : {},
                    });
                    if (!res.ok) { setError("Falha ao gerar PDF"); return; }
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url; a.download = `fusoes_${(name ?? panelType).replace(/\s+/g, "_")}.pdf`;
                    document.body.appendChild(a); a.click();
                    document.body.removeChild(a); URL.revokeObjectURL(url);
                  } catch { setError("Erro ao exportar PDF"); }
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
              onClick={() => { setNewTubeForm({ identifier: `Tubo ${tubes.length + 1}`, color: "blue", totalVias: 12, type: "tube" }); setError(null); setPanelView("newTube"); }}
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
    return (
      <>
        <PanelHeader title="Novo Tubo" onBack={() => setPanelView("tubes")} backLabel="Cancelar" />
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <ErrorBox />
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Identificador</label>
            <input type="text" value={newTubeForm.identifier} onChange={e => setNewTubeForm(f => ({ ...f, identifier: e.target.value }))} placeholder="ex: Tubo 1" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500" />
          </div>
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
                  await client.ceoTubes.create.mutate({ ceoId: refId, identifier: newTubeForm.identifier, type: newTubeForm.type as "tube" | "splitter", totalVias: newTubeForm.totalVias, color: newTubeForm.color });
                } else {
                  await client.ctoTubes.create.mutate({ ctoId: refId, identifier: newTubeForm.identifier, type: newTubeForm.type as "tube" | "splitter", totalVias: newTubeForm.totalVias, color: newTubeForm.color });
                }
                await loadTubes(refId, panelType);
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

        {/* Legenda */}
        <div className="absolute top-3 left-3 bg-zinc-900/90 backdrop-blur-sm border border-zinc-800 rounded-xl p-2.5 flex flex-col gap-1.5" style={{ zIndex: 5 }}>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-violet-600 border border-violet-400 flex-shrink-0" />
            <span className="text-[11px] text-zinc-300">CEO</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-emerald-600 border border-emerald-400 flex-shrink-0" />
            <span className="text-[11px] text-zinc-300">CTO</span>
          </div>
        </div>

        {/* Botão Minha Localização — rodapé do mapa */}
        {!panelOpen && (
          <button
            onClick={handleMyLocation}
            disabled={gpsLocating}
            className="absolute bottom-4 right-4 flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-xs font-semibold px-4 py-2.5 rounded-2xl shadow-lg shadow-blue-900/40 transition-colors"
            style={{ zIndex: 10 }}
          >
            {gpsLocating
              ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Localizando...</>
              : <><LocateFixed className="w-4 h-4" /> Onde estou</>}
          </button>
        )}

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

        {/* ─── Modal: Vincular CTO ao SGP ───────────────────────────────── */}
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
                        const ids = (linkedRes as any).ids ?? [];
                        const currentSgpId = selectedCto?.sgpId;
                        setLinkSgpLinkedIds(new Set(ids.filter((id: number) => id !== currentSgpId)));
                      } catch (e: any) {
                        setLinkSgpError(e.message ?? "Erro ao carregar CTOs");
                      } finally { setLinkSgpLoading(false); }
                    }}
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Tentar novamente
                  </button>
                </div>
              ) : (() => {
                const filtered = linkSgpCtos.filter((c: any) => {
                  const q = linkSgpSearch.toLowerCase();
                  return !q || (c.ident ?? c.name ?? "").toLowerCase().includes(q) || String(c.id).includes(q);
                });
                return (
                  <div className="flex-1 overflow-y-auto space-y-1">
                    {filtered.map((c: any) => {
                      const alreadyLinked = linkSgpLinkedIds.has(c.id);
                      const isSelected = linkSgpSelectedId === c.id;
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
                        >
                          {isSelected
                            ? <Check className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                            : alreadyLinked
                            ? <Link2 className="w-3.5 h-3.5 text-amber-400/60 flex-shrink-0" />
                            : <div className="w-3.5 h-3.5 flex-shrink-0" />}
                          <span className="flex-1 truncate font-medium">{c.ident ?? c.name ?? `CTO #${c.id}`}</span>
                          {alreadyLinked && (
                            <span className="text-[10px] text-amber-400/70 bg-amber-500/10 px-1.5 py-0.5 rounded flex-shrink-0">vinculada</span>
                          )}
                          <span className="text-zinc-500 font-mono text-[10px]">#{c.id}</span>
                        </button>
                      );
                    })}
                    {filtered.length === 0 && (
                      <div className="flex flex-col items-center gap-2 text-zinc-500 text-xs text-center py-8">
                        <Users className="w-6 h-6 opacity-30" />
                        {linkSgpSearch ? `Nenhuma CTO encontrada para "${linkSgpSearch}"` : "Nenhuma CTO disponível no SGP"}
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
