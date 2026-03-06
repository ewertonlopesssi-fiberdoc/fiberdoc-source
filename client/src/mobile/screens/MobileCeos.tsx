import { useState, useEffect, useCallback } from "react";
import { useMobileAuth } from "../MobileAuthContext";
import { createMobileTrpcClient, saveOfflineCache, loadOfflineCache, isOnline } from "../mobileTrpc";
import {
  Cable, ChevronRight, ChevronLeft, Search, RefreshCw, Edit2, Check,
  AlertCircle, Plus, Trash2, Link2, Link2Off, LocateFixed, Loader2, Layers,
  Boxes, Zap, ArrowRightLeft, Map as MapIcon,
} from "lucide-react";

// ─── Cores de tubo ─────────────────────────────────────────────────────────
const TUBE_COLORS: Record<string, string> = {
  blue: "bg-blue-500", orange: "bg-orange-500", green: "bg-emerald-500",
  brown: "bg-amber-800", slate: "bg-slate-400", white: "bg-white",
  red: "bg-red-500", black: "bg-zinc-900 border border-zinc-600",
  yellow: "bg-yellow-400", violet: "bg-violet-500", rose: "bg-pink-400",
  aqua: "bg-cyan-400",
};
const TUBE_COLOR_LABELS: Record<string, string> = {
  blue: "Azul", orange: "Laranja", green: "Verde", brown: "Marrom",
  slate: "Cinza", white: "Branco", red: "Vermelho", black: "Preto",
  yellow: "Amarelo", violet: "Violeta", rose: "Rosa", aqua: "Aqua",
};

// Cores padrão de fibra óptica por número de via (1–12)
const VIA_FIBER_COLORS: Record<number, { dot: string; label: string }> = {
  1:  { dot: "bg-green-500",   label: "Verde" },
  2:  { dot: "bg-yellow-400",  label: "Amarelo" },
  3:  { dot: "bg-white",       label: "Branco" },
  4:  { dot: "bg-blue-500",    label: "Azul" },
  5:  { dot: "bg-red-500",     label: "Vermelho" },
  6:  { dot: "bg-violet-500",  label: "Violeta" },
  7:  { dot: "bg-amber-700",   label: "Marrom" },
  8:  { dot: "bg-pink-400",    label: "Rosa" },
  9:  { dot: "bg-zinc-900 border border-zinc-500", label: "Preto" },
  10: { dot: "bg-slate-400",   label: "Cinza" },
  11: { dot: "bg-orange-500",  label: "Laranja" },
  12: { dot: "bg-cyan-400",    label: "Aqua" },
};

// ─── Tipos ─────────────────────────────────────────────────────────────────
type Ceo = {
  id: number; name: string; location?: string | null; type?: string | null;
  totalTubes?: number | null; notes?: string | null; status?: string | null;
};
type Tube = {
  id: number; ceoId: number; identifier: string; type: string;
  totalVias: number; color: string | null; notes?: string | null;
  bandejaId?: number | null;
};
type Via = {
  id: number; tubeId: number; ceoId: number; viaNumber: number;
  label?: string | null; fusedToViaId?: number | null; fusedToTubeId?: number | null;
  fiberId?: number | null; notes?: string | null;
};
type Bandeja = {
  id: number; ceoId: number; number: number; label?: string | null; notes?: string | null;
};
type Splitter = {
  id: number; ceoId: number; bandejaId?: number | null;
  identifier: string; type: "balanced" | "unbalanced"; ratio: string; notes?: string | null;
};
type SplitterVia = {
  id: number; splitterId: number; ceoId: number; viaNumber: number;
  label?: string | null; lossDb?: number | null; notes?: string | null;
};
type Association = {
  id: number; ceoId: number;
  sourceType: string; sourceViaId: number;
  targetType: string; targetViaId: number;
  notes?: string | null;
};

type View =
  | "list" | "detail" | "editCeo"
  | "bandejas" | "bandejaDetail"
  | "tubes" | "editTube" | "newTube"
  | "vias" | "editVia" | "setFusion"
  | "splitterVias" | "newSplitter" | "setAssociation" | "setSplitterAssociation";

interface MobileCeosProps {
  initialCeoId?: number | null;
  onDeepLinkConsumed?: () => void;
  onGoToMap?: (type: "ceo" | "cto", id: number) => void;
}

export default function MobileCeos({ initialCeoId, onDeepLinkConsumed, onGoToMap }: MobileCeosProps = {}) {
  const { serverUrl, token } = useMobileAuth();
  const client = createMobileTrpcClient(serverUrl, token);

  // ─── Estado principal ───────────────────────────────────────────────────
  const [ceos, setCeos]         = useState<Ceo[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [view, setView]         = useState<View>("list");
  const [selected, setSelected] = useState<Ceo | null>(null);

  // Tubos
  const [tubes, setTubes]               = useState<Tube[]>([]);
  const [selectedTube, setSelectedTube] = useState<Tube | null>(null);
  const [editTubeForm, setEditTubeForm] = useState<Partial<Tube>>({});
  const [newTubeForm, setNewTubeForm]   = useState({ identifier: "", color: "blue", totalVias: 12, type: "tube", bandejaId: null as number | null });

  // Vias
  const [vias, setVias]               = useState<Via[]>([]);
  const [allVias, setAllVias]         = useState<Via[]>([]);
  const [selectedVia, setSelectedVia] = useState<Via | null>(null);
  const [editViaForm, setEditViaForm] = useState<{ label: string; notes: string }>({ label: "", notes: "" });

  // Fusão
  const [fusionTubeId, setFusionTubeId]     = useState<string>("");
  const [fusionViaId, setFusionViaId]       = useState<string>("");

  // Bandejas
  const [bandejas, setBandejas]             = useState<Bandeja[]>([]);
  const [selectedBandeja, setSelectedBandeja] = useState<Bandeja | null>(null);
  const [newBandejaForm, setNewBandejaForm] = useState({ number: "", label: "", notes: "" });
  const [showNewBandeja, setShowNewBandeja] = useState(false);

   // Splitters
  const [splitters, setSplitters]           = useState<Splitter[]>([]);
  const [selectedSplitter, setSelectedSplitter] = useState<Splitter | null>(null);
  const [splitterVias, setSplitterVias]     = useState<SplitterVia[]>([]);
  const [newSplitterForm, setNewSplitterForm] = useState({
    identifier: "", splitterType: "balanced" as "balanced" | "unbalanced",
    ratio: "1:8", notes: "",
  });
  // Associações
  const [associations, setAssociations]     = useState<Association[]>([]);
  const [allSplitterVias, setAllSplitterVias] = useState<SplitterVia[]>([]);
  // Formulário de associação (via tubo ↔ via splitter)
  const [assocSplitterId, setAssocSplitterId] = useState<string>("");
  const [assocSplitterViaId, setAssocSplitterViaId] = useState<string>("");

  // Editar CEO
  const [editCeoForm, setEditCeoForm] = useState<Partial<Ceo>>({});
  const [geoLoading, setGeoLoading]   = useState(false);

  // Expansão inline de tubos na tela de detalhe
  const [expandedTubeIds, setExpandedTubeIds] = useState<Set<number>>(new Set());
  const [tubeViasCache, setTubeViasCache] = useState<Map<number, Via[]>>(new Map());
  const [expandedSplitterIds, setExpandedSplitterIds] = useState<Set<number>>(new Set());
  const [expandedBandejaIds, setExpandedBandejaIds] = useState<Set<number>>(new Set());

  // UI
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  // ─── Toggle inline tube expansion ─────────────────────────────────────
  async function toggleTubeExpand(tube: Tube) {
    const id = tube.id;
    if (expandedTubeIds.has(id)) {
      setExpandedTubeIds(prev => { const s = new Set(prev); s.delete(id); return s; });
      return;
    }
    // Load vias if not cached
    if (!tubeViasCache.has(id)) {
      try {
        const data = await client.ceoVias.byTube.query({ tubeId: id });
        setTubeViasCache(prev => new Map(prev).set(id, data as unknown as Via[]));
      } catch { setTubeViasCache(prev => new Map(prev).set(id, [])); }
    }
    setExpandedTubeIds(prev => new Set(prev).add(id));
  }

  function toggleSplitterExpand(sp: Splitter) {
    const id = sp.id;
    if (expandedSplitterIds.has(id)) {
      setExpandedSplitterIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    } else {
      setExpandedSplitterIds(prev => new Set(prev).add(id));
    }
  }

  // ─── GPS ────────────────────────────────────────────────────────────────
  async function handleGetLocationCeo() {
    if (!navigator.geolocation) { setError("Geolocalização não suportada"); return; }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        let address = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=pt-BR`);
          const data = await res.json();
          if (data?.display_name) address = data.display_name;
        } catch { /* ignora */ }
        setEditCeoForm(f => ({ ...f, location: address }));
        setGeoLoading(false);
      },
      () => { setGeoLoading(false); setError("Não foi possível obter a localização. Verifique o GPS."); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  // ─── Loaders ────────────────────────────────────────────────────────────
  const loadCeos = useCallback(async () => {
    setLoading(true);
    try {
      if (isOnline()) {
        const data = await client.ceos.list.query({});
        setCeos(data as Ceo[]);
        await saveOfflineCache("ceos_list", data);
      } else {
        const cached = await loadOfflineCache<Ceo[]>("ceos_list");
        setCeos(cached ?? []);
      }
    } catch {
      const cached = await loadOfflineCache<Ceo[]>("ceos_list");
      setCeos(cached ?? []);
    } finally { setLoading(false); }
  }, [serverUrl, token]);

  useEffect(() => { loadCeos(); }, [loadCeos]);

  // Deep-link
  useEffect(() => {
    if (!initialCeoId || ceos.length === 0) return;
    const target = ceos.find(c => c.id === initialCeoId);
    if (target) {
      setSelected(target);
      loadTubes(target.id);
      loadBandejas(target.id);
      loadSplitters(target.id);
      loadAllVias(target.id);
      loadAllSplitterVias(target.id);
      loadAssociations(target.id);
      setView("detail");
      onDeepLinkConsumed?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCeoId, ceos]);

  const loadTubes = useCallback(async (ceoId: number) => {
    try {
      if (isOnline()) {
        const data = await client.ceoTubes.byCeo.query({ ceoId });
        setTubes(data as unknown as Tube[]);
        await saveOfflineCache(`ceo_tubes_${ceoId}`, data);
      } else {
        const cached = await loadOfflineCache<Tube[]>(`ceo_tubes_${ceoId}`);
        setTubes(cached ?? []);
      }
    } catch {
      const cached = await loadOfflineCache<Tube[]>(`ceo_tubes_${ceoId}`);
      setTubes(cached ?? []);
    }
  }, [serverUrl, token]);

  const loadVias = useCallback(async (tubeId: number) => {
    try {
      if (isOnline()) {
        const data = await client.ceoVias.byTube.query({ tubeId });
        setVias(data as unknown as Via[]);
        await saveOfflineCache(`ceo_tube_vias_${tubeId}`, data);
      } else {
        const cached = await loadOfflineCache<Via[]>(`ceo_tube_vias_${tubeId}`);
        setVias(cached ?? []);
      }
    } catch {
      const cached = await loadOfflineCache<Via[]>(`ceo_tube_vias_${tubeId}`);
      setVias(cached ?? []);
    }
  }, [serverUrl, token]);

  const loadAllVias = useCallback(async (ceoId: number) => {
    try {
      if (isOnline()) {
        const data = await client.ceoVias.byCeo.query({ ceoId });
        setAllVias(data as unknown as Via[]);
      }
    } catch { /* ignora */ }
  }, [serverUrl, token]);

  const loadBandejas = useCallback(async (ceoId: number) => {
    try {
      if (isOnline()) {
        const data = await (client as any).ceoBandejas.byCeo.query({ ceoId });
        setBandejas(data as Bandeja[]);
      }
    } catch { setBandejas([]); }
  }, [serverUrl, token]);

  const loadSplitters = useCallback(async (ceoId: number) => {
    try {
      if (isOnline()) {
        const data = await (client as any).ceoSplitters.byCeo.query({ ceoId });
        setSplitters(data as Splitter[]);
      }
    } catch { setSplitters([]); }
  }, [serverUrl, token]);

  const loadSplitterVias = useCallback(async (splitterId: number) => {
    try {
      if (isOnline()) {
        const data = await (client as any).ceoSplitterVias.bySplitter.query({ splitterId });
        setSplitterVias(data as SplitterVia[]);
      }
    } catch { setSplitterVias([]); }
  }, [serverUrl, token]);

  const loadAllSplitterVias = useCallback(async (ceoId: number) => {
    try {
      if (isOnline()) {
        const sps = await (client as any).ceoSplitters.byCeo.query({ ceoId });
        const allSVias: SplitterVia[] = [];
        for (const sp of (sps as Splitter[])) {
          const svias = await (client as any).ceoSplitterVias.bySplitter.query({ splitterId: sp.id });
          allSVias.push(...(svias as SplitterVia[]));
        }
        setAllSplitterVias(allSVias);
      }
    } catch { setAllSplitterVias([]); }
  }, [serverUrl, token]);

  const loadAssociations = useCallback(async (ceoId: number) => {
    try {
      if (isOnline()) {
        const data = await (client as any).ceoViaAssociations.byCeo.query({ ceoId });
        setAssociations(data as Association[]);
      }
    } catch { setAssociations([]); }
  }, [serverUrl, token]);

  const filtered = ceos.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.location ?? "").toLowerCase().includes(search.toLowerCase())
  );

  // ─── Helpers ────────────────────────────────────────────────────────────
  function ErrorBox() {
    if (!error) return null;
    return (
      <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
        <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-red-300">{error}</p>
      </div>
    );
  }

  function fusionLabel(via: Via): string {
    if (!via.fusedToViaId) return "";
    // Usar allVias se disponível, senão procurar no tubeViasCache
    let fusedVia = allVias.find(v => v.id === via.fusedToViaId);
    if (!fusedVia) {
      for (const tvias of tubeViasCache.values()) {
        const found = tvias.find(v => v.id === via.fusedToViaId);
        if (found) { fusedVia = found; break; }
      }
    }
    if (fusedVia) {
      const fusedTube = tubes.find(t => t.id === via.fusedToTubeId);
      return `${fusedTube?.identifier ?? "Tubo ?"} · Via ${fusedVia.viaNumber}`;
    }
    // fusedToViaId aponta para uma via de splitter — usar associationLabel
    const assocLabel = associationLabel(via);
    if (assocLabel) return assocLabel;
    // Procurar directamente em allSplitterVias
    const sv = allSplitterVias.find(s => s.id === via.fusedToViaId);
    if (sv) {
      const sp = splitters.find(s => s.id === sv.splitterId);
      return `Splitter ${sp?.identifier ?? "?"} · Via ${sv.viaNumber}`;
    }
    return "Fusionada";
  }

  function associationLabel(via: Via): string | null {
    const assoc = associations.find(a => a.sourceViaId === via.id || a.targetViaId === via.id);
    if (!assoc) return null;
    const isSource = assoc.sourceViaId === via.id;
    if (isSource) {
      if (assoc.targetType === "splitter_via") {
        const sv = allSplitterVias.find(sv => sv.id === assoc.targetViaId);
        const sp = splitters.find(s => s.id === sv?.splitterId);
        return `Splitter ${sp?.identifier ?? "?"} · Via ${sv?.viaNumber ?? "?"}`;
      }
      const targetVia = allVias.find(v => v.id === assoc.targetViaId);
      const targetTube = tubes.find(t => t.id === targetVia?.tubeId);
      return `${targetTube?.identifier ?? "?"} · Via ${targetVia?.viaNumber ?? "?"}`;
    } else {
      if (assoc.sourceType === "splitter_via") {
        const sv = allSplitterVias.find(sv => sv.id === assoc.sourceViaId);
        const sp = splitters.find(s => s.id === sv?.splitterId);
        return `Splitter ${sp?.identifier ?? "?"} · Via ${sv?.viaNumber ?? "?"}`;
      }
      const sourceVia = allVias.find(v => v.id === assoc.sourceViaId);
      const sourceTube = tubes.find(t => t.id === sourceVia?.tubeId);
      return `${sourceTube?.identifier ?? "?"} · Via ${sourceVia?.viaNumber ?? "?"}`;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEW: LIST
  // ═══════════════════════════════════════════════════════════════════════════
  if (view === "list") return (
    <div className="flex flex-col h-full">
      <div className="bg-zinc-900 border-b border-zinc-800 px-4 pt-4 pb-3 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold text-white">CEO</h1>
          <button onClick={loadCeos} className="text-zinc-400 hover:text-white p-1">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar CEO..."
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-zinc-700 border-t-cyan-400 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-zinc-500 gap-2">
            <Cable className="w-8 h-8 opacity-30" />
            <p className="text-sm">Nenhum CEO encontrado</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {filtered.map(ceo => (
              <button
                key={ceo.id}
                onClick={() => {
                  setSelected(ceo);
                  // Limpar estado do CEO anterior
                  setTubeViasCache(new Map());
                  setExpandedTubeIds(new Set());
                  setExpandedBandejaIds(new Set());
                  setAllVias([]);
                  setTubes([]);
                  setBandejas([]);
                  loadTubes(ceo.id);
                  loadBandejas(ceo.id);
                  loadSplitters(ceo.id);
                  loadAllVias(ceo.id);
                  loadAllSplitterVias(ceo.id);
                  loadAssociations(ceo.id);
                  setView("detail");
                }}
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-zinc-800/50 transition-colors text-left"
              >
                <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center flex-shrink-0">
                  <Cable className="w-4 h-4 text-violet-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{ceo.name}</p>
                  <p className="text-xs text-zinc-500 truncate">
                    {ceo.location ?? "Sem localização"}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-600 flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEW: DETAIL
  // ═══════════════════════════════════════════════════════════════════════════
  if (view === "detail" && selected) {
    const tubesWithoutBandeja = tubes.filter(t => !t.bandejaId);
    const splittersWithoutBandeja = splitters.filter(s => !s.bandejaId);
    const fusedCount = allVias.filter(v => v.fusedToViaId != null).length;

    return (
      <div className="flex flex-col h-full">
        <div className="bg-zinc-900 border-b border-zinc-800 px-4 pt-4 pb-3 flex-shrink-0">
          <button onClick={() => setView("list")} className="flex items-center gap-1 text-cyan-400 text-sm mb-3">
            <ChevronLeft className="w-4 h-4" /> CEO
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-base font-bold text-white">{selected.name}</h1>
              {selected.location && <p className="text-xs text-zinc-400 mt-0.5 truncate max-w-[220px]">{selected.location}</p>}
            </div>
            <div className="flex items-center gap-2">
              {onGoToMap && (
                <button
                  onClick={() => onGoToMap("ceo", selected.id)}
                  className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-cyan-400 transition-colors"
                  title="Ver no Mapa"
                >
                  <MapIcon className="w-3.5 h-3.5" /> Mapa
                </button>
              )}
              {isOnline() && (
                <button
                  onClick={() => { setEditCeoForm({ ...selected }); setError(null); setView("editCeo"); }}
                  className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white transition-colors"
                >
                  <Edit2 className="w-3.5 h-3.5" /> Editar
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Estatísticas */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-white">{bandejas.length}</p>
              <p className="text-[10px] text-zinc-500">Bandejas</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-white">{tubes.length}</p>
              <p className="text-[10px] text-zinc-500">Tubos</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-cyan-400">{fusedCount}</p>
              <p className="text-[10px] text-zinc-500">Fusionadas</p>
            </div>
          </div>

          {/* Info */}
          {(selected.type || selected.notes) && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
              {selected.type && (
                <div className="flex justify-between">
                  <span className="text-xs text-zinc-500">Tipo</span>
                  <span className="text-xs text-zinc-200">{selected.type}</span>
                </div>
              )}
              {selected.notes && (
                <div>
                  <span className="text-xs text-zinc-500 block mb-1">Observações</span>
                  <p className="text-xs text-zinc-300">{selected.notes}</p>
                </div>
              )}
            </div>
          )}

          {/* Bandejas */}
          {bandejas.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Boxes className="w-3.5 h-3.5" /> Bandejas ({bandejas.length})
                </p>
                {isOnline() && (
                  <button
                    onClick={() => setView("bandejas")}
                    className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300"
                  >
                    <Plus className="w-3.5 h-3.5" /> Gerir
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {bandejas.map(bandeja => {
                  const isBandejaExpanded = expandedBandejaIds.has(bandeja.id);
                  const bandejasTubes = tubes.filter(t => t.bandejaId === bandeja.id);
                  const bandejasSplitters = splitters.filter(s => s.bandejaId === bandeja.id);
                  return (
                    <div key={bandeja.id} className="bg-zinc-900 border border-violet-500/20 rounded-xl overflow-hidden">
                      <button
                        onClick={() => {
                          // Carregar allVias ao expandir pela primeira vez (necessário para fusionLabel e indicador de ocupação)
                          if (!expandedBandejaIds.has(bandeja.id) && allVias.length === 0 && selected) {
                            loadAllVias(selected.id);
                          }
                          setExpandedBandejaIds(prev => {
                            const s = new Set(prev);
                            if (s.has(bandeja.id)) s.delete(bandeja.id); else s.add(bandeja.id);
                            return s;
                          });
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left"
                      >
                        <Boxes className="w-4 h-4 text-violet-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-white">Bandeja {bandeja.number}{bandeja.label ? ` — ${bandeja.label}` : ""}</span>
                          <p className="text-xs text-zinc-500">
                            {bandejasTubes.length} tubo{bandejasTubes.length !== 1 ? "s" : ""}
                            {bandejasSplitters.length > 0 ? ` · ${bandejasSplitters.length} splitter${bandejasSplitters.length !== 1 ? "s" : ""}` : ""}
                          </p>
                        </div>
                        {isBandejaExpanded
                          ? <ChevronRight className="w-4 h-4 text-zinc-400 flex-shrink-0 rotate-90 transition-transform" />
                          : <ChevronRight className="w-4 h-4 text-zinc-600 flex-shrink-0 transition-transform" />}
                      </button>
                      {isBandejaExpanded && (
                        <div className="border-t border-zinc-800">
                          {/* Tubos da bandeja */}
                          {bandejasTubes.length > 0 && (
                            <div className="p-3 space-y-2">
                              {bandejasTubes.map(tube => {
                                const isExpanded = expandedTubeIds.has(tube.id);
                                const cachedVias = tubeViasCache.get(tube.id) ?? [];
                                const fusedInTube = cachedVias.filter(v => v.fusedToViaId != null).length;
                                const occCount = fusedInTube;
                                const occPct = tube.totalVias > 0 ? Math.round((occCount / tube.totalVias) * 100) : 0;
                                const occBar = occPct >= 90 ? "bg-red-500" : occPct >= 70 ? "bg-yellow-500" : "bg-emerald-500";
                                const occText = occPct >= 90 ? "text-red-400" : occPct >= 70 ? "text-yellow-400" : "text-emerald-400";
                                return (
                                  <div key={tube.id} className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl overflow-hidden">
                                    <div className="flex items-center gap-3 px-3 py-2.5">
                                      <button
                                        onClick={() => toggleTubeExpand(tube)}
                                        className="flex items-center gap-3 flex-1 min-w-0 text-left"
                                      >
                                        <div className={`w-3.5 h-3.5 rounded-full flex-shrink-0 ${TUBE_COLORS[tube.color ?? ""] ?? "bg-zinc-500"}`} />
                                        <div className="flex-1 min-w-0">
                                          <span className="text-xs font-medium text-white">{tube.identifier}</span>
                                          <div className="flex flex-col gap-0.5">
                                            <p className="text-[11px] text-zinc-500">{TUBE_COLOR_LABELS[tube.color ?? ""] ?? tube.color} · {tube.totalVias} vias</p>
                                            <div className="flex items-center gap-1.5">
                                              <div className="flex-1 h-1 bg-zinc-700 rounded-full overflow-hidden">
                                                <div className={`h-full rounded-full ${occBar}`} style={{ width: `${occPct}%` }} />
                                              </div>
                                              <span className={`text-[10px] font-medium ${occText}`}>{occCount}/{tube.totalVias}</span>
                                            </div>
                                          </div>
                                        </div>
                                        {isExpanded
                                          ? <ChevronRight className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0 rotate-90" />
                                          : <ChevronRight className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />}
                                      </button>
                                      {isOnline() && (
                                        <button
                                          onClick={() => { setSelectedTube(tube); loadVias(tube.id); setView("vias"); }}
                                          className="flex-shrink-0 p-1 text-zinc-500 hover:text-cyan-400"
                                          title="Editar tubo"
                                        >
                                          <Edit2 className="w-3 h-3" />
                                        </button>
                                      )}
                                    </div>
                                    {isExpanded && (
                                      <div className="border-t border-zinc-700/50 divide-y divide-zinc-700/30">
                                        {cachedVias.length === 0 ? (
                                          <p className="text-[11px] text-zinc-600 px-3 py-2 text-center">Nenhuma via neste tubo</p>
                                        ) : cachedVias.map(via => {
                                          const fiberColor = VIA_FIBER_COLORS[via.viaNumber];
                                          const isFused = via.fusedToViaId != null;
                                          const assocLbl = associationLabel(via);
                                          return (
                                            <div
                                              key={via.id}
                                              className={`flex items-center gap-2.5 px-3 py-2 ${
                                                isFused ? "bg-cyan-500/5" : assocLbl ? "bg-emerald-500/5" : ""
                                              }`}
                                            >
                                              <div className={`w-4 h-4 rounded-full flex-shrink-0 border border-white/10 flex items-center justify-center text-[8px] font-bold text-white ${fiberColor?.dot ?? "bg-zinc-700"}`}>
                                                {via.viaNumber}
                                              </div>
                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1">
                                                  <span className="text-[11px] font-medium text-zinc-200">Via {via.viaNumber}</span>
                                                  {via.label && <span className="text-[10px] text-zinc-500">— {via.label}</span>}
                                                </div>
                                                {isFused ? (
                                                  <p className="text-[10px] text-cyan-300 flex items-center gap-0.5">
                                                    <Link2 className="w-2 h-2" />
                                                    {fusionLabel(via) || "Fusionada"}
                                                  </p>
                                                ) : assocLbl ? (
                                                  <p className="text-[10px] text-emerald-300 flex items-center gap-0.5">
                                                    <ArrowRightLeft className="w-2 h-2" />
                                                    {assocLbl}
                                                  </p>
                                                ) : (
                                                  <p className="text-[10px] text-zinc-600">Livre</p>
                                                )}
                                              </div>
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
                          {/* Splitters da bandeja */}
                          {bandejasSplitters.length > 0 && (
                            <div className="p-3 pt-0 space-y-2">
                              {bandejasSplitters.map(sp => {
                                const isSpExpanded = expandedSplitterIds.has(sp.id);
                                const spVias = allSplitterVias.filter(sv => sv.splitterId === sp.id);
                                return (
                                  <div key={sp.id} className="bg-zinc-800/50 border border-amber-500/20 rounded-xl overflow-hidden">
                                    <div className="flex items-center gap-3 px-3 py-2.5">
                                      <button
                                        onClick={() => toggleSplitterExpand(sp)}
                                        className="flex items-center gap-3 flex-1 min-w-0 text-left"
                                      >
                                        <Zap className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                                        <div className="flex-1 min-w-0">
                                          <span className="text-xs font-medium text-white">{sp.identifier}</span>
                                          <p className="text-[11px] text-zinc-500">{sp.type === "balanced" ? "Balanceado" : "Desbalanceado"} · {sp.ratio}</p>
                                        </div>
                                        {isSpExpanded
                                          ? <ChevronRight className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0 rotate-90" />
                                          : <ChevronRight className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />}
                                      </button>
                                      {isOnline() && (
                                        <button
                                          onClick={() => { setSelectedSplitter(sp); loadSplitterVias(sp.id); setView("splitterVias"); }}
                                          className="flex-shrink-0 p-1 text-zinc-500 hover:text-amber-400"
                                          title="Editar splitter"
                                        >
                                          <Edit2 className="w-3 h-3" />
                                        </button>
                                      )}
                                    </div>
                                    {isSpExpanded && (
                                      <div className="border-t border-zinc-700/50 divide-y divide-zinc-700/30">
                                        {spVias.length === 0 ? (
                                          <p className="text-[11px] text-zinc-600 px-3 py-2 text-center">Nenhuma via neste splitter</p>
                                        ) : spVias.map(sv => {
                                          const svAssoc = associations.find(a => a.sourceViaId === sv.id || a.targetViaId === sv.id);
                                          let assocLbl2: string | null = null;
                                          if (svAssoc) {
                                            const isSource = svAssoc.sourceViaId === sv.id;
                                            if (isSource) {
                                              const tv = allVias.find(v => v.id === svAssoc.targetViaId);
                                              const tt = tubes.find(t => t.id === tv?.tubeId);
                                              assocLbl2 = `${tt?.identifier ?? "?"} · Via ${tv?.viaNumber ?? "?"}`;
                                            } else {
                                              const sv2 = allVias.find(v => v.id === svAssoc.sourceViaId);
                                              const st = tubes.find(t => t.id === sv2?.tubeId);
                                              assocLbl2 = `${st?.identifier ?? "?"} · Via ${sv2?.viaNumber ?? "?"}`;
                                            }
                                          }
                                          return (
                                            <div key={sv.id} className={`flex items-center gap-2.5 px-3 py-2 ${assocLbl2 ? "bg-emerald-500/5" : ""}`}>
                                              <div className="w-4 h-4 rounded-full flex-shrink-0 border border-amber-500/30 bg-amber-500/10 flex items-center justify-center text-[8px] font-bold text-amber-300">
                                                {sv.viaNumber}
                                              </div>
                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1">
                                                  <span className="text-[11px] font-medium text-zinc-200">Via {sv.viaNumber}</span>
                                                  {sv.label && <span className="text-[10px] text-zinc-500">— {sv.label}</span>}
                                                </div>
                                                {assocLbl2 ? (
                                                  <p className="text-[10px] text-emerald-300 flex items-center gap-0.5">
                                                    <ArrowRightLeft className="w-2 h-2" />
                                                    {assocLbl2}
                                                  </p>
                                                ) : (
                                                  <p className="text-[10px] text-zinc-600">Livre</p>
                                                )}
                                              </div>
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
                          {bandejasTubes.length === 0 && bandejasSplitters.length === 0 && (
                            <p className="text-xs text-zinc-600 px-4 py-3 text-center">Bandeja vazia</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tubos sem bandeja */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" /> Tubos sem bandeja ({tubesWithoutBandeja.length})
              </p>
              {isOnline() && (
                <button
                  onClick={() => {
                    setNewTubeForm({ identifier: `Tubo ${tubes.length + 1}`, color: "blue", totalVias: 12, type: "tube", bandejaId: null });
                    setError(null);
                    setView("newTube");
                  }}
                  className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300"
                >
                  <Plus className="w-3.5 h-3.5" /> Novo
                </button>
              )}
            </div>

            {tubesWithoutBandeja.length === 0 && splittersWithoutBandeja.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-16 text-zinc-600 gap-1 border border-dashed border-zinc-800 rounded-xl">
                <p className="text-xs">Todos os tubos estão em bandejas</p>
              </div>
            ) : (
              <div className="space-y-2">
                {tubesWithoutBandeja.map(tube => {
                  const isExpanded = expandedTubeIds.has(tube.id);
                  const cachedVias = tubeViasCache.get(tube.id) ?? [];
                  const fusedInTube = cachedVias.filter(v => v.fusedToViaId != null).length;
                  const occCount = fusedInTube;
                  const occPct = tube.totalVias > 0 ? Math.round((occCount / tube.totalVias) * 100) : 0;
                  const occBar = occPct >= 90 ? "bg-red-500" : occPct >= 70 ? "bg-yellow-500" : "bg-emerald-500";
                  const occText = occPct >= 90 ? "text-red-400" : occPct >= 70 ? "text-yellow-400" : "text-emerald-400";
                  return (
                    <div key={tube.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                      {/* Cabeçalho do tubo */}
                      <div className="flex items-center gap-3 px-4 py-3">
                        <button
                          onClick={() => toggleTubeExpand(tube)}
                          className="flex items-center gap-3 flex-1 min-w-0 text-left"
                        >
                          <div className={`w-4 h-4 rounded-full flex-shrink-0 ${TUBE_COLORS[tube.color ?? ""] ?? "bg-zinc-500"}`} />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-white">{tube.identifier}</span>
                            <div className="flex flex-col gap-0.5">
                              <p className="text-xs text-zinc-500">{TUBE_COLOR_LABELS[tube.color ?? ""] ?? tube.color} · {tube.totalVias} vias</p>
                              <div className="flex items-center gap-1.5">
                                <div className="flex-1 h-1 bg-zinc-700 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${occBar}`} style={{ width: `${occPct}%` }} />
                                </div>
                                <span className={`text-[10px] font-medium ${occText}`}>{occCount}/{tube.totalVias}</span>
                              </div>
                            </div>
                          </div>
                          {isExpanded
                            ? <ChevronRight className="w-4 h-4 text-zinc-400 flex-shrink-0 rotate-90 transition-transform" />
                            : <ChevronRight className="w-4 h-4 text-zinc-600 flex-shrink-0 transition-transform" />}
                        </button>
                        {isOnline() && (
                          <button
                            onClick={() => { setSelectedTube(tube); loadVias(tube.id); setView("vias"); }}
                            className="flex-shrink-0 p-1.5 text-zinc-500 hover:text-cyan-400"
                            title="Editar tubo"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      {/* Vias expandidas */}
                      {isExpanded && (
                        <div className="border-t border-zinc-800 divide-y divide-zinc-800/50">
                          {cachedVias.length === 0 ? (
                            <p className="text-xs text-zinc-600 px-4 py-3 text-center">Nenhuma via neste tubo</p>
                          ) : cachedVias.map(via => {
                            const fiberColor = VIA_FIBER_COLORS[via.viaNumber];
                            const isFused = via.fusedToViaId != null;
                            const assocLbl = associationLabel(via);
                            return (
                              <div
                                key={via.id}
                                className={`flex items-center gap-3 px-4 py-2.5 ${
                                  isFused ? "bg-cyan-500/5" : assocLbl ? "bg-emerald-500/5" : ""
                                }`}
                              >
                                <div className={`w-5 h-5 rounded-full flex-shrink-0 border border-white/10 flex items-center justify-center text-[9px] font-bold text-white ${fiberColor?.dot ?? "bg-zinc-700"}`}>
                                  {via.viaNumber}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-medium text-zinc-200">Via {via.viaNumber}</span>
                                    {via.label && <span className="text-[11px] text-zinc-500">— {via.label}</span>}
                                  </div>
                                  {isFused ? (
                                    <p className="text-[10px] text-cyan-300 flex items-center gap-1">
                                      <Link2 className="w-2.5 h-2.5" />
                                      {fusionLabel(via) || "Fusionada"}
                                    </p>
                                  ) : assocLbl ? (
                                    <p className="text-[10px] text-emerald-300 flex items-center gap-1">
                                      <ArrowRightLeft className="w-2.5 h-2.5" />
                                      {assocLbl}
                                    </p>
                                  ) : (
                                    <p className="text-[10px] text-zinc-600">Livre</p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                {splittersWithoutBandeja.map(sp => {
                  const isExpanded = expandedSplitterIds.has(sp.id);
                  const spVias = allSplitterVias.filter(sv => sv.splitterId === sp.id);
                  return (
                    <div key={`sp-${sp.id}`} className="bg-zinc-900 border border-amber-500/20 rounded-xl overflow-hidden">
                      <div className="flex items-center gap-3 px-4 py-3">
                        <button
                          onClick={() => toggleSplitterExpand(sp)}
                          className="flex items-center gap-3 flex-1 min-w-0 text-left"
                        >
                          <Zap className="w-4 h-4 text-amber-400 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-white">{sp.identifier}</span>
                            <p className="text-xs text-zinc-500">{sp.type === "balanced" ? "Balanceado" : "Desbalanceado"} · {sp.ratio}</p>
                          </div>
                          {isExpanded
                            ? <ChevronRight className="w-4 h-4 text-zinc-400 flex-shrink-0 rotate-90 transition-transform" />
                            : <ChevronRight className="w-4 h-4 text-zinc-600 flex-shrink-0 transition-transform" />}
                        </button>
                        {isOnline() && (
                          <button
                            onClick={() => { setSelectedSplitter(sp); loadSplitterVias(sp.id); setView("splitterVias"); }}
                            className="flex-shrink-0 p-1.5 text-zinc-500 hover:text-amber-400"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      {isExpanded && (
                        <div className="border-t border-amber-500/10 divide-y divide-zinc-800/50">
                          {spVias.length === 0 ? (
                            <p className="text-xs text-zinc-600 px-4 py-3 text-center">Nenhuma via neste splitter</p>
                          ) : spVias.map(sv => {
                            const assoc = associations.find(a =>
                              (a.sourceType === "splitter_via" && a.sourceViaId === sv.id) ||
                              (a.targetType === "splitter_via" && a.targetViaId === sv.id)
                            );
                            const isAssoc = !!assoc;
                            let assocLabel = "";
                            if (assoc) {
                              const isSource = assoc.sourceType === "splitter_via" && assoc.sourceViaId === sv.id;
                              const otherViaId = isSource ? assoc.targetViaId : assoc.sourceViaId;
                              const otherVia = allVias.find(v => v.id === otherViaId);
                              const otherTube = tubes.find(t => t.id === otherVia?.tubeId);
                              assocLabel = `${otherTube?.identifier ?? "?"} · Via ${otherVia?.viaNumber ?? "?"}`;
                            }
                            return (
                              <div
                                key={sv.id}
                                className={`flex items-center gap-3 px-4 py-2.5 ${isAssoc ? "bg-emerald-500/5" : ""}`}
                              >
                                <div className="w-5 h-5 rounded-full flex-shrink-0 bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-[9px] font-bold text-amber-300">
                                  {sv.viaNumber}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-medium text-zinc-200">Via {sv.viaNumber}</span>
                                    {sv.label && <span className="text-[11px] text-zinc-500">— {sv.label}</span>}
                                  </div>
                                  {isAssoc ? (
                                    <p className="text-[10px] text-emerald-300 flex items-center gap-1">
                                      <ArrowRightLeft className="w-2.5 h-2.5" />{assocLabel || "Associada"}
                                    </p>
                                  ) : (
                                    <p className="text-[10px] text-zinc-600">Livre</p>
                                  )}
                                </div>
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
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEW: BANDEJAS (lista de bandejas)
  // ═══════════════════════════════════════════════════════════════════════════
  if (view === "bandejas" && selected) {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-zinc-900 border-b border-zinc-800 px-4 pt-4 pb-3 flex-shrink-0">
          <button onClick={() => setView("detail")} className="flex items-center gap-1 text-cyan-400 text-sm mb-3">
            <ChevronLeft className="w-4 h-4" /> {selected.name}
          </button>
          <div className="flex items-center justify-between">
            <h1 className="text-base font-bold text-white">Bandejas</h1>
            {isOnline() && (
              <button
                onClick={() => { setShowNewBandeja(true); setNewBandejaForm({ number: String(bandejas.length + 1), label: "", notes: "" }); setError(null); }}
                className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300"
              >
                <Plus className="w-3.5 h-3.5" /> Nova
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <ErrorBox />

          {/* Formulário nova bandeja */}
          {showNewBandeja && (
            <div className="bg-zinc-900 border border-cyan-500/30 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-cyan-400">Nova Bandeja</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Número *</label>
                  <input
                    type="number" value={newBandejaForm.number}
                    onChange={e => setNewBandejaForm(f => ({ ...f, number: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                    min={1}
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Etiqueta</label>
                  <input
                    type="text" value={newBandejaForm.label}
                    onChange={e => setNewBandejaForm(f => ({ ...f, label: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    const num = parseInt(newBandejaForm.number);
                    if (!num || isNaN(num)) { setError("Número inválido"); return; }
                    setSaving(true); setError(null);
                    try {
                      await (client as any).ceoBandejas.create.mutate({
                        ceoId: selected.id,
                        number: num,
                        label: newBandejaForm.label || undefined,
                        notes: newBandejaForm.notes || undefined,
                      });
                      await loadBandejas(selected.id);
                      setShowNewBandeja(false);
                    } catch (e: any) { setError(e?.message ?? "Erro ao criar bandeja"); }
                    finally { setSaving(false); }
                  }}
                  disabled={saving || !newBandejaForm.number}
                  className="flex-1 bg-cyan-500 disabled:opacity-50 text-zinc-900 font-semibold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1"
                >
                  {saving ? <div className="w-3.5 h-3.5 border-2 border-zinc-900/30 border-t-zinc-900 rounded-full animate-spin" /> : <><Check className="w-3.5 h-3.5" /> Criar</>}
                </button>
                <button onClick={() => setShowNewBandeja(false)} className="px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-zinc-300">
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {bandejas.length === 0 && !showNewBandeja ? (
            <div className="flex flex-col items-center justify-center h-32 text-zinc-600 gap-2 border border-dashed border-zinc-800 rounded-xl">
              <Boxes className="w-7 h-7 opacity-40" />
              <p className="text-xs">Nenhuma bandeja cadastrada</p>
            </div>
          ) : (
            <div className="space-y-2">
              {bandejas.map(bandeja => {
                const bandejasTubes = tubes.filter(t => t.bandejaId === bandeja.id);
                const bandejasSplitters = splitters.filter(s => s.bandejaId === bandeja.id);
                return (
                  <button
                    key={bandeja.id}
                    onClick={() => { setSelectedBandeja(bandeja); setView("bandejaDetail"); }}
                    className="w-full flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 hover:bg-zinc-800/50 transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-violet-400">{bandeja.number}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white">
                        Bandeja {bandeja.number}{bandeja.label ? ` — ${bandeja.label}` : ""}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {bandejasTubes.length} tubo{bandejasTubes.length !== 1 ? "s" : ""}
                        {bandejasSplitters.length > 0 ? ` · ${bandejasSplitters.length} splitter${bandejasSplitters.length !== 1 ? "s" : ""}` : ""}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-zinc-600 flex-shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEW: BANDEJA DETAIL (tubos e splitters de uma bandeja)
  // ═══════════════════════════════════════════════════════════════════════════
  if (view === "bandejaDetail" && selectedBandeja && selected) {
    const bandejasTubes = tubes.filter(t => t.bandejaId === selectedBandeja.id);
    const bandejasSplitters = splitters.filter(s => s.bandejaId === selectedBandeja.id);

    return (
      <div className="flex flex-col h-full">
        <div className="bg-zinc-900 border-b border-zinc-800 px-4 pt-4 pb-3 flex-shrink-0">
          <button onClick={() => setView("bandejas")} className="flex items-center gap-1 text-cyan-400 text-sm mb-3">
            <ChevronLeft className="w-4 h-4" /> Bandejas
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-base font-bold text-white">
                Bandeja {selectedBandeja.number}
                {selectedBandeja.label ? ` — ${selectedBandeja.label}` : ""}
              </h1>
              <p className="text-xs text-zinc-400 mt-0.5">{bandejasTubes.length} tubos · {bandejasSplitters.length} splitters</p>
            </div>
            {isOnline() && (
              <button
                onClick={async () => {
                  if (!confirm("Excluir esta bandeja?")) return;
                  setSaving(true);
                  try {
                    await (client as any).ceoBandejas.delete.mutate({ id: selectedBandeja.id });
                    await loadBandejas(selected.id);
                    setView("bandejas");
                  } catch (e: any) { setError(e?.message ?? "Erro"); }
                  finally { setSaving(false); }
                }}
                className="p-2 text-red-400 hover:text-red-300"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <ErrorBox />

          {/* Tubos da bandeja */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" /> Tubos ({bandejasTubes.length})
              </p>
              {isOnline() && (
                <button
                  onClick={() => {
                    setNewTubeForm({ identifier: `Tubo ${tubes.length + 1}`, color: "blue", totalVias: 12, type: "tube", bandejaId: selectedBandeja.id });
                    setError(null);
                    setView("newTube");
                  }}
                  className="flex items-center gap-1 text-xs text-cyan-400"
                >
                  <Plus className="w-3.5 h-3.5" /> Novo
                </button>
              )}
            </div>
            {bandejasTubes.length === 0 ? (
              <p className="text-xs text-zinc-600 text-center py-3">Nenhum tubo nesta bandeja</p>
            ) : (
              <div className="space-y-2">
                {bandejasTubes.map(tube => {
                  const isExpanded = expandedTubeIds.has(tube.id);
                  const cachedVias = tubeViasCache.get(tube.id) ?? [];
                  const fusedInTube = cachedVias.filter(v => v.fusedToViaId != null).length;
                  const occCount = fusedInTube;
                  const occPct = tube.totalVias > 0 ? Math.round((occCount / tube.totalVias) * 100) : 0;
                  const occBar = occPct >= 90 ? "bg-red-500" : occPct >= 70 ? "bg-yellow-500" : "bg-emerald-500";
                  const occText = occPct >= 90 ? "text-red-400" : occPct >= 70 ? "text-yellow-400" : "text-emerald-400";
                  return (
                    <div key={tube.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                      <div className="flex items-center gap-3 px-4 py-3">
                        <button
                          onClick={() => toggleTubeExpand(tube)}
                          className="flex items-center gap-3 flex-1 min-w-0 text-left"
                        >
                          <div className={`w-4 h-4 rounded-full flex-shrink-0 ${TUBE_COLORS[tube.color ?? ""] ?? "bg-zinc-500"}`} />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-white">{tube.identifier}</span>
                            <div className="flex flex-col gap-0.5">
                              <p className="text-xs text-zinc-500">{TUBE_COLOR_LABELS[tube.color ?? ""] ?? tube.color} · {tube.totalVias} vias</p>
                              <div className="flex items-center gap-1.5">
                                <div className="flex-1 h-1 bg-zinc-700 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${occBar}`} style={{ width: `${occPct}%` }} />
                                </div>
                                <span className={`text-[10px] font-medium ${occText}`}>{occCount}/{tube.totalVias}</span>
                              </div>
                            </div>
                          </div>
                          {isExpanded
                            ? <ChevronRight className="w-4 h-4 text-zinc-400 flex-shrink-0 rotate-90 transition-transform" />
                            : <ChevronRight className="w-4 h-4 text-zinc-600 flex-shrink-0 transition-transform" />}
                        </button>
                        {isOnline() && (
                          <button
                            onClick={() => { setSelectedTube(tube); loadVias(tube.id); setView("vias"); }}
                            className="flex-shrink-0 p-1.5 text-zinc-500 hover:text-cyan-400"
                            title="Editar tubo"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      {isExpanded && (
                        <div className="border-t border-zinc-800 divide-y divide-zinc-800/50">
                          {cachedVias.length === 0 ? (
                            <p className="text-xs text-zinc-600 px-4 py-3 text-center">Nenhuma via neste tubo</p>
                          ) : cachedVias.map(via => {
                            const fiberColor = VIA_FIBER_COLORS[via.viaNumber];
                            const isFused = via.fusedToViaId != null;
                            const assocLbl = associationLabel(via);
                            return (
                              <div
                                key={via.id}
                                className={`flex items-center gap-3 px-4 py-2.5 ${
                                  isFused ? "bg-cyan-500/5" : assocLbl ? "bg-emerald-500/5" : ""
                                }`}
                              >
                                <div className={`w-5 h-5 rounded-full flex-shrink-0 border border-white/10 flex items-center justify-center text-[9px] font-bold text-white ${fiberColor?.dot ?? "bg-zinc-700"}`}>
                                  {via.viaNumber}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-medium text-zinc-200">Via {via.viaNumber}</span>
                                    {via.label && <span className="text-[11px] text-zinc-500">— {via.label}</span>}
                                  </div>
                                  {isFused ? (
                                    <p className="text-[10px] text-cyan-300 flex items-center gap-1">
                                      <Link2 className="w-2.5 h-2.5" />
                                      {fusionLabel(via) || "Fusionada"}
                                    </p>
                                  ) : assocLbl ? (
                                    <p className="text-[10px] text-emerald-300 flex items-center gap-1">
                                      <ArrowRightLeft className="w-2.5 h-2.5" />
                                      {assocLbl}
                                    </p>
                                  ) : (
                                    <p className="text-[10px] text-zinc-600">Livre</p>
                                  )}
                                </div>
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

          {/* Splitters da bandeja */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" /> Splitters ({bandejasSplitters.length})
              </p>
              {isOnline() && (
                <button
                  onClick={() => {
                    setNewSplitterForm({ identifier: `SP-${splitters.length + 1}`, splitterType: "balanced", ratio: "1:8", notes: "" });
                    setError(null);
                    setView("newSplitter");
                  }}
                  className="flex items-center gap-1 text-xs text-amber-400"
                >
                  <Plus className="w-3.5 h-3.5" /> Novo
                </button>
              )}
            </div>
            {bandejasSplitters.length === 0 ? (
              <p className="text-xs text-zinc-600 text-center py-3">Nenhum splitter nesta bandeja</p>
            ) : (
              <div className="space-y-2">
                {bandejasSplitters.map(sp => {
                  const isSpExpanded = expandedSplitterIds.has(sp.id);
                  const spVias = allSplitterVias.filter(sv => sv.splitterId === sp.id);
                  return (
                    <div key={sp.id} className="bg-zinc-900 border border-amber-500/20 rounded-xl overflow-hidden">
                      <div className="flex items-center gap-3 px-4 py-3">
                        <button
                          onClick={() => toggleSplitterExpand(sp)}
                          className="flex items-center gap-3 flex-1 min-w-0 text-left"
                        >
                          <Zap className="w-4 h-4 text-amber-400 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-white">{sp.identifier}</span>
                            <p className="text-xs text-zinc-500">{sp.type === "balanced" ? "Balanceado" : "Desbalanceado"} · {sp.ratio}</p>
                          </div>
                          {isSpExpanded
                            ? <ChevronRight className="w-4 h-4 text-zinc-400 flex-shrink-0 rotate-90 transition-transform" />
                            : <ChevronRight className="w-4 h-4 text-zinc-600 flex-shrink-0 transition-transform" />}
                        </button>
                        {isOnline() && (
                          <button
                            onClick={() => { setSelectedSplitter(sp); loadSplitterVias(sp.id); setView("splitterVias"); }}
                            className="flex-shrink-0 p-1.5 text-zinc-500 hover:text-amber-400"
                            title="Editar splitter"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      {isSpExpanded && (
                        <div className="border-t border-zinc-800 divide-y divide-zinc-800/50">
                          {spVias.length === 0 ? (
                            <p className="text-xs text-zinc-600 px-4 py-3 text-center">Nenhuma via neste splitter</p>
                          ) : spVias.map(sv => {
                            const svAssoc = associations.find(a => a.sourceViaId === sv.id || a.targetViaId === sv.id);
                            let assocLbl: string | null = null;
                            if (svAssoc) {
                              const isSource = svAssoc.sourceViaId === sv.id;
                              if (isSource) {
                                const tv = allVias.find(v => v.id === svAssoc.targetViaId);
                                const tt = tubes.find(t => t.id === tv?.tubeId);
                                assocLbl = `${tt?.identifier ?? "?"} · Via ${tv?.viaNumber ?? "?"}`;
                              } else {
                                const sv2 = allVias.find(v => v.id === svAssoc.sourceViaId);
                                const st = tubes.find(t => t.id === sv2?.tubeId);
                                assocLbl = `${st?.identifier ?? "?"} · Via ${sv2?.viaNumber ?? "?"}`;
                              }
                            }
                            return (
                              <div key={sv.id} className={`flex items-center gap-3 px-4 py-2.5 ${assocLbl ? "bg-emerald-500/5" : ""}`}>
                                <div className="w-5 h-5 rounded-full flex-shrink-0 border border-amber-500/30 bg-amber-500/10 flex items-center justify-center text-[9px] font-bold text-amber-300">
                                  {sv.viaNumber}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-medium text-zinc-200">Via {sv.viaNumber}</span>
                                    {sv.label && <span className="text-[11px] text-zinc-500">— {sv.label}</span>}
                                  </div>
                                  {assocLbl ? (
                                    <p className="text-[10px] text-emerald-300 flex items-center gap-1">
                                      <ArrowRightLeft className="w-2.5 h-2.5" />
                                      {assocLbl}
                                    </p>
                                  ) : (
                                    <p className="text-[10px] text-zinc-600">Livre</p>
                                  )}
                                </div>
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
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEW: SPLITTER VIAS
  // ═══════════════════════════════════════════════════════════════════════════
  if (view === "splitterVias" && selectedSplitter) {
    const backView: View = selectedSplitter.bandejaId ? "bandejaDetail" : "detail";
    return (
      <div className="flex flex-col h-full">
        <div className="bg-zinc-900 border-b border-zinc-800 px-4 pt-4 pb-3 flex-shrink-0">
          <button onClick={() => setView(backView)} className="flex items-center gap-1 text-cyan-400 text-sm mb-3">
            <ChevronLeft className="w-4 h-4" /> {selectedSplitter.bandejaId ? `Bandeja ${selectedBandeja?.number}` : selected?.name}
          </button>
          <div>
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <h1 className="text-base font-bold text-white">{selectedSplitter.identifier}</h1>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              {selectedSplitter.type === "balanced" ? "Balanceado" : "Desbalanceado"} · {selectedSplitter.ratio}
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {splitterVias.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-zinc-600 gap-2">
              <p className="text-sm">Nenhuma via neste splitter</p>
            </div>
          ) : splitterVias.map(sv => {
            const assoc = associations.find(a =>
              (a.sourceType === "splitter_via" && a.sourceViaId === sv.id) ||
              (a.targetType === "splitter_via" && a.targetViaId === sv.id)
            );
            const isAssoc = !!assoc;
            let assocLabel = "";
            if (assoc) {
              const isSource = assoc.sourceType === "splitter_via" && assoc.sourceViaId === sv.id;
              const otherViaId = isSource ? assoc.targetViaId : assoc.sourceViaId;
              const otherType = isSource ? assoc.targetType : assoc.sourceType;
              if (otherType === "tube_via") {
                const otherVia = allVias.find(v => v.id === otherViaId);
                const otherTube = tubes.find(t => t.id === otherVia?.tubeId);
                assocLabel = `${otherTube?.identifier ?? "?"} · Via ${otherVia?.viaNumber ?? "?"}`;
              }
            }
            return (
              <div
                key={sv.id}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 border ${
                  isAssoc ? "bg-emerald-500/5 border-emerald-500/30" : "bg-zinc-900 border-zinc-800"
                }`}
              >
                <div className="w-6 h-6 rounded-full flex-shrink-0 bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-[10px] font-bold text-amber-300">
                  {sv.viaNumber}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">Via {sv.viaNumber}</span>
                    {sv.label && <span className="text-xs text-zinc-400">— {sv.label}</span>}
                  </div>
                  {sv.lossDb != null && (
                    <p className="text-[11px] text-amber-400/70 mt-0.5">Perda: {sv.lossDb} dB</p>
                  )}
                  {isAssoc ? (
                    <p className="text-[11px] text-emerald-300 flex items-center gap-1 mt-0.5">
                      <ArrowRightLeft className="w-3 h-3" /> {assocLabel || "Associada"}
                    </p>
                  ) : (
                    <p className="text-[11px] text-zinc-500 mt-0.5">Livre</p>
                  )}
                </div>
                {isOnline() && (
                  isAssoc ? (
                    <button
                      onClick={async () => {
                        if (!assoc) return;
                        setSaving(true); setError(null);
                        try {
                          await (client as any).ceoViaAssociations.delete.mutate({ id: assoc.id });
                          await loadAssociations(selected!.id);
                        } catch (e: any) { setError(e?.message ?? "Erro ao remover"); }
                        finally { setSaving(false); }
                      }}
                      disabled={saving}
                      className="flex-shrink-0 p-1.5 text-red-400 hover:text-red-300"
                    >
                      <Link2Off className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        // Navegar para setSplitterAssociation com a via de splitter seleccionada
                        setSelectedSplitter(selectedSplitter);
                        setAssocSplitterId(String(selectedSplitter.id));
                        setAssocSplitterViaId(String(sv.id));
                        setView("setSplitterAssociation");
                      }}
                      className="flex-shrink-0 p-1.5 text-emerald-400 hover:text-emerald-300"
                    >
                      <Link2 className="w-4 h-4" />
                    </button>
                  )
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEW: NEW SPLITTER
  // ═══════════════════════════════════════════════════════════════════════════
  if (view === "newSplitter" && selectedBandeja && selected) {
    const RATIOS = ["1:2", "1:4", "1:8", "1:16", "1:32", "1:64", "2:4", "2:8"];
    return (
      <div className="flex flex-col h-full">
        <div className="bg-zinc-900 border-b border-zinc-800 px-4 pt-4 pb-3 flex-shrink-0">
          <button onClick={() => setView("bandejaDetail")} className="flex items-center gap-1 text-cyan-400 text-sm mb-3">
            <ChevronLeft className="w-4 h-4" /> Bandeja {selectedBandeja.number}
          </button>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <h1 className="text-base font-bold text-white">Novo Splitter</h1>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <ErrorBox />
          {/* Identificador */}
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Identificador *</label>
            <input
              value={newSplitterForm.identifier}
              onChange={e => setNewSplitterForm(f => ({ ...f, identifier: e.target.value }))}
              placeholder="Ex: SP-01"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
            />
          </div>
          {/* Tipo */}
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Tipo</label>
            <div className="flex gap-2">
              {(["balanced", "unbalanced"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setNewSplitterForm(f => ({ ...f, splitterType: t }))}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                    newSplitterForm.splitterType === t
                      ? "bg-amber-500/20 border-amber-500/50 text-amber-300"
                      : "bg-zinc-800 border-zinc-700 text-zinc-400"
                  }`}
                >
                  {t === "balanced" ? "Balanceado" : "Desbalanceado"}
                </button>
              ))}
            </div>
          </div>
          {/* Rácio */}
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Rácio</label>
            <select
              value={newSplitterForm.ratio}
              onChange={e => setNewSplitterForm(f => ({ ...f, ratio: e.target.value }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
            >
              {RATIOS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {/* Observações */}
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Observações</label>
            <textarea
              value={newSplitterForm.notes}
              onChange={e => setNewSplitterForm(f => ({ ...f, notes: e.target.value }))}
              rows={2}
              placeholder="Opcional..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 resize-none"
            />
          </div>
          {/* Botão criar */}
          <button
            onClick={async () => {
              if (!newSplitterForm.identifier.trim()) { setError("Informe o identificador"); return; }
              setSaving(true); setError(null);
              try {
                await (client as any).ceoSplitters.create.mutate({
                  ceoId: selected.id,
                  bandejaId: selectedBandeja.id,
                  identifier: newSplitterForm.identifier.trim(),
                  splitterType: newSplitterForm.splitterType,
                  ratio: newSplitterForm.ratio,
                  notes: newSplitterForm.notes || undefined,
                });
                // Recarregar splitters
                const allSp = await (client as any).ceoSplitters.byCeo.query({ ceoId: selected.id });
                setSplitters(allSp);
                setView("bandejaDetail");
              } catch (e: any) { setError(e?.message ?? "Erro ao criar splitter"); }
              finally { setSaving(false); }
            }}
            disabled={saving}
            className="w-full bg-amber-500 hover:bg-amber-400 text-black font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> : <><Plus className="w-4 h-4" /> Criar Splitter</>}
          </button>
        </div>
      </div>
    );
  }
  // ═══════════════════════════════════════════════════════════════════════════
  // VIEW: SET SPLITTER ASSOCIATION (associar via de splitter a via de tubo)
  // ═══════════════════════════════════════════════════════════════════════════
  if (view === "setSplitterAssociation" && selectedSplitter && selected) {
    // A via de splitter já está seleccionada (assocSplitterViaId)
    // Precisamos seleccionar a via de tubo a associar
    const splitterVia = allSplitterVias.find(sv => sv.id === parseInt(assocSplitterViaId));
    // Tubos disponíveis (excluir splitters)
    const availableTubes = tubes.filter(t => t.type === "tube");
    return (
      <div className="flex flex-col h-full">
        <div className="bg-zinc-900 border-b border-zinc-800 px-4 pt-4 pb-3 flex-shrink-0">
          <button onClick={() => setView("splitterVias")} className="flex items-center gap-1 text-cyan-400 text-sm mb-3">
            <ChevronLeft className="w-4 h-4" /> {selectedSplitter.identifier}
          </button>
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-emerald-400" />
            <div>
              <h1 className="text-base font-bold text-white">Associar Via</h1>
              <p className="text-xs text-zinc-400 mt-0.5">
                {selectedSplitter.identifier} · Via {splitterVia?.viaNumber ?? "?"}
                {splitterVia?.label ? ` — ${splitterVia.label}` : ""}
              </p>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <ErrorBox />
          <p className="text-xs text-zinc-400">Seleccione a via de tubo a associar a esta via de splitter:</p>
          {/* Seleccionar tubo */}
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Tubo</label>
            <select
              value={fusionTubeId}
              onChange={e => { setFusionTubeId(e.target.value); setFusionViaId(""); }}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="">Seleccionar tubo...</option>
              {availableTubes.map(t => (
                <option key={t.id} value={String(t.id)}>{t.identifier}</option>
              ))}
            </select>
          </div>
          {/* Seleccionar via do tubo */}
          {fusionTubeId && (
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Via do tubo</label>
              <select
                value={fusionViaId}
                onChange={e => setFusionViaId(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="">Seleccionar via...</option>
                {allVias
                  .filter(v => v.tubeId === parseInt(fusionTubeId))
                  .filter(v => !v.fusedToViaId)
                  .filter(v => !associations.find(a =>
                    (a.sourceType === "tube_via" && a.sourceViaId === v.id) ||
                    (a.targetType === "tube_via" && a.targetViaId === v.id)
                  ))
                  .map(v => (
                    <option key={v.id} value={String(v.id)}>
                      Via {v.viaNumber}{v.label ? ` — ${v.label}` : ""}
                    </option>
                  ))}
              </select>
            </div>
          )}
          {/* Botão confirmar */}
          {fusionTubeId && fusionViaId && (
            <button
              onClick={async () => {
                setSaving(true); setError(null);
                try {
                  await (client as any).ceoViaAssociations.create.mutate({
                    ceoId: selected.id,
                    sourceType: "splitter_via",
                    sourceViaId: parseInt(assocSplitterViaId),
                    targetType: "tube_via",
                    targetViaId: parseInt(fusionViaId),
                  });
                  await loadAssociations(selected.id);
                  setAssocSplitterId("");
                  setAssocSplitterViaId("");
                  setFusionTubeId("");
                  setFusionViaId("");
                  setView("splitterVias");
                } catch (e: any) { setError(e?.message ?? "Erro ao criar associação"); }
                finally { setSaving(false); }
              }}
              disabled={saving}
              className="w-full bg-emerald-500 text-zinc-900 font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saving
                ? <div className="w-4 h-4 border-2 border-zinc-900/30 border-t-zinc-900 rounded-full animate-spin" />
                : <><ArrowRightLeft className="w-4 h-4" /> Confirmar Associação</>}
            </button>
          )}
        </div>
      </div>
    );
  }
  // ═══════════════════════════════════════════════════════════════════════════
  // VIEW: VIAS (lista de vias de um tubo)
  // ═══════════════════════════════════════════════════════════════════════════
  if (view === "vias" && selectedTube) {
    const fused = vias.filter(v => v.fusedToViaId != null).length;
    const backView: View = selectedTube.bandejaId ? "bandejaDetail" : "detail";
    return (
      <div className="flex flex-col h-full">
        <div className="bg-zinc-900 border-b border-zinc-800 px-4 pt-4 pb-3 flex-shrink-0">
          <button onClick={() => setView(backView)} className="flex items-center gap-1 text-cyan-400 text-sm mb-3">
            <ChevronLeft className="w-4 h-4" /> {selectedTube.bandejaId ? `Bandeja ${selectedBandeja?.number}` : selected?.name}
          </button>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <div className={`w-3.5 h-3.5 rounded-full flex-shrink-0 ${TUBE_COLORS[selectedTube.color ?? ""] ?? "bg-zinc-500"}`} />
                <h1 className="text-base font-bold text-white">{selectedTube.identifier}</h1>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">{vias.length} vias · {fused} fusionadas · {vias.length - fused} livres</p>
            </div>
            {isOnline() && (
              <button
                onClick={() => { setEditTubeForm({ ...selectedTube }); setError(null); setView("editTube"); }}
                className="flex items-center gap-1.5 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white"
              >
                <Edit2 className="w-3.5 h-3.5" /> Editar
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {vias.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-zinc-600 gap-2">
              <p className="text-sm">Nenhuma via neste tubo</p>
            </div>
          ) : vias.map(via => {
            const fiberColor = VIA_FIBER_COLORS[via.viaNumber];
            const isFused = via.fusedToViaId != null;
            const assocLbl = associationLabel(via);
            return (
              <button
                key={via.id}
                onClick={() => {
                  setSelectedVia(via);
                  setEditViaForm({ label: via.label ?? "", notes: via.notes ?? "" });
                  setFusionTubeId("");
                  setFusionViaId("");
                  setError(null);
                  setView("editVia");
                }}
                className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 transition-colors text-left border ${
                  isFused
                    ? "bg-cyan-500/5 border-cyan-500/30 hover:bg-cyan-500/10"
                    : assocLbl
                    ? "bg-emerald-500/5 border-emerald-500/30 hover:bg-emerald-500/10"
                    : "bg-zinc-900 border-zinc-800 hover:bg-zinc-800/50"
                }`}
              >
                <div className={`w-6 h-6 rounded-full flex-shrink-0 border border-white/10 flex items-center justify-center text-[10px] font-bold text-white ${fiberColor?.dot ?? "bg-zinc-700"}`}>
                  {via.viaNumber}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">Via {via.viaNumber}</span>
                    {via.label && <span className="text-xs text-zinc-400">— {via.label}</span>}
                  </div>
                  {isFused ? (
                    <p className="text-[11px] text-cyan-300 flex items-center gap-1 mt-0.5">
                      <Link2 className="w-3 h-3" />
                      {fusionLabel(via) || "Fusionada"}
                    </p>
                  ) : assocLbl ? (
                    <p className="text-[11px] text-emerald-300 flex items-center gap-1 mt-0.5">
                      <ArrowRightLeft className="w-3 h-3" />
                      {assocLbl}
                    </p>
                  ) : (
                    <p className="text-[11px] text-zinc-500 mt-0.5">Livre</p>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-600 flex-shrink-0" />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEW: EDIT TUBE
  // ═══════════════════════════════════════════════════════════════════════════
  if (view === "editTube" && selectedTube) return (
    <div className="flex flex-col h-full">
      <div className="bg-zinc-900 border-b border-zinc-800 px-4 pt-4 pb-3 flex-shrink-0">
        <button onClick={() => setView("vias")} className="flex items-center gap-1 text-cyan-400 text-sm mb-3">
          <ChevronLeft className="w-4 h-4" /> Cancelar
        </button>
        <h1 className="text-base font-bold text-white">Editar {selectedTube.identifier}</h1>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <ErrorBox />
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Identificador</label>
          <input
            type="text" value={editTubeForm.identifier ?? ""}
            onChange={e => setEditTubeForm(f => ({ ...f, identifier: e.target.value }))}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
          />
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-2 block">Cor</label>
          <div className="flex flex-wrap gap-2">
            {Object.entries(TUBE_COLORS).map(([color, cls]) => (
              <button
                key={color}
                onClick={() => setEditTubeForm(f => ({ ...f, color }))}
                className={`w-8 h-8 rounded-full ${cls} border-2 transition-all ${editTubeForm.color === color ? "border-white scale-110" : "border-transparent"}`}
                title={TUBE_COLOR_LABELS[color]}
              />
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Observações</label>
          <textarea
            value={editTubeForm.notes ?? ""}
            onChange={e => setEditTubeForm(f => ({ ...f, notes: e.target.value || undefined }))}
            rows={3}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500 resize-none"
          />
        </div>
        <div className="flex gap-3">
          <button
            onClick={async () => {
              setSaving(true); setError(null);
              try {
                await client.ceoTubes.update.mutate({
                  id: selectedTube.id,
                  identifier: editTubeForm.identifier ?? selectedTube.identifier,
                  color: editTubeForm.color ?? selectedTube.color ?? undefined,
                  notes: editTubeForm.notes ?? undefined,
                });
                if (selected) await loadTubes(selected.id);
                setSelectedTube({ ...selectedTube, ...editTubeForm } as Tube);
                setView("vias");
              } catch (e: any) { setError(e?.message ?? "Erro"); }
              finally { setSaving(false); }
            }}
            disabled={saving}
            className="flex-1 bg-cyan-500 text-zinc-900 font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2"
          >
            {saving ? <div className="w-4 h-4 border-2 border-zinc-900/30 border-t-zinc-900 rounded-full animate-spin" /> : <><Check className="w-4 h-4" /> Salvar</>}
          </button>
          <button
            onClick={async () => {
              if (!confirm("Excluir este tubo e todas as suas vias?")) return;
              setSaving(true);
              try {
                await client.ceoTubes.delete.mutate({ id: selectedTube.id });
                if (selected) await loadTubes(selected.id);
                setView("detail");
              } catch (e: any) { setError(e?.message ?? "Erro"); }
              finally { setSaving(false); }
            }}
            disabled={saving}
            className="bg-red-500/10 border border-red-500/30 text-red-400 py-3 px-4 rounded-xl text-sm"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEW: NEW TUBE
  // ═══════════════════════════════════════════════════════════════════════════
  if (view === "newTube" && selected) return (
    <div className="flex flex-col h-full">
      <div className="bg-zinc-900 border-b border-zinc-800 px-4 pt-4 pb-3 flex-shrink-0">
        <button
          onClick={() => setView(newTubeForm.bandejaId ? "bandejaDetail" : "detail")}
          className="flex items-center gap-1 text-cyan-400 text-sm mb-3"
        >
          <ChevronLeft className="w-4 h-4" /> Cancelar
        </button>
        <h1 className="text-base font-bold text-white">Novo Tubo</h1>
        {newTubeForm.bandejaId && selectedBandeja && (
          <p className="text-xs text-zinc-400 mt-0.5">Bandeja {selectedBandeja.number}{selectedBandeja.label ? ` — ${selectedBandeja.label}` : ""}</p>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <ErrorBox />
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Identificador</label>
          <input
            type="text" value={newTubeForm.identifier}
            onChange={e => setNewTubeForm(f => ({ ...f, identifier: e.target.value }))}
            placeholder="ex: Tubo 1, SPLITTER 1x8"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
          />
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-2 block">Tipo</label>
          <div className="grid grid-cols-2 gap-2">
            {[["tube", "Tubo"], ["splitter", "Splitter"]].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setNewTubeForm(f => ({ ...f, type: val }))}
                className={`py-2.5 rounded-xl text-xs font-medium border transition-colors ${newTubeForm.type === val ? "bg-cyan-500 border-cyan-500 text-zinc-900" : "bg-zinc-800 border-zinc-700 text-zinc-300"}`}
              >{label}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-2 block">Total de Vias</label>
          <div className="grid grid-cols-4 gap-2">
            {[4, 8, 12, 24].map(n => (
              <button
                key={n}
                onClick={() => setNewTubeForm(f => ({ ...f, totalVias: n }))}
                className={`py-2.5 rounded-xl text-xs font-medium border transition-colors ${newTubeForm.totalVias === n ? "bg-cyan-500 border-cyan-500 text-zinc-900" : "bg-zinc-800 border-zinc-700 text-zinc-300"}`}
              >{n}</button>
            ))}
          </div>
          <input
            type="number" value={newTubeForm.totalVias}
            onChange={e => setNewTubeForm(f => ({ ...f, totalVias: parseInt(e.target.value) || 12 }))}
            min={1} max={288}
            className="w-full mt-2 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
          />
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-2 block">Cor</label>
          <div className="flex flex-wrap gap-2">
            {Object.entries(TUBE_COLORS).map(([color, cls]) => (
              <button
                key={color}
                onClick={() => setNewTubeForm(f => ({ ...f, color }))}
                className={`w-8 h-8 rounded-full ${cls} border-2 transition-all ${newTubeForm.color === color ? "border-white scale-110" : "border-transparent"}`}
                title={TUBE_COLOR_LABELS[color]}
              />
            ))}
          </div>
        </div>
        <button
          onClick={async () => {
            if (!newTubeForm.identifier.trim()) { setError("Informe o identificador"); return; }
            setSaving(true); setError(null);
            try {
              await client.ceoTubes.create.mutate({
                ceoId: selected.id,
                identifier: newTubeForm.identifier,
                type: newTubeForm.type as "tube" | "splitter",
                totalVias: newTubeForm.totalVias,
                color: newTubeForm.color,
                bandejaId: newTubeForm.bandejaId ?? undefined,
              });
              await loadTubes(selected.id);
              setView(newTubeForm.bandejaId ? "bandejaDetail" : "detail");
            } catch (e: any) { setError(e?.message ?? "Erro ao criar tubo"); }
            finally { setSaving(false); }
          }}
          disabled={saving || !newTubeForm.identifier.trim()}
          className="w-full bg-cyan-500 disabled:opacity-50 text-zinc-900 font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2"
        >
          {saving ? <div className="w-4 h-4 border-2 border-zinc-900/30 border-t-zinc-900 rounded-full animate-spin" /> : <><Plus className="w-4 h-4" /> Criar Tubo</>}
        </button>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEW: EDIT CEO
  // ═══════════════════════════════════════════════════════════════════════════
  if (view === "editCeo" && selected) return (
    <div className="flex flex-col h-full">
      <div className="bg-zinc-900 border-b border-zinc-800 px-4 pt-4 pb-3 flex-shrink-0">
        <button onClick={() => setView("detail")} className="flex items-center gap-1 text-cyan-400 text-sm mb-3">
          <ChevronLeft className="w-4 h-4" /> Cancelar
        </button>
        <h1 className="text-base font-bold text-white">Editar CEO</h1>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <ErrorBox />
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Nome *</label>
          <input
            type="text" value={editCeoForm.name ?? ""}
            onChange={e => setEditCeoForm(f => ({ ...f, name: e.target.value || undefined }))}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
          />
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Localização / Endereço</label>
          <button
            type="button" onClick={handleGetLocationCeo} disabled={geoLoading}
            className="w-full h-11 flex items-center justify-center gap-2 text-sm font-medium border border-amber-500/50 text-amber-400 bg-transparent hover:bg-amber-500/10 rounded-xl mb-2 active:scale-[0.98] transition-all disabled:opacity-60"
          >
            {geoLoading ? <><Loader2 className="w-5 h-5 animate-spin" /> Obtendo GPS...</> : <><LocateFixed className="w-5 h-5" /> Usar Minha Localização</>}
          </button>
          <input
            type="text" value={editCeoForm.location ?? ""}
            onChange={e => setEditCeoForm(f => ({ ...f, location: e.target.value || null }))}
            placeholder="Endereço ou coordenadas"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
          />
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Tipo</label>
          <input
            type="text" value={editCeoForm.type ?? ""}
            onChange={e => setEditCeoForm(f => ({ ...f, type: e.target.value || null }))}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
          />
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Observações</label>
          <textarea
            value={editCeoForm.notes ?? ""}
            onChange={e => setEditCeoForm(f => ({ ...f, notes: e.target.value || null }))}
            rows={3}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500 resize-none"
          />
        </div>
        <button
          onClick={async () => {
            if (!editCeoForm.name?.trim()) return;
            setSaving(true); setError(null);
            try {
              await client.ceos.update.mutate({ id: selected.id, name: editCeoForm.name!, location: editCeoForm.location ?? undefined, notes: editCeoForm.notes ?? undefined });
              await loadCeos();
              setSelected({ ...selected, ...editCeoForm } as Ceo);
              setView("detail");
            } catch (e: any) { setError(e?.message ?? "Erro ao salvar"); }
            finally { setSaving(false); }
          }}
          disabled={saving || !editCeoForm.name?.trim()}
          className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-zinc-900 font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"
        >
          {saving ? <div className="w-4 h-4 border-2 border-zinc-900/30 border-t-zinc-900 rounded-full animate-spin" /> : <><Check className="w-4 h-4" /> Salvar</>}
        </button>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEW: EDIT VIA
  // ═══════════════════════════════════════════════════════════════════════════
  if (view === "editVia" && selectedVia && selectedTube) {
    const isFused = selectedVia.fusedToViaId != null;
    const fusedTube = isFused ? tubes.find(t => t.id === selectedVia.fusedToTubeId) : null;
    const fusedVia = isFused ? allVias.find(v => v.id === selectedVia.fusedToViaId) : null;
    const assocLbl = associationLabel(selectedVia);
    return (
      <div className="flex flex-col h-full">
        <div className="bg-zinc-900 border-b border-zinc-800 px-4 pt-4 pb-3 flex-shrink-0">
          <button onClick={() => setView("vias")} className="flex items-center gap-1 text-cyan-400 text-sm mb-3">
            <ChevronLeft className="w-4 h-4" /> {selectedTube.identifier}
          </button>
          <h1 className="text-base font-bold text-white">Via {selectedVia.viaNumber}</h1>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <ErrorBox />

          {/* Fusão atual */}
          {isFused ? (
            <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Link2 className="w-4 h-4 text-cyan-400" />
                <div>
                  <p className="text-xs font-semibold text-cyan-300">Fusão identificada</p>
                  <p className="text-[11px] text-cyan-200/70">
                    {fusedTube?.identifier ?? "Tubo ?"} · Via {fusedVia?.viaNumber ?? "?"}
                  </p>
                </div>
              </div>
              <button
                onClick={async () => {
                  setSaving(true);
                  try {
                    await client.ceoVias.clearFusion.mutate({ viaId: selectedVia.id });
                    await loadVias(selectedTube.id);
                    await loadAllVias(selected!.id);
                    setSelectedVia({ ...selectedVia, fusedToViaId: null, fusedToTubeId: null });
                    setView("vias");
                  } catch (e: any) { setError(e?.message ?? "Erro"); }
                  finally { setSaving(false); }
                }}
                disabled={saving}
                className="flex items-center gap-1 text-xs text-red-400 border border-red-500/30 bg-red-500/10 rounded-lg px-2.5 py-1.5"
              >
                <Link2Off className="w-3.5 h-3.5" /> Remover
              </button>
            </div>
          ) : assocLbl ? (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-emerald-400" />
                <div>
                  <p className="text-xs font-semibold text-emerald-300">Associação</p>
                  <p className="text-[11px] text-emerald-200/70">{assocLbl}</p>
                </div>
              </div>
              {isOnline() && (
                <button
                  onClick={async () => {
                    const assoc = associations.find(a => a.sourceViaId === selectedVia.id || a.targetViaId === selectedVia.id);
                    if (!assoc) return;
                    setSaving(true); setError(null);
                    try {
                      await (client as any).ceoViaAssociations.delete.mutate({ id: assoc.id });
                      await loadAssociations(selected!.id);
                      setSelectedVia({ ...selectedVia });
                    } catch (e: any) { setError(e?.message ?? "Erro ao remover associação"); }
                    finally { setSaving(false); }
                  }}
                  disabled={saving}
                  className="flex items-center gap-1 text-xs text-red-400 border border-red-500/30 bg-red-500/10 rounded-lg px-2.5 py-1.5"
                >
                  <Link2Off className="w-3.5 h-3.5" /> Remover
                </button>
              )}
            </div>
          ) : (
            /* Definir fusão */
            isOnline() && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-zinc-300">Identificar Fusão</p>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Tubo destino</label>
                  <select
                    value={fusionTubeId}
                    onChange={e => { setFusionTubeId(e.target.value); setFusionViaId(""); }}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="">Selecionar tubo...</option>
                    {tubes.filter(t => t.id !== selectedTube.id).map(t => (
                      <option key={t.id} value={String(t.id)}>{t.identifier}</option>
                    ))}
                  </select>
                </div>
                {fusionTubeId && (
                  <div>
                    <label className="text-xs text-zinc-400 mb-1 block">Via destino</label>
                    <select
                      value={fusionViaId}
                      onChange={e => setFusionViaId(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
                    >
                      <option value="">Selecionar via...</option>
                      {allVias
                        .filter(v => v.tubeId === parseInt(fusionTubeId) && !v.fusedToViaId)
                        .map(v => (
                          <option key={v.id} value={String(v.id)}>Via {v.viaNumber}{v.label ? ` — ${v.label}` : ""}</option>
                        ))}
                    </select>
                  </div>
                )}
                {fusionTubeId && fusionViaId && (
                  <button
                    onClick={async () => {
                      setSaving(true); setError(null);
                      try {
                        await client.ceoVias.setFusion.mutate({
                          viaId: selectedVia.id,
                          fusedToTubeId: parseInt(fusionTubeId),
                          fusedToViaId: parseInt(fusionViaId),
                        });
                        await loadVias(selectedTube.id);
                        await loadAllVias(selected!.id);
                        setView("vias");
                      } catch (e: any) { setError(e?.message ?? "Erro ao registrar fusão"); }
                      finally { setSaving(false); }
                    }}
                    disabled={saving}
                    className="w-full bg-cyan-500 text-zinc-900 font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2"
                  >
                    {saving ? <div className="w-4 h-4 border-2 border-zinc-900/30 border-t-zinc-900 rounded-full animate-spin" /> : <><Link2 className="w-4 h-4" /> Registrar Fusão</>}
                  </button>
                )}
              </div>
            )
          )}

          {/* Associar a via de splitter (apenas se não há fusão nem associação) */}
          {!isFused && !assocLbl && isOnline() && splitters.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-zinc-300">Associar a Via de Splitter</p>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Splitter</label>
                <select
                  value={assocSplitterId}
                  onChange={e => { setAssocSplitterId(e.target.value); setAssocSplitterViaId(""); }}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Selecionar splitter...</option>
                  {splitters.map(sp => (
                    <option key={sp.id} value={String(sp.id)}>{sp.identifier} ({sp.ratio})</option>
                  ))}
                </select>
              </div>
              {assocSplitterId && (
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Via do splitter</label>
                  <select
                    value={assocSplitterViaId}
                    onChange={e => setAssocSplitterViaId(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">Selecionar via...</option>
                    {allSplitterVias
                      .filter(sv => sv.splitterId === parseInt(assocSplitterId))
                      .filter(sv => !associations.find(a =>
                        (a.sourceType === "splitter_via" && a.sourceViaId === sv.id) ||
                        (a.targetType === "splitter_via" && a.targetViaId === sv.id)
                      ))
                      .map(sv => (
                        <option key={sv.id} value={String(sv.id)}>
                          Via {sv.viaNumber}{sv.label ? ` — ${sv.label}` : ""}{sv.lossDb != null ? ` (${sv.lossDb} dB)` : ""}
                        </option>
                      ))}
                  </select>
                </div>
              )}
              {assocSplitterId && assocSplitterViaId && (
                <button
                  onClick={async () => {
                    setSaving(true); setError(null);
                    try {
                      await (client as any).ceoViaAssociations.create.mutate({
                        ceoId: selected!.id,
                        sourceType: "tube_via",
                        sourceViaId: selectedVia.id,
                        targetType: "splitter_via",
                        targetViaId: parseInt(assocSplitterViaId),
                      });
                      await loadAssociations(selected!.id);
                      setAssocSplitterId("");
                      setAssocSplitterViaId("");
                    } catch (e: any) { setError(e?.message ?? "Erro ao criar associação"); }
                    finally { setSaving(false); }
                  }}
                  disabled={saving}
                  className="w-full bg-emerald-500 text-zinc-900 font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2"
                >
                  {saving ? <div className="w-4 h-4 border-2 border-zinc-900/30 border-t-zinc-900 rounded-full animate-spin" /> : <><ArrowRightLeft className="w-4 h-4" /> Associar Via</>}
                </button>
              )}
            </div>
          )}
          {/* Editar etiqueta */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-zinc-300">Etiqueta e Observações</p>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Etiqueta</label>
              <input
                type="text" value={editViaForm.label}
                onChange={e => setEditViaForm(f => ({ ...f, label: e.target.value }))}
                placeholder="ex: Cliente João, Backbone"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Observações</label>
              <textarea
                value={editViaForm.notes}
                onChange={e => setEditViaForm(f => ({ ...f, notes: e.target.value }))}
                rows={2}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500 resize-none"
              />
            </div>
            {isOnline() && (
              <button
                onClick={async () => {
                  setSaving(true); setError(null);
                  try {
                    await client.ceoVias.updateLabel.mutate({
                      id: selectedVia.id,
                      label: editViaForm.label || undefined,
                      notes: editViaForm.notes || undefined,
                    });
                    await loadVias(selectedTube.id);
                    setView("vias");
                  } catch (e: any) { setError(e?.message ?? "Erro ao salvar"); }
                  finally { setSaving(false); }
                }}
                disabled={saving}
                className="w-full bg-zinc-700 text-white font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2"
              >
                {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Check className="w-4 h-4" /> Salvar Etiqueta</>}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
