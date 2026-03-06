import { useState, useEffect, useCallback } from "react";
import { useMobileAuth } from "../MobileAuthContext";
import { createMobileTrpcClient, saveOfflineCache, loadOfflineCache, isOnline } from "../mobileTrpc";
import {
  Radio, ChevronRight, ChevronLeft, Search, RefreshCw, Edit2, Check,
  AlertCircle, Plus, Trash2, Link2, Link2Off, LocateFixed, Loader2, Layers, MapPin,
  ArrowRightLeft, Map as MapIcon,
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
type Cto = {
  id: number; name: string; address?: string | null;
  lat?: string | null; lng?: string | null;
  capacity?: number | null; usedPorts?: number | null;
  status?: string | null; notes?: string | null;
};
type Tube = {
  id: number; ctoId: number; identifier: string; type: string;
  totalVias: number; color: string | null; notes?: string | null;
};
type Via = {
  id: number; tubeId: number; ctoId: number; viaNumber: number;
  label?: string | null; fusedToViaId?: number | null; fusedToTubeId?: number | null;
  fiberId?: number | null; notes?: string | null;
};

type View =
  | "list" | "detail" | "edit"
  | "tubes" | "editTube" | "newTube"
  | "vias" | "editVia" | "setFusion";

const STATUS_LABEL: Record<string, string> = { active: "Ativo", inactive: "Inativo", maintenance: "Manutenção" };
const STATUS_COLOR: Record<string, string> = {
  active: "bg-emerald-500/20 text-emerald-300",
  inactive: "bg-zinc-500/20 text-zinc-400",
  maintenance: "bg-amber-500/20 text-amber-300",
};

interface MobileCtosProps {
  initialCtoId?: number | null;
  onDeepLinkConsumed?: () => void;
  onGoToMap?: (type: "ceo" | "cto", id: number) => void;
}

export default function MobileCtos({ initialCtoId, onDeepLinkConsumed, onGoToMap }: MobileCtosProps = {}) {
  const { serverUrl, token } = useMobileAuth();
  const client = createMobileTrpcClient(serverUrl, token);

  // ─── Estado principal ───────────────────────────────────────────────────
  const [ctos, setCtos]         = useState<Cto[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [view, setView]         = useState<View>("list");
  const [selected, setSelected] = useState<Cto | null>(null);

  // Tubos
  const [tubes, setTubes]               = useState<Tube[]>([]);
  const [selectedTube, setSelectedTube] = useState<Tube | null>(null);
  const [editTubeForm, setEditTubeForm] = useState<Partial<Tube>>({});
  const [newTubeForm, setNewTubeForm]   = useState({ identifier: "", color: "blue", totalVias: 12, type: "tube" });

  // Vias
  const [vias, setVias]               = useState<Via[]>([]);
  const [allVias, setAllVias]         = useState<Via[]>([]);
  const [selectedVia, setSelectedVia] = useState<Via | null>(null);
  const [editViaForm, setEditViaForm] = useState<{ label: string; notes: string }>({ label: "", notes: "" });

  // Fusão
  const [fusionTubeId, setFusionTubeId] = useState<string>("");
  const [fusionViaId, setFusionViaId]   = useState<string>("");

  // Editar CTO
  const [editForm, setEditForm]   = useState<Partial<Cto>>({});
  const [geoLoading, setGeoLoading] = useState(false);

  // Expansão inline de tubos na tela de detalhe
  const [expandedTubeIds, setExpandedTubeIds] = useState<Set<number>>(new Set());
  const [tubeViasCache, setTubeViasCache] = useState<Map<number, Via[]>>(new Map());

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
    if (!tubeViasCache.has(id)) {
      try {
        const data = await client.ctoVias.byTube.query({ tubeId: id });
        setTubeViasCache(prev => new Map(prev).set(id, data as unknown as Via[]));
      } catch { setTubeViasCache(prev => new Map(prev).set(id, [])); }
    }
    setExpandedTubeIds(prev => new Set(prev).add(id));
  }

  // ─── GPS ────────────────────────────────────────────────────────────────
  async function handleGetLocation() {
    if (!navigator.geolocation) { setError("Geolocalização não suportada neste dispositivo"); return; }
    setGeoLoading(true); setError(null);
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
        setEditForm(f => ({ ...f, lat, lng, address }));
        setGeoLoading(false);
      },
      () => { setGeoLoading(false); setError("Não foi possível obter a localização. Verifique se o GPS está ativado."); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  // ─── Loaders ────────────────────────────────────────────────────────────
  const loadCtos = useCallback(async () => {
    setLoading(true);
    try {
      if (isOnline()) {
        const data = await client.ctos.list.query();
        setCtos(data as Cto[]);
        await saveOfflineCache("ctos_list", data);
      } else {
        const cached = await loadOfflineCache<Cto[]>("ctos_list");
        setCtos(cached ?? []);
      }
    } catch {
      const cached = await loadOfflineCache<Cto[]>("ctos_list");
      setCtos(cached ?? []);
    } finally { setLoading(false); }
  }, [serverUrl, token]);

  useEffect(() => { loadCtos(); }, [loadCtos]);

  // Deep-link: abrir detalhe directamente quando initialCtoId é fornecido pelo MobileApp
  useEffect(() => {
    if (!initialCtoId || ctos.length === 0) return;
    const target = ctos.find(c => c.id === initialCtoId);
    if (target) {
      setSelected(target);
      loadTubes(target.id);
      loadAllVias(target.id);
      setView("detail");
      onDeepLinkConsumed?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCtoId, ctos]);

  const loadTubes = useCallback(async (ctoId: number) => {
    try {
      if (isOnline()) {
        const data = await client.ctoTubes.byCto.query({ ctoId });
        setTubes(data as unknown as Tube[]);
        await saveOfflineCache(`cto_tubes_${ctoId}`, data);
      } else {
        const cached = await loadOfflineCache<Tube[]>(`cto_tubes_${ctoId}`);
        setTubes(cached ?? []);
      }
    } catch {
      const cached = await loadOfflineCache<Tube[]>(`cto_tubes_${ctoId}`);
      setTubes(cached ?? []);
    }
  }, [serverUrl, token]);

  const loadVias = useCallback(async (tubeId: number) => {
    try {
      if (isOnline()) {
        const data = await client.ctoVias.byTube.query({ tubeId });
        setVias(data as unknown as Via[]);
        await saveOfflineCache(`cto_tube_vias_${tubeId}`, data);
      } else {
        const cached = await loadOfflineCache<Via[]>(`cto_tube_vias_${tubeId}`);
        setVias(cached ?? []);
      }
    } catch {
      const cached = await loadOfflineCache<Via[]>(`cto_tube_vias_${tubeId}`);
      setVias(cached ?? []);
    }
  }, [serverUrl, token]);

  const loadAllVias = useCallback(async (ctoId: number) => {
    try {
      if (isOnline()) {
        const data = await client.ctoVias.byCto.query({ ctoId });
        setAllVias(data as unknown as Via[]);
      }
    } catch { /* ignora */ }
  }, [serverUrl, token]);

  const filtered = ctos.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.address ?? "").toLowerCase().includes(search.toLowerCase())
  );

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

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEW: LIST
  // ═══════════════════════════════════════════════════════════════════════════
  if (view === "list") return (
    <div className="flex flex-col h-full">
      <div className="bg-zinc-900 border-b border-zinc-800 px-4 pt-4 pb-3 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold text-white">CTO</h1>
          <button onClick={loadCtos} className="text-zinc-400 hover:text-white p-1">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar CTO..."
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
            <Radio className="w-8 h-8 opacity-30" />
            <p className="text-sm">Nenhuma CTO encontrada</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {filtered.map(cto => {
              const pct = cto.capacity && cto.capacity > 0 ? Math.round(((cto.usedPorts ?? 0) / cto.capacity) * 100) : null;
              return (
                <button
                  key={cto.id}
                  onClick={() => {
                    setSelected(cto);
                    // Limpar estado do CTO anterior
                    setTubeViasCache(new Map());
                    setExpandedTubeIds(new Set());
                    setAllVias([]);
                    setTubes([]);
                    loadTubes(cto.id);
                    loadAllVias(cto.id);
                    setView("detail");
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-zinc-800/50 transition-colors text-left"
                >
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                    <Radio className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{cto.name}</p>
                    <p className="text-xs text-zinc-500 truncate">
                      {cto.address ?? "Sem endereço"}
                      {pct !== null ? ` · ${pct}% ocupada` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {cto.status && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${STATUS_COLOR[cto.status] ?? "bg-zinc-500/20 text-zinc-400"}`}>
                        {STATUS_LABEL[cto.status] ?? cto.status}
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4 text-zinc-600" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEW: DETAIL
  // ═══════════════════════════════════════════════════════════════════════════
  if (view === "detail" && selected) {
    const pct = selected.capacity && selected.capacity > 0
      ? Math.round(((selected.usedPorts ?? 0) / selected.capacity) * 100)
      : null;
    return (
      <div className="flex flex-col h-full">
        <div className="bg-zinc-900 border-b border-zinc-800 px-4 pt-4 pb-3 flex-shrink-0">
          <button onClick={() => setView("list")} className="flex items-center gap-1 text-cyan-400 text-sm mb-3">
            <ChevronLeft className="w-4 h-4" /> CTO
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-base font-bold text-white">{selected.name}</h1>
              {selected.address && (
                <p className="text-xs text-zinc-400 mt-0.5 flex items-center gap-1 truncate max-w-[220px]">
                  <MapPin className="w-3 h-3 flex-shrink-0" /> {selected.address}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {onGoToMap && (
                <button
                  onClick={() => onGoToMap("cto", selected.id)}
                  className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-cyan-400 transition-colors"
                  title="Ver no Mapa"
                >
                  <MapIcon className="w-3.5 h-3.5" /> Mapa
                </button>
              )}
              {isOnline() && (
                <button
                  onClick={() => { setEditForm({ ...selected }); setError(null); setView("edit"); }}
                  className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white transition-colors"
                >
                  <Edit2 className="w-3.5 h-3.5" /> Editar
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Informações */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
            {selected.status && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-zinc-500">Status</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[selected.status] ?? "bg-zinc-500/20 text-zinc-400"}`}>
                  {STATUS_LABEL[selected.status] ?? selected.status}
                </span>
              </div>
            )}
            {selected.capacity != null && (
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-xs text-zinc-500">Capacidade</span>
                  <span className="text-xs text-zinc-200">{selected.usedPorts ?? 0} / {selected.capacity} portas</span>
                </div>
                {pct !== null && (
                  <div className="w-full bg-zinc-800 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500"}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                )}
              </div>
            )}
            {selected.lat && selected.lng && (
              <div className="flex justify-between">
                <span className="text-xs text-zinc-500">Coordenadas</span>
                <span className="text-xs text-zinc-200 font-mono">{parseFloat(selected.lat).toFixed(5)}, {parseFloat(selected.lng).toFixed(5)}</span>
              </div>
            )}
            {selected.notes && (
              <div>
                <span className="text-xs text-zinc-500 block mb-1">Observações</span>
                <p className="text-xs text-zinc-300">{selected.notes}</p>
              </div>
            )}
          </div>

          {/* Tubos */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" /> Tubos ({tubes.length})
              </p>
              {isOnline() && (
                <button
                  onClick={() => { setNewTubeForm({ identifier: `Tubo ${tubes.length + 1}`, color: "blue", totalVias: 12, type: "tube" }); setError(null); setView("newTube"); }}
                  className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300"
                >
                  <Plus className="w-3.5 h-3.5" /> Novo Tubo
                </button>
              )}
            </div>

            {tubes.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-24 text-zinc-600 gap-2 border border-dashed border-zinc-800 rounded-xl">
                <Layers className="w-6 h-6 opacity-40" />
                <p className="text-xs">Nenhum tubo cadastrado</p>
              </div>
            ) : (
              <div className="space-y-2">
                {tubes.map(tube => {
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
                            onClick={() => { setSelectedTube(tube); loadVias(tube.id); loadAllVias(selected.id); setView("vias"); }}
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
                            // Procurar via fusionada em allVias ou no tubeViasCache
                            let fusedVia = isFused ? allVias.find(v => v.id === via.fusedToViaId) : null;
                            if (isFused && !fusedVia) {
                              for (const tvias of tubeViasCache.values()) {
                                const found = tvias.find(v => v.id === via.fusedToViaId);
                                if (found) { fusedVia = found; break; }
                              }
                            }
                            const fusedTube = isFused ? (tubes.find(t => t.id === via.fusedToTubeId) ?? tubes.find(t => t.id === fusedVia?.tubeId)) : null;
                            return (
                              <div
                                key={via.id}
                                className={`flex items-center gap-3 px-4 py-2.5 ${isFused ? "bg-cyan-500/5" : ""}`}
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
                                      {fusedTube?.identifier ?? "Tubo ?"} · Via {fusedVia?.viaNumber ?? "?"}
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
  // VIEW: EDIT CTO
  // ═══════════════════════════════════════════════════════════════════════════
  if (view === "edit" && selected) return (
    <div className="flex flex-col h-full">
      <div className="bg-zinc-900 border-b border-zinc-800 px-4 pt-4 pb-3 flex-shrink-0">
        <button onClick={() => setView("detail")} className="flex items-center gap-1 text-cyan-400 text-sm mb-3">
          <ChevronLeft className="w-4 h-4" /> Cancelar
        </button>
        <h1 className="text-base font-bold text-white">Editar CTO</h1>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <ErrorBox />
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Nome *</label>
          <input
            type="text" value={editForm.name ?? ""}
            onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
          />
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Localização / Endereço</label>
          <button
            type="button" onClick={handleGetLocation} disabled={geoLoading}
            className="w-full h-11 flex items-center justify-center gap-2 text-sm font-medium border border-emerald-500/50 text-emerald-400 bg-transparent hover:bg-emerald-500/10 rounded-xl mb-2 active:scale-[0.98] transition-all disabled:opacity-60"
          >
            {geoLoading ? <><Loader2 className="w-5 h-5 animate-spin" /> Obtendo GPS...</> : <><LocateFixed className="w-5 h-5" /> Usar Minha Localização</>}
          </button>
          <input
            type="text" value={editForm.address ?? ""}
            onChange={e => setEditForm(f => ({ ...f, address: e.target.value || null }))}
            placeholder="Rua, número, bairro"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Latitude</label>
            <input
              type="number" step="any" value={editForm.lat ?? ""}
              onChange={e => setEditForm(f => ({ ...f, lat: e.target.value || null }))}
              placeholder="-23.5505"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Longitude</label>
            <input
              type="number" step="any" value={editForm.lng ?? ""}
              onChange={e => setEditForm(f => ({ ...f, lng: e.target.value || null }))}
              placeholder="-46.6333"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-2 block">Status</label>
          <div className="grid grid-cols-3 gap-2">
            {[["active", "Ativo"], ["inactive", "Inativo"], ["maintenance", "Manutenção"]].map(([val, label]) => (
              <button
                key={val} type="button"
                onClick={() => setEditForm(f => ({ ...f, status: val }))}
                className={`py-2.5 rounded-xl text-xs font-medium border transition-colors ${editForm.status === val ? "bg-cyan-500 border-cyan-500 text-zinc-900" : "bg-zinc-800 border-zinc-700 text-zinc-300"}`}
              >{label}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Capacidade (portas)</label>
          <input
            type="number" value={editForm.capacity ?? ""}
            onChange={e => setEditForm(f => ({ ...f, capacity: parseInt(e.target.value) || null }))}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
          />
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Observações</label>
          <textarea
            value={editForm.notes ?? ""}
            onChange={e => setEditForm(f => ({ ...f, notes: e.target.value || null }))}
            rows={3}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500 resize-none"
          />
        </div>
        <button
          onClick={async () => {
            if (!editForm.name?.trim()) { setError("O nome é obrigatório"); return; }
            setSaving(true); setError(null);
            try {
              await client.ctos.update.mutate({
                id: selected.id,
                name: editForm.name!,
                address: editForm.address ?? undefined,
                lat: editForm.lat != null ? parseFloat(String(editForm.lat)) : undefined,
                lng: editForm.lng != null ? parseFloat(String(editForm.lng)) : undefined,
                status: (editForm.status as "active" | "inactive" | "maintenance") ?? undefined,
                capacity: editForm.capacity != null ? Number(editForm.capacity) : undefined,
                notes: editForm.notes ?? undefined,
              });
              await loadCtos();
              setSelected({ ...selected, ...editForm } as Cto);
              setView("detail");
            } catch (e: any) { setError(e?.message ?? "Erro ao salvar"); }
            finally { setSaving(false); }
          }}
          disabled={saving || !editForm.name?.trim()}
          className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-zinc-900 font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"
        >
          {saving ? <div className="w-4 h-4 border-2 border-zinc-900/30 border-t-zinc-900 rounded-full animate-spin" /> : <><Check className="w-4 h-4" /> Salvar</>}
        </button>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEW: NEW TUBE
  // ═══════════════════════════════════════════════════════════════════════════
  if (view === "newTube" && selected) return (
    <div className="flex flex-col h-full">
      <div className="bg-zinc-900 border-b border-zinc-800 px-4 pt-4 pb-3 flex-shrink-0">
        <button onClick={() => setView("detail")} className="flex items-center gap-1 text-cyan-400 text-sm mb-3">
          <ChevronLeft className="w-4 h-4" /> Cancelar
        </button>
        <h1 className="text-base font-bold text-white">Novo Tubo</h1>
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
              await client.ctoTubes.create.mutate({
                ctoId: selected.id,
                identifier: newTubeForm.identifier,
                type: newTubeForm.type as "tube" | "splitter",
                totalVias: newTubeForm.totalVias,
                color: newTubeForm.color,
              });
              await loadTubes(selected.id);
              setView("detail");
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
  // VIEW: VIAS
  // ═══════════════════════════════════════════════════════════════════════════
  if (view === "vias" && selectedTube) {
    const fused = vias.filter(v => v.fusedToViaId != null).length;
    return (
      <div className="flex flex-col h-full">
        <div className="bg-zinc-900 border-b border-zinc-800 px-4 pt-4 pb-3 flex-shrink-0">
          <button onClick={() => setView("detail")} className="flex items-center gap-1 text-cyan-400 text-sm mb-3">
            <ChevronLeft className="w-4 h-4" /> {selected?.name}
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
            let fusedVia = isFused ? allVias.find(v => v.id === via.fusedToViaId) : null;
            if (isFused && !fusedVia) {
              for (const tvias of tubeViasCache.values()) {
                const found = tvias.find(v => v.id === via.fusedToViaId);
                if (found) { fusedVia = found; break; }
              }
            }
            const fusedTube = isFused ? (tubes.find(t => t.id === via.fusedToTubeId) ?? tubes.find(t => t.id === fusedVia?.tubeId)) : null;
            return (
              <button
                key={via.id}
                onClick={() => {
                  setSelectedVia(via);
                  setEditViaForm({ label: via.label ?? "", notes: via.notes ?? "" });
                  setFusionTubeId(""); setFusionViaId("");
                  setError(null);
                  setView("editVia");
                }}
                className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 transition-colors text-left border ${
                  isFused ? "bg-cyan-500/5 border-cyan-500/30 hover:bg-cyan-500/10" : "bg-zinc-900 border-zinc-800 hover:bg-zinc-800/50"
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
                      {fusedTube ? `${fusedTube.identifier} · Via ${fusedVia?.viaNumber ?? "?"}` : "Fusionada"}
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
                await client.ctoTubes.update.mutate({
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
                await client.ctoTubes.delete.mutate({ id: selectedTube.id });
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
  // VIEW: EDIT VIA
  // ═══════════════════════════════════════════════════════════════════════════
  if (view === "editVia" && selectedVia && selectedTube) {
    const isFused = selectedVia.fusedToViaId != null;
    let fusedVia = isFused ? allVias.find(v => v.id === selectedVia.fusedToViaId) : null;
    if (isFused && !fusedVia) {
      for (const tvias of tubeViasCache.values()) {
        const found = tvias.find(v => v.id === selectedVia.fusedToViaId);
        if (found) { fusedVia = found; break; }
      }
    }
    const fusedTube = isFused ? (tubes.find(t => t.id === selectedVia.fusedToTubeId) ?? tubes.find(t => t.id === fusedVia?.tubeId)) : null;
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
                    await client.ctoVias.clearFusion.mutate({ viaId: selectedVia.id });
                    await loadVias(selectedTube.id);
                    setSelectedVia({ ...selectedVia, fusedToViaId: null, fusedToTubeId: null });
                    setView("vias");
                  } catch (e: any) { setError(e?.message ?? "Erro"); }
                  finally { setSaving(false); }
                }}
                disabled={saving}
                className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-2 py-1"
              >
                <Link2Off className="w-3.5 h-3.5" /> Remover
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setFusionTubeId(""); setFusionViaId(""); setView("setFusion"); }}
              className="w-full flex items-center justify-center gap-2 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 rounded-xl py-3 text-sm font-medium hover:bg-cyan-500/20 transition-colors"
            >
              <Link2 className="w-4 h-4" /> Identificar Fusão
            </button>
          )}

          {/* Etiqueta */}
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Etiqueta</label>
            <input
              type="text" value={editViaForm.label}
              onChange={e => setEditViaForm(f => ({ ...f, label: e.target.value }))}
              placeholder="ex: Cliente A, Porta 1"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Observações */}
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Observações</label>
            <textarea
              value={editViaForm.notes}
              onChange={e => setEditViaForm(f => ({ ...f, notes: e.target.value }))}
              rows={3}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500 resize-none"
            />
          </div>

          <button
            onClick={async () => {
              setSaving(true); setError(null);
              try {
                await client.ctoVias.update.mutate({
                  id: selectedVia.id,
                  label: editViaForm.label || undefined,
                  notes: editViaForm.notes || undefined,
                });
                // Recarregar o tubo actual e também o tubo fundido (sincronização bidirecional)
                await loadVias(selectedTube.id);
                if (selectedVia.fusedToTubeId && selectedVia.fusedToTubeId !== selectedTube.id) {
                  await loadVias(selectedVia.fusedToTubeId);
                }
                setView("vias");
              } catch (e: any) { setError(e?.message ?? "Erro"); }
              finally { setSaving(false); }
            }}
            disabled={saving}
            className="w-full bg-cyan-500 disabled:opacity-50 text-zinc-900 font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2"
          >
            {saving ? <div className="w-4 h-4 border-2 border-zinc-900/30 border-t-zinc-900 rounded-full animate-spin" /> : <><Check className="w-4 h-4" /> Salvar</>}
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEW: SET FUSION
  // ═══════════════════════════════════════════════════════════════════════════
  if (view === "setFusion" && selectedVia && selectedTube) {
    const targetTubeVias = allVias.filter(v => v.tubeId === parseInt(fusionTubeId) && v.id !== selectedVia.id);
    return (
      <div className="flex flex-col h-full">
        <div className="bg-zinc-900 border-b border-zinc-800 px-4 pt-4 pb-3 flex-shrink-0">
          <button onClick={() => setView("editVia")} className="flex items-center gap-1 text-cyan-400 text-sm mb-3">
            <ChevronLeft className="w-4 h-4" /> Cancelar
          </button>
          <h1 className="text-base font-bold text-white">Identificar Fusão</h1>
          <p className="text-xs text-zinc-400 mt-0.5">{selectedTube.identifier} · Via {selectedVia.viaNumber}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <ErrorBox />

          {/* Selecionar tubo destino */}
          <div>
            <label className="text-xs text-zinc-400 mb-2 block">Tubo destino</label>
            <div className="space-y-2">
              {tubes.filter(t => t.id !== selectedTube.id).map(tube => (
                <button
                  key={tube.id}
                  onClick={() => { setFusionTubeId(String(tube.id)); setFusionViaId(""); }}
                  className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 border transition-colors text-left ${
                    fusionTubeId === String(tube.id) ? "bg-cyan-500/10 border-cyan-500/40" : "bg-zinc-900 border-zinc-800 hover:bg-zinc-800/50"
                  }`}
                >
                  <div className={`w-3.5 h-3.5 rounded-full flex-shrink-0 ${TUBE_COLORS[tube.color ?? ""] ?? "bg-zinc-500"}`} />
                  <span className="text-sm text-white">{tube.identifier}</span>
                  {fusionTubeId === String(tube.id) && <Check className="w-4 h-4 text-cyan-400 ml-auto" />}
                </button>
              ))}
            </div>
          </div>

          {/* Selecionar via destino */}
          {fusionTubeId && (
            <div>
              <label className="text-xs text-zinc-400 mb-2 block">Via destino</label>
              {targetTubeVias.length === 0 ? (
                <p className="text-xs text-zinc-500 italic">Nenhuma via disponível neste tubo</p>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {targetTubeVias.map(via => {
                    const fc = VIA_FIBER_COLORS[via.viaNumber];
                    const alreadyFused = via.fusedToViaId != null;
                    return (
                      <button
                        key={via.id}
                        onClick={() => !alreadyFused && setFusionViaId(String(via.id))}
                        disabled={alreadyFused}
                        className={`flex flex-col items-center gap-1 rounded-xl py-2.5 border transition-colors ${
                          fusionViaId === String(via.id)
                            ? "bg-cyan-500/20 border-cyan-500/50"
                            : alreadyFused
                            ? "bg-zinc-800/30 border-zinc-800 opacity-40 cursor-not-allowed"
                            : "bg-zinc-900 border-zinc-800 hover:bg-zinc-800/50"
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-full ${fc?.dot ?? "bg-zinc-600"}`} />
                        <span className="text-[11px] text-zinc-300 font-medium">{via.viaNumber}</span>
                        {alreadyFused && <span className="text-[9px] text-zinc-500">fusionada</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <button
            onClick={async () => {
              if (!fusionTubeId || !fusionViaId) { setError("Selecione o tubo e a via destino"); return; }
              setSaving(true); setError(null);
              try {
                await client.ctoVias.setFusion.mutate({
                  viaId: selectedVia.id,
                  fusedToTubeId: parseInt(fusionTubeId),
                  fusedToViaId: parseInt(fusionViaId),
                });
                await loadVias(selectedTube.id);
                await loadAllVias(selected!.id);
                setView("vias");
              } catch (e: any) { setError(e?.message ?? "Erro ao identificar fusão"); }
              finally { setSaving(false); }
            }}
            disabled={saving || !fusionTubeId || !fusionViaId}
            className="w-full bg-cyan-500 disabled:opacity-50 text-zinc-900 font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2"
          >
            {saving ? <div className="w-4 h-4 border-2 border-zinc-900/30 border-t-zinc-900 rounded-full animate-spin" /> : <><Link2 className="w-4 h-4" /> Confirmar Fusão</>}
          </button>
        </div>
      </div>
    );
  }

  return null;
}
