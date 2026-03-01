import { useState, useEffect, useCallback } from "react";
import { useMobileAuth } from "../MobileAuthContext";
import { createMobileTrpcClient, saveOfflineCache, loadOfflineCache, isOnline } from "../mobileTrpc";
import {
  Cable, ChevronRight, ChevronLeft, Search, RefreshCw, Edit2, Check,
  AlertCircle, Plus, Trash2, Circle, Link2, Unlink, LocateFixed, Loader2,
} from "lucide-react";

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

type Ceo = {
  id: number; name: string; location?: string | null; type?: string | null;
  totalTubes?: number | null; notes?: string | null;
};

type Tube = {
  id: number; ceoId: number; tubeNumber: number; color: string;
  label?: string | null; notes?: string | null;
};

type Via = {
  id: number; tubeId: number; viaNumber: number; color?: string | null;
  status: string; fusedWithViaId?: number | null; fiberId?: number | null;
  notes?: string | null;
};

type View = "list" | "detail" | "editCeo" | "tubes" | "editTube" | "vias" | "editVia";

export default function MobileCeos() {
  const { serverUrl, token } = useMobileAuth();
  const [ceos, setCeos] = useState<Ceo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<View>("list");
  const [selected, setSelected] = useState<Ceo | null>(null);
  const [tubes, setTubes] = useState<Tube[]>([]);
  const [selectedTube, setSelectedTube] = useState<Tube | null>(null);
  const [vias, setVias] = useState<Via[]>([]);
  const [selectedVia, setSelectedVia] = useState<Via | null>(null);
  const [editCeoForm, setEditCeoForm] = useState<Partial<Ceo>>({});
  const [editTubeForm, setEditTubeForm] = useState<Partial<Tube>>({});
  const [editViaForm, setEditViaForm] = useState<Partial<Via>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newTubeColor, setNewTubeColor] = useState("blue");
  const [addingTube, setAddingTube] = useState(false);
  const [addingVia, setAddingVia] = useState(false);
  const [newViaColor, setNewViaColor] = useState("blue");
  const [geoLoading, setGeoLoading] = useState(false);

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

  const client = createMobileTrpcClient(serverUrl, token);

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
    } finally {
      setLoading(false);
    }
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
        await saveOfflineCache(`tube_vias_${tubeId}`, data);
      } else {
        const cached = await loadOfflineCache<Via[]>(`tube_vias_${tubeId}`);
        setVias(cached ?? []);
      }
    } catch {
      const cached = await loadOfflineCache<Via[]>(`tube_vias_${tubeId}`);
      setVias(cached ?? []);
    }
  }, [serverUrl, token]);

  const filtered = ceos.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.location ?? "").toLowerCase().includes(search.toLowerCase())
  );

  // ─── LIST ────────────────────────────────────────────────────────────────────
  if (view === "list") {
    return (
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
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
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
              {filtered.map((ceo) => (
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
                      {ceo.totalTubes ? ` · ${ceo.totalTubes} tubos` : ""}
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
  }

  // ─── DETAIL ──────────────────────────────────────────────────────────────────
  if (view === "detail" && selected) {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-zinc-900 border-b border-zinc-800 px-4 pt-4 pb-3 flex-shrink-0">
          <button onClick={() => setView("list")} className="flex items-center gap-1 text-cyan-400 text-sm mb-3">
            <ChevronLeft className="w-4 h-4" /> CEO
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-base font-bold text-white">{selected.name}</h1>
              {selected.location && <p className="text-xs text-zinc-400 mt-0.5">{selected.location}</p>}
            </div>
            <button
              onClick={() => { setEditCeoForm({ ...selected }); setError(null); setView("editCeo"); }}
              className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white transition-colors"
            >
              <Edit2 className="w-3.5 h-3.5" /> Editar
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Info */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
            {[
              ["Tipo", selected.type],
              ["Total de Tubos", selected.totalTubes?.toString()],
              ["Observações", selected.notes],
            ].filter(([, v]) => v).map(([l, v]) => (
              <div key={l as string} className="flex justify-between">
                <span className="text-xs text-zinc-500">{l as string}</span>
                <span className="text-xs text-zinc-200">{v as string}</span>
              </div>
            ))}
          </div>

          {/* Tubos */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Tubos ({tubes.length})
              </p>
              {isOnline() && (
                <button
                  onClick={() => { setAddingTube(true); setNewTubeColor("blue"); setError(null); }}
                  className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300"
                >
                  <Plus className="w-3.5 h-3.5" /> Novo Tubo
                </button>
              )}
            </div>

            {addingTube && (
              <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 mb-3 space-y-3">
                <p className="text-xs font-semibold text-white">Novo Tubo</p>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Cor</label>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(TUBE_COLORS).map(([color, cls]) => (
                      <button
                        key={color}
                        onClick={() => setNewTubeColor(color)}
                        className={`w-7 h-7 rounded-full ${cls} border-2 transition-all ${newTubeColor === color ? "border-white scale-110" : "border-transparent"}`}
                        title={TUBE_COLOR_LABELS[color]}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      setSaving(true);
                      try {
                        await client.ceoTubes.create.mutate({
                          ceoId: selected.id,
                          identifier: `Tubo ${tubes.length + 1}`,
                          totalVias: 12,
                          color: newTubeColor,
                        });
                        await loadTubes(selected.id);
                        setAddingTube(false);
                      } catch (e: any) { setError(e?.message ?? "Erro"); }
                      finally { setSaving(false); }
                    }}
                    disabled={saving}
                    className="flex-1 bg-cyan-500 text-zinc-900 font-semibold py-2 rounded-xl text-xs"
                  >
                    Adicionar
                  </button>
                  <button
                    onClick={() => setAddingTube(false)}
                    className="flex-1 bg-zinc-800 border border-zinc-700 text-zinc-300 py-2 rounded-xl text-xs"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl mb-3">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-300">{error}</p>
              </div>
            )}

            <div className="space-y-2">
              {tubes.map((tube) => (
                <button
                  key={tube.id}
                  onClick={() => { setSelectedTube(tube); loadVias(tube.id); setView("vias"); }}
                  className="w-full flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 hover:bg-zinc-800/50 transition-colors text-left"
                >
                  <div className={`w-4 h-4 rounded-full flex-shrink-0 ${TUBE_COLORS[tube.color] ?? "bg-zinc-500"}`} />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-white">Tubo {tube.tubeNumber}</span>
                    {tube.label && <span className="text-xs text-zinc-400 ml-2">— {tube.label}</span>}
                    <p className="text-xs text-zinc-500">{TUBE_COLOR_LABELS[tube.color] ?? tube.color}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-600 flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── EDIT CEO ────────────────────────────────────────────────────────────────
  if (view === "editCeo" && selected) {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-zinc-900 border-b border-zinc-800 px-4 pt-4 pb-3 flex-shrink-0">
          <button onClick={() => setView("detail")} className="flex items-center gap-1 text-cyan-400 text-sm mb-3">
            <ChevronLeft className="w-4 h-4" /> Cancelar
          </button>
          <h1 className="text-base font-bold text-white">Editar CEO</h1>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Nome</label>
            <input
              type="text"
              value={editCeoForm.name ?? ""}
              onChange={(e) => setEditCeoForm(f => ({ ...f, name: e.target.value || undefined }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Localização / Endereço</label>
            <button
              type="button"
              onClick={handleGetLocationCeo}
              disabled={geoLoading}
              className="w-full h-11 flex items-center justify-center gap-2 text-sm font-medium border border-amber-500/50 text-amber-400 bg-transparent hover:bg-amber-500/10 rounded-xl mb-2 active:scale-[0.98] transition-all disabled:opacity-60"
            >
              {geoLoading
                ? <><Loader2 className="w-5 h-5 animate-spin" /> Obtendo GPS...</>
                : <><LocateFixed className="w-5 h-5" /> Atualizar Minha Localização</>}
            </button>
            <input
              type="text"
              value={editCeoForm.location ?? ""}
              onChange={(e) => setEditCeoForm(f => ({ ...f, location: e.target.value || null }))}
              placeholder="Endereço ou coordenadas"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
            />
            <p className="text-[11px] text-amber-400/70 mt-1">Toque no botão para capturar a posição atual e depois toque em Salvar.</p>
          </div>
          {[
            { label: "Tipo", key: "type", type: "text" },
            { label: "Total de Tubos", key: "totalTubes", type: "number" },
          ].map(({ label, key, type }) => (
            <div key={key}>
              <label className="text-xs text-zinc-400 mb-1 block">{label}</label>
              <input
                type={type}
                value={(editCeoForm as any)[key] ?? ""}
                onChange={(e) => setEditCeoForm(f => ({ ...f, [key]: type === "number" ? parseInt(e.target.value) || null : e.target.value || null }))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
          ))}
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Observações</label>
            <textarea
              value={editCeoForm.notes ?? ""}
              onChange={(e) => setEditCeoForm(f => ({ ...f, notes: e.target.value || null }))}
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
            disabled={saving}
            className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-zinc-900 font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"
          >
            {saving ? <div className="w-4 h-4 border-2 border-zinc-900/30 border-t-zinc-900 rounded-full animate-spin" /> : <><Check className="w-4 h-4" /> Salvar</>}
          </button>
        </div>
      </div>
    );
  }

  // ─── VIAS ────────────────────────────────────────────────────────────────────
  if (view === "vias" && selectedTube) {
    const fused = vias.filter(v => v.fusedWithViaId).length;
    return (
      <div className="flex flex-col h-full">
        <div className="bg-zinc-900 border-b border-zinc-800 px-4 pt-4 pb-3 flex-shrink-0">
          <button onClick={() => setView("detail")} className="flex items-center gap-1 text-cyan-400 text-sm mb-3">
            <ChevronLeft className="w-4 h-4" /> {selected?.name}
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-base font-bold text-white">
                Tubo {selectedTube.tubeNumber}
                <span className={`inline-block w-3 h-3 rounded-full ml-2 ${TUBE_COLORS[selectedTube.color] ?? "bg-zinc-500"}`} />
              </h1>
              <p className="text-xs text-zinc-400 mt-0.5">{vias.length} vias · {fused} fusionadas</p>
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

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isOnline() && (
            <button
              onClick={() => { setAddingVia(true); setNewViaColor("blue"); setError(null); }}
              className="w-full flex items-center justify-center gap-2 bg-zinc-800 border border-zinc-700 rounded-xl py-2.5 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors"
            >
              <Plus className="w-4 h-4" /> Nova Via
            </button>
          )}

          {addingVia && (
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-white">Nova Via</p>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Cor</label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(TUBE_COLORS).map(([color, cls]) => (
                    <button key={color} onClick={() => setNewViaColor(color)}
                      className={`w-6 h-6 rounded-full ${cls} border-2 transition-all ${newViaColor === color ? "border-white scale-110" : "border-transparent"}`}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    setSaving(true);
                    try {
                      // Vias são criadas automaticamente com o tubo — apenas atualizar label
                      await client.ceoVias.updateLabel.mutate({ id: vias[0]?.id ?? 0, notes: `Via ${vias.length + 1}` });
                      await loadVias(selectedTube.id);
                      setAddingVia(false);
                    } catch (e: any) { setError(e?.message ?? "Erro"); }
                    finally { setSaving(false); }
                  }}
                  disabled={saving}
                  className="flex-1 bg-cyan-500 text-zinc-900 font-semibold py-2 rounded-xl text-xs"
                >Adicionar</button>
                <button onClick={() => setAddingVia(false)} className="flex-1 bg-zinc-800 border border-zinc-700 text-zinc-300 py-2 rounded-xl text-xs">Cancelar</button>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}

          {vias.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-zinc-500 gap-2">
              <Circle className="w-8 h-8 opacity-30" />
              <p className="text-sm">Nenhuma via cadastrada</p>
            </div>
          ) : (
            <div className="space-y-2">
              {vias.map((via) => (
                <button
                  key={via.id}
                  onClick={() => { setSelectedVia(via); setEditViaForm({ ...via }); setError(null); setView("editVia"); }}
                  className="w-full flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 hover:bg-zinc-800/50 transition-colors text-left"
                >
                  <div className={`w-3.5 h-3.5 rounded-full flex-shrink-0 ${TUBE_COLORS[via.color ?? ""] ?? "bg-zinc-500"}`} />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-white">Via {via.viaNumber}</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                        via.status === "fused" ? "bg-emerald-500/20 text-emerald-300" :
                        via.status === "free" ? "bg-zinc-500/20 text-zinc-300" :
                        "bg-amber-500/20 text-amber-300"
                      }`}>
                        {via.status === "fused" ? "Fusionada" : via.status === "free" ? "Livre" : via.status}
                      </span>
                      {via.fusedWithViaId && <Link2 className="w-3 h-3 text-emerald-400" />}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-600 flex-shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── EDIT TUBE ───────────────────────────────────────────────────────────────
  if (view === "editTube" && selectedTube) {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-zinc-900 border-b border-zinc-800 px-4 pt-4 pb-3 flex-shrink-0">
          <button onClick={() => setView("vias")} className="flex items-center gap-1 text-cyan-400 text-sm mb-3">
            <ChevronLeft className="w-4 h-4" /> Cancelar
          </button>
          <h1 className="text-base font-bold text-white">Editar Tubo {selectedTube.tubeNumber}</h1>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}
          <div>
            <label className="text-xs text-zinc-400 mb-2 block">Cor do Tubo</label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(TUBE_COLORS).map(([color, cls]) => (
                <button key={color} onClick={() => setEditTubeForm(f => ({ ...f, color }))}
                  className={`w-8 h-8 rounded-full ${cls} border-2 transition-all ${editTubeForm.color === color ? "border-white scale-110" : "border-transparent"}`}
                  title={TUBE_COLOR_LABELS[color]}
                />
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Etiqueta</label>
            <input
              type="text"
              value={editTubeForm.label ?? ""}
              onChange={(e) => setEditTubeForm(f => ({ ...f, label: e.target.value || null }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Observações</label>
            <textarea
              value={editTubeForm.notes ?? ""}
              onChange={(e) => setEditTubeForm(f => ({ ...f, notes: e.target.value || null }))}
              rows={3}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500 resize-none"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={async () => {
                setSaving(true); setError(null);
                try {
                  await client.ceoTubes.update.mutate({ id: selectedTube.id, color: editTubeForm.color ?? selectedTube.color, notes: editTubeForm.notes ?? undefined });
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
  }

  // ─── EDIT VIA ────────────────────────────────────────────────────────────────
  if (view === "editVia" && selectedVia && selectedTube) {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-zinc-900 border-b border-zinc-800 px-4 pt-4 pb-3 flex-shrink-0">
          <button onClick={() => setView("vias")} className="flex items-center gap-1 text-cyan-400 text-sm mb-3">
            <ChevronLeft className="w-4 h-4" /> Vias
          </button>
          <h1 className="text-base font-bold text-white">Via {selectedVia.viaNumber}</h1>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}

          <div>
            <label className="text-xs text-zinc-400 mb-2 block">Cor da Via</label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(TUBE_COLORS).map(([color, cls]) => (
                <button key={color} onClick={() => setEditViaForm(f => ({ ...f, color }))}
                  className={`w-7 h-7 rounded-full ${cls} border-2 transition-all ${editViaForm.color === color ? "border-white scale-110" : "border-transparent"}`}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-zinc-400 mb-2 block">Status</label>
            <div className="grid grid-cols-3 gap-2">
              {[["free", "Livre"], ["fused", "Fusionada"], ["reserved", "Reservada"]].map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setEditViaForm(f => ({ ...f, status: val }))}
                  className={`py-2 rounded-xl text-xs font-medium border transition-colors ${
                    editViaForm.status === val
                      ? "bg-cyan-500 border-cyan-500 text-zinc-900"
                      : "bg-zinc-800 border-zinc-700 text-zinc-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Observações</label>
            <textarea
              value={editViaForm.notes ?? ""}
              onChange={(e) => setEditViaForm(f => ({ ...f, notes: e.target.value || null }))}
              rows={3}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500 resize-none"
            />
          </div>

          {/* Fusão */}
          {selectedVia.fusedWithViaId && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Link2 className="w-4 h-4 text-emerald-400" />
                <span className="text-xs text-emerald-300">Fusionada com Via {selectedVia.fusedWithViaId}</span>
              </div>
              <button
                onClick={async () => {
                  setSaving(true);
                  try {
                    await client.ceoVias.clearFusion.mutate({ viaId: selectedVia.id });
                    await loadVias(selectedTube.id);
                    setView("vias");
                  } catch (e: any) { setError(e?.message ?? "Erro"); }
                  finally { setSaving(false); }
                }}
                className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300"
              >
                <Unlink className="w-3.5 h-3.5" /> Desfazer
              </button>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={async () => {
                setSaving(true); setError(null);
                try {
                  await client.ceoVias.updateLabel.mutate({
                    id: selectedVia.id,
                    notes: editViaForm.notes ?? null,
                  });
                  await loadVias(selectedTube.id);
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
                if (!confirm("Excluir esta via?")) return;
                setSaving(true);
                try {
                  await client.ceoVias.clearFiber.mutate({ viaId: selectedVia.id });
                  await loadVias(selectedTube.id);
                  setView("vias");
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
  }

  return null;
}
