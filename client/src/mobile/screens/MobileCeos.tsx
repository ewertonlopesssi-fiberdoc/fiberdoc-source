import { useState, useEffect, useCallback } from "react";
import { useMobileAuth } from "../MobileAuthContext";
import { createMobileTrpcClient, saveOfflineCache, loadOfflineCache, isOnline } from "../mobileTrpc";
import {
  Cable, ChevronRight, ChevronLeft, Search, RefreshCw, Edit2, Check,
  AlertCircle, Plus, Trash2, Link2, Link2Off, LocateFixed, Loader2, Layers,
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
};
type Via = {
  id: number; tubeId: number; ceoId: number; viaNumber: number;
  label?: string | null; fusedToViaId?: number | null; fusedToTubeId?: number | null;
  fiberId?: number | null; notes?: string | null;
};

type View =
  | "list" | "detail" | "editCeo"
  | "tubes" | "editTube" | "newTube"
  | "vias" | "editVia" | "setFusion";

export default function MobileCeos() {
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
  const [newTubeForm, setNewTubeForm]   = useState({ identifier: "", color: "blue", totalVias: 12, type: "tube" });

  // Vias
  const [vias, setVias]               = useState<Via[]>([]);
  const [allVias, setAllVias]         = useState<Via[]>([]);  // todas as vias do CEO para fusão
  const [selectedVia, setSelectedVia] = useState<Via | null>(null);
  const [editViaForm, setEditViaForm] = useState<{ label: string; notes: string }>({ label: "", notes: "" });

  // Fusão
  const [fusionTubeId, setFusionTubeId]     = useState<string>("");
  const [fusionViaId, setFusionViaId]       = useState<string>("");

  // Editar CEO
  const [editCeoForm, setEditCeoForm] = useState<Partial<Ceo>>({});
  const [geoLoading, setGeoLoading]   = useState(false);

  // UI
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

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

  const filtered = ceos.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.location ?? "").toLowerCase().includes(search.toLowerCase())
  );

  // ─── Helpers de UI ──────────────────────────────────────────────────────
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
                onClick={() => { setSelected(ceo); loadTubes(ceo.id); setView("detail"); }}
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
  if (view === "detail" && selected) return (
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

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
              {tubes.map(tube => (
                <button
                  key={tube.id}
                  onClick={() => { setSelectedTube(tube); loadVias(tube.id); loadAllVias(selected.id); setView("vias"); }}
                  className="w-full flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 hover:bg-zinc-800/50 transition-colors text-left"
                >
                  <div className={`w-4 h-4 rounded-full flex-shrink-0 ${TUBE_COLORS[tube.color ?? ""] ?? "bg-zinc-500"}`} />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-white">{tube.identifier}</span>
                    <p className="text-xs text-zinc-500">{TUBE_COLOR_LABELS[tube.color ?? ""] ?? tube.color} · {tube.totalVias} vias</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-600 flex-shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
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
              await client.ceoTubes.create.mutate({
                ceoId: selected.id,
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
  // VIEW: VIAS (lista de vias de um tubo)
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
            const fusedTube = isFused ? tubes.find(t => t.id === via.fusedToTubeId) : null;
            const fusedVia = isFused ? allVias.find(v => v.id === via.fusedToViaId) : null;
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
  // VIEW: EDIT VIA
  // ═══════════════════════════════════════════════════════════════════════════
  if (view === "editVia" && selectedVia && selectedTube) {
    const isFused = selectedVia.fusedToViaId != null;
    const fusedTube = isFused ? tubes.find(t => t.id === selectedVia.fusedToTubeId) : null;
    const fusedVia = isFused ? allVias.find(v => v.id === selectedVia.fusedToViaId) : null;
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
                await client.ceoVias.updateLabel.mutate({
                  id: selectedVia.id,
                  label: editViaForm.label || undefined,
                  notes: editViaForm.notes || undefined,
                });
                await loadVias(selectedTube.id);
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
                    fusionTubeId === String(tube.id)
                      ? "bg-cyan-500/10 border-cyan-500/40"
                      : "bg-zinc-900 border-zinc-800 hover:bg-zinc-800/50"
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
                await client.ceoVias.setFusion.mutate({
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
